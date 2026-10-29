-- Warehouse catalogue: priests who may see prices, products with their prices, orders.
-- Every table is closed to the public API (RLS on, no policies, no grants to anon/authenticated).
-- Only the Edge Functions, with the secret key, read and write them.

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
comment on table public.priests is 'Clergy who see prices: add one row per email. Set active = false to remove access.';

create table public.products (
  code text primary key,
  category text not null,
  name_fr text not null,
  name_en text not null,
  name_sr text not null,
  price numeric(10, 2) not null check (price >= 0),
  unit text not null default 'piece' check (unit in ('piece', 'kg')),
  sort integer not null default 0
);
comment on table public.products is 'Prices are edited here. Names and photos shown on the site live in data/catalogue.json.';

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
  emailed boolean not null default false
);
comment on table public.orders is 'Every order sent from the site, with its lines as they were priced at that moment.';
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

-- emails are compared in lower case, whatever the warehouse types
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

alter table public.priests enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.attempts enable row level security;

revoke all on public.priests, public.products, public.orders, public.attempts from anon, authenticated;
revoke execute on function public.normalize_priest_email() from public, anon, authenticated;
