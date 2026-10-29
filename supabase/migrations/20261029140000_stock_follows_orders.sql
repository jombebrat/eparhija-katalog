-- Stock follows orders: marking an order done (Izvršena) takes its quantities off stock;
-- reopening or cancelling it puts back exactly what was taken. Articles whose stock is empty
-- (not counted) are left alone.

alter table public.orders add column stock_taken jsonb;
comment on column public.orders.stock_taken is 'What marking the order done took off stock, per code. Put back when the order is reopened or cancelled.';

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
      select x ->> 'code' as code, sum((x ->> 'qty')::integer) as qty
      from jsonb_array_elements(new.items) as x
      group by 1
    loop
      select p.stock into have from public.products p where p.code = it.code and p.stock is not null for update;
      if found then
        update public.products set stock = have - least(have, it.qty) where code = it.code;
        took := took || jsonb_build_object(it.code, least(have, it.qty));
      end if;
    end loop;
    new.stock_taken := took;
  elsif old.status = 'done' and new.status <> 'done' then
    for it in select key as code, value::integer as qty from jsonb_each_text(coalesce(old.stock_taken, '{}'::jsonb)) loop
      update public.products set stock = stock + it.qty where code = it.code and stock is not null;
    end loop;
    new.stock_taken := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.order_stock() from public, anon, authenticated;

create trigger orders_stock before update of status on public.orders
for each row execute function public.order_stock();
