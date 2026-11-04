-- The text of the automatic messages, editable in the admin (tab "Poruke"). One row per message and language.
-- Placeholders: {n} order number, {tracking} the tracking line (empty without a code), {invoice} the sentence about the attached invoice.
create table public.message_templates (
  key text not null,
  lang text not null check (lang in ('fr', 'en', 'sr')),
  subject text not null,
  body text not null,
  updated_at timestamptz not null default now(),
  primary key (key, lang)
);
alter table public.message_templates enable row level security;
create policy "admins manage message templates" on public.message_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.message_templates (key, lang, subject, body) values
  ('shipped', 'fr', 'Votre commande n° {n} est terminée et expédiée',
   E'Bonjour,\n\nVotre commande n° {n} est terminée et expédiée.\n\n{tracking}\n\n{invoice}\n\nMerci pour votre confiance.\n\nL’entrepôt du Diocèse d’Europe occidentale'),
  ('shipped', 'en', 'Your order no. {n} is complete and shipped',
   E'Hello,\n\nYour order no. {n} is complete and has been shipped.\n\n{tracking}\n\n{invoice}\n\nThank you for your trust.\n\nThe warehouse of the Eparchy of Western Europe'),
  ('shipped', 'sr', 'Ваша поруџбина бр. {n} је завршена и послата',
   E'Добар дан,\n\nВаша поруџбина бр. {n} је завршена и послата.\n\n{tracking}\n\n{invoice}\n\nХвала на поверењу.\n\nМагацин Епархије западноевропске');
