-- Magacin Eparhije zapadnoevropske: catalogue, clergy, orders, admins.
--
-- Who sees what:
--   visitors (anon)        categories, and the public columns of active products (no price, no stock figure)
--   priests                prices, through the Edge Function `prices`, after their email is checked
--   admins (signed in)     everything, through the admin panel at /admin/
-- Prices, stock, priests and orders are never readable with the public key.

-- ---------- admins ----------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
comment on table public.admins is 'Users of the admin panel. Add one with: insert into admins (user_id, email) select id, email from auth.users where email = ''…'';';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- catalogue ----------
create table public.categories (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  name_fr text not null,
  name_en text not null,
  name_sr text not null,
  layout text not null default 'grid' check (layout in ('grid', 'table')),
  cover text,
  sort integer not null default 0
);
comment on column public.categories.layout is 'grid: cards with photos; table: rows (the wax candles).';
comment on column public.categories.cover is 'Code of the product whose photo stands for the category on the home page.';

create table public.products (
  code text primary key check (length(code) between 1 and 40),
  category text not null references public.categories (id) on update cascade,
  name_fr text not null,
  name_en text not null,
  name_sr text not null,
  note_fr text,
  note_en text,
  note_sr text,
  price numeric(10, 2) not null default 0 check (price >= 0),
  unit text not null default 'piece' check (unit in ('piece', 'kg')),
  stock integer check (stock >= 0),
  available boolean generated always as (stock is null or stock > 0) stored,
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  active boolean not null default true,
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);
comment on column public.products.stock is 'Quantity in the warehouse. Empty = not counted. 0 = shown as out of stock.';
comment on column public.products.photos is 'List of {src, w, h, W, H}: src is a file name in docs/assets/img/p or a Storage URL without its .webp ending.';
create index products_category_sort_idx on public.products (category, sort);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger products_touch before update on public.products
for each row execute function public.touch_updated_at();

-- ---------- clergy, orders ----------
create table public.priests (
  id bigint generated always as identity primary key,
  email text not null unique,
  name text,
  parish text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint priests_email_shape check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
comment on table public.priests is 'Clergy who see prices: one row per email. active = false removes access.';

create or replace function public.normalize_priest_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end;
$$;
create trigger priests_normalize_email
before insert or update of email on public.priests
for each row execute function public.normalize_priest_email();

create table public.orders (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  priest_id bigint references public.priests (id) on delete set null,
  email text not null,
  name text,
  parish text,
  phone text,
  address text,
  note text,
  lang text not null check (lang in ('fr', 'en', 'sr')),
  items jsonb not null,
  total numeric(10, 2) not null,
  emailed boolean not null default false,
  status text not null default 'new' check (status in ('new', 'done', 'cancelled'))
);
comment on table public.orders is 'Every order sent from the site, priced as it was at that moment.';
create index orders_created_at_idx on public.orders (created_at desc);
create index orders_priest_id_idx on public.orders (priest_id);

create table public.attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  ok boolean not null,
  at timestamptz not null default now()
);
comment on table public.attempts is 'Email checks, kept a day, to slow down anyone guessing addresses.';
create index attempts_ip_at_idx on public.attempts (ip, at desc);
create index attempts_at_idx on public.attempts (at);

-- ---------- access ----------
alter table public.admins enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.priests enable row level security;
alter table public.orders enable row level security;
alter table public.attempts enable row level security;

revoke all on public.admins, public.categories, public.products, public.priests, public.orders, public.attempts from anon, authenticated;

-- visitors: categories, and products without price or stock figure
grant select on public.categories to anon;
grant select (code, category, name_fr, name_en, name_sr, note_fr, note_en, note_sr, unit, available, photos, active, sort) on public.products to anon;
create policy "visitors read categories" on public.categories for select to anon using (true);
create policy "visitors read active products" on public.products for select to anon using (active);

-- admins: everything, through their signed-in session
grant select, insert, update, delete on public.categories, public.products, public.priests, public.orders to authenticated;
grant select on public.admins to authenticated;
grant usage on all sequences in schema public to authenticated;
create policy "admins manage categories" on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage products" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage priests" on public.priests for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage orders" on public.orders for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins see admins" on public.admins for select to authenticated using (public.is_admin());

revoke execute on function public.normalize_priest_email() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- ---------- photos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "admins upload product photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'products' and public.is_admin());
create policy "admins replace product photos" on storage.objects for update to authenticated
  using (bucket_id = 'products' and public.is_admin()) with check (bucket_id = 'products' and public.is_admin());
create policy "admins delete product photos" on storage.objects for delete to authenticated
  using (bucket_id = 'products' and public.is_admin());

-- the order PDF's font and coat of arms, cached here by the `order` function (private)
insert into storage.buckets (id, name, public, file_size_limit) values ('assets', 'assets', false, 2097152)
on conflict (id) do nothing;
