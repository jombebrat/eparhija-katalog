// An admin opens a member's account page as that member.
//   POST { email } with an admin's session -> { email, code }
// The code is the same one-time sign-in code the member gets by mail; the account page signs in with it (Supabase Auth, verify).
import { createClient } from '@supabase/supabase-js';

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

  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 200);
  const { data: member } = await db.from('priests').select('id').eq('email', email).maybeSingle();
  if (!member) return json({ error: 'unknown' }, 404);
  await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { member: true } }); // "already registered" is fine
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  const code = data?.properties?.email_otp;
  if (error || !code) { console.error('as-member', error); return json({ error: 'server' }, 500); }
  console.log('as-member', u.user.email, '->', email);
  return json({ email, code });
});
