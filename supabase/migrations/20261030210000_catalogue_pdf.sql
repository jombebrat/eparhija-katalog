-- The price-list PDF (all articles, three languages) is made in the admin panel and kept in a private bucket.
-- Only admins can write or read it directly; members get a short-lived link from the `prices` function after their email is checked.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogue', 'catalogue', false, 31457280, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "admins read the catalogue pdf" on storage.objects for select to authenticated
  using (bucket_id = 'catalogue' and public.is_admin());
create policy "admins add the catalogue pdf" on storage.objects for insert to authenticated
  with check (bucket_id = 'catalogue' and public.is_admin());
create policy "admins replace the catalogue pdf" on storage.objects for update to authenticated
  using (bucket_id = 'catalogue' and public.is_admin()) with check (bucket_id = 'catalogue' and public.is_admin());
create policy "admins delete the catalogue pdf" on storage.objects for delete to authenticated
  using (bucket_id = 'catalogue' and public.is_admin());
