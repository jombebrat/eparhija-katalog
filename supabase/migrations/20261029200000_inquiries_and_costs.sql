-- Price inquiries from visitors who are not members, the quotes that answer them,
-- and purchase prices for the admin's profit figures.
--
-- A visitor sends the list (the `order` function, action "inquiry"); the admin answers it with a
-- quote in one click (action "quote"); the visitor orders from the quote's link (action "quote-order").

create table public.inquiries (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text,
  parish text,
  phone text,
  note text,
  lang text not null check (lang in ('fr', 'en', 'sr')),
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  status text not null default 'new' check (status in ('new', 'sent', 'ordered', 'closed')),
  quote jsonb,
  quote_total numeric(10, 2),
  quoted_at timestamptz,
  token uuid not null default gen_random_uuid() unique,
  order_id bigint references public.orders (id) on delete set null,
  emailed boolean not null default false
);
comment on table public.inquiries is 'Price requests from visitors who are not members. items: [{code, qty}] as asked; quote: [{code, name, qty, price, unit}] as sent; token: the secret in the quote''s order link.';
create index inquiries_created_at_idx on public.inquiries (created_at desc);

alter table public.inquiries enable row level security;
revoke all on public.inquiries from anon, authenticated;
grant select, update, delete on public.inquiries to authenticated;
create policy "admins manage inquiries" on public.inquiries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.products add column cost numeric(10, 2) check (cost >= 0);
comment on column public.products.cost is 'Purchase price, for the admin''s profit figures. Never shown on the site.';

alter table public.attempts drop constraint attempts_kind_check;
alter table public.attempts add constraint attempts_kind_check check (kind in ('check', 'code', 'inquiry'));
