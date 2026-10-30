-- New articles from the catalogue PDF of 30 Oct 2026 (P154-P157), and the prices of P146 and P151 as printed there.
-- Photos are in docs/assets/img/p. Stock is left empty (not counted) until it is entered in the admin panel.
insert into public.products (code, category, name_fr, name_en, name_sr, price, sort, photos) values
  ('P154', 'pendentifs', 'Petites croix en pierres semi-précieuses', 'Small crosses in semi-precious stones', 'Крстићи - полудраго камење', 2.5, 695, '[{"src": "p154-1", "w": 494, "h": 640, "W": 768, "H": 995}]'::jsonb),
  ('P155', 'veilleuses', 'Veilleuse en onyx', 'Onyx oil lamp', 'Кандило од оникса', 38, 481, '[{"src": "p155-1", "w": 526, "h": 636, "W": 526, "H": 636}]'::jsonb),
  ('P156', 'veilleuses', 'Veilleuse en onyx', 'Onyx oil lamp', 'Кандило од оникса', 31, 482, '[{"src": "p156-1", "w": 461, "h": 640, "W": 503, "H": 698}]'::jsonb),
  ('P157', 'veilleuses', 'Veilleuse en onyx', 'Onyx oil lamp', 'Кандило од оникса', 38, 483, '[{"src": "p157-1", "w": 540, "h": 640, "W": 580, "H": 688}]'::jsonb)
on conflict (code) do update set
  category = excluded.category, name_fr = excluded.name_fr, name_en = excluded.name_en, name_sr = excluded.name_sr,
  price = excluded.price, sort = excluded.sort, photos = excluded.photos;

update public.products set price = 11.12 where code = 'P146';
update public.products set price = 5.15 where code = 'P151';
