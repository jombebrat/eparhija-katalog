-- Draft / published for articles. Admin-only: a draft is simply kept inactive, so every public reader
-- (catalogue build, order, prices, PDF) that already filters on active = true ignores it with no code change.
alter table public.products
  add column if not exists status text not null default 'published' check (status in ('draft', 'published'));

create or replace function public.products_draft_inactive() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'draft' then new.active := false; end if;
  return new;
end $$;

drop trigger if exists products_draft_inactive on public.products;
create trigger products_draft_inactive before insert or update on public.products
  for each row execute function public.products_draft_inactive();

comment on column public.products.status is 'draft = prepared in the admin, never shown or orderable; published = normal (visibility then follows active).';
