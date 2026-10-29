// Orders, and the member's account. Three requests:
//   POST { email, lang, items: [{ code, qty }], name, parish, phone, address, note }
//     -> { number, total, emailed, pdf (base64), filename }
//     Only an email on the members' list (table priests) may order. Prices and names come from the database, never from the page.
//     When RESEND_API_KEY, ORDER_FROM and WAREHOUSE_EMAIL are set, the PDF is emailed to the member who ordered and the warehouse
//     (the warehouse's message is in WAREHOUSE_LANG: fr, en or sr, default sr).
//   POST { action: 'code', email, lang }
//     -> { ok } and a 6-digit sign-in code by email, for members only (needs RESEND_API_KEY and ORDER_FROM).
//     The page then signs in with Supabase Auth (verify, type email) and reads its own orders.
//   POST { action: 'pdf', id } with Authorization: Bearer <session>
//     -> { pdf, filename } for an order of the signed-in member, or any order for an admin.
import { createClient } from '@supabase/supabase-js';
import { orderPdf, type Line, type Assets } from './pdf.ts';
import { T, LOCALE, fill, type Lang, toCyrillic } from './i18n.ts';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const secret = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default; } catch { return undefined; }
})() ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const db = createClient(Deno.env.get('SUPABASE_URL')!, secret!, { auth: { persistSession: false } });

// The PDF's font and coat of arms: kept in the private Storage bucket `assets`; on first use they are copied
// there from this repository (PDF_ASSETS_URL can point elsewhere).
const ASSETS_URL = Deno.env.get('PDF_ASSETS_URL') ?? 'https://raw.githubusercontent.com/jombebrat/eparhija-katalog/main/supabase/functions/order/assets/';
let assetCache: Assets | null = null;
async function pdfAssets(): Promise<Assets> {
  if (assetCache) return assetCache;
  const get = async (name: string, type: string) => {
    const { data } = await db.storage.from('assets').download(name);
    if (data) return new Uint8Array(await data.arrayBuffer());
    const r = await fetch(ASSETS_URL + name);
    if (!r.ok) throw new Error(`asset ${name}: ${r.status}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    await db.storage.from('assets').upload(name, bytes, { contentType: type, upsert: true });
    return bytes;
  };
  const [regular, bold, emblem] = await Promise.all([get('onest-400.ttf', 'font/ttf'), get('onest-700.ttf', 'font/ttf'), get('emblem.png', 'image/png')]);
  assetCache = { regular, bold, emblem };
  return assetCache;
}

const clientIp = (req: Request) =>
  (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

async function sendMail(to: string, replyTo: string, subject: string, text: string, filename?: string, pdf?: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('ORDER_FROM');
  if (!key || !from) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [to], reply_to: replyTo, subject, text,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">${esc(text).replace(/\n/g, '<br>')}</div>`,
      ...(pdf ? { attachments: [{ filename, content: pdf }] } : {}),
    }),
  });
  if (!r.ok) console.error('resend', r.status, await r.text());
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid' }, 400); }
  if (body.action === 'pdf') return pdfAgain(req, body);
  if (body.action === 'code') return sendCode(req, body);
  const email = clean(body.email, 200).toLowerCase();
  const lang = (['fr', 'en', 'sr'].includes(String(body.lang)) ? body.lang : 'fr') as Lang;
  const items = Array.isArray(body.items) ? body.items.slice(0, 300) : [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !items.length) return json({ error: 'invalid' }, 400);

  // same guard as the price check
  const ip = clientIp(req);
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count: fails } = await db.from('attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('ok', false).gte('at', since);
  if ((fails ?? 0) >= 10) return json({ error: 'too_many' }, 429);
  const { data: priest } = await db.from('priests').select('id, name, parish, phone, address').eq('email', email).eq('active', true).maybeSingle();
  if (!priest) {
    await db.from('attempts').insert({ ip, ok: false });
    return json({ error: 'unknown' }, 404);
  }

  // price every line from the database
  const wanted = new Map<string, number>();
  for (const it of items as { code?: unknown; qty?: unknown }[]) {
    const code = clean(it?.code, 40);
    const qty = Math.round(Number(it?.qty));
    if (!code || !Number.isFinite(qty) || qty < 1 || qty > 999) return json({ error: 'invalid' }, 400);
    wanted.set(code, (wanted.get(code) ?? 0) + qty);
  }
  const { data: products, error } = await db.from('products').select('code, name_fr, name_en, name_sr, price, unit, sort, available').eq('active', true).in('code', [...wanted.keys()]);
  if (error) return json({ error: 'server' }, 500);
  if ((products ?? []).length !== wanted.size) return json({ error: 'unknown_item' }, 400);
  const gone = products!.filter((p) => !p.available).map((p) => p.code);
  if (gone.length) return json({ error: 'unavailable', codes: gone }, 409);
  const lines: Line[] = products!
    .sort((a, b) => a.sort - b.sort)
    .map((p) => ({
      code: p.code,
      name: String((p as Record<string, unknown>)[`name_${lang}`] || p.name_fr || p.name_sr || p.name_en || p.code),
      qty: wanted.get(p.code)!,
      price: Number(p.price),
      unit: p.unit as 'piece' | 'kg',
    }));
  const total = Math.round(lines.reduce((a, l) => a + l.price * l.qty, 0) * 100) / 100;

  const name = clean(body.name, 120) || priest.name || '';
  const who = {
    // on the Serbian pages the order is written in Cyrillic: "P. Jovan Pavlović" → "о. Јован Павловић"
    name: lang === 'sr' ? toCyrillic(name) : name,
    parish: clean(body.parish, 160) || priest.parish || '',
    phone: clean(body.phone, 40) || priest.phone || '',
    address: clean(body.address, 300) || priest.address || '',
    note: clean(body.note, 1000),
  };
  const { data: saved, error: e2 } = await db.from('orders')
    .insert({ priest_id: priest.id, email, lang, items: lines, total, ...who })
    .select('id, created_at').single();
  if (e2 || !saved) return json({ error: 'server' }, 500);

  let pdf = '';
  try {
    const pdfBytes = await orderPdf({ number: saved.id, date: new Date(saved.created_at), lang, email, ...who, lines, total }, await pdfAssets());
    pdf = toB64(pdfBytes);
  } catch (e) {
    console.error('pdf', e); // the order is saved; the warehouse still sees it in the admin panel
  }
  const t = T[lang];
  const money = new Intl.NumberFormat(LOCALE[lang], { style: 'currency', currency: 'EUR' }).format(total);
  const filename = fill(t.file, { n: saved.id });
  const subject = fill(t.subject, { n: saved.id });

  let emailed = false;
  const warehouse = Deno.env.get('WAREHOUSE_EMAIL');
  const wl = (['fr', 'en', 'sr'].includes(Deno.env.get('WAREHOUSE_LANG') ?? '') ? Deno.env.get('WAREHOUSE_LANG') : 'sr') as Lang;
  if (warehouse && pdf) {
    const [a, b] = await Promise.all([
      sendMail(email, warehouse, subject, fill(t.mailPriest, { n: saved.id, total: money }), filename, pdf),
      sendMail(warehouse, email, fill(T[wl].subject, { n: saved.id }), fill(T[wl].mailWarehouse, { n: saved.id, total: money, who: [who.name, who.parish].filter(Boolean).join(', ') || email, email }), filename, pdf),
    ]);
    emailed = a && b;
    if (emailed) await db.from('orders').update({ emailed: true }).eq('id', saved.id);
  }

  return json({ number: saved.id, total, emailed, pdf, filename });
});

// ---------- the member's account ----------

// a 6-digit code to sign in, sent by email to a member on the list
async function sendCode(req: Request, body: Record<string, unknown>) {
  const email = clean(body.email, 200).toLowerCase();
  const lang = (['fr', 'en', 'sr'].includes(String(body.lang)) ? body.lang : 'fr') as Lang;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'invalid' }, 400);
  const ip = clientIp(req);
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count: fails } = await db.from('attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('ok', false).gte('at', since);
  const { count: sent } = await db.from('attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('kind', 'code').gte('at', since);
  if ((fails ?? 0) >= 10 || (sent ?? 0) >= 10) return json({ error: 'too_many' }, 429);
  const { data: member } = await db.from('priests').select('id').eq('email', email).eq('active', true).maybeSingle();
  if (!member) {
    await db.from('attempts').insert({ ip, ok: false });
    return json({ error: 'unknown' }, 404);
  }
  if (!Deno.env.get('RESEND_API_KEY') || !Deno.env.get('ORDER_FROM')) return json({ error: 'mail_off' }, 503);
  // the member's sign-in account is made the first time; "already registered" is fine
  await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { member: true } });
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  const code = data?.properties?.email_otp;
  if (error || !code) { console.error('code', error); return json({ error: 'server' }, 500); }
  await db.from('attempts').insert({ ip, ok: true, kind: 'code' });
  const t = T[lang];
  const ok = await sendMail(email, Deno.env.get('WAREHOUSE_EMAIL') || email, fill(t.codeSubject, { code }), fill(t.codeMail, { code }));
  return ok ? json({ ok: true }) : json({ error: 'mail_failed' }, 502);
}

// the PDF of an earlier order, for the member who sent it or for an admin
async function pdfAgain(req: Request, body: Record<string, unknown>) {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const id = Number(body.id);
  if (!jwt || !Number.isInteger(id)) return json({ error: 'invalid' }, 400);
  const { data: u } = await db.auth.getUser(jwt);
  const user = u?.user;
  if (!user) return json({ error: 'signed_out' }, 401);
  const { data: o } = await db.from('orders').select('*').eq('id', id).maybeSingle();
  const { data: admin } = await db.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!o || (!admin && o.email !== (user.email ?? '').toLowerCase())) return json({ error: 'not_found' }, 404);
  const lang = (['fr', 'en', 'sr'].includes(o.lang) ? o.lang : 'fr') as Lang;
  try {
    const bytes = await orderPdf({
      number: o.id, date: new Date(o.created_at), lang, email: o.email,
      name: o.name ?? '', parish: o.parish ?? '', phone: o.phone ?? '', address: o.address ?? '', note: o.note ?? '',
      lines: o.items as Line[], total: Number(o.total),
    }, await pdfAssets());
    return json({ pdf: toB64(bytes), filename: fill(T[lang].file, { n: o.id }) });
  } catch (e) {
    console.error('pdf again', e);
    return json({ error: 'server' }, 500);
  }
}
