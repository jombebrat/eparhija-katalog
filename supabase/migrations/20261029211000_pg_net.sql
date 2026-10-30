-- HTTP calls from the database: used to check that a deployed Edge Function answers,
-- and later for scheduled jobs (pg_cron) that call a function, such as a stock sync.
-- In the extensions schema, not public (Supabase's security advisor).
create extension if not exists pg_net schema extensions;
