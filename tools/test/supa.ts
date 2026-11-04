// Local stand-in for Supabase (Auth, REST, Storage, the two functions), for testing the site and the admin.
import { orderPdf } from '/home/claude/eparhija-katalog/supabase/functions/order/pdf.ts';
import { toCyrillic } from '/home/claude/eparhija-katalog/supabase/functions/order/i18n.ts';
import { readItems, buildLines, total as sumOf } from '/home/claude/eparhija-katalog/supabase/functions/order/lines.ts';
const OUT = Deno.env.get('MOCK_OUT') || '/tmp/eparhija-mock-out';
await Deno.mkdir(OUT, { recursive: true });
// Izmišljene cene (prave cene nisu u repou): šifra iz kataloga -> 5 + redni broj.
const cat = JSON.parse(await Deno.readTextFile(new URL('../../data/catalogue.json', import.meta.url)));
const prices: Record<string, number> = {};
cat.products.forEach((p: { code: string }, i: number) => { prices[p.code] = 5 + (i % 40); });
for (const [k, v] of Object.entries({ ...prices })) if (k.startsWith('bougie-')) prices[k === 'bougie-dikiri' ? 'D/T' : k.slice(7).replace('-', '/')] = v;
const A = new URL('../../supabase/functions/order/assets/', import.meta.url).pathname;
const assets = { regular: await Deno.readFile(A + 'onest-400.ttf'), bold: await Deno.readFile(A + 'onest-700.ttf'), emblem: await Deno.readFile(A + 'emblem.png') };

type Row = Record<string, any>;
const T: Record<string, Row[]> = {
  categories: cat.categories.map((c: Row) => ({ ...c })),
  products: cat.products.map((p: Row) => ({ ...p, price: prices[p.code] ?? 0, stock: ({ P013: 0, P011: 12, H004: 30, P074: 40, A006: 8 } as Record<string, number>)[p.code] ?? null, min_stock: ({ P011: 15, A006: 5 } as Record<string, number>)[p.code] ?? null, active: true, updated_at: new Date().toISOString() })),
  priests: [
    { id: 1, email: 'otac.nikola@example.com', name: 'P. Nikola Petrović', parish: 'Saint-Sava, Paris', phone: '+33 6 12 34 56 78', active: true, created_at: new Date().toISOString() },
    { id: 2, email: 'jerej.marko@example.com', name: 'Jerej Marko Ilić', parish: 'Lyon', phone: '', active: true, created_at: new Date().toISOString() },
  ],
  orders: [],
  status_log: [],
  stock_moves: [
    { id: 2, at: new Date().toISOString(), product: 'P011', option_id: null, label: null, kind: 'receipt', delta: 5, before_qty: 7, after_qty: 12, reason: 'Isporuka dobavljača', admin: 'admin@example.com' },
    { id: 1, at: new Date(Date.now() - 864e5).toISOString(), product: 'P011', option_id: null, label: null, kind: 'initial', delta: 7, before_qty: null, after_qty: 7, reason: 'Početno stanje', admin: null },
  ],
  inquiries: [],
  message_templates: [],
  options: (cat.options || []).map((o: Row) => ({ ...o, erplain_id: null, stock: o.available ? 3 : 0, updated_at: new Date().toISOString() })),
};
const KEYS: Record<string, string> = { categories: 'id', products: 'code', priests: 'id', orders: 'id', inquiries: 'id', options: 'id' };
const seq: Record<string, number> = { priests: 2, orders: 0, inquiries: 0, options: Math.max(0, ...T.options.map((o) => o.id)) };
const OPTION_COLS = ['id', 'product', 'sku', 'label_sr', 'label_fr', 'label_en', 'available', 'active', 'sort'];
const PUBLIC_COLS = ['code', 'category', 'name_fr', 'name_en', 'name_sr', 'note_fr', 'note_en', 'note_sr', 'unit', 'available', 'photos', 'sort'];
const avail = (p: Row) => ({ ...p, available: p.stock === null || p.stock === undefined || p.stock > 0 });
T.products = T.products.map(avail);

const users: Record<string, { password: string | null; admin: boolean }> = { 'admin@example.com': { password: 'tajna-lozinka-1', admin: true }, 'djakon@magacin.example.com': { password: 'djakonnajjaci', admin: true }, 'nobody@example.com': { password: 'lozinka-1234', admin: false } };
const codes: Record<string, string> = {};
let mailOff = false;
// a year of orders, so the statistics have something to count
{
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pool = ['P011', 'P074', 'H004', '10/1', 'P012', 'A006', 'P014', 'H006', '30/1', 'P020'].filter((c) => T.products.some((p) => p.code === c));
  const who = [T.priests[0], T.priests[1]];
  for (let i = 0; i < 36; i++) {
    const at = new Date(Date.now() - Math.floor(rnd() * 360) * 86400000 - 3600000);
    const pr = who[i % 2];
    const n = 1 + Math.floor(rnd() * 4);
    const codesIn = [...new Set(Array.from({ length: n }, () => pool[Math.floor(rnd() * (i < 18 ? 4 : pool.length))]))];
    const lines = codesIn.map((c) => { const p = T.products.find((x) => x.code === c)!; return { code: c, name: p.name_sr, qty: 1 + Math.floor(rnd() * 5), price: p.price, unit: p.unit }; });
    const total = Math.round(lines.reduce((a, l) => a + l.price * l.qty, 0) * 100) / 100;
    T.orders.push({ id: ++seq.orders, created_at: at.toISOString(), priest_id: pr.id, email: pr.email, name: pr.name, parish: pr.parish, phone: pr.phone, address: null, note: null, lang: 'sr', items: lines, total, emailed: false, status: i % 7 === 3 ? 'cancelled' : i < 30 ? 'done' : 'new', stock_taken: null });
  }
  T.orders.forEach((o, i) => { if (i < 12) { o.note = `[Erplain FAC-${1100 + i}] TTC ${(o.total * 1.2).toFixed(2)}` + (i % 4 === 1 ? '; nije plaćena' : ''); o.status = i === 5 ? 'cancelled' : 'done'; } });
  T.orders.sort((a, b) => a.id - b.id);
(globalThis as any).logId = 0; for (const o of T.orders) T.status_log.push({ id: ++(globalThis as any).logId, entity: 'order', entity_id: o.id, from_status: null, to_status: 'new', changed_by: 'sajt', changed_at: o.created_at });
  T.inquiries.push({ id: ++seq.inquiries, created_at: new Date(Date.now() - 5 * 3600000).toISOString(), email: 'marie.dupont@example.fr', name: 'Marie Dupont', parish: 'Lyon, Saints-Cyrille-et-Méthode', phone: '', note: 'Pour la fête de la paroisse.', lang: 'fr', items: [{ code: 'P074', qty: 2 }, { code: 'H004', qty: 1 }, { code: '10/1', qty: 3 }], status: 'new', quote: null, quote_total: null, quoted_at: null, token: crypto.randomUUID(), order_id: null, emailed: false });
}
const tokens: Record<string, string> = {};
const files = new Map<string, { bytes: Uint8Array; type: string }>();
const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, content-type, authorization, prefer, x-upsert, cache-control, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...H, 'Content-Type': 'application/json' } });
const who = (req: Request) => tokens[(req.headers.get('authorization') || '').replace(/^Bearer /, '')];
const isAdmin = (req: Request) => !!users[who(req) || '']?.admin;
let slow = 0; // ms, set by GET /__slow?ms=

function filter(rows: Row[], p: URLSearchParams) {
  let out = rows;
  for (const [k, v] of p) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    const [op, ...rest] = v.split('.');
    const val = rest.join('.');
    if (op === 'eq') out = out.filter((r) => String(r[k]) === val);
    if (op === 'in') { const set = val.replace(/^\(|\)$/g, '').split(','); out = out.filter((r) => set.includes(String(r[k]))); }
  }
  return out;
}
function order(rows: Row[], o: string | null) {
  if (!o) return rows;
  const keys = o.split(',').map((s) => { const [c, d] = s.split('.'); return [c, d === 'desc' ? -1 : 1] as const; });
  return [...rows].sort((a, b) => { for (const [c, d] of keys) { const x = a[c], y = b[c]; if (x === y) continue; if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1; return (x < y ? -1 : 1) * d; } return 0; });
}
function orderStock(old: Row, next: Row) {
  const target = (k: string) => (k.startsWith('#') ? T.options.find((x) => x.id === Number(k.slice(1))) : T.products.find((x) => x.code === k));
  if (next.status === 'done' && old.status !== 'done') {
    const want: Record<string, number> = {};
    for (const l of next.items) { const k = l.option ? `#${l.option}` : l.code; want[k] = (want[k] || 0) + l.qty; }
    const took: Record<string, number> = {};
    for (const [c, q] of Object.entries(want)) { const p = target(c); if (p && p.stock !== null) { const n = Math.min(p.stock, q); p.stock -= n; took[c] = n; Object.assign(p, avail(p)); } }
    next.stock_taken = took;
  } else if (old.status === 'done' && next.status !== 'done') {
    for (const [c, n] of Object.entries(old.stock_taken || {})) { const p = target(c); if (p && p.stock !== null) { p.stock += n as number; Object.assign(p, avail(p)); } }
    next.stock_taken = null;
  }
}
const priceList = (items: Row[], lang: 'fr' | 'en' | 'sr', checkStock = true) => buildLines(items as never, T.products.filter((p) => p.active), T.options, lang, { checkStock });

Deno.serve({ port: 54321 }, async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: H });
  const url = new URL(req.url);
  const path = url.pathname;
  if (path === '/__slow') { slow = Number(url.searchParams.get('ms') || 0); return json({ slow }); }
  if (slow) await new Promise((r) => setTimeout(r, slow));

  // ----- auth -----
  if (path === '/auth/v1/token') {
    const b = await req.json();
    if (url.searchParams.get('grant_type') === 'password') {
      const u = users[String(b.email).toLowerCase()];
      if (!u || u.password !== b.password) return json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      const t = crypto.randomUUID();
      tokens[t] = String(b.email).toLowerCase();
      return json({ access_token: t, refresh_token: 'r-' + t, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: tokens[t] } });
    }
    const old = String(b.refresh_token).slice(2);
    if (!tokens[old]) return json({ error_code: 'refresh_token_not_found' }, 400);
    const t = crypto.randomUUID(); tokens[t] = tokens[old];
    return json({ access_token: t, refresh_token: 'r-' + t, expires_in: 3600, user: { email: tokens[t] } });
  }
  if (path === '/auth/v1/verify') {
    const b = await req.json();
    const e = String(b.email).toLowerCase();
    if (!codes[e] || codes[e] !== b.token || !['email', 'magiclink'].includes(b.type)) return json({ code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403);
    delete codes[e];
    users[e] ??= { password: null, admin: false };
    const t = crypto.randomUUID(); tokens[t] = e;
    return json({ access_token: t, refresh_token: 'r-' + t, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: e } });
  }
  if (path === '/__mail') { mailOff = url.searchParams.get('off') === '1'; return json({ mailOff }); }
  if (path === '/__code') return json(codes);
  if (path === '/auth/v1/logout') { delete tokens[(req.headers.get('authorization') || '').slice(7)]; return new Response(null, { status: 204, headers: H }); }
  if (path === '/auth/v1/user' && req.method === 'PUT') {
    const e = who(req); if (!e) return json({ msg: 'no' }, 401);
    const b = await req.json();
    if (b.password === users[e].password) return json({ error_code: 'same_password', msg: 'same' }, 422);
    users[e].password = b.password; return json({ email: e });
  }

  // ----- rest -----
  if (path === '/rest/v1/rpc/is_admin') { if (!who(req)) return json({ message: 'JWT' }, 401); return json(isAdmin(req)); }
  if (path === '/rest/v1/rpc/stock_move') {
    const b = await req.json(); const p = T.products.find((x) => x.code === b.p_code);
    if (!p) return json({ message: 'no such article' }, 400);
    const have = p.stock ?? 0; const want = b.p_kind === 'receipt' ? have + b.p_qty : b.p_kind === 'issue' ? have - b.p_qty : b.p_qty;
    if (want < 0) return json({ message: `not enough in stock (have ${have})` }, 400);
    T.stock_moves.unshift({ id: T.stock_moves.length + 1, at: new Date().toISOString(), product: b.p_code, option_id: null, label: null, kind: b.p_kind, delta: want - have, before_qty: p.stock, after_qty: want, reason: b.p_reason, admin: 'admin@example.com' });
    p.stock = want; return json(want);
  }
  if (path === '/rest/v1/rpc/update_my_details') {
    const e = who(req); if (!e) return json({ message: 'JWT' }, 401);
    const b = await req.json();
    const pr = T.priests.find((x) => x.email === e && x.active);
    if (!pr) return json([]);
    const v = (x: unknown, n: number) => (String(x ?? '').trim().slice(0, n) || null);
    Object.assign(pr, { name: v(b.p_name, 120), parish: v(b.p_parish, 160), phone: v(b.p_phone, 40), address: v(b.p_address, 300) });
    return json([pr]);
  }
  const m = path.match(/^\/rest\/v1\/(\w+)$/);
  if (m) {
    const table = m[1];
    const rows = T[table];
    if (!rows) return json({ message: 'no table' }, 404);
    const admin = isAdmin(req);
    if (req.headers.get('authorization') && !who(req)) return json({ message: 'JWT expired' }, 401);
    if (req.method === 'GET') {
      if (!admin) {
        if (table === 'categories') return json(order(rows, url.searchParams.get('order')));
        if (table === 'products') return json(order(filter(rows.filter((r) => r.active), url.searchParams), url.searchParams.get('order')).map((r) => Object.fromEntries(PUBLIC_COLS.map((c) => [c, r[c]]))));
        if (table === 'options') return json(order(filter(rows.filter((r) => r.active), url.searchParams), url.searchParams.get('order')).map((r) => Object.fromEntries(OPTION_COLS.map((c) => [c, r[c]]))));
        const e = who(req);
        if (e && table === 'priests') return json(rows.filter((r) => r.email === e));
        if (e && table === 'orders') return json(order(rows.filter((r) => r.email === e), url.searchParams.get('order')));
        return json({ message: 'permission denied', code: '42501' }, 401);
      }
      let out = order(filter(rows, url.searchParams), url.searchParams.get('order'));
      const lim = Number(url.searchParams.get('limit') || 0); if (lim) out = out.slice(0, lim);
      return json(out);
    }
    if (!admin) return json({ message: 'permission denied', code: '42501' }, 403);
    const rep = (req.headers.get('prefer') || '').includes('return=representation');
    const key = KEYS[table];
    if (req.method === 'POST' && table === 'message_templates') {
      const b = await req.json();
      const i = rows.findIndex((x) => x.key === b.key && x.lang === b.lang);
      if (i >= 0) rows[i] = { ...rows[i], ...b }; else rows.push({ ...b });
      return rep ? json([rows[i >= 0 ? i : rows.length - 1]], 201) : new Response(null, { status: 201, headers: H });
    }
    if (req.method === 'POST') {
      const b = await req.json();
      const list = (Array.isArray(b) ? b : [b]).map((r: Row) => {
        const r2: Row = { ...r };
        if (table === 'priests') { r2.email = String(r2.email).toLowerCase(); r2.created_at = new Date().toISOString(); }
        if (key === 'id' && table !== 'categories') r2.id = ++seq[table];
        if (table === 'products') { delete r2.available; Object.assign(r2, avail({ photos: [], active: true, stock: null, sort: 0, ...r2 })); }
        if (table === 'options') { delete r2.available; Object.assign(r2, avail({ active: true, stock: null, sort: 0, sku: null, label_fr: null, label_en: null, erplain_id: null, ...r2 })); }
        return r2;
      });
      for (const r of list) {
        if (rows.some((x) => x[key] === r[key]) || (table === 'priests' && rows.some((x) => x.email === r.email))) return json({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
        if (table === 'products' && 'available' in r && false) return json({}, 400);
      }
      rows.push(...list);
      return rep ? json(list, 201) : new Response(null, { status: 201, headers: H });
    }
    if (req.method === 'PATCH') {
      const b = await req.json();
      if ((table === 'products' || table === 'options') && 'available' in b) return json({ code: '428C9', message: 'column "available" can only be updated to DEFAULT' }, 400);
      const hit = filter(rows, url.searchParams);
      if (b[key] !== undefined && hit.length && rows.some((x) => x[key] === b[key] && !hit.includes(x))) return json({ code: '23505', message: 'duplicate key' }, 409);
      if (table === 'products' && b.stock !== undefined && b.stock !== null && b.stock < 0) return json({ code: '23514', message: 'check' }, 400);
      for (const r of hit) {
        const next = { ...r, ...b };
        if (table === 'orders' && b.status) orderStock(r, next);
        if (table === 'products' || table === 'options') Object.assign(next, avail(next), { updated_at: new Date().toISOString() });
        if (table === 'products' && b.code && b.code !== r.code) {/* cascade nothing: covers are text */}
        if ((table === 'orders' || table === 'inquiries') && b.status && b.status !== r.status) T.status_log.push({ id: ++(globalThis as any).logId, entity: table === 'orders' ? 'order' : 'inquiry', entity_id: r.id, from_status: r.status, to_status: b.status, changed_by: 'admin@example.com', changed_at: new Date().toISOString() });
        Object.assign(r, next);
      }
      return rep ? json(hit) : new Response(null, { status: 204, headers: H });
    }
    if (req.method === 'DELETE') {
      const hit = filter(rows, url.searchParams);
      if (table === 'categories' && hit.some((c) => T.products.some((p) => p.category === c.id))) return json({ code: '23503', message: 'fk' }, 409);
      T[table] = rows.filter((r) => !hit.includes(r));
      return rep ? json(hit) : new Response(null, { status: 204, headers: H });
    }
  }

  // ----- storage -----
  if (path === '/__shipped') return json((globalThis as any).shipped || []);
  if (path === '/__changes') return json((globalThis as any).__changes || []);
  if (path.startsWith('/storage/v1/object/invoices/') || path.startsWith('/storage/v1/object/authenticated/invoices/')) {
    const name = path.replace(/^\/storage\/v1\/object\/(authenticated\/)?invoices\//, '');
    if (req.method === 'POST') { if (!isAdmin(req)) return json({ message: 'unauthorized' }, 403); files.set(`inv/${name}`, { bytes: new Uint8Array(await req.arrayBuffer()), type: 'application/pdf' }); return json({ Key: path }); }
    if (req.method === 'DELETE') { files.delete(`inv/${name}`); return json({}); }
    const f = files.get(`inv/${name}`);
    return f ? new Response(f.bytes, { headers: { ...H, 'Content-Type': f.type } }) : json({ message: 'not found' }, 404);
  }
  if (path.startsWith('/storage/v1/object/public/products/')) {
    const f = files.get(path.slice('/storage/v1/object/public/products/'.length));
    return f ? new Response(f.bytes, { headers: { ...H, 'Content-Type': f.type } }) : json({ message: 'not found' }, 404);
  }
  if (path.startsWith('/storage/v1/object/products/') && req.method === 'POST') {
    if (!isAdmin(req)) return json({ message: 'unauthorized' }, 403);
    files.set(path.slice('/storage/v1/object/products/'.length), { bytes: new Uint8Array(await req.arrayBuffer()), type: req.headers.get('content-type') || 'application/octet-stream' });
    return json({ Key: path });
  }
  if (path === '/storage/v1/object/products' && req.method === 'DELETE') {
    if (!isAdmin(req)) return json({ message: 'unauthorized' }, 403);
    const b = await req.json();
    for (const p of b.prefixes) files.delete(p);
    return json(b.prefixes.map((name: string) => ({ name })));
  }
  if (path === '/storage/v1/object/list/catalogue' && req.method === 'POST') {
    if (!isAdmin(req)) return json({ message: 'unauthorized' }, 403);
    const f = files.get('__catalogue/cenovnik.pdf');
    return json(f ? [{ name: 'cenovnik.pdf', updated_at: new Date().toISOString(), metadata: { size: f.bytes.length } }] : []);
  }
  if (path === '/storage/v1/object/catalogue/cenovnik.pdf' && req.method === 'POST') {
    if (!isAdmin(req)) return json({ message: 'unauthorized' }, 403);
    files.set('__catalogue/cenovnik.pdf', { bytes: new Uint8Array(await req.arrayBuffer()), type: 'application/pdf' });
    return json({ Key: 'catalogue/cenovnik.pdf' });
  }
  if (path === '/storage/v1/object/authenticated/catalogue/cenovnik.pdf') {
    if (!isAdmin(req)) return json({ message: 'unauthorized' }, 403);
    const f = files.get('__catalogue/cenovnik.pdf');
    return f ? new Response(f.bytes, { headers: { ...H, 'Content-Type': 'application/pdf' } }) : json({ message: 'not found' }, 404);
  }
  if (path === '/__pdf') {
    const f = files.get('__catalogue/cenovnik.pdf');
    return f ? new Response(f.bytes, { headers: { ...H, 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Magacin-Eparhije-cenovnik.pdf"' } }) : json({ message: 'not found' }, 404);
  }
  if (path === '/__files') return json([...files.keys()]);

  // ----- functions -----
  if (path.startsWith('/functions/v1/')) {
    const body = await req.json();
    if (body.action === 'code') {
      const e = String(body.email || '').toLowerCase();
      if (!T.priests.some((p) => p.email === e && p.active)) return json({ error: 'unknown' }, 404);
      if (mailOff) return json({ error: 'mail_off' }, 503);
      codes[e] = '123456';
      return json({ ok: true });
    }
    if (path.endsWith('/ship')) {
      if (!isAdmin(req)) return json({ error: 'signed_out' }, 401);
      (globalThis as any).shipped = [...((globalThis as any).shipped || []), body];
      return mailOff ? json({ sent: false, reason: 'mail_off' }) : json({ sent: true });
    }
    if (path.endsWith('/as-member')) {
      const e = String(body.email || '').toLowerCase();
      if (!T.priests.some((p) => p.email === e)) return json({ error: 'unknown' }, 404);
      codes[e] = '654321';
      return json({ email: e, code: '654321' });
    }
    if (body.action === 'inquiry') {
      if (body.website) return json({ ok: true });
      const e = String(body.email || '').toLowerCase();
      const its = readItems(body.items);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || !its) return json({ error: 'invalid' }, 400);
      const chk = priceList(its, body.lang, false);
      if ('error' in chk) return json(chk, 400);
      const asked = chk.lines.map((l) => ({ code: l.code, qty: l.qty, ...(l.option ? { option: l.option } : {}) }));
      const id = ++seq.inquiries;
      T.inquiries.push({ id, created_at: new Date().toISOString(), email: e, name: body.name || null, parish: body.parish || null, phone: body.phone || null, note: body.note || null, lang: body.lang, items: asked, status: 'new', quote: null, quote_total: null, quoted_at: null, token: crypto.randomUUID(), order_id: null, emailed: false });
      return json({ ok: true, number: id });
    }
    if (body.action === 'quote') {
      if (!isAdmin(req)) return json({ error: 'signed_out' }, 401);
      const q = T.inquiries.find((x) => x.id === Number(body.id));
      if (!q) return json({ error: 'not_found' }, 404);
      const its = readItems(body.lines, true);
      if (!its) return json({ error: 'invalid' }, 400);
      const pr = priceList(its, q.lang, false);
      if ('error' in pr) return json(pr, 400);
      const lines = pr.lines;
      const total = sumOf(lines);
      if (body.send && mailOff) return json({ error: 'mail_off' }, 503);
      const link = `http://localhost:8765/${q.lang === 'fr' ? '' : q.lang + '/'}?ponuda=${q.token}`;
      const bytes = await orderPdf({ number: q.id, date: new Date(), lang: q.lang, kind: 'quote', link, email: q.email, name: q.name, parish: q.parish, phone: q.phone, lines, total }, assets);
      await Deno.writeFile(`${OUT}/last-quote.pdf`, bytes);
      let s2 = ''; for (let i = 0; i < bytes.length; i += 0x8000) s2 += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      Object.assign(q, { quote: lines, quote_total: total, quoted_at: new Date().toISOString(), status: q.status === 'ordered' ? 'ordered' : 'sent', emailed: !!body.send || q.emailed });
      return json({ pdf: btoa(s2), filename: `devis-${q.id}.pdf`, emailed: !!body.send, link, inquiry: q });
    }
    if (body.action === 'quote-get' || body.action === 'quote-order') {
      const q = T.inquiries.find((x) => x.token === body.token);
      if (!q || !q.quote) return json({ error: 'not_found' }, 404);
      if (q.status !== 'sent') return json({ error: 'gone' }, 410);
      if (body.action === 'quote-get') return json({ number: q.id, lang: q.lang, lines: q.quote, total: q.quote_total, email: q.email, name: q.name || '', parish: q.parish || '', phone: q.phone || '' });
      const id = ++seq.orders;
      T.orders.push({ id, created_at: new Date().toISOString(), priest_id: null, email: q.email, name: body.name || q.name, parish: body.parish || q.parish, phone: body.phone || q.phone, address: body.address || null, note: body.note || null, lang: q.lang, items: q.quote, total: q.quote_total, emailed: false, status: 'new', stock_taken: null });
      Object.assign(q, { status: 'ordered', order_id: id });
      const bytes = await orderPdf({ number: id, date: new Date(), lang: q.lang, email: q.email, name: body.name || q.name, parish: body.parish, phone: body.phone, address: body.address, note: body.note, lines: q.quote, total: q.quote_total }, assets);
      let s2 = ''; for (let i = 0; i < bytes.length; i += 0x8000) s2 += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return json({ number: id, total: q.quote_total, emailed: false, pdf: btoa(s2), filename: `commande-${id}.pdf` });
    }
    if (body.action === 'member-cancel' || body.action === 'member-edit') {
      const e = who(req); if (!e) return json({ error: 'signed_out' }, 401);
      const o = T.orders.find((x) => x.id === Number(body.id));
      if (!o || o.email !== e) return json({ error: 'not_found' }, 404);
      if (o.status !== 'new') return json({ error: 'locked' }, 409);
      (globalThis as any).__changes ??= [];
      if (body.action === 'member-cancel') { o.status = 'cancelled'; (globalThis as any).__changes.push({ id: o.id, kind: 'cancel' }); }
      else {
        const keep = (body.items as any[]).map((a) => ({ ...o.items.find((l: any) => l.code === a.code && (l.option || null) === (a.option || null)), qty: a.qty }));
        o.items_original ??= o.items; o.items = keep; o.total = Math.round(keep.reduce((a: number, l: any) => a + l.price * l.qty, 0) * 100) / 100; o.edited_at = new Date().toISOString();
        (globalThis as any).__changes.push({ id: o.id, kind: 'edit', total: o.total });
      }
      return json({ ok: true, order: { id: o.id, status: o.status, items: o.items, total: o.total, edited_at: o.edited_at } });
    }
    if (body.action === 'pdf') {
      const e = who(req); if (!e) return json({ error: 'signed_out' }, 401);
      const o = T.orders.find((x) => x.id === Number(body.id));
      if (!o || (!users[e]?.admin && o.email !== e)) return json({ error: 'not_found' }, 404);
      const bytes = await orderPdf({ number: o.id, date: new Date(o.created_at), lang: o.lang, email: o.email, name: o.name, parish: o.parish, phone: o.phone, address: o.address, note: o.note, lines: o.items, total: o.total }, assets);
      let s2 = ''; for (let i = 0; i < bytes.length; i += 0x8000) s2 += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return json({ pdf: btoa(s2), filename: `porudzbina-${o.id}.pdf` });
    }
    const email = String(body.email || '').toLowerCase();
    const pr = T.priests.find((p) => p.email === email && p.active);
    if (!pr) return json({ error: 'unknown' }, 404);
    if (path.endsWith('/prices') && body.pdf === true) return files.has('__catalogue/cenovnik.pdf') ? json({ url: 'http://localhost:54321/__pdf' }) : json({ error: 'nopdf' }, 404);
    if (path.endsWith('/prices')) return json({ priest: { name: pr.name, parish: pr.parish, phone: pr.phone }, prices: Object.fromEntries(T.products.filter((p) => p.active).map((p) => [p.code, p.price])) });
    const its = readItems(body.items);
    if (!its) return json({ error: 'invalid' }, 400);
    const priced = priceList(its, body.lang);
    if ('error' in priced) return json(priced, priced.error === 'unavailable' ? 409 : 400);
    const lines = priced.lines;
    const total = sumOf(lines);
    const id = ++seq.orders;
    body.name = body.lang === 'sr' ? toCyrillic(body.name || pr.name) : body.name || pr.name;
    T.orders.push({ id, created_at: new Date().toISOString(), priest_id: pr.id, email, name: body.name || pr.name, parish: body.parish || pr.parish, phone: body.phone || pr.phone, address: body.address || null, note: body.note || null, lang: body.lang, items: lines, total, emailed: false, status: 'new', stock_taken: null });
    const bytes = await orderPdf({ number: id, date: new Date(), lang: body.lang, email, name: body.name, parish: body.parish, phone: body.phone, address: body.address, note: body.note, lines, total }, assets);
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    await Deno.writeFile(`${OUT}/last-${body.lang}.pdf`, bytes);
    return json({ number: id, total, emailed: false, pdf: btoa(s), filename: `commande-${id}.pdf` });
  }
  return json({ message: 'not found' }, 404);
});
