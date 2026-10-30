-- Options of an article: the saint or the feast of an icon, each with its own code and stock,
-- as the variants are kept in Erplain (P064/8, P064/9…). The article keeps its price; a member
-- chooses the option, and the order line carries it.
--
-- Public: the label, the code (sku) and whether it is in stock. Stock figures stay with the admins.

create table public.options (
  id bigint generated always as identity primary key,
  product text not null references public.products (code) on update cascade on delete cascade,
  sku text check (length(sku) <= 40),
  erplain_id bigint unique,
  label_sr text not null check (length(label_sr) between 1 and 160),
  label_fr text check (length(label_fr) <= 160),
  label_en text check (length(label_en) <= 160),
  stock integer check (stock >= 0),
  available boolean generated always as (stock is null or stock > 0) stored,
  active boolean not null default true,
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);
comment on table public.options is 'Options of an article (the saint of an icon). sku: its code in Erplain; erplain_id: the Erplain product id, for the sync. Stock as on products: empty = not counted, 0 = out of stock.';
create index options_product_idx on public.options (product, sort);
create trigger options_touch before update on public.options
for each row execute function public.touch_updated_at();

alter table public.options enable row level security;
revoke all on public.options from anon, authenticated;
grant select (id, product, sku, label_sr, label_fr, label_en, available, active, sort) on public.options to anon;
create policy "visitors read active options" on public.options for select to anon using (active);
grant select, insert, update, delete on public.options to authenticated;
create policy "admins manage options" on public.options for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Stock follows orders, now also per option: a line with an option takes from that option.
-- stock_taken keeps article codes as they were, and options as "#<id>".
create or replace function public.order_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  it record;
  have integer;
  took jsonb := '{}'::jsonb;
begin
  if new.status = 'done' and old.status <> 'done' then
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
  elsif old.status = 'done' and new.status <> 'done' then
    for it in select key, value::integer as qty from jsonb_each_text(coalesce(old.stock_taken, '{}'::jsonb)) loop
      if left(it.key, 1) = '#' then
        update public.options set stock = stock + it.qty where id = substr(it.key, 2)::bigint and stock is not null;
      else
        update public.products set stock = stock + it.qty where code = it.key and stock is not null;
      end if;
    end loop;
    new.stock_taken := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.order_stock() from public, anon, authenticated;
