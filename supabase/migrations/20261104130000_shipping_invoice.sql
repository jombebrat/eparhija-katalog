-- When an order is finished the admin attaches the invoice made in Erplain and a tracking code, and the member is told.
-- Additive: new nullable columns and a private bucket; nothing existing changes.

alter table public.orders
  add column invoice_path text,
  add column invoice_name text,
  add column carrier text,
  add column tracking_code text,
  add column shipped_at timestamptz,
  add column shipped_note text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "admins read invoices" on storage.objects for select to authenticated
  using (bucket_id = 'invoices' and public.is_admin());
create policy "admins add invoices" on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices' and public.is_admin());
create policy "admins replace invoices" on storage.objects for update to authenticated
  using (bucket_id = 'invoices' and public.is_admin()) with check (bucket_id = 'invoices' and public.is_admin());
create policy "admins delete invoices" on storage.objects for delete to authenticated
  using (bucket_id = 'invoices' and public.is_admin());
-- a member reads only the invoice of an order placed with their own email
create policy "members read their invoices" on storage.objects for select to authenticated
  using (bucket_id = 'invoices' and exists (
    select 1 from public.orders o
    where o.invoice_path = storage.objects.name and lower(o.email) = lower(auth.jwt() ->> 'email')));
