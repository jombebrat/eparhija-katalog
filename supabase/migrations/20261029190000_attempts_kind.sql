-- Sign-in codes are counted apart from price checks, so a member browsing the catalogue never runs out of codes.
alter table public.attempts add column kind text not null default 'check' check (kind in ('check', 'code'));
comment on column public.attempts.kind is 'check: an email checked for prices or an order; code: a sign-in code sent.';
