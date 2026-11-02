-- Stock ledger. Every change to a stock figure (article or option) is written to stock_moves by a trigger,
-- whoever or whatever made it: the stock_move() function below (receipt / issue / correction), an order marked done
-- or reopened, or a plain edit of the figure. The ledger can only be added to: no update, no delete.

create table public.stock_moves (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  product text not null,                       -- article code as it was at the time
  option_id bigint,                            -- set when the figure belongs to an option
  label text,                                  -- the option's code or name, for reading the history
  kind text not null check (kind in ('initial', 'receipt', 'issue', 'correction', 'order', 'order_undo')),
  delta integer not null,                      -- + in, - out (for 'initial': the starting figure)
  before_qty integer,                          -- null = the figure was not counted
  after_qty integer,
  reason text,
  admin text                                   -- the signed-in admin's email
);
create index stock_moves_product_idx on public.stock_moves (product, at desc);
create index stock_moves_at_idx on public.stock_moves (at desc);
comment on table public.stock_moves is 'Append-only history of every stock change.';

alter table public.stock_moves enable row level security;
create policy "admins read stock moves" on public.stock_moves for select to authenticated using (public.is_admin());
revoke all on public.stock_moves from anon, authenticated;
grant select on public.stock_moves to authenticated;

create or replace function public.stock_moves_frozen() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'stock_moves can only be added to'; end $$;
create trigger stock_moves_no_edit before update or delete on public.stock_moves
  for each row execute function public.stock_moves_frozen();

-- the trigger that writes the ledger
create or replace function public.log_stock() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  k text := coalesce(nullif(current_setting('app.stock_kind', true), ''), 'correction');
  r text := nullif(current_setting('app.stock_reason', true), '');
  who text := nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', '');
  prod text; opt bigint; lab text; was integer;
begin
  if tg_op = 'UPDATE' then
    if new.stock is not distinct from old.stock then return new; end if;
    was := old.stock;
  else
    if new.stock is null then return new; end if;
    k := case when k = 'correction' then 'initial' else k end;
  end if;
  if tg_table_name = 'options' then prod := new.product; opt := new.id; lab := coalesce(new.sku, new.label_sr);
  else prod := new.code; end if;
  insert into public.stock_moves (product, option_id, label, kind, delta, before_qty, after_qty, reason, admin)
  values (prod, opt, lab, k, coalesce(new.stock, 0) - coalesce(was, 0), was, new.stock, r, who);
  return new;
end $$;
revoke execute on function public.log_stock() from public, anon, authenticated;

-- the starting figures, so the ledger adds up from day one
insert into public.stock_moves (product, kind, delta, before_qty, after_qty, reason)
  select code, 'initial', stock, null, stock, 'Početno stanje' from public.products where stock is not null;
insert into public.stock_moves (product, option_id, label, kind, delta, before_qty, after_qty, reason)
  select product, id, coalesce(sku, label_sr), 'initial', stock, null, stock, 'Početno stanje' from public.options where stock is not null;

create trigger products_log_stock after insert or update of stock on public.products for each row execute function public.log_stock();
create trigger options_log_stock after insert or update of stock on public.options for each row execute function public.log_stock();

-- orders: say why the figure moved
create or replace function public.order_stock()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare
  it record;
  have integer;
  took jsonb := '{}'::jsonb;
begin
  if new.status = 'done' and old.status <> 'done' then
    perform set_config('app.stock_kind', 'order', true), set_config('app.stock_reason', 'Porudžbina br. ' || new.id, true);
    for it in
      select x ->> 'code' as code, nullif(x ->> 'option', '')::bigint as opt, sum((x ->> 'qty')::integer) as qty
      from jsonb_array_elements(new.items) as x
      group by 1, 2
    loop
      if it.opt is not null then
        select o.stock into have from public.options o where o.id = it.opt and o.stock is not null for update;
        if found then
          update public.options set stock = have - least(have, it.qty) where id = it.opt;
          took := took || jsonb_build_object('#' || it.opt, least(have, it.qty));
        end if;
      else
        select p.stock into have from public.products p where p.code = it.code and p.stock is not null for update;
        if found then
          update public.products set stock = have - least(have, it.qty) where code = it.code;
          took := took || jsonb_build_object(it.code, least(have, it.qty));
        end if;
      end if;
    end loop;
    new.stock_taken := took;
    perform set_config('app.stock_kind', '', true), set_config('app.stock_reason', '', true);
  elsif old.status = 'done' and new.status <> 'done' then
    perform set_config('app.stock_kind', 'order_undo', true), set_config('app.stock_reason', 'Porudžbina br. ' || new.id || ' vraćena', true);
    for it in select key, value::integer as qty from jsonb_each_text(coalesce(old.stock_taken, '{}'::jsonb)) loop
      if left(it.key, 1) = '#' then
        update public.options set stock = stock + it.qty where id = substr(it.key, 2)::bigint and stock is not null;
      else
        update public.products set stock = stock + it.qty where code = it.key and stock is not null;
      end if;
    end loop;
    new.stock_taken := null;
    perform set_config('app.stock_kind', '', true), set_config('app.stock_reason', '', true);
  end if;
  return new;
end;
$function$;

-- the admin's way to move stock: receipt (+), issue (-), correction (set to a counted figure)
create or replace function public.stock_move(p_code text, p_option bigint, p_kind text, p_qty integer, p_reason text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare have integer; want integer;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind not in ('receipt', 'issue', 'correction') then raise exception 'unknown kind'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'quantity must be 0 or more'; end if;
  if p_kind = 'correction' and nullif(btrim(p_reason), '') is null then raise exception 'a correction needs a reason'; end if;
  if p_option is not null then
    select stock into have from public.options where id = p_option and product = p_code for update;
  else
    select stock into have from public.products where code = p_code for update;
  end if;
  if not found then raise exception 'no such article'; end if;
  want := case p_kind when 'receipt' then coalesce(have, 0) + p_qty
                      when 'issue' then coalesce(have, 0) - p_qty
                      else p_qty end;
  if want < 0 then raise exception 'not enough in stock (have %)', coalesce(have, 0); end if;
  perform set_config('app.stock_kind', p_kind, true), set_config('app.stock_reason', coalesce(p_reason, ''), true);
  if p_option is not null then update public.options set stock = want where id = p_option;
  else update public.products set stock = want where code = p_code; end if;
  perform set_config('app.stock_kind', '', true), set_config('app.stock_reason', '', true);
  return want;
end $$;
revoke execute on function public.stock_move(text, bigint, text, integer, text) from public, anon;
grant execute on function public.stock_move(text, bigint, text, integer, text) to authenticated;
