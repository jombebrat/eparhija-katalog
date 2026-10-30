// POST { email } -> { priest: { name, parish, phone, address }, prices: { CODE: price } }
// POST { email, pdf: true, blank?: true } -> { url }: a five-minute link to the price-list PDF (private bucket `catalogue`), for members only
// Prices are only returned for an email on the members' list (table public.priests, active = true).
// Failed checks are counted per IP so nobody can try addresses one after another.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const secret = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default; } catch { return undefined; }
})() ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const db = createClient(Deno.env.get('SUPABASE_URL')!, secret!, { auth: { persistSession: false } });

const MAX_FAILS_PER_IP = 10;     // in 15 minutes
const MAX_FAILS_TOTAL = 300;     // in 15 minutes, across everyone

const clientIp = (req: Request) =>
  (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let email = '', wantPdf = false, blank = false;
  try { const b = await req.json(); email = String(b.email ?? '').trim().toLowerCase(); wantPdf = b.pdf === true; blank = b.blank === true; } catch { /* empty body */ }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return json({ error: 'invalid' }, 400);

  const ip = clientIp(req);
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [{ count: mine }, { count: all }] = await Promise.all([
    db.from('attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('ok', false).gte('at', since),
    db.from('attempts').select('id', { count: 'exact', head: true }).eq('ok', false).gte('at', since),
  ]);
  if ((mine ?? 0) >= MAX_FAILS_PER_IP || (all ?? 0) >= MAX_FAILS_TOTAL) return json({ error: 'too_many' }, 429);

  const { data: priest, error } = await db.from('priests').select('id, name, parish, phone, address').eq('email', email).eq('active', true).maybeSingle();
  if (error) return json({ error: 'server' }, 500);
  await db.from('attempts').insert({ ip, ok: !!priest });
  if (Math.random() < 0.05) await db.from('attempts').delete().lt('at', new Date(Date.now() - 86400000).toISOString());
  if (!priest) {
    await new Promise((r) => setTimeout(r, 400));
    return json({ error: 'unknown' }, 404);
  }

  if (wantPdf) {
    const { data, error: e3 } = await db.storage.from('catalogue').createSignedUrl(blank ? 'cenovnik-bez-cena.pdf' : 'cenovnik.pdf', 300, { download: blank ? 'Magacin-Eparhije-cenovnik-bez-cena.pdf' : 'Magacin-Eparhije-cenovnik.pdf' });
    if (e3 || !data?.signedUrl) return json({ error: 'nopdf' }, 404);
    return json({ url: data.signedUrl });
  }

  const { data: products, error: e2 } = await db.from('products').select('code, price').eq('active', true);
  if (e2) return json({ error: 'server' }, 500);
  const prices = Object.fromEntries((products ?? []).map((p) => [p.code, Number(p.price)]));
  return json({ priest: { name: priest.name ?? '', parish: priest.parish ?? '', phone: priest.phone ?? '', address: priest.address ?? '' }, prices });
});
