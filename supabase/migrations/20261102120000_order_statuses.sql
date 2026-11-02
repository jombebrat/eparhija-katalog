-- Order workflow: two new statuses between "new" and "done", and a history of every status change
-- (orders and price inquiries). Additive: existing rows and the stock logic (which reacts to 'done' only) are untouched.

alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status = any (array['new','processing','ready','done','cancelled']));

create table public.status_log (
  id bigint generated always as identity primary key,
  entity text not null check (entity in ('order', 'inquiry')),
  entity_id bigint not null,
  from_status text,
  to_status text not null,
  changed_by text,
  changed_at timestamptz not null default now()
);
create index status_log_entity on public.status_log (entity, entity_id, changed_at);

alter table public.status_log enable row level security;
create policy "admins read status log" on public.status_log for select to authenticated using (public.is_admin());
-- no insert/update/delete policy: only the trigger below writes, and nobody edits history

create or replace function public.log_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  kind text := case tg_table_name when 'orders' then 'order' else 'inquiry' end;
  who text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
begin
  if tg_op = 'INSERT' then
    insert into public.status_log (entity, entity_id, from_status, to_status, changed_by, changed_at)
    values (kind, new.id, null, new.status, coalesce(who, 'sajt'), new.created_at);
  elsif new.status is distinct from old.status then
    insert into public.status_log (entity, entity_id, from_status, to_status, changed_by)
    values (kind, new.id, old.status, new.status, who);
  end if;
  return null;
end $$;

revoke all on function public.log_status() from public, anon, authenticated;

create trigger orders_log after insert or update of status on public.orders
  for each row execute function public.log_status();
create trigger inquiries_log after insert or update of status on public.inquiries
  for each row execute function public.log_status();

-- the history starts with what already exists: each order and inquiry as created
insert into public.status_log (entity, entity_id, from_status, to_status, changed_by, changed_at)
  select 'order', id, null, status, 'sajt', created_at from public.orders
  union all select 'inquiry', id, null, status, 'sajt', created_at from public.inquiries;
