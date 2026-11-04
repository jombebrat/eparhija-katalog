// Tells a member that their order is finished and sent, with the invoice attached when there is one.
//   POST { id, subject, message } with an admin's session -> { sent: boolean, reason?: 'mail_off' | 'mail_failed' }
// The admin writes (or keeps) the message in the dialog; this function only sends it. Needs mail set up (see mail.ts).
import { createClient } from '@supabase/supabase-js';
import { mailOn, sendMail } from './mail.ts';

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

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, (c) => (c === '\n' ? c : '')).trim().slice(0, max);
const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: 'invalid' }, 400); }

  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'signed_out' }, 401);
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return json({ error: 'signed_out' }, 401);
  const { data: admin } = await db.from('admins').select('user_id').eq('user_id', u.user.id).maybeSingle();
  if (!admin) return json({ error: 'signed_out' }, 401);

  const id = Number(body.id);
  const subject = clean(body.subject, 200);
  const message = clean(body.message, 5000);
  if (!Number.isInteger(id) || !subject || !message) return json({ error: 'invalid' }, 400);
  const { data: order } = await db.from('orders').select('id, email, invoice_path, invoice_name').eq('id', id).maybeSingle();
  if (!order) return json({ error: 'not_found' }, 404);

  if (!mailOn()) return json({ sent: false, reason: 'mail_off' });

  let filename: string | undefined;
  let pdf: string | undefined;
  if (order.invoice_path) {
    const { data: file } = await db.storage.from('invoices').download(order.invoice_path);
    if (file) { filename = order.invoice_name || 'facture.pdf'; pdf = toB64(new Uint8Array(await file.arrayBuffer())); }
  }
  const ok = await sendMail(order.email, Deno.env.get('WAREHOUSE_EMAIL') || order.email, subject, message, filename, pdf);
  if (!ok) return json({ sent: false, reason: 'mail_failed' });
  console.log('ship', u.user.email, '-> order', id);
  return json({ sent: true });
});
