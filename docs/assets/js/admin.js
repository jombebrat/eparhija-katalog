// Administration of the warehouse: articles and their stock, categories, clergy, orders.
// Talks to Supabase over plain fetch (Auth, the REST API, Storage). What a signed-in account may read
// or change is decided by the database (an account must be listed in the `admins` table).
import { norm, esc, photoUrl } from './render.js?v=1381f84ccd';

const C = JSON.parse(document.getElementById('admin-config').textContent);
// an admin can sign in with a bare user name: "djakon" is the account djakon@<userDomain>
const USER_DOMAIN = C.userDomain || 'magacin.example.com';
const shown = (e) => (e && e.endsWith(`@${USER_DOMAIN}`) ? e.slice(0, -USER_DOMAIN.length - 1) : e || '');
const SITE = new URL('../', location.href).href;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const money = new Intl.NumberFormat('sr-Latn-RS', { style: 'currency', currency: 'EUR' });
const when = new Intl.DateTimeFormat('sr-Latn-RS', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });
// 1 artikal, 2 artikla, 5 artikala
const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100;
  return `${n} ${a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many}`;
};
const X = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';

// ---------- session ----------
const KEY = 'ek-admin';
let session = (() => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } })();
function keep(s) {
  session = s;
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* private window: the session lasts this tab */ }
}

async function call(url, init) {
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

const auth = (path, body, bearer, method = 'POST') => call(`${C.url}/auth/v1/${path}`, {
  method, headers: { apikey: C.key, 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
  body: JSON.stringify(body),
});

const fromAuth = (j) => keep({
  access_token: j.access_token, refresh_token: j.refresh_token,
  expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), email: j.user?.email || session?.email || '',
});

let refreshing = null;
async function token() {
  if (!session) throw signedOut();
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  refreshing ??= auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
    .then(fromAuth).finally(() => { refreshing = null; });
  try { await refreshing; } catch (e) { if (e.offline) throw e; throw signedOut(); }
  return session.access_token;
}

function signedOut(msg = 'Sesija je istekla. Prijavite se ponovo.') {
  keep(null);
  showGate(msg);
  return Object.assign(new Error('signed out'), { signedOut: true });
}

async function db(path, { method = 'GET', body, prefer } = {}) {
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
    if (method !== 'GET') pdfChanged(path, body);
    return res;
  } catch (e) {
    if (e.status === 401) throw signedOut();
    throw e;
  }
}
const eq = (v) => `eq.${encodeURIComponent(v)}`;
// one changed row back, or an error when the database let nothing through
const one = (rows) => {
  if (!Array.isArray(rows) || !rows.length) throw Object.assign(new Error('denied'), { code: '42501' });
  return rows[0];
};

function reason(e) {
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
async function removeFiles(srcs) {
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
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'artikal';
async function addPhoto(file, code) {
  const big = await resized(file, 1600, 1600);
  const small = await resized(file, 640, 800);
  const base = `${slug(code)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await upload(`${base}.webp`, big.blob);
  await upload(`${base}-s.webp`, small.blob);
  return { src: PUBLIC + base, w: small.w, h: small.h, W: big.w, H: big.h };
}
const thumb = (ph) => photoUrl(SITE, ph.src, true);

// ---------- data ----------
const D = { products: [], cats: [], priests: [], groups: [], orders: [], inquiries: [], options: [] };
const ST = { products: 'idle', cats: 'idle', priests: 'idle', groups: 'idle', orders: 'idle', inquiries: 'idle' };
const GROUPS = [['svestenstvo', 'Sveštenstvo'], ['ostali', 'Ostali kontakti']];
const groupOf = (p) => p.grp || 'svestenstvo';
const markupOf = (g) => Number(D.groups.find((x) => x.grp === g)?.markup ?? 0);
const allRows = async (path) => {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const page = await db(`${path}&limit=1000&offset=${from}`);
    all.push(...page);
    if (page.length < 1000) return all;
  }
};
const ERR = {};
const Q = {
  cats: () => db('categories?select=*&order=sort.asc,id.asc'),
  // the options (the saints of an icon) come with the articles they belong to
  products: async () => {
    const [p, o] = await Promise.all([db('products?select=*&order=sort.asc,code.asc'), allRows('options?select=*&order=product.asc,sort.asc,id.asc')]);
    D.options = o;
    return p;
  },
  priests: () => db('priests?select=*&order=name.asc.nullslast,email.asc'),
  groups: () => db('contact_groups?select=*&order=grp.asc'),
  orders: () => allRows('orders?select=*&order=created_at.desc'),
  inquiries: () => allRows('inquiries?select=*&order=created_at.desc'),
};
async function load(what, force = false) {
  if (!force && (ST[what] === 'ready' || ST[what] === 'loading')) return;
  ST[what] = 'loading';
  draw();
  try {
    D[what] = await Q[what]();
    ST[what] = 'ready';
  } catch (e) {
    if (e.signedOut) return;
    ST[what] = 'error'; ERR[what] = e;
  }
  draw();
}
const byCode = (code) => D.products.find((p) => p.code === code);
const optionsOf = (code) => D.options.filter((o) => o.product === code);
const optById = (id) => D.options.find((o) => o.id === Number(id));
const optStock = (code) => optionsOf(code).reduce((a, o) => a + (o.stock ?? 0), 0);
// at or under its reorder point (or gone): time to order more
const low = (p) => p.stock !== null && p.stock !== undefined && (p.stock === 0 || (p.min_stock !== null && p.min_stock !== undefined && p.stock <= p.min_stock));
const ledgerCounts = (all) => ({ '': all.length, out: all.filter((p) => p.stock === 0).length, low: all.filter(low).length, hidden: all.filter((p) => !p.active).length });
const catOf = (id) => D.cats.find((c) => c.id === id);
const catName = (id) => { const c = catOf(id); return c ? c.name_sr || c.name_fr || c.id : id; };
const nameOf = (p) => p.name_sr || p.name_fr || p.name_en || p.code;

// ---------- routes: the tab and its filters live in the address ----------
const TABS = ['pregled', 'upiti', 'porudzbine', 'artikli', 'statistika', 'svestenstvo', 'kategorije'];
const NEEDS = {
  pregled: ['orders', 'products', 'inquiries', 'priests', 'cats'], upiti: ['inquiries', 'products', 'priests'],
  artikli: ['products', 'cats'], kategorije: ['cats', 'products'], svestenstvo: ['priests', 'groups'], porudzbine: ['orders', 'products'], statistika: ['orders', 'products', 'cats'],
};
function route() {
  const [tab, qs] = location.hash.slice(1).split('?');
  return { tab: TABS.includes(tab) ? tab : 'pregled', p: new URLSearchParams(qs || '') };
}
function setParam(k, v) {
  const r = route();
  if (v) r.p.set(k, v); else r.p.delete(k);
  const s = r.p.toString();
  history.replaceState(null, '', `#${r.tab}${s ? `?${s}` : ''}`);
  draw();
}
const stateOf = (list) => (list.some((w) => ST[w] === 'error') ? 'error' : list.every((w) => ST[w] === 'ready') ? 'ready' : 'loading');

// ---------- the four states of a region ----------
const skeleton = (rows = 8) => `<div class="skel" aria-busy="true" aria-label="Učitavanje">${'<span class="skel__row"></span>'.repeat(rows)}</div>`;
const failed = (what, list) => `<div class="state state--error" role="alert">
    <p class="state__title">${esc(what)} se nisu učitali.</p>
    <p>${esc(reason(list.map((w) => ERR[w]).find(Boolean)))}</p>
    <button class="btn" type="button" data-retry="${list.join(' ')}">Pokušaj ponovo</button>
  </div>`;
const empty = (title, text, action = '') => `<div class="state"><p class="state__title">${esc(title)}</p><p>${esc(text)}</p>${action}</div>`;

// ---------- draw ----------
let shownTab = '';
function draw() {
  if ($('#app').hidden) return;
  const r = route();
  for (const t of TABS) {
    $(`[data-screen="${t}"]`).hidden = t !== r.tab;
    const a = $(`[data-tab="${t}"]`);
    if (t === r.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  if (shownTab !== r.tab) {
    shownTab = r.tab;
    const a = $(`[data-tab="${r.tab}"]`), row = a.parentElement;
    // on a phone the tab row scrolls sideways: keep the current tab in view
    if (row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, a.offsetLeft - row.offsetLeft - 16);
  }
  for (const w of NEEDS[r.tab]) if (ST[w] === 'idle') { load(w); return; }
  if (r.tab === 'pregled') drawPdfCard();
  ({ pregled: drawOverview, upiti: drawInquiries, artikli: drawProducts, kategorije: drawCats, svestenstvo: drawPriests, porudzbine: drawOrders, statistika: drawStats })[r.tab](r);
  drawBadge();
}

// ---------- the members' PDF price list ----------
// Made here, in the browser, from the articles as they are now; kept in the private bucket `catalogue`.
// The site hands it to members only (function `prices`, after the email check).
const PDF_NAME = 'cenovnik.pdf';
const PDF_NAME_GROUP = (g) => `cenovnik-${g}.pdf`;
const PDF_NAME_BLANK ='cenovnik-bez-cena.pdf';   // the same list with a line instead of each price, for parishes to write their own
let pdfBusy = false;
const pdfWhen = new Intl.DateTimeFormat('sr-Latn-RS', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
async function pdfInfo() {
  const t = await token();
  const rows = await call(`${C.url}/storage/v1/object/list/catalogue`, {
    method: 'POST', headers: { apikey: C.key, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 10, search: 'cenovnik' }),
  });
  return (rows || []).find((r) => r.name === PDF_NAME) || null;
}
async function drawPdfCard() {
  const state = $('[data-pdf-state]');
  if (!state || pdfBusy) return;
  try {
    const f = await pdfInfo();
    const got = $('[data-pdf-get]');
    got.hidden = !f;
    const size = f?.metadata?.size ? `, ${(f.metadata.size / 1048576).toFixed(1).replace('.', ',')} MB` : '';
    state.textContent = f ? `Poslednji put osvežen: ${pdfWhen.format(new Date(f.updated_at || f.created_at))}${size}.` : 'PDF još nije napravljen. Pritisnite „Osveži PDF“.';
    state.classList.remove('is-error');
  } catch (e) {
    if (e.signedOut) return;
    state.textContent = 'Ne mogu da proverim PDF. Pokušajte ponovo kasnije.';
  }
}
// the PDF made from the database as it is now, without touching what is on the screen
async function makePdf(say) {
  say('Učitavam artikle…');
  const [products, cats, groups] = await Promise.all([Q.products(), Q.cats(), Q.groups()]);
  D.groups = groups;
  const { buildCatalogue } = await import('./catalogue-pdf.js?v=0d7a5f5e72');
  const t = await token();
  let r;
  // one priced list per group (the clergy's at the article price, the others' with their markup) and the blank one
  const at = (g) => products.map((p) => ({ ...p, price: Math.round(Number(p.price) * (1 + markupOf(g) / 100) * 100) / 100 }));
  for (const [name, withPrices, list] of [[PDF_NAME, true, at('svestenstvo')], [PDF_NAME_GROUP('ostali'), true, at('ostali')], [PDF_NAME_BLANK, false, products]]) {
    r = await buildCatalogue({
      products: list, cats, options: D.options, prices: withPrices,
      photoUrl: (src) => photoUrl(SITE, src, true), siteBase: SITE, onProgress: say,
    });
    say('Čuvam PDF…');
    await call(`${C.url}/storage/v1/object/catalogue/${name}`, {
      method: 'POST',
      headers: { apikey: C.key, Authorization: `Bearer ${t}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true', 'cache-control': 'no-cache' },
      body: new Blob([r.bytes], { type: 'application/pdf' }),
    });
  }
  try { localStorage.removeItem(PDF_DIRTY); } catch { /* fine */ }
  return r;
}
async function refreshPdf() {
  if (pdfBusy) return;
  pdfBusy = true;
  clearTimeout(pdfTimer);
  const state = $('[data-pdf-state]');
  const buttons = $$('[data-pdf-refresh]');
  const labels = buttons.map((b) => b.textContent);
  buttons.forEach((b) => { b.disabled = true; });
  const say = (s) => { state.textContent = s; buttons.forEach((b) => { b.textContent = s.length < 28 ? s : 'Pravim PDF…'; }); };
  try {
    const r = await makePdf(say);
    pdfBusy = false;
    await drawPdfCard();
    notify(`PDF je osvežen: ${plural(r.articles, 'artikal', 'artikla', 'artikala')}, ${plural(r.pages, 'strana', 'strane', 'strana')}.`);
  } catch (e) {
    if (e.signedOut) return;
    state.textContent = `PDF nije osvežen. ${reason(e)}`;
    notify('PDF nije osvežen.', null, true);
  } finally {
    pdfBusy = false;
    buttons.forEach((b, i) => { b.disabled = false; b.textContent = labels[i]; });
  }
}
// After every change to articles, options or categories the PDF is made again, a minute after the last change.
// A new stock figure does not change it. If the tab is closed before that, the next visit makes it first thing.
const PDF_DIRTY = 'ek-pdf-dirty';
const PDF_WAIT = 60000;
let pdfTimer;
function pdfChanged() { /* the list is made once a day, see pdfOnEnter; the button does it at once */ }
function pdfLater(ms) {
  clearTimeout(pdfTimer);
  pdfTimer = setTimeout(autoPdf, ms);
  const state = $('[data-pdf-state]');
  if (state && !pdfBusy) state.textContent = 'PDF se pravi za trenutak, jer je stariji od jednog dana.';
}
async function autoPdf() {
  if (pdfBusy || !session) return;
  if (!$('#app') || $('#app').hidden) return;
  pdfBusy = true;
  const state = $('[data-pdf-state]');
  const say = (s) => { if (state) state.textContent = s; };
  try {
    await makePdf(say);
    pdfBusy = false;
    await drawPdfCard();
  } catch (e) {
    if (e.signedOut) return;
    pdfBusy = false;
    say(`PDF se nije osvežio sam. ${reason(e)} Pritisnite „Osveži PDF“.`);
  } finally { pdfBusy = false; }
}
// on entering: a PDF that is missing, or was left stale by a closed tab, is made at once
const PDF_DAY = 24 * 3600 * 1000;
async function pdfOnEnter() {
  const check = async () => {
    try {
      const f = await pdfInfo();
      const age = f ? Date.now() - new Date(f.updated_at || f.created_at).getTime() : Infinity;
      if (age > PDF_DAY) pdfLater(4000);
    } catch (e) { /* the card says it */ }
  };
  await check();
  setInterval(check, 3600 * 1000);   // an admin tab left open overnight still makes it
}
async function openPdf(btn) {
  btn.disabled = true;
  try {
    const t = await token();
    const r = await fetch(`${C.url}/storage/v1/object/authenticated/catalogue/${PDF_NAME}`, { headers: { apikey: C.key, Authorization: `Bearer ${t}` } });
    if (!r.ok) throw new Error('PDF nije nađen.');
    const url = URL.createObjectURL(await r.blob());
    window.open(url, '_blank', 'noopener') || (location.href = url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    if (!e.signedOut) notify(reason(e), null, true);
  } finally { btn.disabled = false; }
}

function drawBadge() {
  const n = D.orders.filter((o) => o.status === 'new').length;
  const b = $('[data-new-orders]');
  b.textContent = n ? String(n) : '';
  b.hidden = !n;
  $('[data-tab="porudzbine"]').setAttribute('aria-label', n ? `Porudžbine, ${plural(n, 'nova', 'nove', 'novih')}` : 'Porudžbine');
  const m = D.inquiries.filter((i) => i.status === 'new').length;
  const c = $('[data-new-inquiries]');
  c.textContent = m ? String(m) : '';
  c.hidden = !m;
  $('[data-tab="upiti"]').setAttribute('aria-label', m ? `Upiti, ${plural(m, 'nov', 'nova', 'novih')}` : 'Upiti');
}

function syncInput(el, v) { if (el && document.activeElement !== el && el.value !== v) el.value = v; }
function syncSeg(seg, v) { $$('button', seg).forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.v || '') === v))); }

// ----- articles: the stock ledger -----
const productKey = (p) => norm([p.code, p.code.replace(/^p/i, 'r').replace(/^h/i, 'n'), p.name_sr, p.name_fr, p.name_en].join(' '));
function drawProducts(r) {
  const box = $('[data-region="products"]');
  const sc = $('[data-screen="artikli"]');
  const q = r.p.get('q') || '', k = r.p.get('k') || '', f = r.p.get('f') || '';
  syncInput($('[data-q]', sc), q);
  const sel = $('[data-k]', sc);
  const opts = `<option value="">Sve kategorije</option>${D.cats.map((c) => `<option value="${esc(c.id)}">${esc(c.name_sr || c.name_fr)}</option>`).join('')}`;
  if (sel.dataset.built !== String(D.cats.length) + D.cats.map((c) => c.id + c.name_sr).join()) { sel.innerHTML = opts; sel.dataset.built = String(D.cats.length) + D.cats.map((c) => c.id + c.name_sr).join(); }
  sel.value = k;
  syncSeg($('[data-f]', sc), f);

  const st = stateOf(NEEDS.artikli);
  if (st === 'loading') { box.innerHTML = skeleton(); return; }
  if (st === 'error') { box.innerHTML = failed('Artikli', NEEDS.artikli); return; }

  const order = Object.fromEntries(D.cats.map((c, i) => [c.id, i]));
  const all = [...D.products].sort((a, b) => (order[a.category] ?? 99) - (order[b.category] ?? 99) || a.sort - b.sort || a.code.localeCompare(b.code));
  const counts = ledgerCounts(all);
  $$('[data-f] [data-n]', sc).forEach((s) => { s.textContent = counts[s.dataset.n]; });

  if (!all.length) {
    box.innerHTML = empty('Još nema artikala.', 'Artikli koje ovde dodate pojavljuju se u katalogu na sva tri jezika.', '<button class="btn btn--primary" type="button" data-new="product">Novi artikal</button>');
    return;
  }
  const nq = norm(q);
  const list = all.filter((p) => (!k || p.category === k) && (!f || (f === 'out' ? p.stock === 0 : f === 'low' ? low(p) : !p.active)) && (!nq || productKey(p).includes(nq)));
  if (!list.length) {
    box.innerHTML = empty('Nijedan artikal ne odgovara.', f === 'out' && !q && !k ? 'Svaki artikal čije se stanje prati ima bar jedan komad.' : f === 'low' && !q && !k ? 'Nijedan artikal nije pao na granicu za naručivanje. Granica se upisuje u artiklu.' : 'Proverite šifru ili naziv, ili izaberite drugu kategoriju.',
      '<button class="btn" type="button" data-clear>Prikaži sve artikle</button>');
    return;
  }
  box.innerHTML = `<p class="region__count" aria-live="polite">${esc(plural(list.length, 'artikal', 'artikla', 'artikala'))}${list.length < all.length ? ` od ${all.length}` : ''}<span class="region__hint">Stanje: upišite broj i pritisnite Enter. Prazno polje znači da se stanje ne prati.</span></p>
  <table class="tbl tbl--products">
    <thead><tr><th scope="col"><span class="visually-hidden">Fotografija</span></th><th scope="col">Šifra</th><th scope="col">Naziv</th><th scope="col">Kategorija</th><th scope="col" class="num">Cena</th><th scope="col" class="num">Stanje</th><th scope="col">Na sajtu</th><th scope="col"><span class="visually-hidden">Izmena</span></th></tr></thead>
    <tbody>${list.map(productRow).join('')}</tbody>
  </table>`;
}

function stockTag(p) {
  if (p.stock === 0) return '<span class="tag tag--out">nema</span>';
  if (low(p)) return `<span class="tag tag--low" title="Granica za naručivanje: ${p.min_stock}">poruči</span>`;
  return '';
}
function productRow(p) {
  const ph = p.photos?.[0];
  const c = esc(p.code);
  return `<tr data-code="${c}"${p.active ? '' : ' class="is-hidden"'}>
      <td class="c-photo">${ph ? `<img src="${esc(thumb(ph))}" width="${ph.w}" height="${ph.h}" alt="" loading="lazy" decoding="async">` : '<span class="nophoto" aria-hidden="true"></span>'}</td>
      <th scope="row" class="c-code">${c}</th>
      <td class="c-name">${p.name_sr ? `<span lang="sr">${esc(p.name_sr)}</span><span class="sub" lang="fr">${esc(p.name_fr || '')}</span>` : `<span lang="${p.name_fr ? 'fr' : 'en'}">${esc(nameOf(p))}</span>`}</td>
      <td class="c-cat" data-label="Kategorija">${esc(catName(p.category))}</td>
      <td class="num c-price" data-label="Cena">${esc(money.format(p.price))}${p.unit === 'kg' ? ' / kg' : ''}</td>
      <td class="num c-stock" data-label="Stanje">${optionsOf(p.code).length
        ? `<span class="stock stock--opts"><span class="stock__sum">${optStock(p.code)}</span><span class="sub">${esc(plural(optionsOf(p.code).length, 'opcija', 'opcije', 'opcija'))}</span>${optionsOf(p.code).every((o) => o.stock === 0) ? '<span class="tag tag--out">nema</span>' : ''}</span>`
        : `<span class="stock"><input class="input input--stock" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${p.stock ?? ''}" placeholder="—" aria-label="Stanje, ${c}" data-stock="${c}">${stockTag(p)}</span>`}</td>
      <td class="c-on" data-label="Na sajtu"><label class="check"><input type="checkbox" data-active="${c}"${p.active ? ' checked' : ''}><span class="visually-hidden">${c} na sajtu</span></label></td>
      <td class="c-act"><button class="btn btn--s" type="button" data-edit="${c}" aria-label="Uredi ${c}">Uredi</button></td>
    </tr>`;
}
function refreshRow(code) {
  const tr = $(`tr[data-code="${CSS.escape(code)}"]`);
  const p = byCode(code);
  if (!tr || !p) return;
  tr.classList.toggle('is-hidden', !p.active);
  const s = $('.stock', tr);
  const inp = $('[data-stock]', tr);
  if (inp) {
    $('.tag', s)?.remove();
    s.insertAdjacentHTML('beforeend', stockTag(p));
    if (document.activeElement !== inp) inp.value = p.stock ?? '';
  }
  const sc = $('[data-screen="artikli"]');
  const counts = ledgerCounts(D.products);
  $$('[data-f] [data-n]', sc).forEach((n) => { n.textContent = counts[n.dataset.n]; });
}

const saving = new Set();
async function saveStock(input) {
  const code = input.dataset.stock;
  const p = byCode(code);
  if (!p || saving.has(code)) return;
  const raw = input.value.trim();
  if (raw !== '' && !/^\d{1,7}$/.test(raw)) {
    input.setAttribute('aria-invalid', 'true');
    notify(`Stanje za ${code} mora biti ceo broj (0 ili više), ili prazno ako se ne prati.`, null, true);
    return;
  }
  input.removeAttribute('aria-invalid');
  const v = raw === '' ? null : Number(raw);
  if (v === p.stock) return;
  saving.add(code);
  input.setAttribute('aria-busy', 'true');
  input.closest('tr')?.classList.add('is-saving');
  try {
    Object.assign(p, one(await db(`products?code=${eq(code)}`, { method: 'PATCH', body: { stock: v }, prefer: 'return=representation' })));
  } catch (e) {
    if (!e.signedOut) notify(`Stanje za ${code} nije sačuvano. ${reason(e)}`, null, true);
    input.value = p.stock ?? '';
  } finally {
    saving.delete(code);
    input.removeAttribute('aria-busy');
    input.closest('tr')?.classList.remove('is-saving');
    refreshRow(code);
  }
}
async function saveActive(box) {
  const code = box.dataset.active;
  const p = byCode(code);
  if (!p) return;
  box.disabled = true;
  try {
    Object.assign(p, one(await db(`products?code=${eq(code)}`, { method: 'PATCH', body: { active: box.checked }, prefer: 'return=representation' })));
  } catch (e) {
    if (!e.signedOut) notify(`${code} nije izmenjen. ${reason(e)}`, null, true);
  } finally {
    box.disabled = false;
    box.checked = p.active;
    refreshRow(code);
  }
}

// ----- categories -----
function drawCats() {
  const box = $('[data-region="cats"]');
  const st = stateOf(NEEDS.kategorije);
  if (st === 'loading') { box.innerHTML = skeleton(6); return; }
  if (st === 'error') { box.innerHTML = failed('Kategorije', NEEDS.kategorije); return; }
  if (!D.cats.length) {
    box.innerHTML = empty('Još nema kategorija.', 'Svaki artikal pripada jednoj kategoriji; napravite prvu, pa dodajte artikle.', '<button class="btn btn--primary" type="button" data-new="cat">Nova kategorija</button>');
    return;
  }
  const n = (id) => D.products.filter((p) => p.category === id).length;
  box.innerHTML = `<table class="tbl tbl--cats">
    <thead><tr><th scope="col" class="num">Redosled</th><th scope="col">Naziv</th><th scope="col">Oznaka</th><th scope="col">Prikaz</th><th scope="col" class="num">Artikala</th><th scope="col"><span class="visually-hidden">Izmena</span></th></tr></thead>
    <tbody>${D.cats.map((c) => `<tr data-cat="${esc(c.id)}">
      <td class="num c-sort" data-label="Redosled">${c.sort}</td>
      <th scope="row" class="c-name"><span lang="sr">${esc(c.name_sr)}</span><span class="sub" lang="fr">${esc(c.name_fr)}</span></th>
      <td class="c-id" data-label="Oznaka"><code>${esc(c.id)}</code></td>
      <td data-label="Prikaz">${c.layout === 'table' ? 'Tabela' : 'Kartice'}</td>
      <td class="num" data-label="Artikala">${n(c.id)}</td>
      <td class="c-act"><button class="btn btn--s" type="button" data-edit-cat="${esc(c.id)}" aria-label="Uredi ${esc(c.name_sr)}">Uredi</button></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ----- contacts: clergy and other contacts, each group with its own price -----
function drawPriests(r) {
  const box = $('[data-region="priests"]');
  const sc = $('[data-screen="svestenstvo"]');
  const q = r.p.get('q') || '';
  const g = r.p.get('g') === 'ostali' ? 'ostali' : 'svestenstvo';
  syncInput($('[data-q]', sc), q);
  const st = stateOf(NEEDS.svestenstvo);
  if (st === 'loading') { box.innerHTML = skeleton(); return; }
  if (st === 'error') { box.innerHTML = failed('Kontakti', NEEDS.svestenstvo); return; }
  priestCount();
  const mine = D.priests.filter((p) => groupOf(p) === g);
  const mk = markupOf(g);
  const tabs = `<div class="seg" role="group" aria-label="Grupa" data-g>${GROUPS.map(([k, t]) => `<button type="button" data-v="${k}" aria-pressed="${k === g}">${esc(t)} <span class="seg__n">${D.priests.filter((p) => groupOf(p) === k).length}</span></button>`).join('')}</div>`;
  const price = `<form class="pricebox" data-markup-form="${g}" novalidate>
    <div class="field"><label for="mk-${g}">Cena za ovu grupu: povećanje u %</label>
      <input class="input" id="mk-${g}" name="markup" type="number" step="0.5" min="-50" max="300" inputmode="decimal" value="${mk}" aria-describedby="mk-${g}-h"></div>
    <button class="btn btn--primary" type="submit">Sačuvaj cenu</button>
    <p class="field__help" id="mk-${g}-h">0 znači cena artikla (nabavna). 25 znači 25% više. Važi za prikaz cena, porudžbine i PDF ove grupe. PDF se osveži sam za nekoliko sekundi.</p>
  </form>`;
  if (!mine.length) {
    box.innerHTML = `${tabs}${price}${empty(g === 'ostali' ? 'Nema ostalih kontakata.' : 'Lista sveštenstva je prazna.', 'Samo adrese sa lista vide cene i mogu da naruče.', '<button class="btn btn--primary" type="button" data-new="priest">Dodaj kontakt</button>')}`;
    return;
  }
  const nq = norm(q);
  const list = mine.filter((p) => !nq || norm([p.name, p.parish, p.email, p.phone].join(' ')).includes(nq));
  if (!list.length) {
    box.innerHTML = `${tabs}${price}${empty('Niko ne odgovara pretrazi.', 'Pretražite po imenu, parohiji ili mejlu.', '<button class="btn" type="button" data-clear>Prikaži sve</button>')}`;
    return;
  }
  box.innerHTML = `${tabs}${price}<p class="region__count">${list.length} od ${mine.length}</p>
  <table class="tbl tbl--priests">
    <thead><tr><th scope="col">Ime</th><th scope="col">Parohija</th><th scope="col">Mejl</th><th scope="col">Telefon</th><th scope="col">Vidi cene</th><th scope="col"><span class="visually-hidden">Izmena</span></th></tr></thead>
    <tbody>${list.map((p) => `<tr data-priest="${p.id}"${p.active ? '' : ' class="is-hidden"'}>
      <th scope="row" class="c-name">${esc(p.name || '—')}</th>
      <td data-label="Parohija">${esc(p.parish || '')}</td>
      <td class="c-mail" data-label="Mejl"><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></td>
      <td class="num" data-label="Telefon">${p.phone ? `<a href="tel:${esc(p.phone.replace(/[^+\d]/g, ''))}">${esc(p.phone)}</a>` : ''}</td>
      <td class="c-on" data-label="Vidi cene"><label class="check"><input type="checkbox" data-priest-active="${p.id}"${p.active ? ' checked' : ''}><span class="visually-hidden">${esc(p.name || p.email)} vidi cene</span></label></td>
      <td class="c-act"><button class="btn btn--s" type="button" data-edit-priest="${p.id}" aria-label="Uredi ${esc(p.name || p.email)}">Uredi</button></td>
    </tr>`).join('')}</tbody>
  </table>`;
}
function priestCount() {
  const el = $('[data-priest-count]');
  const n = (g) => D.priests.filter((x) => groupOf(x) === g).length;
  el.textContent = D.priests.length ? `Sveštenstvo ${n('svestenstvo')}, ostali kontakti ${n('ostali')}` : '';
}
async function saveMarkup(form) {
  const g = form.dataset.markupForm;
  const v = Number(String(form.elements.markup.value).replace(',', '.'));
  const help = $(`#mk-${g}-h`);
  if (!Number.isFinite(v) || v < -50 || v > 300) { help.textContent = 'Upišite broj od -50 do 300.'; form.elements.markup.focus(); return; }
  const btn = $('button[type="submit"]', form);
  btn.disabled = true;
  try {
    const row = one(await db(`contact_groups?grp=eq.${g}`, { method: 'PATCH', body: { markup: v }, prefer: 'return=representation' }));
    Object.assign(D.groups.find((x) => x.grp === g) || D.groups[D.groups.push({ grp: g }) - 1], row);
    notify(`Cena za grupu „${GROUPS.find(([k]) => k === g)[1]}“: ${v > 0 ? '+' : ''}${v}%. PDF se osvežava.`);
    pdfLater(5000);
  } catch (e) {
    if (!e.signedOut) notify(`Cena nije sačuvana. ${reason(e)}`, null, true);
  } finally { btn.disabled = false; }
}
async function savePriestActive(box) {
  const id = Number(box.dataset.priestActive);
  const p = D.priests.find((x) => x.id === id);
  if (!p) return;
  box.disabled = true;
  try {
    Object.assign(p, one(await db(`priests?id=eq.${id}`, { method: 'PATCH', body: { active: box.checked }, prefer: 'return=representation' })));
  } catch (e) {
    if (!e.signedOut) notify(`Pristup nije izmenjen. ${reason(e)}`, null, true);
  } finally {
    box.disabled = false;
    box.checked = p.active;
    box.closest('tr')?.classList.toggle('is-hidden', !p.active);
    priestCount();
  }
}

// ----- orders -----
const STATUS = { new: 'Nova', done: 'Izvršena', cancelled: 'Otkazana' };
function drawOrders(r) {
  const box = $('[data-region="orders"]');
  const sc = $('[data-screen="porudzbine"]');
  const s = r.p.has('s') ? r.p.get('s') : 'new';
  syncSeg($('[data-s]', sc), s === 'all' ? 'all' : s);
  const st = stateOf(NEEDS.porudzbine);
  if (st === 'loading') { box.innerHTML = skeleton(); return; }
  if (st === 'error') { box.innerHTML = failed('Porudžbine', NEEDS.porudzbine); return; }
  const counts = { new: 0, done: 0, cancelled: 0, all: D.orders.length };
  for (const o of D.orders) counts[o.status]++;
  $$('[data-s] [data-n]', sc).forEach((n) => { n.textContent = counts[n.dataset.n]; });
  if (!D.orders.length) {
    box.innerHTML = empty('Još nema porudžbina.', 'Kada sveštenik pošalje listu sa sajta, porudžbina se pojavi ovde, a PDF stigne i magacinu na mejl ako je mejl podešen.');
    return;
  }
  const list = D.orders.filter((o) => s === 'all' || o.status === s);
  if (!list.length) {
    box.innerHTML = empty(s === 'new' ? 'Nema novih porudžbina.' : `Nema porudžbina sa statusom „${STATUS[s]}“.`, s === 'new' ? 'Sve pristigle porudžbine su obrađene.' : 'Promenite filter da vidite ostale.',
      '<button class="btn" type="button" data-s-all>Prikaži sve porudžbine</button>');
    return;
  }
  box.innerHTML = `<table class="tbl tbl--orders">
    <thead><tr><th scope="col" class="num">Broj</th><th scope="col">Primljena</th><th scope="col">Naručilac</th><th scope="col" class="num">Stavki</th><th scope="col" class="num">Iznos</th><th scope="col">Status</th></tr></thead>
    <tbody>${list.map((o) => `<tr data-order="${o.id}" class="is-link">
      <th scope="row" class="num c-no"><button class="link" type="button" data-open-order="${o.id}" aria-label="Porudžbina ${o.id}, otvori">${o.id}</button></th>
      <td data-label="Primljena">${esc(when.format(new Date(o.created_at)))}</td>
      <td class="c-name"><span>${esc(o.name || o.email)}</span><span class="sub">${esc(o.parish || '')}</span></td>
      <td class="num" data-label="Stavki">${o.items.length}</td>
      <td class="num" data-label="Iznos">${esc(money.format(o.total))}</td>
      <td data-label="Status"><span class="tag tag--${o.status}">${STATUS[o.status]}</span></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ----- statistics: what sells, what does not, what to order -----
const DAY = 864e5;
const PERIODS = { 30: '30 dana', 90: '90 dana', 365: '12 meseci', sve: 'od početka' };
const whole = new Intl.NumberFormat('sr-Latn-RS', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const qtyText = (n, unit) => (unit === 'kg' ? `${String(n).replace('.', ',')} kg` : String(n));
const dayText = new Intl.DateTimeFormat('sr-Latn-RS', { dateStyle: 'medium', timeZone: 'Europe/Paris' });
const monthLong = new Intl.DateTimeFormat('sr-Latn-RS', { month: 'long', year: 'numeric' });
const monthShort = new Intl.DateTimeFormat('sr-Latn-RS', { month: 'short' });
const counted = () => D.orders.filter((o) => o.status !== 'cancelled');

// per article: quantity, value and number of orders, from the order lines
function salesBy(orders) {
  const by = new Map();
  for (const o of orders) {
    const at = Date.parse(o.created_at);
    for (const l of o.items || []) {
      const s = by.get(l.code) || { qty: 0, value: 0, orders: 0, unit: l.unit, name: l.name, last: 0 };
      s.qty += l.qty; s.value += l.qty * l.price; s.orders++; s.last = Math.max(s.last, at);
      by.set(l.code, s);
    }
  }
  return by;
}
function periodOf(r) {
  const v = r.p.get('p') || '90';
  return v in PERIODS ? v : '90';
}
function statsModel(r) {
  const per = periodOf(r);
  const since = per === 'sve' ? 0 : Date.now() - Number(per) * DAY;
  const live = counted();
  const inPeriod = live.filter((o) => Date.parse(o.created_at) >= since);
  const sales = salesBy(inPeriod);
  const ever = salesBy(live);
  const pace = salesBy(live.filter((o) => Date.parse(o.created_at) >= Date.now() - 90 * DAY));
  return { per, live, inPeriod, sales, ever, pace };
}

function reorderList(m) {
  return D.products.filter((p) => p.active && p.stock !== null && p.stock !== undefined).map((p) => {
    const sold = m.pace.get(p.code)?.qty || 0;
    const perDay = sold / 90;
    const days = perDay > 0 ? Math.floor(p.stock / perDay) : null;
    return { p, sold, days };
  }).filter(({ p, days }) => low(p) || (days !== null && days <= 30))
    .sort((a, b) => (a.p.stock === 0 ? -1 : 0) - (b.p.stock === 0 ? -1 : 0) || (a.days ?? 1e9) - (b.days ?? 1e9) || a.p.stock - b.p.stock);
}

function niceTop(v) {
  if (v <= 0) return 1;
  const e = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((f) => f * e).find((x) => x >= v);
}
function monthChart(live) {
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: d.getFullYear() * 12 + d.getMonth(), date: d, value: 0, n: 0 });
  }
  const at = new Map(months.map((m, i) => [m.key, i]));
  for (const o of live) {
    const d = new Date(o.created_at);
    const i = at.get(d.getFullYear() * 12 + d.getMonth());
    if (i !== undefined) { months[i].value += Number(o.total); months[i].n++; }
  }
  const max = Math.max(...months.map((m) => m.value));
  if (max <= 0) return '<p class="state__hint">U poslednjih 12 meseci nema porudžbina.</p>';
  const top = niceTop(max);
  const peak = months.findIndex((m) => m.value === max);
  const ticks = [top, top / 2, 0];
  return `<figure class="chart">
    <div class="chart__plot">
      ${ticks.map((v) => `<span class="chart__grid" style="bottom:${(v / top) * 100}%"><span>${esc(whole.format(v))}</span></span>`).join('')}
      <div class="chart__cols" data-chart>
        ${months.map((m, i) => `<div class="chart__col" tabindex="0" data-value="${esc(money.format(m.value))}" data-label="${esc(`${monthLong.format(m.date)} · ${plural(m.n, 'porudžbina', 'porudžbine', 'porudžbina')}`)}" aria-label="${esc(`${monthLong.format(m.date)}: ${money.format(m.value)}, ${plural(m.n, 'porudžbina', 'porudžbine', 'porudžbina')}`)}">
          <span class="chart__bar" style="height:${(m.value / top) * 100}%">${i === peak ? `<span class="chart__cap">${esc(whole.format(m.value))}</span>` : ''}</span>
          <span class="chart__x" aria-hidden="true">${esc(monthShort.format(m.date).replace('.', ''))}</span>
        </div>`).join('')}
      </div>
      <div class="chart__tip" role="status" hidden><strong></strong><span></span></div>
    </div>
    <details class="chart__table">
      <summary>Prikaži kao tabelu</summary>
      <table class="tbl tbl--compact"><thead><tr><th scope="col">Mesec</th><th scope="col" class="num">Porudžbina</th><th scope="col" class="num">Iznos</th></tr></thead>
      <tbody>${months.map((m) => `<tr><th scope="row">${esc(monthLong.format(m.date))}</th><td class="num">${m.n}</td><td class="num">${esc(money.format(m.value))}</td></tr>`).join('')}</tbody></table>
    </details>
  </figure>`;
}

function drawStats(r) {
  const box = $('[data-region="stats"]');
  const sc = $('[data-screen="statistika"]');
  const per = periodOf(r);
  const by = r.p.get('po') === 'iznos' ? 'iznos' : 'kol';
  syncSeg($('[data-p]', sc), per);
  const st = stateOf(NEEDS.statistika);
  if (st === 'loading') { box.innerHTML = skeleton(6); return; }
  if (st === 'error') { box.innerHTML = failed('Podaci za statistiku', NEEDS.statistika); return; }
  const m = statsModel(r);
  const name = (code, fallback) => { const p = byCode(code); return p ? nameOf(p) : fallback || code; };
  const catIndex = Object.fromEntries(D.cats.map((c, i) => [c.id, i]));
  const catOrder = (p) => catIndex[p.category] ?? 99;
  const codeBtn = (code) => (byCode(code) ? `<button class="link" type="button" data-edit="${esc(code)}" aria-label="Uredi ${esc(code)}">${esc(code)}</button>` : esc(code));

  // what to order
  const re = reorderList(m);
  const reorder = `<section class="panel" aria-labelledby="h-reorder">
      <div class="panel__head"><h2 id="h-reorder">Za naručivanje</h2><p class="panel__sub">Artikli čije se stanje prati: nema ih, pali su na granicu, ili ih po prodaji poslednjih 90 dana ima za manje od mesec dana.</p></div>
      ${re.length ? `<div class="tbl-wrap"><table class="tbl tbl--compact">
        <thead><tr><th scope="col">Šifra</th><th scope="col">Naziv</th><th scope="col" class="num">Stanje</th><th scope="col" class="num opt">Granica</th><th scope="col" class="num">Prodato za 90 dana</th><th scope="col" class="num">Dovoljno za</th></tr></thead>
        <tbody>${re.map(({ p, sold, days }) => `<tr><th scope="row" class="c-code">${codeBtn(p.code)}</th><td>${esc(nameOf(p))}</td>
          <td class="num">${p.stock === 0 ? '<span class="tag tag--out">nema</span>' : p.stock}</td><td class="num opt">${p.min_stock ?? '—'}</td>
          <td class="num">${esc(qtyText(sold, p.unit))}</td><td class="num">${p.stock === 0 ? '—' : days === null ? 'nema prodaje' : days < 1 ? 'manje od dana' : esc(plural(days, 'dan', 'dana', 'dana'))}</td></tr>`).join('')}</tbody>
      </table></div>`
    : `<p class="state__hint">${D.products.some((p) => p.stock !== null && p.stock !== undefined) ? 'Ništa ne treba naručiti: svega ima dovoljno.' : 'Stanje se još ne prati ni za jedan artikal. Upišite ga u tabeli Artikli i stanje, a u artiklu granicu „Poruči kad padne na“.'}</p>`}
    </section>`;

  if (!m.live.length) {
    box.innerHTML = `${reorder}${empty('Još nema porudžbina.', 'Ostala statistika (šta se najviše i najmanje prodaje, promet, članovi) pravi se iz porudžbina sa sajta.')}`;
    return;
  }

  const value = m.inPeriod.reduce((a, o) => a + Number(o.total), 0);
  const members = new Set(m.inPeriod.map((o) => o.email)).size;
  const figures = `<dl class="figures">
      <div><dt>Porudžbine</dt><dd>${m.inPeriod.length}</dd></div>
      <div><dt>Iznos</dt><dd>${esc(money.format(value))}</dd></div>
      <div><dt>Prosečna porudžbina</dt><dd>${m.inPeriod.length ? esc(money.format(value / m.inPeriod.length)) : '—'}</dd></div>
      <div><dt>Članova poručilo</dt><dd>${members}</dd></div>
    </dl>
    <p class="region__hint">${esc(PERIODS[per] === 'od početka' ? 'Od prve porudžbine.' : `Poslednjih ${PERIODS[per]}.`)} Računaju se sve porudžbine osim otkazanih.</p>`;

  const ranked = [...m.sales].sort((a, b) => (by === 'iznos' ? b[1].value - a[1].value : b[1].qty - a[1].qty) || b[1].orders - a[1].orders).slice(0, 10);
  const best = `<section class="panel" aria-labelledby="h-best">
      <div class="panel__head panel__head--row"><h2 id="h-best">Najviše se prodaje</h2>
        <div class="seg seg--s" role="group" aria-label="Poređaj" data-po><button type="button" data-v="kol" aria-pressed="${by === 'kol'}">po količini</button><button type="button" data-v="iznos" aria-pressed="${by === 'iznos'}">po iznosu</button></div></div>
      ${ranked.length ? `<div class="tbl-wrap"><table class="tbl tbl--compact">
        <thead><tr><th scope="col" class="num opt">#</th><th scope="col">Artikal</th><th scope="col" class="num">Količina</th><th scope="col" class="num">Iznos</th><th scope="col" class="num opt">Porudžbina</th></tr></thead>
        <tbody>${ranked.map(([code, s], i) => `<tr><td class="num opt">${i + 1}</td><th scope="row"><span class="c-code">${codeBtn(code)}</span> <span class="sub">${esc(name(code, s.name))}</span></th>
          <td class="num">${esc(qtyText(s.qty, s.unit))}</td><td class="num">${esc(money.format(s.value))}</td><td class="num opt">${s.orders}</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="state__hint">U ovom periodu nema prodaje.</p>'}
    </section>`;

  const least = D.products.filter((p) => p.active).map((p) => ({ p, s: m.sales.get(p.code), last: m.ever.get(p.code)?.last || 0 }))
    .sort((a, b) => (a.s?.qty || 0) - (b.s?.qty || 0) || a.last - b.last || catOrder(a.p) - catOrder(b.p) || a.p.sort - b.p.sort).slice(0, 10);
  const never = D.products.filter((p) => p.active && !m.sales.has(p.code)).length;
  const worst = `<section class="panel" aria-labelledby="h-least">
      <div class="panel__head"><h2 id="h-least">Najmanje se prodaje</h2><p class="panel__sub">${esc(never ? `${plural(never, 'artikal nije poručen', 'artikla nisu poručena', 'artikala nije poručeno')} u ovom periodu; ovde su oni koji najduže čekaju.` : 'Svaki artikal je poručen bar jednom u ovom periodu.')}</p></div>
      <div class="tbl-wrap"><table class="tbl tbl--compact">
        <thead><tr><th scope="col">Artikal</th><th scope="col" class="num">Količina</th><th scope="col" class="num">Poslednji put poručen</th><th scope="col" class="num opt">Stanje</th></tr></thead>
        <tbody>${least.map(({ p, s, last }) => `<tr><th scope="row"><span class="c-code">${codeBtn(p.code)}</span> <span class="sub">${esc(nameOf(p))}</span></th>
          <td class="num">${s ? esc(qtyText(s.qty, p.unit)) : '0'}</td><td class="num">${last ? esc(dayText.format(new Date(last))) : 'nikad'}</td><td class="num opt">${p.stock ?? '—'}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>`;

  const people = new Map();
  for (const o of m.inPeriod) {
    const x = people.get(o.email) || { name: o.name || o.email, parish: o.parish || '', n: 0, value: 0, last: 0 };
    x.n++; x.value += Number(o.total); x.last = Math.max(x.last, Date.parse(o.created_at));
    people.set(o.email, x);
  }
  const topPeople = [...people.values()].sort((a, b) => b.value - a.value).slice(0, 10);
  const who = `<section class="panel" aria-labelledby="h-people">
      <div class="panel__head"><h2 id="h-people">Članovi koji najviše poručuju</h2></div>
      <div class="tbl-wrap"><table class="tbl tbl--compact">
        <thead><tr><th scope="col">Član</th><th scope="col" class="num">Porudžbina</th><th scope="col" class="num">Iznos</th><th scope="col" class="num">Poslednja</th></tr></thead>
        <tbody>${topPeople.map((x) => `<tr><th scope="row">${esc(x.name)}<span class="sub">${esc(x.parish)}</span></th><td class="num">${x.n}</td><td class="num">${esc(money.format(x.value))}</td><td class="num">${esc(dayText.format(new Date(x.last)))}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>`;

  const months = `<section class="panel" aria-labelledby="h-months">
      <div class="panel__head"><h2 id="h-months">Promet po mesecima</h2><p class="panel__sub">Iznos porudžbina, poslednjih 12 meseci.</p></div>
      ${monthChart(m.live)}
    </section>`;

  box.innerHTML = `${figures}${reorder}<div class="pair">${best}${worst}</div>${months}${who}`;
}

// the chart's readout follows the pointer and the keyboard
function chartTip(col) {
  const plot = col.closest('.chart__plot');
  const tip = $('.chart__tip', plot);
  if (!tip) return;
  $('strong', tip).textContent = col.dataset.value;
  $('span', tip).textContent = col.dataset.label;
  tip.hidden = false;
  const bar = $('.chart__bar', col).getBoundingClientRect(), box = plot.getBoundingClientRect();
  const x = Math.min(Math.max(bar.left + bar.width / 2 - box.left, tip.offsetWidth / 2), box.width - tip.offsetWidth / 2);
  tip.style.left = `${x}px`;
  tip.style.bottom = `${box.bottom - bar.top + 8}px`;
}
document.addEventListener('pointerover', (e) => { const c = e.target.closest?.('.chart__col'); if (c) chartTip(c); });
document.addEventListener('focusin', (e) => { if (e.target.matches?.('.chart__col')) chartTip(e.target); });
document.addEventListener('pointerout', (e) => { const c = e.target.closest?.('.chart__col'); if (c && !c.contains(e.relatedTarget)) { const t = $('.chart__tip', c.closest('.chart__plot')); if (t && document.activeElement !== c) t.hidden = true; } });
document.addEventListener('focusout', (e) => { if (e.target.matches?.('.chart__col')) { const t = $('.chart__tip', e.target.closest('.chart__plot')); if (t) t.hidden = true; } });

// ----- spreadsheets (CSV, opens in Excel) -----
function csv(name, rows) {
  const cell = (v) => { const x = v === null || v === undefined ? '' : String(v); return /[;"\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  const text = `﻿${rows.map((r) => r.map(cell).join(';')).join('\r\n')}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const dec = (n) => (n === null || n === undefined || n === '' ? '' : String(Math.round(Number(n) * 100) / 100).replace('.', ','));
const today = () => new Date().toISOString().slice(0, 10);
function csvProducts() {
  csv(`artikli-${today()}.csv`, [['Šifra', 'Kategorija', 'Naziv (srpski)', 'Naziv (francuski)', 'Naziv (engleski)', 'Cena (€)', 'Nabavna cena (€)', 'Jedinica', 'Stanje', 'Poruči kad padne na', 'Na sajtu'],
    ...D.products.map((p) => [p.code, catName(p.category), p.name_sr, p.name_fr, p.name_en, dec(p.price), dec(p.cost), p.unit === 'kg' ? 'kg' : 'komad', p.stock ?? '', p.min_stock ?? '', p.active ? 'da' : 'ne'])]);
}
function csvOrders() {
  const rows = [['Broj', 'Datum', 'Status', 'Mejl', 'Ime', 'Parohija', 'Šifra', 'Artikal', 'Količina', 'Cena (€)', 'Iznos (€)']];
  for (const o of D.orders) for (const l of o.items || []) rows.push([o.id, when.format(new Date(o.created_at)), STATUS[o.status], o.email, o.name || '', o.parish || '', l.code, l.name, dec(l.qty), dec(l.price), dec(l.qty * l.price)]);
  csv(`porudzbine-${today()}.csv`, rows);
}
function csvStats() {
  const m = statsModel(route());
  csv(`prodaja-${m.per}-${today()}.csv`, [['Šifra', 'Naziv', 'Kategorija', 'Količina', 'Iznos (€)', 'Porudžbina', 'Stanje'],
    ...D.products.map((p) => { const s = m.sales.get(p.code); return [p.code, nameOf(p), catName(p.category), dec(s?.qty || 0), dec(s?.value || 0), s?.orders || 0, p.stock ?? '']; })
      .sort((a, b) => Number(String(b[4]).replace(',', '.')) - Number(String(a[4]).replace(',', '.')))]);
}

// ----- an order's PDF, made again by the server -----
async function orderPdf(id, btn) {
  const box = btn.closest('.sheet__inner');
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Pravi se…';
  try {
    const t = await token();
    const j = await call(`${C.url}/functions/v1/order`, {
      method: 'POST', headers: { apikey: C.key, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pdf', id }),
    });
    saveFile(j.pdf, j.filename);
  } catch (e) {
    if (!e.signedOut) formError(box, `PDF nije napravljen. ${reason(e)}`);
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

// ----- price inquiries: a visitor's list, answered with a quote in one click -----
const INQ = { new: 'Nov', sent: 'Ponuda poslata', ordered: 'Poručeno', closed: 'Zatvoren' };
const LANGNAME = { fr: 'francuski', en: 'engleski', sr: 'srpski' };
const decIn = (v) => Number(String(v).trim().replace(/\s/g, '').replace(',', '.'));
function saveFile(b64, filename, type = 'application/pdf') {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function drawInquiries(r) {
  const box = $('[data-region="inquiries"]');
  const sc = $('[data-screen="upiti"]');
  const s = r.p.has('s') ? r.p.get('s') : 'new';
  syncSeg($('[data-s]', sc), s);
  const st = stateOf(NEEDS.upiti);
  if (st === 'loading') { box.innerHTML = skeleton(); return; }
  if (st === 'error') { box.innerHTML = failed('Upiti', NEEDS.upiti); return; }
  const counts = { new: 0, sent: 0, ordered: 0, closed: 0, all: D.inquiries.length };
  for (const i of D.inquiries) counts[i.status]++;
  $$('[data-s] [data-n]', sc).forEach((n) => { n.textContent = counts[n.dataset.n]; });
  if (!D.inquiries.length) {
    box.innerHTML = empty('Još nema upita.', 'Kada posetilac bez naloga napuni listu i zatraži cene, upit stiže ovde. Jednim klikom mu šaljete ponudu sa svim cenama.');
    return;
  }
  const list = D.inquiries.filter((i) => s === 'all' || i.status === s);
  if (!list.length) {
    box.innerHTML = empty(s === 'new' ? 'Nema novih upita.' : `Nema upita sa statusom „${INQ[s]}“.`, s === 'new' ? 'Na sve upite je odgovoreno.' : 'Promenite filter da vidite ostale.',
      '<button class="btn" type="button" data-s-all>Prikaži sve upite</button>');
    return;
  }
  box.innerHTML = `<table class="tbl tbl--orders">
    <thead><tr><th scope="col" class="num">Broj</th><th scope="col">Primljen</th><th scope="col">Ko pita</th><th scope="col" class="num">Artikala</th><th scope="col" class="num">Ponuda</th><th scope="col">Status</th></tr></thead>
    <tbody>${list.map((i) => `<tr data-inq="${i.id}" class="is-link">
      <th scope="row" class="num c-no"><button class="link" type="button" data-open-inq="${i.id}" aria-label="Upit ${i.id}, otvori">${i.id}</button></th>
      <td data-label="Primljen">${esc(when.format(new Date(i.created_at)))}</td>
      <td class="c-name"><span>${esc(i.name || i.email)}</span><span class="sub">${esc(i.name ? i.email : i.parish || '')}</span></td>
      <td class="num" data-label="Artikala">${i.items.length}</td>
      <td class="num" data-label="Ponuda">${i.quote_total !== null && i.quote_total !== undefined ? esc(money.format(i.quote_total)) : '—'}</td>
      <td data-label="Status"><span class="tag tag--${i.status === 'sent' ? 'done' : i.status === 'ordered' ? 'new' : i.status === 'closed' ? 'cancelled' : 'low'}">${INQ[i.status]}</span></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function inquirySheet(i) {
  const member = D.priests.find((p) => p.email === i.email);
  const lines = (i.quote?.length ? i.quote : i.items).map((l) => {
    const p = byCode(l.code);
    const o = l.option ? optById(l.option) : null;
    return {
      code: l.code, option: l.option || null, sku: o?.sku || l.sku || l.code,
      name: p ? `${nameOf(p)}${o ? `, ${o.label_sr}` : ''}` : l.name || l.code,
      qty: l.qty, price: l.price ?? p?.price ?? 0, unit: p?.unit || l.unit || 'piece',
      out: o ? o.stock === 0 : !!p && p.stock === 0, gone: !p || !p.active || (l.option && (!o || !o.active)),
    };
  });
  const facts = [['Mejl', `<a href="mailto:${esc(i.email)}">${esc(i.email)}</a>`], ['Parohija', esc(i.parish || '')],
    ['Telefon', i.phone ? `<a href="tel:${esc(i.phone.replace(/[^+\d]/g, ''))}">${esc(i.phone)}</a>` : ''], ['Napomena', esc(i.note || '').replace(/\n/g, '<br>')],
    ['Jezik', LANGNAME[i.lang]], ['Ponuda', i.quoted_at ? `${esc(when.format(new Date(i.quoted_at)))}${i.emailed ? ', poslata mejlom' : ', preuzeta kao PDF'}` : '']].filter(([, x]) => x);
  openSheet(`<div class="sheet__inner" data-inq-sheet="${i.id}">
    ${head(`Upit br. ${i.id}`, `${esc(when.format(new Date(i.created_at)))} · <span class="tag tag--${i.status === 'sent' ? 'done' : i.status === 'ordered' ? 'new' : i.status === 'closed' ? 'cancelled' : 'low'}">${INQ[i.status]}</span>`)}
    <div class="sheet__body">
      <p class="order__who">${esc(i.name || i.email)}</p>
      <dl class="facts">${facts.map(([k, x]) => `<div><dt>${k}</dt><dd>${x}</dd></div>`).join('')}</dl>
      <p class="inq__member">${member ? `<span class="tag tag--done">Član</span> Ova adresa je na listi članova${member.active ? ' i sama vidi cene.' : ', ali bez pristupa cenama.'}`
        : '<button class="btn btn--s" type="button" data-add-member>Dodaj kao člana</button> <span>Sledeći put će sam videti cene i moći da poruči.</span>'}</p>
      <div class="tbl-wrap"><table class="tbl tbl--lines tbl--quote">
        <thead><tr><th scope="col" class="c-code">Šifra</th><th scope="col">Artikal</th><th scope="col" class="num">Kol.</th><th scope="col" class="num">Cena (€)</th><th scope="col" class="num">Ukupno</th></tr></thead>
        <tbody>${lines.map((l, k) => `<tr data-line="${k}" data-code="${esc(l.code)}"${l.option ? ` data-option="${l.option}"` : ''} data-sku="${esc(l.sku)}">
          <th scope="row" class="c-code">${esc(l.sku)}</th>
          <td><span class="code-s">${esc(l.sku)} · </span>${esc(l.name)}${l.unit === 'kg' ? ' <span class="sub">po kg</span>' : ''}${l.out ? ' <span class="tag tag--out">nema</span>' : ''}${l.gone ? ' <span class="tag tag--cancelled">nije na sajtu</span>' : ''}</td>
          <td class="num"><input class="input input--stock input--qty" data-q-qty value="${l.qty}" inputmode="numeric" autocomplete="off" aria-label="Količina, ${esc(l.sku)}"></td>
          <td class="num"><input class="input input--stock" data-q-price value="${esc(String(l.price).replace('.', ','))}" inputmode="decimal" autocomplete="off" aria-label="Cena, ${esc(l.sku)}"></td>
          <td class="num" data-q-sum></td></tr>`).join('')}</tbody>
        <tfoot><tr><td class="c-code"></td><th scope="row" colspan="3">Ukupno</th><td class="num total" data-q-total></td></tr></tfoot>
      </table></div>
      <p class="order__stock">Cene su iz cenovnika i mogu se promeniti pre slanja. Posetilac dobija PDF ponude i link „Poruči po ovoj ponudi“ koji važi 30 dana.</p>
      ${i.order_id ? `<p class="order__stock">Posetilac je poručio po ponudi: <button class="link" type="button" data-open-order="${i.order_id}">porudžbina br. ${i.order_id}</button>.</p>` : ''}
    </div>
    <footer class="sheet__foot">
      <p class="sheet__msg" role="alert" data-form-msg hidden></p>
      <div class="sheet__actions">
        <button class="btn btn--primary" type="button" data-quote="send">${i.status === 'sent' ? 'Pošalji ponudu ponovo' : 'Pošalji ponudu mejlom'}</button>
        <button class="btn" type="button" data-quote="pdf">Preuzmi PDF ponude</button>
        <span class="spacer"></span>
        ${i.status === 'closed' ? '<button class="btn" type="button" data-inq-status="new">Ponovo otvori</button>' : i.status !== 'ordered' ? '<button class="btn" type="button" data-inq-status="closed">Zatvori upit</button>' : ''}
      </div>
    </footer>
  </div>`);
  quoteSums();
}
function quoteSums() {
  const box = $('[data-inq-sheet]', sheet);
  if (!box) return;
  let total = 0;
  for (const tr of $$('tr[data-line]', box)) {
    const qty = decIn($('[data-q-qty]', tr).value), price = decIn($('[data-q-price]', tr).value);
    const ok = Number.isInteger(qty) && qty >= 1 && Number.isFinite(price) && price >= 0;
    $('[data-q-sum]', tr).textContent = ok ? money.format(qty * price) : '—';
    if (ok) total += qty * price;
  }
  $('[data-q-total]', box).textContent = money.format(total);
}
document.addEventListener('input', (e) => { if (e.target.matches?.('[data-q-qty], [data-q-price]')) { e.target.removeAttribute('aria-invalid'); quoteSums(); } });

async function sendQuote(id, send, btn) {
  const box = btn.closest('.sheet__inner');
  const i = D.inquiries.find((x) => x.id === id);
  const lines = [];
  for (const tr of $$('tr[data-line]', box)) {
    const q = $('[data-q-qty]', tr), pr = $('[data-q-price]', tr);
    const qty = decIn(q.value), price = decIn(pr.value);
    if (!(Number.isInteger(qty) && qty >= 1 && qty <= 999)) { q.setAttribute('aria-invalid', 'true'); q.focus(); formError(box, `Količina za ${tr.dataset.sku} mora biti ceo broj od 1 do 999.`); return; }
    if (!(Number.isFinite(price) && price >= 0)) { pr.setAttribute('aria-invalid', 'true'); pr.focus(); formError(box, `Cena za ${tr.dataset.sku} nije ispravna (na primer 12,50).`); return; }
    lines.push({ code: tr.dataset.code, qty, price, ...(tr.dataset.option ? { option: Number(tr.dataset.option) } : {}) });
  }
  formError(box, '');
  const all = $$('.sheet__actions button', box);
  all.forEach((b) => { b.disabled = true; });
  const label = btn.textContent;
  btn.textContent = send ? 'Slanje…' : 'Pravi se…';
  try {
    const t = await token();
    const j = await call(`${C.url}/functions/v1/order`, {
      method: 'POST', headers: { apikey: C.key, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'quote', id, lines, send }),
    });
    if (j.inquiry) Object.assign(i, j.inquiry);
    if (!send) saveFile(j.pdf, j.filename);
    inquirySheet(i);
    draw();
    if (send) notify(`Ponuda br. ${id} je poslata na ${i.email}.`);
  } catch (e) {
    if (e.signedOut) return;
    all.forEach((b) => { b.disabled = false; });
    btn.textContent = label;
    formError(box, e.code === 'mail_off' ? 'Slanje mejlova još nije podešeno. Preuzmite PDF ponude i pošaljite ga sami; u PDF-u je i link „Poruči po ovoj ponudi“.' : `Ponuda nije napravljena. ${reason(e)}`);
  }
}
async function addMember(id, btn) {
  const i = D.inquiries.find((x) => x.id === id);
  btn.disabled = true;
  try {
    D.priests.push(one(await db('priests', { method: 'POST', body: { email: i.email, name: i.name || null, parish: i.parish || null, phone: i.phone || null, active: true }, prefer: 'return=representation' })));
    inquirySheet(i);
    notify(`${i.name || i.email} je dodat na listu članova.`);
  } catch (e) {
    if (e.signedOut) return;
    btn.disabled = false;
    formError(btn.closest('.sheet__inner'), e.code === '23505' ? 'Ta adresa je već na listi članova.' : `Nije dodato. ${reason(e)}`);
  }
}
async function setInquiry(id, status, btn) {
  const i = D.inquiries.find((x) => x.id === id);
  btn.disabled = true;
  try {
    Object.assign(i, one(await db(`inquiries?id=eq.${id}`, { method: 'PATCH', body: { status }, prefer: 'return=representation' })));
    inquirySheet(i);
    draw();
  } catch (e) {
    if (e.signedOut) return;
    btn.disabled = false;
    formError(btn.closest('.sheet__inner'), `Status nije promenjen. ${reason(e)}`);
  }
}

// ----- the overview: what waits, how the month goes, what sells, where it goes -----
// towns of the parishes, for the map (latitude, longitude)
const TOWNS = {
  paris: [48.857, 2.352], pariz: [48.857, 2.352], bondy: [48.902, 2.483], asnieres: [48.914, 2.287], 'pierrefitte-sur-seine': [48.965, 2.362],
  lille: [50.629, 3.057], strasbourg: [48.573, 7.752], strazbur: [48.573, 7.752], nancy: [48.692, 6.184], mulhouse: [47.75, 7.336], dijon: [47.322, 5.041],
  'chalon-sur-saone': [46.781, 4.854], 'monastere d uchon': [46.81, 4.25], lyon: [45.764, 4.836], nice: [43.71, 7.262], 'marseille-vitrolles': [43.46, 5.25],
  marseille: [43.296, 5.37], 'annecy-grenoble': [45.9, 6.13], castelsarrasin: [44.04, 1.107], lectoure: [43.934, 0.622], bordeaux: [44.838, -0.579],
  anvers: [51.219, 4.402], bruxelles: [50.85, 4.352], hasselt: [50.931, 5.338], rotterdam: [51.924, 4.478], 'amsterdam-zaandam': [52.44, 4.83],
  utrecht: [52.091, 5.122], nimegue: [51.842, 5.853], 'emmen-compascuum': [52.81, 7.05], breda: [51.589, 4.776], eindhoven: [51.441, 5.47],
  zelande: [51.45, 3.65], enschede: [52.222, 6.894], luxembourg: [49.612, 6.13], catalogne: [41.59, 1.52], barcelone: [41.385, 2.173],
  'monastere de bois-salair': [48.31, -0.69], madrid: [40.417, -3.704], valence: [39.47, -0.376], 'la corogne': [43.362, -8.412], tenerife: [28.29, -16.63], lisbonne: [38.722, -9.139],
};
const townOf = (parish) => {
  for (const part of String(parish || '').split(/[,;()]/)) { const k = norm(part); if (TOWNS[k]) return k; }
  return null;
};
const townName = (parish, k) => (String(parish || '').split(/[,;()]/).find((part) => norm(part) === k) || k).trim();
// the map image: Western Europe in Mercator, see tools for how it was drawn
const MAP = { w: -10.8, n: 55.8, W: 600, H: 653, k: 1273.2395447351628 };
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const project = ([lat, lon]) => [((lon - MAP.w) * Math.PI) / 180 * MAP.k, (merc(MAP.n) - merc(lat)) * MAP.k];
const relTime = new Intl.RelativeTimeFormat('sr-Latn-RS', { numeric: 'auto' });
const ago = (iso) => {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const [v, u] = Math.abs(s) < 3600 ? [s / 60, 'minute'] : Math.abs(s) < 86400 ? [s / 3600, 'hour'] : Math.abs(s) < 30 * 86400 ? [s / 86400, 'day'] : [s / (30 * 86400), 'month'];
  return relTime.format(Math.round(v), u);
};
const pct = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
function spark(values, current = values.length - 1) {
  const max = Math.max(...values, 0);
  if (max <= 0) return '';
  return `<svg class="spark" viewBox="0 0 ${values.length * 8} 28" preserveAspectRatio="none" aria-hidden="true">${values.map((v, i) => {
    const h = Math.max(1.5, (v / max) * 28);
    return `<rect x="${i * 8 + 1}" y="${28 - h}" width="6" height="${h}" rx="1.5" class="${i === current ? 'is-now' : ''}"/>`;
  }).join('')}</svg>`;
}

function drawOverview() {
  const box = $('[data-region="overview"]');
  $('[data-today]').textContent = new Intl.DateTimeFormat('sr-Latn-RS', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date());
  const st = stateOf(NEEDS.pregled);
  if (st === 'loading') { box.innerHTML = skeleton(6); return; }
  if (st === 'error') { box.innerHTML = failed('Podaci za pregled', NEEDS.pregled); return; }

  const live = counted();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastSame = new Date(lastStart.getFullYear(), lastStart.getMonth(), Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate()), now.getHours(), now.getMinutes());
  const inRange = (o, a, b) => { const t = Date.parse(o.created_at); return t >= a.getTime() && t < b.getTime(); };
  const thisMonth = live.filter((o) => inRange(o, monthStart, new Date(now.getTime() + 1)));
  const lastPart = live.filter((o) => inRange(o, lastStart, lastSame));
  const value = (list) => list.reduce((a, o) => a + Number(o.total), 0);
  const costOf = new Map(D.products.filter((p) => p.cost !== null && p.cost !== undefined).map((p) => [p.code, Number(p.cost)]));
  const profit = (list) => list.reduce((a, o) => a + (o.items || []).reduce((b, l) => b + (costOf.has(l.code) ? (l.price - costOf.get(l.code)) * l.qty : 0), 0), 0);
  const months = [];
  for (let i = 11; i >= 0; i--) months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  const perMonth = (fn) => months.map((m, i) => fn(live.filter((o) => inRange(o, m, i === 11 ? new Date(now.getTime() + 1) : months[i + 1]))));
  const monthName = new Intl.DateTimeFormat('sr-Latn-RS', { month: 'long' });
  const vs = (a, b) => {
    const d = pct(a, b);
    const span = `1–${lastSame.getDate()}. ${monthName.format(lastStart)}`;
    if (d === null) return a > 0 ? `prošlog meseca u isto vreme: bez prometa` : 'još nema prometa ovog meseca';
    const shown = d > 300 ? `${String(Math.round((a / b) * 10) / 10).replace('.', ',')} puta više` : `${d >= 0 ? '+' : '−'}${Math.abs(d)} %`;
    return `<span class="delta ${d >= 0 ? 'delta--up' : 'delta--down'}">${shown}</span> u odnosu na ${esc(span)}`;
  };

  // what waits
  const waitInq = D.inquiries.filter((i) => i.status === 'new').length;
  const waitOrd = D.orders.filter((o) => o.status === 'new').length;
  const reorder = reorderList(statsModel({ p: new URLSearchParams('p=90') })).length;
  const tile = (n, label, sub, href) => `<a class="wait${n ? ' wait--on' : ''}" href="${href}"><span class="wait__n">${n}</span><span class="wait__label">${label}</span><span class="wait__sub">${sub}</span></a>`;
  const wait = `<section class="ov__wait" aria-label="Čeka vas">
      ${tile(waitInq, plural(waitInq, 'nov upit', 'nova upita', 'novih upita').replace(/^\d+ /, ''), waitInq ? 'čekaju ponudu sa cenama' : 'na sve je odgovoreno', '#upiti')}
      ${tile(waitOrd, plural(waitOrd, 'nova porudžbina', 'nove porudžbine', 'novih porudžbina').replace(/^\d+ /, ''), waitOrd ? 'čekaju pripremu' : 'sve su obrađene', '#porudzbine')}
      ${tile(reorder, plural(reorder, 'artikal za naručivanje', 'artikla za naručivanje', 'artikala za naručivanje').replace(/^\d+ /, ''), reorder ? 'nema ih ili ih uskoro neće biti' : 'svega ima dovoljno', '#statistika')}
    </section>`;

  // the month
  const tracked = D.products.filter((p) => p.stock !== null && p.stock !== undefined);
  const stockValue = tracked.reduce((a, p) => a + p.stock * Number(p.price), 0);
  const stockCost = tracked.filter((p) => costOf.has(p.code)).reduce((a, p) => a + p.stock * costOf.get(p.code), 0);
  const hasCost = costOf.size > 0;
  const kpi = (label, figure, sub, sparkValues) => `<div class="kpi"><dt>${label}</dt><dd><span class="kpi__n">${figure}</span>${sparkValues ? spark(sparkValues) : ''}<span class="kpi__sub">${sub}</span></dd></div>`;
  const kpis = `<dl class="ov__kpis">
      ${kpi(`Promet, ${esc(monthName.format(now))}`, esc(money.format(value(thisMonth))), vs(value(thisMonth), value(lastPart)), perMonth(value))}
      ${kpi('Porudžbine ovog meseca', String(thisMonth.length), vs(thisMonth.length, lastPart.length), perMonth((l) => l.length))}
      ${hasCost ? kpi('Zarada ovog meseca', esc(money.format(profit(thisMonth))), vs(profit(thisMonth), profit(lastPart)), perMonth(profit))
        : kpi('Zarada ovog meseca', '—', 'Upišite nabavne cene u artiklima i ovde će stajati zarada.', null)}
      ${kpi('Roba na stanju', esc(whole.format(stockValue)), tracked.length ? `${esc(plural(tracked.length, 'artikal se prati', 'artikla se prate', 'artikala se prati'))}${hasCost && stockCost ? ` · nabavna vrednost ${esc(whole.format(stockCost))}` : ''}` : 'Upišite stanje u tabeli Artikli i stanje.', null)}
    </dl>`;

  // what sells (90 days), with photos
  const sales = salesBy(live.filter((o) => Date.parse(o.created_at) >= Date.now() - 90 * DAY));
  const top = [...sales].sort((a, b) => b[1].value - a[1].value).slice(0, 6);
  const topMax = top[0]?.[1].value || 1;
  const best = `<section class="panel" aria-labelledby="h-ov-best">
      <div class="panel__head"><h2 id="h-ov-best">Najprodavanije</h2><p class="panel__sub">Poslednjih 90 dana, po iznosu.</p></div>
      ${top.length ? `<ol class="toplist" role="list">${top.map(([code, s], i) => {
        const p = byCode(code); const ph = p?.photos?.[0];
        return `<li class="toplist__item"><span class="toplist__rank">${i + 1}</span>
          <span class="toplist__img">${ph ? `<img src="${esc(thumb(ph))}" alt="" width="${ph.w}" height="${ph.h}" loading="lazy">` : ''}</span>
          <span class="toplist__text"><b>${esc(p ? nameOf(p) : s.name)}</b><span class="sub">${esc(code)} · ${esc(s.unit === 'kg' ? qtyText(s.qty, s.unit) : `${s.qty} kom.`)} · ${plural(s.orders, 'porudžbina', 'porudžbine', 'porudžbina')}</span>
            <span class="toplist__bar"><span style="width:${(s.value / topMax) * 100}%"></span></span></span>
          <span class="toplist__value">${esc(money.format(s.value))}</span></li>`;
      }).join('')}</ol>` : '<p class="state__hint">U poslednjih 90 dana nema prodaje.</p>'}
    </section>`;

  // where it goes: the parishes on the map
  const towns = new Map();
  const at = (k) => { if (!towns.has(k)) towns.set(k, { members: 0, orders: 0, value: 0, names: new Set() }); return towns.get(k); };
  const memberTown = new Map();
  for (const m of D.priests) { const k = townOf(m.parish); if (k) { at(k).members++; at(k).names.add(townName(m.parish, k)); memberTown.set(m.email, k); } }
  const year = live.filter((o) => Date.parse(o.created_at) >= Date.now() - 365 * DAY);
  for (const o of year) { const k = memberTown.get(o.email) || townOf(o.parish); if (k) { const x = at(k); x.orders++; x.value += Number(o.total); if (!x.names.size) x.names.add(townName(o.parish, k)); } }
  const maxV = Math.max(1, ...[...towns.values()].map((x) => x.value));
  const placed = [...towns].map(([k, x]) => {
    const [lat] = TOWNS[k];
    const [px, py] = lat < 34 ? [34, MAP.H - 30] : project(TOWNS[k]);
    const r = x.value ? 5 + 15 * Math.sqrt(x.value / maxV) : 4;
    const label = `${[...x.names][0] || k}: ${plural(x.members, 'član', 'člana', 'članova')}, ${plural(x.orders, 'porudžbina', 'porudžbine', 'porudžbina')}, ${money.format(x.value)}`;
    return { k, x, px, py, r, label };
  }).sort((a, b) => b.r - a.r);
  const mapped = [...towns.values()].reduce((a, x) => a + x.members, 0);
  const unmapped = D.priests.length - mapped;
  const map = `<section class="panel" aria-labelledby="h-ov-map">
      <div class="panel__head"><h2 id="h-ov-map">Odakle stižu porudžbine</h2><p class="panel__sub">Parohije članova; veći krug je veći promet u poslednjih 12 meseci, prazan krug još nije poručivao.</p></div>
      <figure class="ovmap">
        <img class="ovmap__land" src="../assets/img/europa.svg" width="${MAP.W}" height="${MAP.H}" alt="">
        <svg class="ovmap__dots" viewBox="0 0 ${MAP.W} ${MAP.H}" role="img" aria-label="Mapa parohija">
          <rect class="ovmap__inset" x="8" y="${MAP.H - 58}" width="60" height="50" rx="6"/><text class="ovmap__inset-label" x="38" y="${MAP.H - 12}" text-anchor="middle">Kanari</text>
          ${placed.map((d) => `<circle class="${d.x.value ? 'dot' : 'dot dot--none'}" cx="${d.px.toFixed(1)}" cy="${d.py.toFixed(1)}" r="${d.r.toFixed(1)}" tabindex="0" data-tip="${esc(d.label)}"><title>${esc(d.label)}</title></circle>`).join('')}
        </svg>
        <div class="chart__tip ovmap__tip" role="status" hidden><strong></strong></div>
      </figure>
      ${unmapped > 0 ? `<p class="panel__sub">${esc(plural(unmapped, 'član nema mesto na mapi', 'člana nemaju mesto na mapi', 'članova nema mesto na mapi'))}: grad parohije nije prepoznat.</p>` : ''}
      <details class="chart__table"><summary>Prikaži kao tabelu</summary>
        <table class="tbl tbl--compact"><thead><tr><th scope="col">Mesto</th><th scope="col" class="num">Članova</th><th scope="col" class="num">Porudžbina</th><th scope="col" class="num">Iznos</th></tr></thead>
        <tbody>${placed.slice().sort((a, b) => b.x.value - a.x.value || b.x.members - a.x.members).map((d) => `<tr><th scope="row">${esc([...d.x.names][0] || d.k)}</th><td class="num">${d.x.members}</td><td class="num">${d.x.orders}</td><td class="num">${esc(money.format(d.x.value))}</td></tr>`).join('')}</tbody></table>
      </details>
    </section>`;

  // the latest
  const events = [
    ...D.orders.map((o) => ({ at: o.created_at, html: `<button class="link" type="button" data-open-order="${o.id}">Porudžbina br. ${o.id}</button> · ${esc(o.name || o.email)} · ${esc(money.format(o.total))}`, tag: STATUS[o.status], cls: o.status })),
    ...D.inquiries.map((i) => ({ at: i.created_at, html: `<button class="link" type="button" data-open-inq="${i.id}">Upit br. ${i.id}</button> · ${esc(i.name || i.email)} · ${esc(plural(i.items.length, 'artikal', 'artikla', 'artikala'))}`, tag: INQ[i.status], cls: i.status === 'sent' ? 'done' : i.status === 'ordered' ? 'new' : i.status === 'closed' ? 'cancelled' : 'low' })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 8);
  const feed = `<section class="panel" aria-labelledby="h-ov-feed">
      <div class="panel__head"><h2 id="h-ov-feed">Poslednje</h2></div>
      ${events.length ? `<ol class="feed" role="list">${events.map((e) => `<li><span class="feed__when">${esc(ago(e.at))}</span><span class="feed__what">${e.html}</span><span class="tag tag--${e.cls}">${esc(e.tag)}</span></li>`).join('')}</ol>`
        : '<p class="state__hint">Još nema porudžbina ni upita. Čim stignu, ovde se vidi šta je novo.</p>'}
    </section>`;

  const chart = `<section class="panel" aria-labelledby="h-ov-months">
      <div class="panel__head"><h2 id="h-ov-months">Promet po mesecima</h2><p class="panel__sub">Iznos porudžbina, poslednjih 12 meseci, bez otkazanih.</p></div>
      ${monthChart(live)}
    </section>`;

  box.innerHTML = `${wait}${kpis}${chart}<div class="pair">${best}${map}</div>${feed}`;
}
// the map's readout, like the chart's
function mapTip(dot) {
  const fig = dot.closest('.ovmap');
  const tip = $('.ovmap__tip', fig);
  $('strong', tip).textContent = dot.dataset.tip;
  tip.hidden = false;
  const r = dot.getBoundingClientRect(), b = fig.getBoundingClientRect();
  tip.style.left = `${Math.min(Math.max(r.left + r.width / 2 - b.left, tip.offsetWidth / 2), b.width - tip.offsetWidth / 2)}px`;
  tip.style.bottom = `${b.bottom - r.top + 6}px`;
}
document.addEventListener('pointerover', (e) => { const d = e.target.closest?.('.ovmap .dot'); if (d) mapTip(d); });
document.addEventListener('focusin', (e) => { if (e.target.matches?.('.ovmap .dot')) mapTip(e.target); });
document.addEventListener('pointerout', (e) => { const d = e.target.closest?.('.ovmap .dot'); if (d) { const t = $('.ovmap__tip', d.closest('.ovmap')); if (t && document.activeElement !== d) t.hidden = true; } });
document.addEventListener('focusout', (e) => { if (e.target.matches?.('.ovmap .dot')) { const t = $('.ovmap__tip', e.target.closest('.ovmap')); if (t) t.hidden = true; } });

// ---------- the side sheet ----------
const sheet = $('[data-sheet]');
let onSheetClose = null;
function openSheet(html) {
  sheet.innerHTML = html;
  sheet.showModal();
  sheet.scrollTop = 0;
}
function closeSheet() { if (sheet.open) sheet.close(); }
sheet.addEventListener('close', () => {
  const f = onSheetClose;
  onSheetClose = null;
  sheet.innerHTML = '';
  f?.();
});
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) closeSheet();
  if (e.target.closest('[data-close]')) closeSheet();
});

const head = (title, sub = '') => `<header class="sheet__head"><div><h2 id="sheet-title">${title}</h2>${sub ? `<p class="sheet__sub">${sub}</p>` : ''}</div><button class="icon-btn" type="button" data-close aria-label="Zatvori">${X}</button></header>`;
const field = ({ id, label, name, value = '', type = 'text', req = false, help = '', attrs = '', cls = '' }) => `<div class="field ${cls}">
    <label for="${id}">${label}${req ? ' <span class="req">obavezno</span>' : ''}</label>
    <input class="input" id="${id}" name="${name}" type="${type}" value="${esc(value ?? '')}"${req ? ' aria-required="true"' : ''} aria-describedby="${id}-h" ${attrs}>
    <p class="field__help" id="${id}-h" data-help="${esc(help)}">${esc(help)}</p>
  </div>`;
const select = ({ id, label, name, options, value, help = '', cls = '' }) => `<div class="field ${cls}">
    <label for="${id}">${label}</label>
    <span class="select"><select class="input" id="${id}" name="${name}" aria-describedby="${id}-h">${options.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></span>
    <p class="field__help" id="${id}-h" data-help="${esc(help)}">${esc(help)}</p>
  </div>`;
const checkbox = ({ id, label, name, checked, help = '' }) => `<div class="field field--check">
    <label class="check check--label" for="${id}"><input type="checkbox" id="${id}" name="${name}"${checked ? ' checked' : ''} aria-describedby="${id}-h"> ${label}</label>
    <p class="field__help" id="${id}-h" data-help="${esc(help)}">${esc(help)}</p>
  </div>`;
function invalid(form, name, msg) {
  const el = form.elements[name];
  el.setAttribute('aria-invalid', 'true');
  const h = $(`#${el.id}-h`);
  h.textContent = msg;
  h.classList.add('is-error');
  return el;
}
function clearInvalid(el) {
  if (!el?.hasAttribute?.('aria-invalid')) return;
  el.removeAttribute('aria-invalid');
  const h = $(`#${el.id}-h`);
  if (h) { h.textContent = h.dataset.help; h.classList.remove('is-error'); }
}
sheet.addEventListener('input', (e) => clearInvalid(e.target));
function busy(form, on, label) {
  const b = $('[type="submit"]', form);
  if (!b) return;
  if (on) { b.dataset.label = b.textContent; b.textContent = label; b.disabled = true; form.setAttribute('aria-busy', 'true'); } else { b.textContent = b.dataset.label || b.textContent; b.disabled = false; form.removeAttribute('aria-busy'); }
}
const formError = (form, msg) => { const m = $('[data-form-msg]', form); m.textContent = msg; m.hidden = !msg; };
const foot = (save, del = '') => `<footer class="sheet__foot">
    <p class="sheet__msg" role="alert" data-form-msg hidden></p>
    <div class="sheet__actions"><button class="btn btn--primary" type="submit">${save}</button><button class="btn" type="button" data-close>Otkaži</button>${del ? `<span class="spacer"></span>${del}` : ''}</div>
  </footer>`;

// ----- the article form -----
let edit = null; // { code (old), photos, added: [] }
function productForm(p) {
  const isNew = !p;
  const cat = p?.category || route().p.get('k') || D.cats[0]?.id || '';
  const nextSort = Math.max(0, ...D.products.filter((x) => x.category === cat).map((x) => x.sort)) + 10;
  p ??= { code: '', category: cat, name_sr: '', name_fr: '', name_en: '', note_sr: '', note_fr: '', note_en: '', price: '', unit: 'piece', stock: null, min_stock: null, active: true, sort: nextSort, photos: [] };
  edit = { code: isNew ? null : p.code, photos: [...(p.photos || [])], added: [], removed: [], saved: false, options: isNew ? [] : optionsOf(p.code).map((o) => ({ ...o })), dropped: [] };
  onSheetClose = () => { if (!edit?.saved && edit?.added.length) removeFiles(edit.added); edit = null; };
  const price = p.price === '' ? '' : String(p.price).replace('.', ',');
  openSheet(`<form class="sheet__inner" novalidate data-form="product">
    ${head(isNew ? 'Novi artikal' : esc(`${p.code} · ${nameOf(p)}`), isNew ? 'Pojavljuje se u katalogu čim ga sačuvate.' : 'Izmene se vide na sajtu pri sledećem otvaranju stranice.')}
    <div class="sheet__body">
      <div class="row2">
        ${field({ id: 'f-code', label: 'Šifra', name: 'code', value: p.code, req: true, help: 'Kao u katalogu: P011, H016, 10/1.', attrs: `autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40"${isNew ? ' autofocus' : ''}` })}
        ${select({ id: 'f-cat', label: 'Kategorija', name: 'category', value: p.category, options: D.cats.map((c) => [c.id, c.name_sr || c.name_fr]) })}
      </div>
      <fieldset class="group">
        <legend>Naziv</legend>
        ${field({ id: 'f-name-sr', label: 'Srpski', name: 'name_sr', value: p.name_sr, attrs: 'lang="sr" autocomplete="off"', help: 'Bar jedan naziv. Prazan prevod zamenjuje francuski ili srpski.' })}
        ${field({ id: 'f-name-fr', label: 'Francuski', name: 'name_fr', value: p.name_fr, attrs: 'lang="fr" autocomplete="off"' })}
        ${field({ id: 'f-name-en', label: 'Engleski', name: 'name_en', value: p.name_en, attrs: 'lang="en" autocomplete="off"' })}
      </fieldset>
      <fieldset class="group">
        <legend>Napomena ili dimenzije <span class="req req--quiet">nije obavezno</span></legend>
        ${field({ id: 'f-note-sr', label: 'Srpski', name: 'note_sr', value: p.note_sr, attrs: 'lang="sr" autocomplete="off"', help: 'Kod sveća ovde stoje dimenzije, na primer 72 × 4,5 cm.' })}
        ${field({ id: 'f-note-fr', label: 'Francuski', name: 'note_fr', value: p.note_fr, attrs: 'lang="fr" autocomplete="off"' })}
        ${field({ id: 'f-note-en', label: 'Engleski', name: 'note_en', value: p.note_en, attrs: 'lang="en" autocomplete="off"' })}
      </fieldset>
      <div class="row2">
        ${field({ id: 'f-price', label: 'Cena u evrima', name: 'price', value: price, req: true, help: 'Vide je samo sveštenici sa liste.', attrs: 'inputmode="decimal" autocomplete="off" placeholder="12,50"' })}
        ${select({ id: 'f-unit', label: 'Prodaje se na', name: 'unit', value: p.unit, options: [['piece', 'komad'], ['kg', 'kilogram']] })}
      </div>
      <div class="row2">
        ${field({ id: 'f-cost', label: 'Nabavna cena u evrima', name: 'cost', value: p.cost === null || p.cost === undefined ? '' : String(p.cost).replace('.', ','), help: 'Ne vidi se na sajtu. Služi za zaradu u Pregledu.', attrs: 'inputmode="decimal" autocomplete="off" placeholder="8,00"' })}
      </div>
      <div class="row2">
        ${field({ id: 'f-stock', label: 'Stanje u magacinu', name: 'stock', value: p.stock ?? '', help: 'Prazno: ne prati se. 0: na sajtu piše da ga nema.', attrs: 'inputmode="numeric" autocomplete="off"' })}
        ${field({ id: 'f-min', label: 'Poruči kad padne na', name: 'min_stock', value: p.min_stock ?? '', help: 'Na toj količini artikal ide na listu za naručivanje.', attrs: 'inputmode="numeric" autocomplete="off"' })}
      </div>
      <div class="row2">
        ${field({ id: 'f-sort', label: 'Redosled u kategoriji', name: 'sort', value: p.sort, help: 'Manji broj stoji pre.', attrs: 'inputmode="numeric" autocomplete="off"' })}
      </div>
      ${checkbox({ id: 'f-active', label: 'Prikaži na sajtu', name: 'active', checked: p.active, help: 'Sakriven artikal ostaje u bazi, ali se ne vidi u katalogu.' })}
      <fieldset class="group">
        <legend>Fotografije</legend>
        <ul class="photos" role="list" data-photos></ul>
        <div class="photos__add">
          <input class="visually-hidden" id="f-files" type="file" accept="image/*" multiple data-files>
          <label class="btn" for="f-files">Dodaj fotografije</label>
          <p class="field__help" data-photo-msg aria-live="polite">Prva fotografija je naslovna. JPG, PNG ili WebP; sajt ih sam smanjuje.</p>
        </div>
      </fieldset>
      <fieldset class="group">
        <legend>Opcije <span class="req req--quiet">nije obavezno</span></legend>
        <p class="field__help opts-ed__help">Na primer sveci na ikoni. Svaka opcija ima svoju šifru (kao u Erplainu) i svoje stanje, a cena je cena artikla. Kad artikal ima opcije, član na sajtu bira jednu.</p>
        <div class="opts-ed" data-opts-ed></div>
        <p><button class="btn btn--s" type="button" data-opt-add>Dodaj opciju</button></p>
      </fieldset>
    </div>
    ${foot(isNew ? 'Dodaj artikal' : 'Sačuvaj izmene', isNew ? '' : '<button class="btn btn--danger" type="button" data-delete-product>Obriši artikal</button>')}
  </form>`);
  drawPhotos();
  drawOptEditor();
}
// ----- the options of an article, edited in its form and saved with it -----
function readOptEditor() {
  if (!edit) return;
  $$('[data-oi]', sheet).forEach((row) => {
    const o = edit.options[Number(row.dataset.oi)];
    const v = (n) => row.querySelector(`[name="${n}"]`).value.trim();
    Object.assign(o, { label_sr: v('o-sr'), label_fr: v('o-fr') || null, label_en: v('o-en') || null, sku: v('o-sku') || null, stockRaw: v('o-stock'), active: row.querySelector('[name="o-on"]').checked });
  });
}
function drawOptEditor() {
  const box = $('[data-opts-ed]', sheet);
  if (!box || !edit) return;
  const n = edit.options.length;
  box.innerHTML = n ? `<div class="opt-ed opt-ed--head" aria-hidden="true"><span>Srpski</span><span>Francuski</span><span>Engleski</span></div>
    ${edit.options.map((o, i) => {
      const stock = o.stockRaw ?? (o.stock ?? '');
      const label = o.label_sr || `opcija ${i + 1}`;
      return `<div class="opt-ed" data-oi="${i}">
        <input class="input" name="o-sr" lang="sr" value="${esc(o.label_sr || '')}" placeholder="Srpski" aria-label="Opcija ${i + 1}, srpski naziv" autocomplete="off">
        <input class="input" name="o-fr" lang="fr" value="${esc(o.label_fr || '')}" placeholder="Francuski" aria-label="${esc(label)}, francuski" autocomplete="off">
        <input class="input" name="o-en" lang="en" value="${esc(o.label_en || '')}" placeholder="Engleski" aria-label="${esc(label)}, engleski" autocomplete="off">
        <input class="input" name="o-sku" value="${esc(o.sku || '')}" placeholder="Šifra" aria-label="${esc(label)}, šifra" autocomplete="off" spellcheck="false">
        <input class="input input--stock" name="o-stock" value="${esc(String(stock))}" placeholder="Stanje" inputmode="numeric" aria-label="${esc(label)}, stanje (prazno: ne prati se)" autocomplete="off">
        <label class="check opt-ed__on"><input type="checkbox" name="o-on"${o.active !== false ? ' checked' : ''}><span>Na sajtu</span><span class="visually-hidden">, ${esc(label)}</span></label>
        <button class="btn btn--s" type="button" data-opt-del="${i}" aria-label="Ukloni ${esc(label)}">Ukloni</button>
      </div>`;
    }).join('')}` : '<p class="photos__none">Bez opcija: član stavlja sam artikal u listu.</p>';
}
async function saveOptions(code) {
  const before = new Map(optionsOf(code).map((o) => [o.id, o]));
  const rows = edit.options.map((o, i) => ({ ...o, sort: (i + 1) * 10, stock: o.stockRaw === undefined ? o.stock ?? null : o.stockRaw === '' ? null : Number(o.stockRaw) }));
  const body = (o) => ({ label_sr: o.label_sr, label_fr: o.label_fr, label_en: o.label_en, sku: o.sku, stock: o.stock, active: o.active !== false, sort: o.sort });
  const fresh = rows.filter((o) => !o.id);
  const changed = rows.filter((o) => o.id && JSON.stringify(body(o)) !== JSON.stringify(body(before.get(o.id) || {})));
  if (fresh.length) await db('options', { method: 'POST', body: fresh.map((o) => ({ product: code, ...body(o) })) });
  for (const o of changed) await db(`options?id=${eq(o.id)}`, { method: 'PATCH', body: body(o) });
  if (edit.dropped.length) await db(`options?id=in.(${edit.dropped.join(',')})`, { method: 'DELETE' });
  if (fresh.length || changed.length || edit.dropped.length) D.options = await allRows('options?select=*&order=product.asc,sort.asc,id.asc');
}
function drawPhotos() {
  const ul = $('[data-photos]', sheet);
  if (!ul || !edit) return;
  ul.innerHTML = edit.photos.length
    ? edit.photos.map((ph, i) => `<li class="photo">
        <img src="${esc(thumb(ph))}" width="${ph.w}" height="${ph.h}" alt="Fotografija ${i + 1}">
        ${i === 0 ? '<span class="photo__first">Naslovna</span>' : ''}
        <span class="photo__act">
          <button class="btn btn--s" type="button" data-ph-move="${i}" data-dir="-1"${i === 0 ? ' disabled' : ''} aria-label="Pomeri fotografiju ${i + 1} napred">←</button>
          <button class="btn btn--s" type="button" data-ph-move="${i}" data-dir="1"${i === edit.photos.length - 1 ? ' disabled' : ''} aria-label="Pomeri fotografiju ${i + 1} nazad">→</button>
          <button class="btn btn--s" type="button" data-ph-del="${i}" aria-label="Ukloni fotografiju ${i + 1}">Ukloni</button>
        </span>
      </li>`).join('')
    : '<li class="photos__none">Bez fotografije: na sajtu stoji „bez slike“.</li>';
}
async function addFiles(input) {
  const files = [...input.files];
  input.value = '';
  if (!files.length || !edit) return;
  const msg = $('[data-photo-msg]', sheet);
  const form = $('[data-form="product"]', sheet);
  const code = form.elements.code.value.trim() || 'artikal';
  const btn = $('[type="submit"]', form);
  btn.disabled = true;
  let done = 0;
  for (const f of files) {
    msg.textContent = `Otpremanje ${done + 1} od ${files.length}…`;
    msg.classList.remove('is-error');
    try {
      const ph = await addPhoto(f, code);
      if (!edit) { removeFiles([ph.src]); return; }
      edit.photos.push(ph); edit.added.push(ph.src);
      done++;
      drawPhotos();
    } catch (e) {
      if (e.signedOut) return;
      msg.textContent = e instanceof DOMException || e?.name === 'InvalidStateError' || e?.name === 'EncodingError'
        ? `„${f.name}“ nije slika koju pregledač ume da otvori. Sačuvajte je kao JPG ili PNG.`
        : `„${f.name}“ nije otpremljena. ${reason(e)}`;
      msg.classList.add('is-error');
      btn.disabled = false;
      return;
    }
  }
  btn.disabled = false;
  msg.textContent = done === 1 ? 'Fotografija je dodata. Sačuvajte artikal da bi se videla na sajtu.' : `${done} fotografije su dodate. Sačuvajte artikal da bi se videle na sajtu.`;
}

async function submitProduct(form) {
  const v = (n) => form.elements[n].value.trim();
  const errs = [];
  let formMsg = '';
  const code = v('code');
  if (!code) errs.push(invalid(form, 'code', 'Upišite šifru artikla.'));
  else if (code !== edit.code && byCode(code)) errs.push(invalid(form, 'code', `Šifra ${code} već postoji.`));
  if (!v('name_sr') && !v('name_fr') && !v('name_en')) errs.push(invalid(form, 'name_sr', 'Upišite bar jedan naziv.'));
  const price = Number(v('price').replace(/\s/g, '').replace(',', '.'));
  if (v('price') === '' || !Number.isFinite(price) || price < 0) errs.push(invalid(form, 'price', 'Upišite cenu, na primer 12,50.'));
  const stockRaw = v('stock');
  if (stockRaw !== '' && !/^\d{1,7}$/.test(stockRaw)) errs.push(invalid(form, 'stock', 'Ceo broj, 0 ili više, ili prazno.'));
  const costRaw = v('cost').replace(/\s/g, '').replace(',', '.');
  if (costRaw !== '' && !(Number.isFinite(Number(costRaw)) && Number(costRaw) >= 0)) errs.push(invalid(form, 'cost', 'Upišite cenu, na primer 8,00, ili ostavite prazno.'));
  const minRaw = v('min_stock');
  if (minRaw !== '' && !/^\d{1,7}$/.test(minRaw)) errs.push(invalid(form, 'min_stock', 'Ceo broj, 0 ili više, ili prazno.'));
  const sortRaw = v('sort');
  if (sortRaw !== '' && !/^-?\d{1,6}$/.test(sortRaw)) errs.push(invalid(form, 'sort', 'Ceo broj, na primer 10.'));
  readOptEditor();
  edit.options.forEach((o, i) => {
    const row = $(`[data-oi="${i}"]`, sheet);
    const bad = (name, msg) => { const el = row.querySelector(`[name="${name}"]`); el.setAttribute('aria-invalid', 'true'); errs.push(el); if (!formMsg) formMsg = msg; };
    if (!o.label_sr) bad('o-sr', `Opcija ${i + 1}: upišite srpski naziv ili je uklonite.`);
    if (o.stockRaw && !/^\d{1,7}$/.test(o.stockRaw)) bad('o-stock', `${o.label_sr || `Opcija ${i + 1}`}: stanje je ceo broj, 0 ili više, ili prazno.`);
  });
  if (errs.length) { errs[0].focus(); if (formMsg) formError(form, formMsg); return; }

  const row = {
    code, category: v('category'),
    name_sr: v('name_sr'), name_fr: v('name_fr'), name_en: v('name_en'),
    note_sr: v('note_sr') || null, note_fr: v('note_fr') || null, note_en: v('note_en') || null,
    price: Math.round(price * 100) / 100, unit: v('unit'), cost: costRaw === '' ? null : Math.round(Number(costRaw) * 100) / 100,
    stock: stockRaw === '' ? null : Number(stockRaw), min_stock: minRaw === '' ? null : Number(minRaw), sort: sortRaw === '' ? 0 : Number(sortRaw),
    active: form.elements.active.checked, photos: edit.photos,
  };
  busy(form, true, 'Čuvanje…');
  formError(form, '');
  try {
    const old = edit.code;
    const saved = old === null
      ? one(await db('products', { method: 'POST', body: row, prefer: 'return=representation' }))
      : one(await db(`products?code=${eq(old)}`, { method: 'PATCH', body: row, prefer: 'return=representation' }));
    if (old !== null && old !== code) {
      for (const c of D.cats.filter((x) => x.cover === old)) {
        await db(`categories?id=${eq(c.id)}`, { method: 'PATCH', body: { cover: code } }).catch(() => {});
        c.cover = code;
      }
    }
    if (old === null) D.products.push(saved); else Object.assign(byCode(old), saved);
    if (old !== null && old !== code) D.options.forEach((o) => { if (o.product === old) o.product = code; });
    try { await saveOptions(code); } catch (e) {
      busy(form, false);
      edit.code = code;
      if (!e.signedOut) formError(form, `Artikal je sačuvan, ali opcije nisu. ${reason(e)}`);
      draw();
      return;
    }
    const gone = (byCodeBefore.get(old) || []).filter((s) => !edit.photos.some((ph) => ph.src === s));
    edit.saved = true;
    removeFiles(gone);
    closeSheet();
    draw();
  } catch (e) {
    busy(form, false);
    if (e.signedOut) return;
    if (e.code === '23505') invalid(form, 'code', `Šifra ${code} već postoji.`).focus();
    else formError(form, `Artikal nije sačuvan. ${reason(e)}`);
  }
}
// the photos an article had when its form opened, to clear the files of those removed
const byCodeBefore = new Map();

async function deleteProduct() {
  const p = byCode(edit.code);
  if (!p) return;
  const form = $('[data-form="product"]', sheet);
  try {
    await db(`products?code=${eq(p.code)}`, { method: 'DELETE' });
  } catch (e) {
    if (!e.signedOut) formError(form, `Artikal nije obrisan. ${reason(e)}`);
    return;
  }
  const copy = { ...p };
  delete copy.available; delete copy.updated_at;
  const opts = optionsOf(p.code).map(({ id, available, updated_at, ...o }) => o);
  D.options = D.options.filter((o) => o.product !== p.code);
  D.products = D.products.filter((x) => x !== p);
  edit.saved = true;
  closeSheet();
  draw();
  let undone = false;
  notify(`${p.code} je obrisan.`, async () => {
    undone = true;
    try {
      D.products.push(one(await db('products', { method: 'POST', body: copy, prefer: 'return=representation' })));
      if (opts.length) { await db('options', { method: 'POST', body: opts }); D.options = await allRows('options?select=*&order=product.asc,sort.asc,id.asc'); }
      draw();
    } catch (e) { if (!e.signedOut) notify(`${p.code} nije vraćen. ${reason(e)}`, null, true); }
  });
  setTimeout(() => { if (!undone) removeFiles((copy.photos || []).map((ph) => ph.src)); }, 12000);
}

// ----- the category form -----
let editCat = null;
function catForm(c) {
  const isNew = !c;
  c ??= { id: '', name_sr: '', name_fr: '', name_en: '', layout: 'grid', cover: '', sort: Math.max(0, ...D.cats.map((x) => x.sort)) + 10 };
  editCat = isNew ? null : c.id;
  const items = D.products.filter((p) => p.category === c.id);
  const withPhoto = items.filter((p) => p.photos?.length);
  openSheet(`<form class="sheet__inner" novalidate data-form="cat">
    ${head(isNew ? 'Nova kategorija' : esc(c.name_sr || c.name_fr), isNew ? '' : esc(plural(items.length, 'artikal', 'artikla', 'artikala')))}
    <div class="sheet__body">
      <fieldset class="group">
        <legend>Naziv</legend>
        ${field({ id: 'c-name-sr', label: 'Srpski', name: 'name_sr', value: c.name_sr, attrs: `lang="sr" autocomplete="off"${isNew ? ' autofocus' : ''}`, help: 'Bar jedan naziv. Prazan prevod zamenjuje francuski ili srpski.' })}
        ${field({ id: 'c-name-fr', label: 'Francuski', name: 'name_fr', value: c.name_fr, attrs: 'lang="fr" autocomplete="off"' })}
        ${field({ id: 'c-name-en', label: 'Engleski', name: 'name_en', value: c.name_en, attrs: 'lang="en" autocomplete="off"' })}
      </fieldset>
      ${field({ id: 'c-id', label: 'Oznaka u adresi', name: 'id', value: c.id, req: isNew, help: isNew ? 'Mala slova, brojevi i crtica, na primer ikone-a4. Kasnije se ne menja.' : 'Ne menja se, da bi stari linkovi radili.', attrs: `autocomplete="off" spellcheck="false" maxlength="40"${isNew ? '' : ' readonly'}` })}
      <div class="row2">
        ${select({ id: 'c-layout', label: 'Prikaz', name: 'layout', value: c.layout, options: [['grid', 'Kartice sa fotografijom'], ['table', 'Tabela, kao sveće']] })}
        ${field({ id: 'c-sort', label: 'Redosled', name: 'sort', value: c.sort, help: 'Manji broj stoji pre.', attrs: 'inputmode="numeric" autocomplete="off"' })}
      </div>
      ${isNew ? '' : select({ id: 'c-cover', label: 'Naslovna fotografija na početnoj', name: 'cover', value: c.cover || '', options: [['', 'Prvi artikal sa fotografijom'], ...withPhoto.map((p) => [p.code, `${p.code} · ${nameOf(p)}`])] })}
    </div>
    ${foot(isNew ? 'Dodaj kategoriju' : 'Sačuvaj izmene', isNew ? '' : `<button class="btn btn--danger" type="button" data-delete-cat${items.length ? ' disabled aria-describedby="c-del-why"' : ''}>Obriši kategoriju</button>${items.length ? '<p class="sheet__why" id="c-del-why">Brisanje je moguće kad u kategoriji nema artikala.</p>' : ''}`)}
  </form>`);
  if (isNew) {
    const nameFr = $('#c-name-fr', sheet), id = $('#c-id', sheet);
    let touched = false;
    id.addEventListener('input', () => { touched = true; });
    const auto = () => { if (!touched) id.value = slug($('#c-name-fr', sheet).value || $('#c-name-sr', sheet).value).slice(0, 40); };
    nameFr.addEventListener('input', auto);
    $('#c-name-sr', sheet).addEventListener('input', auto);
  }
}
async function submitCat(form) {
  const v = (n) => form.elements[n]?.value.trim() ?? '';
  const errs = [];
  if (!v('name_sr') && !v('name_fr') && !v('name_en')) errs.push(invalid(form, 'name_sr', 'Upišite bar jedan naziv.'));
  const id = editCat ?? v('id');
  if (editCat === null) {
    if (!/^[a-z0-9-]{1,40}$/.test(id)) errs.push(invalid(form, 'id', 'Samo mala slova bez kvačica, brojevi i crtica.'));
    else if (catOf(id)) errs.push(invalid(form, 'id', 'Ta oznaka je zauzeta.'));
  }
  if (v('sort') !== '' && !/^-?\d{1,6}$/.test(v('sort'))) errs.push(invalid(form, 'sort', 'Ceo broj, na primer 10.'));
  if (errs.length) { errs[0].focus(); return; }
  const row = { name_sr: v('name_sr'), name_fr: v('name_fr'), name_en: v('name_en'), layout: v('layout'), sort: Number(v('sort') || 0) };
  if (editCat !== null) row.cover = v('cover') || null;
  busy(form, true, 'Čuvanje…');
  formError(form, '');
  try {
    if (editCat === null) D.cats.push(one(await db('categories', { method: 'POST', body: { id, ...row }, prefer: 'return=representation' })));
    else Object.assign(catOf(editCat), one(await db(`categories?id=${eq(editCat)}`, { method: 'PATCH', body: row, prefer: 'return=representation' })));
    D.cats.sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
    closeSheet();
    draw();
  } catch (e) {
    busy(form, false);
    if (!e.signedOut) formError(form, `Kategorija nije sačuvana. ${reason(e)}`);
  }
}
async function deleteCat() {
  const c = catOf(editCat);
  const form = $('[data-form="cat"]', sheet);
  try { await db(`categories?id=${eq(c.id)}`, { method: 'DELETE' }); } catch (e) {
    if (!e.signedOut) formError(form, `Kategorija nije obrisana. ${reason(e)}`);
    return;
  }
  D.cats = D.cats.filter((x) => x !== c);
  closeSheet();
  draw();
  notify(`Kategorija „${c.name_sr || c.name_fr}“ je obrisana.`, async () => {
    try { D.cats.push(one(await db('categories', { method: 'POST', body: c, prefer: 'return=representation' }))); D.cats.sort((a, b) => a.sort - b.sort); draw(); } catch (e) { if (!e.signedOut) notify(`Kategorija nije vraćena. ${reason(e)}`, null, true); }
  });
}

// ----- the priest form -----
let editPriest = null;
function priestForm(p) {
  const isNew = !p;
  p ??= { email: '', name: '', parish: '', phone: '', address: '', active: true, grp: route().p.get('g') === 'ostali' ? 'ostali' : 'svestenstvo' };
  editPriest = isNew ? null : p.id;
  openSheet(`<form class="sheet__inner" novalidate data-form="priest">
    ${head(isNew ? 'Novi kontakt' : esc(p.name || p.email), isNew ? 'Sa ovim mejlom vidi cene i šalje porudžbine.' : '')}
    <div class="sheet__body">
      ${select({ id: 'p-grp', label: 'Grupa', name: 'grp', options: GROUPS, value: groupOf(p), help: 'Svaka grupa ima svoju cenu.' })}
      ${field({ id: 'p-email', label: 'Mejl', name: 'email', type: 'email', value: p.email, req: true, help: 'Adresa koju sveštenik upisuje na sajtu.', attrs: `autocomplete="off" inputmode="email" spellcheck="false"${isNew ? ' autofocus' : ''}` })}
      ${field({ id: 'p-name', label: 'Ime i prezime', name: 'name', value: p.name, help: 'Upisuje se u porudžbinu i PDF.', attrs: 'autocomplete="off"' })}
      ${field({ id: 'p-parish', label: 'Parohija ili crkva', name: 'parish', value: p.parish, attrs: 'autocomplete="off"' })}
      ${field({ id: 'p-phone', label: 'Telefon', name: 'phone', type: 'tel', value: p.phone, attrs: 'autocomplete="off" inputmode="tel"' })}
      ${field({ id: 'p-address', label: 'Adresa za dostavu', name: 'address', value: p.address, help: 'Upisuje se sama u porudžbinu; član je može menjati u svom nalogu.', attrs: 'autocomplete="off"' })}
      ${checkbox({ id: 'p-active', label: 'Vidi cene i može da naruči', name: 'active', checked: p.active, help: 'Isključite umesto brisanja kad neko privremeno ne treba pristup.' })}
    </div>
    ${foot(isNew ? 'Dodaj kontakt' : 'Sačuvaj izmene', isNew ? '' : '<button class="btn btn--danger" type="button" data-delete-priest>Obriši sa liste</button>')}
  </form>`);
}
async function submitPriest(form) {
  const v = (n) => form.elements[n].value.trim();
  const email = v('email').toLowerCase();
  const errs = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.push(invalid(form, 'email', 'Upišite ceo mejl, na primer ime@parohija.fr.'));
  else if (D.priests.some((p) => p.email === email && p.id !== editPriest)) errs.push(invalid(form, 'email', 'Taj mejl je već na listi.'));
  if (errs.length) { errs[0].focus(); return; }
  const row = { email, name: v('name') || null, parish: v('parish') || null, phone: v('phone') || null, address: v('address') || null, grp: form.elements.grp.value, active: form.elements.active.checked };
  busy(form, true, 'Čuvanje…');
  formError(form, '');
  try {
    if (editPriest === null) D.priests.push(one(await db('priests', { method: 'POST', body: row, prefer: 'return=representation' })));
    else Object.assign(D.priests.find((p) => p.id === editPriest), one(await db(`priests?id=eq.${editPriest}`, { method: 'PATCH', body: row, prefer: 'return=representation' })));
    D.priests.sort((a, b) => (a.name || '￿').localeCompare(b.name || '￿', 'sr') || a.email.localeCompare(b.email));
    closeSheet();
    draw();
  } catch (e) {
    busy(form, false);
    if (e.signedOut) return;
    if (e.code === '23505') invalid(form, 'email', 'Taj mejl je već na listi.').focus();
    else if (e.code === '23514') invalid(form, 'email', 'Mejl nije ispravan.').focus();
    else formError(form, `Nije sačuvano. ${reason(e)}`);
  }
}
async function deletePriest() {
  const p = D.priests.find((x) => x.id === editPriest);
  const form = $('[data-form="priest"]', sheet);
  try { await db(`priests?id=eq.${p.id}`, { method: 'DELETE' }); } catch (e) {
    if (!e.signedOut) formError(form, `Nije obrisano. ${reason(e)}`);
    return;
  }
  D.priests = D.priests.filter((x) => x !== p);
  closeSheet();
  draw();
  const { id, created_at, ...copy } = p;
  notify(`${p.name || p.email} je obrisan sa liste.`, async () => {
    try { D.priests.push(one(await db('priests', { method: 'POST', body: copy, prefer: 'return=representation' }))); draw(); } catch (e) { if (!e.signedOut) notify(`Nije vraćeno. ${reason(e)}`, null, true); }
  });
}

// ----- one order -----
const LANG = { fr: 'francuski', en: 'engleski', sr: 'srpski' };
function orderSheet(o) {
  const facts = [['Mejl', o.email && `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>`], ['Parohija', esc(o.parish || '')], ['Telefon', o.phone && `<a href="tel:${esc(o.phone.replace(/[^+\d]/g, ''))}">${esc(o.phone)}</a>`],
    ['Adresa za dostavu', esc(o.address || '').replace(/\n/g, '<br>')], ['Napomena', esc(o.note || '').replace(/\n/g, '<br>')], ['Jezik', LANG[o.lang]], ['PDF poslat mejlom', o.emailed ? 'da' : 'ne']].filter(([, x]) => x);
  const taken = o.stock_taken && Object.entries(o.stock_taken).filter(([, n]) => n > 0);
  const actions = o.status === 'new'
    ? `<button class="btn btn--primary" type="button" data-status="done">Označi kao izvršenu</button><button class="btn" type="button" data-status="cancelled">Otkaži porudžbinu</button>`
    : `<button class="btn" type="button" data-status="new">Vrati u nove</button>`;
  openSheet(`<div class="sheet__inner" data-order-sheet="${o.id}">
    ${head(`Porudžbina br. ${o.id}`, `${esc(when.format(new Date(o.created_at)))} · <span class="tag tag--${o.status}">${STATUS[o.status]}</span>`)}
    <div class="sheet__body">
      <p class="order__who">${esc(o.name || o.email)}</p>
      <dl class="facts">${facts.map(([k, x]) => `<div><dt>${k}</dt><dd>${x}</dd></div>`).join('')}</dl>
      <table class="tbl tbl--lines">
        <thead><tr><th scope="col">Šifra</th><th scope="col">Artikal</th><th scope="col" class="num">Kol.</th><th scope="col" class="num">Cena</th><th scope="col" class="num">Ukupno</th></tr></thead>
        <tbody>${o.items.map((l) => `<tr><th scope="row" class="c-code">${esc(l.sku || l.code)}</th><td>${esc(l.name)}</td><td class="num">${l.qty}${l.unit === 'kg' ? ' kg' : ''}</td><td class="num">${esc(money.format(l.price))}</td><td class="num">${esc(money.format(l.price * l.qty))}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row" colspan="4">Ukupno</th><td class="num total">${esc(money.format(o.total))}</td></tr></tfoot>
      </table>
      <p class="order__stock">${o.status === 'done'
        ? (taken?.length ? `Skinuto sa stanja: ${taken.map(([c, n]) => `${esc(c.startsWith('#') ? optById(c.slice(1))?.sku || o.items.find((l) => String(l.option) === c.slice(1))?.sku || c : c)} × ${n}`).join(', ')}.` : 'Nijedan artikal iz porudžbine nema praćeno stanje, pa stanje nije menjano.')
        : o.status === 'new' ? 'Kada je označite kao izvršenu, naručene količine se skidaju sa stanja.' : 'Otkazana porudžbina ne menja stanje.'}</p>
    </div>
    <footer class="sheet__foot">
      <p class="sheet__msg" role="alert" data-form-msg hidden></p>
      <div class="sheet__actions">${actions}<span class="spacer"></span><button class="btn" type="button" data-order-pdf>PDF</button><button class="btn" type="button" data-print>Štampaj</button></div>
    </footer>
  </div>`);
}
async function setStatus(id, status, btn) {
  const o = D.orders.find((x) => x.id === id);
  const box = btn.closest('.sheet__inner');
  $$('.sheet__actions button', box).forEach((b) => { b.disabled = true; });
  btn.dataset.label = btn.textContent;
  btn.textContent = 'Čuvanje…';
  try {
    Object.assign(o, one(await db(`orders?id=eq.${id}`, { method: 'PATCH', body: { status }, prefer: 'return=representation' })));
    if (ST.products === 'ready') load('products', true);
    orderSheet(o);
    draw();
  } catch (e) {
    if (e.signedOut) return;
    $$('.sheet__actions button', box).forEach((b) => { b.disabled = false; });
    btn.textContent = btn.dataset.label;
    formError(box, `Status nije promenjen. ${reason(e)}`);
  }
}

// ----- password -----
function passwordForm() {
  openSheet(`<form class="sheet__inner" novalidate data-form="password">
    ${head('Promena lozinke', esc(shown(session?.email)))}
    <div class="sheet__body">
      <input type="email" name="username" autocomplete="username" value="${esc(session?.email || '')}" hidden>
      ${field({ id: 'w-new', label: 'Nova lozinka', name: 'password', type: 'password', req: true, help: 'Najmanje 10 znakova.', attrs: 'autocomplete="new-password" minlength="10" autofocus' })}
      ${field({ id: 'w-again', label: 'Ponovite novu lozinku', name: 'again', type: 'password', req: true, attrs: 'autocomplete="new-password"' })}
    </div>
    ${foot('Promeni lozinku')}
  </form>`);
}
async function submitPassword(form) {
  const a = form.elements.password.value, b = form.elements.again.value;
  if (a.length < 10) { invalid(form, 'password', 'Lozinka je kraća od 10 znakova.').focus(); return; }
  if (a !== b) { invalid(form, 'again', 'Lozinke se ne poklapaju.').focus(); return; }
  busy(form, true, 'Čuvanje…');
  try {
    await auth('user', { password: a }, await token(), 'PUT');
    closeSheet();
    notify('Lozinka je promenjena. Sledeći put se prijavite novom.');
  } catch (e) {
    busy(form, false);
    if (!e.signedOut) formError(form, e.code === 'same_password' ? 'Nova lozinka je ista kao stara.' : e.code === 'weak_password' ? 'Lozinka je preslaba; dodajte brojeve ili znakove.' : `Lozinka nije promenjena. ${reason(e)}`);
  }
}

// ---------- the notice: undo after a delete, and failures ----------
const bar = $('[data-undo]');
let barTimer = 0;
function notify(text, undo = null, error = false) {
  $('[data-undo-text]', bar).textContent = text;
  const b = $('[data-undo-btn]', bar);
  b.hidden = !undo;
  b.onclick = undo ? () => { hideBar(); undo(); } : null;
  bar.classList.toggle('undo--error', error);
  bar.hidden = false;
  clearTimeout(barTimer);
  barTimer = setTimeout(hideBar, undo ? 10000 : error ? 12000 : 6000);
}
function hideBar() { bar.hidden = true; clearTimeout(barTimer); }
$('[data-undo-close]', bar).addEventListener('click', hideBar);

// ---------- events ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, a, tr.is-link');
  if (!t) return;
  if (t.matches('[data-retry]')) { t.dataset.retry.split(' ').forEach((w) => { if (ST[w] === 'error') load(w, true); }); return; }
  if (t.matches('[data-clear]')) { history.replaceState(null, '', `#${route().tab}`); draw(); return; }
  if (t.matches('[data-s-all]')) { setParam('s', 'all'); return; }
  if (t.matches('[data-f] button')) { setParam('f', t.dataset.v); return; }
  if (t.matches('[data-g] button')) { setParam('g', t.dataset.v === 'svestenstvo' ? '' : t.dataset.v); return; }
  if (t.matches('[data-s] button')) { setParam('s', t.dataset.v === 'new' ? '' : t.dataset.v); return; }
  if (t.matches('[data-new="product"]')) { if (!D.cats.length) { notify('Prvo napravite kategoriju; svaki artikal pripada jednoj.', null, true); return; } productForm(null); return; }
  if (t.matches('[data-new="cat"]')) { catForm(null); return; }
  if (t.matches('[data-new="priest"]')) { priestForm(null); return; }
  if (t.matches('[data-edit]')) { const p = byCode(t.dataset.edit); byCodeBefore.set(p.code, (p.photos || []).map((ph) => ph.src)); productForm(p); return; }
  if (t.matches('[data-edit-cat]')) { catForm(catOf(t.dataset.editCat)); return; }
  if (t.matches('[data-edit-priest]')) { priestForm(D.priests.find((p) => p.id === Number(t.dataset.editPriest))); return; }
  if (t.matches('tr[data-inq]')) { const i = D.inquiries.find((x) => x.id === Number(t.dataset.inq)); if (i && !e.target.closest('a')) inquirySheet(i); return; }
  if (t.matches('[data-open-order], tr.is-link')) {
    if (e.target.closest('a')) return;
    const id = Number(t.dataset.openOrder || t.dataset.order);
    const o = D.orders.find((x) => x.id === id);
    if (o) orderSheet(o);
    return;
  }
  if (t.matches('[data-status]')) { setStatus(Number(t.closest('[data-order-sheet]').dataset.orderSheet), t.dataset.status, t); return; }
  if (t.matches('[data-open-inq], tr[data-inq]')) {
    if (e.target.closest('a')) return;
    const i = D.inquiries.find((x) => x.id === Number(t.dataset.openInq || t.dataset.inq));
    if (i) inquirySheet(i);
    return;
  }
  if (t.matches('[data-quote]')) { sendQuote(Number(t.closest('[data-inq-sheet]').dataset.inqSheet), t.dataset.quote === 'send', t); return; }
  if (t.matches('[data-add-member]')) { addMember(Number(t.closest('[data-inq-sheet]').dataset.inqSheet), t); return; }
  if (t.matches('[data-inq-status]')) { setInquiry(Number(t.closest('[data-inq-sheet]').dataset.inqSheet), t.dataset.inqStatus, t); return; }
  if (t.matches('[data-print]')) { window.print(); return; }
  if (t.matches('[data-order-pdf]')) { orderPdf(Number(t.closest('[data-order-sheet]').dataset.orderSheet), t); return; }
  if (t.matches('[data-csv]')) { ({ products: csvProducts, orders: csvOrders, stats: csvStats })[t.dataset.csv](); return; }
  if (t.matches('[data-p] button')) { setParam('p', t.dataset.v === '90' ? '' : t.dataset.v); return; }
  if (t.matches('[data-po] button')) { setParam('po', t.dataset.v === 'kol' ? '' : t.dataset.v); return; }
  if (t.matches('[data-ph-move]')) {
    const i = Number(t.dataset.phMove), j = i + Number(t.dataset.dir);
    [edit.photos[i], edit.photos[j]] = [edit.photos[j], edit.photos[i]];
    drawPhotos();
    $(`[data-ph-move="${j}"][data-dir="${t.dataset.dir}"]`, sheet)?.focus() || $(`[data-ph-move="${j}"]`, sheet)?.focus();
    return;
  }
  if (t.matches('[data-ph-del]')) {
    const i = Number(t.dataset.phDel);
    edit.photos.splice(i, 1);
    drawPhotos();
    ($(`[data-ph-del="${Math.min(i, edit.photos.length - 1)}"]`, sheet) || $('label[for="f-files"]', sheet))?.focus();
    return;
  }
  if (t.matches('[data-delete-product]')) { deleteProduct(); return; }
  if (t.matches('[data-opt-add]')) {
    readOptEditor();
    edit.options.push({ label_sr: '', label_fr: null, label_en: null, sku: null, stock: null, active: true });
    drawOptEditor();
    $(`[data-oi="${edit.options.length - 1}"] [name="o-sr"]`, sheet)?.focus();
    return;
  }
  if (t.matches('[data-opt-del]')) {
    readOptEditor();
    const i = Number(t.dataset.optDel);
    const [o] = edit.options.splice(i, 1);
    if (o?.id) edit.dropped.push(o.id);
    drawOptEditor();
    ($(`[data-opt-del="${Math.min(i, edit.options.length - 1)}"]`, sheet) || $('[data-opt-add]', sheet))?.focus();
    return;
  }
  if (t.matches('[data-delete-cat]')) { deleteCat(); return; }
  if (t.matches('[data-delete-priest]')) { deletePriest(); return; }
  if (t.matches('[data-pdf-refresh]')) { refreshPdf(t); return; }
  if (t.matches('[data-pdf-get]')) { openPdf(t); return; }
  if (t.matches('[data-password]')) { closeProfile(); passwordForm(); return; }
  if (t.matches('[data-signout]')) { closeProfile(); signOut(); }
});

// day or night: automatic follows the device; the choice is kept in this browser
(function theme() {
  const root = document.documentElement;
  const get = () => { try { return localStorage.getItem('ek-theme') || 'auto'; } catch { return 'auto'; } };
  const apply = (v) => {
    if (v === 'light' || v === 'dark') root.dataset.theme = v; else delete root.dataset.theme;
    $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === v)));
  };
  apply(get());
  $$('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.themeSet;
    try { if (v === 'auto') localStorage.removeItem('ek-theme'); else localStorage.setItem('ek-theme', v); } catch { /* fine */ }
    apply(v);
  }));
})();

// the profile menu: who is signed in, the site, the password, sign out
const profileBtn = $('[data-profile]');
const profileMenu = $('[data-profile-menu]');
function closeProfile(back = false) {
  if (profileMenu.hidden) return;
  profileMenu.hidden = true; profileBtn.setAttribute('aria-expanded', 'false');
  if (back) profileBtn.focus();
}
profileBtn.addEventListener('click', () => {
  const open = profileMenu.hidden;
  profileMenu.hidden = !open; profileBtn.setAttribute('aria-expanded', String(open));
  if (open) $('.profile__item', profileMenu).focus();
});
document.addEventListener('click', (e) => { if (!e.target.closest('.bar__me')) closeProfile(); });
profileMenu.addEventListener('click', (e) => { if (e.target.closest('a')) closeProfile(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !profileMenu.hidden) closeProfile(true); });

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches('[data-stock]')) saveStock(t);
  else if (t.matches('[data-active]')) saveActive(t);
  else if (t.matches('[data-priest-active]')) savePriestActive(t);
  else if (t.matches('[data-k]')) setParam('k', t.value);
  else if (t.matches('[data-files]')) addFiles(t);
});
document.addEventListener('focusin', (e) => { if (e.target.matches('[data-stock]')) e.target.select(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-stock]')) { e.preventDefault(); saveStock(e.target); }
  if (e.key === 'Escape' && e.target.matches('[data-stock]')) { const p = byCode(e.target.dataset.stock); e.target.value = p?.stock ?? ''; e.target.removeAttribute('aria-invalid'); }
});
let typing = 0;
document.addEventListener('input', (e) => {
  if (!e.target.matches('[data-q]')) return;
  clearTimeout(typing);
  const v = e.target.value;
  typing = setTimeout(() => setParam('q', v.trim()), 120);
});
sheet.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  ({ product: submitProduct, cat: submitCat, priest: submitPriest, password: submitPassword })[f.dataset.form]?.(f);
});
document.addEventListener('submit', (e) => {
  const f = e.target;
  if (f.matches?.('[data-markup-form]')) { e.preventDefault(); saveMarkup(f); }
});
window.addEventListener('hashchange', () => { closeSheet(); draw(); });

// ---------- sign in, sign out ----------
function showGate(msg = '') {
  closeSheet();
  hideBar();
  $('#app').hidden = true;
  $('#gate').hidden = false;
  $('[data-boot]').hidden = true;
  const m = $('[data-login-msg]');
  m.textContent = msg;
  m.hidden = !msg;
  document.title = 'Prijava · Magacin Eparhije zapadnoevropske';
}
function showApp() {
  $('#gate').hidden = true;
  $('[data-boot]').hidden = true;
  $('#app').hidden = false;
  $('[data-me]').textContent = shown(session.email);
  document.title = 'Administracija · Magacin Eparhije zapadnoevropske';
  for (const k of Object.keys(ST)) ST[k] = 'idle';
  draw();
  load('orders');
  load('inquiries');
  pdfOnEnter();
}
async function enter() {
  let ok;
  try { ok = await db('rpc/is_admin', { method: 'POST', body: {} }); } catch (e) {
    if (e.signedOut) return;
    showGate(e.offline ? reason(e) : `Provera naloga nije uspela. ${reason(e)}`);
    return;
  }
  if (ok !== true) {
    const who = session?.email;
    await auth('logout', {}, session?.access_token).catch(() => {});
    keep(null);
    showGate(`Nalog ${shown(who)} nema administratorska prava. Vlasnik sajta ga može dodati u tabelu admins.`);
    return;
  }
  showApp();
}
async function signOut() {
  const t = session?.access_token;
  keep(null);
  for (const k of Object.keys(D)) D[k] = [];
  showGate('Odjavljeni ste.');
  if (t) auth('logout', {}, t).catch(() => {});
}

$('[data-login]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const login = f.elements.email.value.trim(), password = f.elements.password.value;
  const email = !login || login.includes('@') ? login : `${login.toLowerCase()}@${USER_DOMAIN}`;
  $$('[aria-invalid]', f).forEach((el) => el.removeAttribute('aria-invalid'));
  const m = $('[data-login-msg]');
  if (!email || !password) {
    const el = !email ? f.elements.email : f.elements.password;
    el.setAttribute('aria-invalid', 'true');
    m.textContent = !email ? 'Upišite korisničko ime ili mejl.' : 'Upišite lozinku.';
    m.hidden = false;
    el.focus();
    return;
  }
  const b = $('[type="submit"]', f);
  b.disabled = true;
  b.textContent = 'Prijavljivanje…';
  m.hidden = true;
  try {
    fromAuth(await auth('token?grant_type=password', { email, password }));
    f.elements.password.value = '';
    await enter();
  } catch (err) {
    m.textContent = err.offline ? reason(err)
      : err.status === 429 ? 'Previše pokušaja. Sačekajte nekoliko minuta.'
        : err.status === 400 || err.status === 401 ? (err.code === 'email_not_confirmed' ? 'Mejl naloga nije potvrđen. U Supabase-u otvorite korisnika i potvrdite ga.' : 'Korisničko ime ili lozinka nisu tačni.')
          : `Prijava nije uspela. ${reason(err)}`;
    m.hidden = false;
    if (!err.offline && (err.status === 400 || err.status === 401)) { f.elements.password.setAttribute('aria-invalid', 'true'); f.elements.password.select(); }
  } finally {
    b.disabled = false;
    b.textContent = 'Prijavi se';
  }
});

// ---------- start ----------
document.documentElement.classList.add('js');
if (!C.url) showGate('Sajt još nije povezan sa bazom (data/site.json).');
else if (session) enter(); else showGate();
