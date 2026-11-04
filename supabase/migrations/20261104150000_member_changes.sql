-- A member can cancel or edit an order while it is still "new" (through the order function, never directly).
-- Edits leave a trace for the warehouse: when it happened and what the order said before the first edit.
alter table public.orders
  add column edited_at timestamptz,
  add column items_original jsonb,
  add column total_original numeric(10, 2);
comment on column public.orders.edited_at is 'When the member last edited the order from the profile page.';
comment on column public.orders.items_original is 'The lines as first sent, kept at the first edit by the member.';
