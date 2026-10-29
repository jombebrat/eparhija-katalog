-- is_admin() only answers "is the signed-in caller an admin"; visitors never need it
revoke execute on function public.is_admin() from anon;
comment on function public.is_admin() is 'True when the signed-in user is in public.admins. Used by the RLS policies and by the admin panel.';
comment on table public.attempts is 'Email checks, kept a day, to slow down anyone guessing addresses. Read and written only by the Edge Functions (no policies on purpose).';
