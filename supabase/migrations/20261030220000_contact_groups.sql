-- Contacts in two groups: clergy (the members' price) and other contacts. A group has a markup in percent
-- over the article's price; the price list, the site and the orders use it for everyone in the group.
alter table public.priests add column grp text not null default 'svestenstvo' check (grp in ('svestenstvo', 'ostali'));
comment on column public.priests.grp is 'Contact group: svestenstvo (clergy) or ostali (other contacts). The group sets the price.';

create table public.contact_groups (
  grp text primary key check (grp in ('svestenstvo', 'ostali')),
  label text not null,
  markup numeric(6,2) not null default 0 check (markup >= -50 and markup <= 300)
);
comment on table public.contact_groups is 'Price per contact group: markup in percent over the article price (0 = the article price).';
insert into public.contact_groups (grp, label, markup) values ('svestenstvo', 'Sveštenstvo', 0), ('ostali', 'Ostali kontakti', 0);

alter table public.contact_groups enable row level security;
create policy contact_groups_admin_all on public.contact_groups for all to authenticated using (public.is_admin()) with check (public.is_admin());
