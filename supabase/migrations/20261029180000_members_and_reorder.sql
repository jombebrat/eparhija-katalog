-- Member accounts and reorder points.
--
-- Members (the `priests` list) sign in on the site's account page with a 6-digit code sent to their
-- email by the `order` function (action "code"). Signed in, they read their own row and their own
-- orders, and keep their details for the order form. Nothing else opens to them.

alter table public.products add column min_stock integer check (min_stock >= 0);
comment on column public.products.min_stock is 'Reorder point: at or below this stock the article is on the admin''s reorder list. Empty = only the sales pace decides.';

alter table public.priests add column address text;
comment on column public.priests.address is 'Delivery address the member keeps for the order form.';

create policy "members read themselves" on public.priests for select to authenticated
  using (email = lower((select auth.jwt()) ->> 'email'));
create policy "members read their orders" on public.orders for select to authenticated
  using (email = lower((select auth.jwt()) ->> 'email'));

create or replace function public.update_my_details(p_name text, p_parish text, p_phone text, p_address text)
returns setof public.priests
language sql
security definer
set search_path = ''
as $$
  update public.priests set
    name = left(nullif(btrim(p_name), ''), 120),
    parish = left(nullif(btrim(p_parish), ''), 160),
    phone = left(nullif(btrim(p_phone), ''), 40),
    address = left(nullif(btrim(p_address), ''), 300)
  where email = lower(auth.jwt() ->> 'email') and active
  returning *;
$$;
comment on function public.update_my_details(text, text, text, text) is 'A signed-in member changes their own name, parish, phone and delivery address.';
revoke execute on function public.update_my_details(text, text, text, text) from public, anon;
grant execute on function public.update_my_details(text, text, text, text) to authenticated;
