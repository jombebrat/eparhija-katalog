-- How long personal data is kept, as the legal page says, enforced by the database itself.
--   attempts (IP addresses of email checks, codes and price requests): 24 hours, swept every hour.
--   inquiries that never became an order: 3 years.
--   orders: kept (10 years of accounting records); nothing is deleted here.

create extension if not exists pg_cron;

select cron.schedule('sweep-attempts', '17 * * * *',
  $$delete from public.attempts where at < now() - interval '24 hours'$$);

select cron.schedule('sweep-inquiries', '41 3 * * *',
  $$delete from public.inquiries where order_id is null and created_at < now() - interval '3 years'$$);

comment on table public.attempts is 'Email checks, code requests and price requests by IP, to slow down abuse. Deleted after 24 hours by the cron job sweep-attempts. Read and written only by the Edge Functions (no policies on purpose).';
