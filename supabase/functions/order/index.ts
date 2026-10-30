// Orders, and the member's account. Three requests:
//   POST { email, lang, items: [{ code, qty, option }], name, parish, phone, address, note }
//     -> { number, total, emailed, pdf (base64), filename }
//     Only an email on the members' list (table priests) may order. Prices and names come from the database, never from the page.
//     An article with options (the saint of an icon) is ordered with one: option is its id in the table options.
//     When RESEND_API_KEY, ORDER_FROM and WAREHOUSE_EMAIL are set, the PDF is emailed to the member who ordered and the warehouse
//     (the warehouse's message is in WAREHOUSE_LANG: fr, en or sr, default sr).
//   POST { action: 'code', email, lang }
//     -> { ok } and a 6-digit sign-in code by email, for members only (needs RESEND_API_KEY and ORDER_FROM).
//     The page then signs in with Supabase Auth (verify, type email) and reads its own orders.
//   POST { action: 'pdf', id } with Authorization: Bearer <session>
//     -> { pdf, filename } for an order of the signed-in member, or any order for an admin.
//   POST { action: 'inquiry', email, name, parish, phone, note, lang, items } -> { ok, number }
//     A visitor who is not a member asks for prices; the warehouse is told by email (when mail is set up).
//   POST { action: 'quote', id, lines: [{ code, qty, price, option }], send } with an admin's session
//     -> { pdf, filename, emailed, link }: the quote for an inquiry, emailed to the visitor when send is true.
//   POST { action: 'quote-get', token } -> the quote behind the link in its email and PDF
//   POST { action: 'quote-order', token, name, parish, phone, address, note } -> like an order, at the quote's prices
import { createClient } from '@supabase/supabase-js';
import { orderPdf, type Line, type Assets } from './pdf.ts';
import { readItems, buildLines, total as sumOf, type Item, type Problem } from './lines.ts';
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
  if (body.action === 'inquiry') return inquiry(req, body);
  if (body.action === 'quote') return quoteFor(req, body);
  if (body.action === 'quote-get') return quoteGet(body);
  if (body.action === 'quote-order') return quoteOrder(req, body);
  const email = clean(body.email, 200).toLowerCase();
  const lang = (['fr', 'en', 'sr'].includes(String(body.lang)) ? body.lang : 'fr') as Lang;
  const items = readItems(body.items);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !items) return json({ error: 'invalid' }, 400);

  // same guard as the price check
  const ip = clientIp(req);
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count: fails } = await db.from('attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('ok', false).gte('at', since);
  if ((fails ?? 0) >= 10) return json({ error: 'too_many' }, 429);
  const { data: priest } = await db.from('priests').select('id, name, parish, phone, address, grp').eq('email', email).eq('active', true).maybeSingle();
  if (!priest) {
    await db.from('attempts').insert({ ip, ok: false });
    return json({ error: 'unknown' }, 404);
  }

  // price every line from the database, at the price of the member's group (markup in percent over the article's price)
  const priced = await linesFor(items, lang);
  if ('error' in priced) return problem(priced);
  const { data: group } = await db.from('contact_groups').select('markup').eq('grp', priest.grp ?? 'svestenstvo').maybeSingle();
  const factor = 1 + Number(group?.markup ?? 0) / 100;
  const lines = factor === 1 ? priced.lines : priced.lines.map((l) => ({ ...l, price: Math.round(l.price * factor * 100) / 100 }));
  const total = sumOf(lines);

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
  return json(await finishOrder(saved, lang, email, who, lines, total));
});

// the articles and options of a list, from the database, into lines in the order's language
async function linesFor(items: Item[], lang: Lang, checkStock = true): Promise<{ lines: Line[] } | Problem | { error: 'server' }> {
  const codes = [...new Set(items.map((i) => i.code))];
  const [{ data: products, error: e1 }, { data: options, error: e2 }] = await Promise.all([
    db.from('products').select('code, name_fr, name_en, name_sr, price, unit, sort, available').eq('active', true).in('code', codes),
    db.from('options').select('id, product, sku, label_fr, label_en, label_sr, available, active').eq('active', true).in('product', codes),
  ]);
  if (e1 || e2) { console.error('lines', e1 || e2); return { error: 'server' }; }
  return buildLines(items, products ?? [], options ?? [], lang, { checkStock });
}
const problem = (p: Problem | { error: 'server' }) =>
  json(p, p.error === 'server' ? 500 : p.error === 'unavailable' ? 409 : 400);

type Who = { name: string; parish: string; phone: string; address: string; note: string };
// the PDF of a saved order, and the emails to the member and the warehouse
async function finishOrder(saved: { id: number; created_at: string }, lang: Lang, email: string, who: Who, lines: Line[], total: number) {
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
  return { number: saved.id, total, emailed, pdf, filename };
}

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

// ---------- price inquiries and quotes ----------

const SITE = (Deno.env.get('SITE_URL') ?? 'https://magacinzapadnoevropski.com/').replace(/\/?$/, '/');
const langPath = (l: Lang) => (l === 'fr' ? '' : `${l}/`);
const mailOn = () => !!(Deno.env.get('RESEND_API_KEY') && Deno.env.get('ORDER_FROM'));
const pickLang = (v: unknown) => (['fr', 'en', 'sr'].includes(String(v)) ? v : 'fr') as Lang;

async function adminOf(req: Request) {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return null;
  const { data: admin } = await db.from('admins').select('user_id').eq('user_id', u.user.id).maybeSingle();
  return admin ? u.user : null;
}

// a visitor's list, for the warehouse to price
async function inquiry(req: Request, body: Record<string, unknown>) {
  if (clean(body.website, 200)) return json({ ok: true }); // the hidden field: only robots fill it
  const email = clean(body.email, 200).toLowerCase();
  const lang = pickLang(body.lang);
  const items = readItems(body.items);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !items) return json({ error: 'invalid' }, 400);
  const ip = clientIp(req);
  const hour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await db.from('attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('kind', 'inquiry').gte('at', hour);
  if ((count ?? 0) >= 5) return json({ error: 'too_many' }, 429);
  // what is asked, as the warehouse will price it: known articles, each with its option
  const checked = await linesFor(items, lang, false);
  if ('error' in checked) return problem(checked);
  const asked = checked.lines.map((l) => ({ code: l.code, qty: l.qty, ...(l.option ? { option: l.option } : {}) }));
  const who = { name: clean(body.name, 120), parish: clean(body.parish, 160), phone: clean(body.phone, 40), note: clean(body.note, 1000) };
  const { data: saved, error } = await db.from('inquiries').insert({ email, lang, items: asked, ...who }).select('id').single();
  if (error || !saved) { console.error('inquiry', error); return json({ error: 'server' }, 500); }
  await db.from('attempts').insert({ ip, ok: true, kind: 'inquiry' });
  const warehouse = Deno.env.get('WAREHOUSE_EMAIL');
  if (warehouse && mailOn()) {
    const wl = pickLang(Deno.env.get('WAREHOUSE_LANG') ?? 'sr');
    const ok = await sendMail(warehouse, email, fill(T[wl].inqSubject, { n: saved.id }),
      fill(T[wl].inqMail, { n: saved.id, who: who.name || email, email, count: asked.length, admin: `${SITE}admin/#upiti` }));
    if (ok) await db.from('inquiries').update({ emailed: true }).eq('id', saved.id);
  }
  return json({ ok: true, number: saved.id });
}

// the admin prices an inquiry in one click: the quote as a PDF, emailed to the visitor (or downloaded)
async function quoteFor(req: Request, body: Record<string, unknown>) {
  if (!(await adminOf(req))) return json({ error: 'signed_out' }, 401);
  const id = Number(body.id);
  const { data: inq } = await db.from('inquiries').select('*').eq('id', id).maybeSingle();
  if (!inq) return json({ error: 'not_found' }, 404);
  const lang = pickLang(inq.lang);
  const asked = readItems(body.lines, true);
  if (!asked) return json({ error: 'invalid' }, 400);
  const priced = await linesFor(asked, lang, false);
  if ('error' in priced) return problem(priced);
  const lines = priced.lines;
  const total = sumOf(lines);
  const link = `${SITE}${langPath(lang)}?ponuda=${inq.token}`;
  const now = new Date();
  const name = lang === 'sr' ? toCyrillic(inq.name) : inq.name ?? '';
  const bytes = await orderPdf({ number: inq.id, date: now, lang, kind: 'quote', link, email: inq.email, name, parish: inq.parish ?? '', phone: inq.phone ?? '', lines, total }, await pdfAssets());
  const pdf = toB64(bytes);
  const t = T[lang];
  const filename = fill(t.quoteFile, { n: inq.id });
  let emailed = false;
  if (body.send) {
    if (!mailOn()) return json({ error: 'mail_off' }, 503);
    const money = new Intl.NumberFormat(LOCALE[lang], { style: 'currency', currency: 'EUR' }).format(total);
    emailed = await sendMail(inq.email, Deno.env.get('WAREHOUSE_EMAIL') || inq.email, fill(t.quoteSubject, { n: inq.id }), fill(t.quoteMail, { n: inq.id, total: money, link }), filename, pdf);
    if (!emailed) return json({ error: 'mail_failed' }, 502);
  }
  const { data: row } = await db.from('inquiries').update({
    quote: lines, quote_total: total, quoted_at: now.toISOString(),
    status: inq.status === 'ordered' ? 'ordered' : 'sent', emailed: emailed || inq.emailed,
  }).eq('id', inq.id).select('*').single();
  return json({ pdf, filename, emailed, link, inquiry: row });
}

// the quote behind its link, for 30 days, until it is ordered
async function openQuote(token: unknown) {
  const tk = clean(token, 60);
  if (!/^[0-9a-f-]{36}$/i.test(tk)) return { error: 'not_found', status: 404 } as const;
  const { data: q } = await db.from('inquiries').select('*').eq('token', tk).maybeSingle();
  if (!q || !q.quote) return { error: 'not_found', status: 404 } as const;
  if (q.status !== 'sent' || Date.now() - Date.parse(q.quoted_at) > 30 * 86400000) return { error: 'gone', status: 410 } as const;
  return { q };
}
async function quoteGet(body: Record<string, unknown>) {
  const r = await openQuote(body.token);
  if (!('q' in r)) return json({ error: r.error }, r.status);
  const q = r.q;
  return json({ number: q.id, lang: q.lang, lines: q.quote, total: Number(q.quote_total), email: q.email, name: q.name ?? '', parish: q.parish ?? '', phone: q.phone ?? '' });
}
async function quoteOrder(req: Request, body: Record<string, unknown>) {
  const r = await openQuote(body.token);
  if (!('q' in r)) return json({ error: r.error }, r.status);
  const q = r.q;
  const lines = q.quote as Line[];
  const [{ data: products }, { data: options }] = await Promise.all([
    db.from('products').select('code, available').eq('active', true).in('code', lines.map((l) => l.code)),
    db.from('options').select('id, available').eq('active', true).in('id', lines.filter((l) => l.option).map((l) => l.option)),
  ]);
  const ok = new Map((products ?? []).map((p) => [p.code, p.available]));
  const okOpt = new Map((options ?? []).map((o) => [o.id, o.available]));
  const gone = lines.filter((l) => !ok.get(l.code) || (l.option && !okOpt.get(l.option))).map((l) => l.sku || l.code);
  if (gone.length) return json({ error: 'unavailable', codes: gone }, 409);
  const lang = pickLang(q.lang);
  const name = clean(body.name, 120) || q.name || '';
  const who = {
    name: lang === 'sr' ? toCyrillic(name) : name,
    parish: clean(body.parish, 160) || q.parish || '', phone: clean(body.phone, 40) || q.phone || '',
    address: clean(body.address, 300), note: clean(body.note, 1000),
  };
  const total = Number(q.quote_total);
  const { data: saved, error } = await db.from('orders').insert({ priest_id: null, email: q.email, lang, items: lines, total, ...who }).select('id, created_at').single();
  if (error || !saved) return json({ error: 'server' }, 500);
  await db.from('inquiries').update({ status: 'ordered', order_id: saved.id }).eq('id', q.id);
  void req;
  return json(await finishOrder(saved, lang, q.email, who, lines, total));
}
