// Config, session, requests to the database and storage, small helpers shared by every screen.
import { norm, esc, photoUrl } from '../render.js?v=2e5794a19b';
export { norm, esc, photoUrl };


export const C = JSON.parse(document.getElementById('admin-config').textContent);
// an admin can sign in with a bare user name: "djakon" is the account djakon@<userDomain>
export const USER_DOMAIN = C.userDomain || 'magacin.example.com';
export const shown = (e) => (e && e.endsWith(`@${USER_DOMAIN}`) ? e.slice(0, -USER_DOMAIN.length - 1) : e || '');
export const SITE = new URL('../', location.href).href;
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const money = new Intl.NumberFormat('sr-Latn-RS', { style: 'currency', currency: 'EUR' });
export const when = new Intl.DateTimeFormat('sr-Latn-RS', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });
// 1 artikal, 2 artikla, 5 artikala
export const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100;
  return `${n} ${a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many}`;
};
export const X = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';

// the sign-in screen is set up later (signin.js); the api only asks for it when the session is over
export const hooks = { gate: () => {} };

// ---------- session ----------
const KEY = 'ek-admin';
export let session = (() => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } })();
export function keep(s) {
  session = s;
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* private window: the session lasts this tab */ }
}

export async function call(url, init) {
  let r;
  try { r = await fetch(url, init); } catch { throw Object.assign(new Error('offline'), { offline: true }); }
  const text = r.status === 204 ? '' : await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!r.ok) {
    throw Object.assign(new Error(body?.message || body?.msg || body?.error_description || r.statusText), {
      status: r.status, code: body?.code ?? body?.error_code ?? body?.error, details: body?.details,
    });
  }
  return body;
}

export const auth = (path, body, bearer, method = 'POST') => call(`${C.url}/auth/v1/${path}`, {
  method, headers: { apikey: C.key, 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
  body: JSON.stringify(body),
});

export const fromAuth = (j) => keep({
  access_token: j.access_token, refresh_token: j.refresh_token,
  expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), email: j.user?.email || session?.email || '',
});

let refreshing = null;
export async function token() {
  if (!session) throw signedOut();
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  refreshing ??= auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
    .then(fromAuth).finally(() => { refreshing = null; });
  try { await refreshing; } catch (e) { if (e.offline) throw e; throw signedOut(); }
  return session.access_token;
}

function signedOut(msg = 'Sesija je istekla. Prijavite se ponovo.') {
  keep(null);
  hooks.gate(msg);
  return Object.assign(new Error('signed out'), { signedOut: true });
}

export async function db(path, { method = 'GET', body, prefer } = {}) {
  const t = await token();
  try {
    const res = await call(`${C.url}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: C.key, Authorization: `Bearer ${t}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return res;
  } catch (e) {
    if (e.status === 401) throw signedOut();
    throw e;
  }
}
export const eq = (v) => `eq.${encodeURIComponent(v)}`;
// one changed row back, or an error when the database let nothing through
export const one = (rows) => {
  if (!Array.isArray(rows) || !rows.length) throw Object.assign(new Error('denied'), { code: '42501' });
  return rows[0];
};

export function reason(e) {
  if (e?.offline) return 'Nema veze sa bazom. Proverite internet i pokušajte ponovo.';
  if (e?.code === '23505') return 'Takav unos već postoji: šifra, oznaka ili mejl su zauzeti.';
  if (e?.code === '23503') return 'Unos je vezan za druge podatke, na primer kategorija koja još ima artikle.';
  if (e?.code === '23514') return 'Neka vrednost nije dozvoljena. Proverite brojeve i oznaku.';
  if (e?.code === '42501' || e?.status === 403) return 'Ovaj nalog nema pravo na tu izmenu.';
  if (e?.status === 413) return 'Fotografija je prevelika (najviše 5 MB).';
  return e?.message || 'Nepoznata greška.';
}

// ---------- storage: product photos ----------
const PUBLIC = `${C.url}/storage/v1/object/public/products/`;
async function upload(path, blob) {
  const t = await token();
  await call(`${C.url}/storage/v1/object/products/${path}`, {
    method: 'POST',
    headers: { apikey: C.key, Authorization: `Bearer ${t}`, 'Content-Type': blob.type, 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
    body: blob,
  });
}
export async function removeFiles(srcs) {
  const paths = srcs.filter((s) => s?.startsWith(PUBLIC)).flatMap((s) => { const b = s.slice(PUBLIC.length); return [`${b}.webp`, `${b}-s.webp`]; });
  if (!paths.length) return;
  const t = await token();
  await call(`${C.url}/storage/v1/object/products`, {
    method: 'DELETE', headers: { apikey: C.key, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths }),
  }).catch(() => { /* a stray file costs nothing on the site */ });
}

// a photo from the phone or the camera, made to the site's two sizes, on a white ground
async function resized(file, maxW, maxH) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, maxW / bmp.width, maxH / bmp.height);
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
  cx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  let blob = await new Promise((r) => cv.toBlob(r, 'image/webp', 0.85));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.86));
  return { blob, w, h };
}
export const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'artikal';
export async function addPhoto(file, code) {
  const big = await resized(file, 1600, 1600);
  const small = await resized(file, 640, 800);
  const base = `${slug(code)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await upload(`${base}.webp`, big.blob);
  await upload(`${base}-s.webp`, small.blob);
  return { src: PUBLIC + base, w: small.w, h: small.h, W: big.w, H: big.h };
}
export const thumb = (ph) => photoUrl(SITE, ph.src, true);
