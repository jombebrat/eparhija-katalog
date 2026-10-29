// Administration of the warehouse: articles and their stock, categories, clergy, orders.
// Talks to Supabase over plain fetch (Auth, the REST API, Storage). What a signed-in account may read
// or change is decided by the database (an account must be listed in the `admins` table).
import { norm, esc, photoUrl } from './render.js';

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
    return await call(`${C.url}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: C.key, Authorization: `Bearer ${t}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
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
const D = { products: [], cats: [], priests: [], orders: [] };
const ST = { products: 'idle', cats: 'idle', priests: 'idle', orders: 'idle' };
const ERR = {};
const Q = {
  cats: () => db('categories?select=*&order=sort.asc,id.asc'),
  products: () => db('products?select=*&order=sort.asc,code.asc'),
  priests: () => db('priests?select=*&order=name.asc.nullslast,email.asc'),
  orders: async () => {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const page = await db(`orders?select=*&order=created_at.desc&limit=1000&offset=${from}`);
      all.push(...page);
      if (page.length < 1000) return all;
    }
  },
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
// at or under its reorder point (or gone): time to order more
const low = (p) => p.stock !== null && p.stock !== undefined && (p.stock === 0 || (p.min_stock !== null && p.min_stock !== undefined && p.stock <= p.min_stock));
const ledgerCounts = (all) => ({ '': all.length, out: all.filter((p) => p.stock === 0).length, low: all.filter(low).length, hidden: all.filter((p) => !p.active).length });
const catOf = (id) => D.cats.find((c) => c.id === id);
const catName = (id) => { const c = catOf(id); return c ? c.name_sr || c.name_fr || c.id : id; };
const nameOf = (p) => p.name_sr || p.name_fr || p.name_en || p.code;

// ---------- routes: the tab and its filters live in the address ----------
const TABS = ['artikli', 'porudzbine', 'statistika', 'svestenstvo', 'kategorije'];
const NEEDS = { artikli: ['products', 'cats'], kategorije: ['cats', 'products'], svestenstvo: ['priests'], porudzbine: ['orders'], statistika: ['orders', 'products', 'cats'] };
function route() {
  const [tab, qs] = location.hash.slice(1).split('?');
  return { tab: TABS.includes(tab) ? tab : 'artikli', p: new URLSearchParams(qs || '') };
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
  ({ artikli: drawProducts, kategorije: drawCats, svestenstvo: drawPriests, porudzbine: drawOrders, statistika: drawStats })[r.tab](r);
  drawBadge();
}

function drawBadge() {
  const n = D.orders.filter((o) => o.status === 'new').length;
  const b = $('[data-new-orders]');
  b.textContent = n ? String(n) : '';
  b.hidden = !n;
  $('[data-tab="porudzbine"]').setAttribute('aria-label', n ? `Porudžbine, ${plural(n, 'nova', 'nove', 'novih')}` : 'Porudžbine');
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
      <td class="num c-stock" data-label="Stanje"><span class="stock"><input class="input input--stock" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${p.stock ?? ''}" placeholder="—" aria-label="Stanje, ${c}" data-stock="${c}">${stockTag(p)}</span></td>
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
  $('.tag', s)?.remove();
  s.insertAdjacentHTML('beforeend', stockTag(p));
  const inp = $('[data-stock]', tr);
  if (document.activeElement !== inp) inp.value = p.stock ?? '';
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

// ----- clergy -----
function drawPriests(r) {
  const box = $('[data-region="priests"]');
  const sc = $('[data-screen="svestenstvo"]');
  const q = r.p.get('q') || '';
  syncInput($('[data-q]', sc), q);
  const st = stateOf(NEEDS.svestenstvo);
  if (st === 'loading') { box.innerHTML = skeleton(); return; }
  if (st === 'error') { box.innerHTML = failed('Sveštenici', NEEDS.svestenstvo); return; }
  priestCount();
  if (!D.priests.length) {
    box.innerHTML = empty('Lista sveštenstva je prazna.', 'Samo adrese sa ove liste vide cene i mogu da naruče.', '<button class="btn btn--primary" type="button" data-new="priest">Dodaj sveštenika</button>');
    return;
  }
  const nq = norm(q);
  const list = D.priests.filter((p) => !nq || norm([p.name, p.parish, p.email, p.phone].join(' ')).includes(nq));
  if (!list.length) {
    box.innerHTML = empty('Niko ne odgovara pretrazi.', 'Pretražite po imenu, parohiji ili mejlu.', '<button class="btn" type="button" data-clear>Prikaži sve</button>');
    return;
  }
  box.innerHTML = `<p class="region__count">${esc(plural(list.length, 'sveštenik', 'sveštenika', 'sveštenika'))}${list.length < D.priests.length ? ` od ${D.priests.length}` : ''}</p>
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
  const on = D.priests.filter((x) => x.active).length;
  $('[data-priest-count]').textContent = D.priests.length ? `Cene vidi ${on} od ${D.priests.length}` : '';
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
  csv(`artikli-${today()}.csv`, [['Šifra', 'Kategorija', 'Naziv (srpski)', 'Naziv (francuski)', 'Naziv (engleski)', 'Cena (€)', 'Jedinica', 'Stanje', 'Poruči kad padne na', 'Na sajtu'],
    ...D.products.map((p) => [p.code, catName(p.category), p.name_sr, p.name_fr, p.name_en, dec(p.price), p.unit === 'kg' ? 'kg' : 'komad', p.stock ?? '', p.min_stock ?? '', p.active ? 'da' : 'ne'])]);
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
    const bytes = Uint8Array.from(atob(j.pdf), (c) => c.charCodeAt(0));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    a.download = j.filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) {
    if (!e.signedOut) formError(box, `PDF nije napravljen. ${reason(e)}`);
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

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
  edit = { code: isNew ? null : p.code, photos: [...(p.photos || [])], added: [], removed: [], saved: false };
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
    </div>
    ${foot(isNew ? 'Dodaj artikal' : 'Sačuvaj izmene', isNew ? '' : '<button class="btn btn--danger" type="button" data-delete-product>Obriši artikal</button>')}
  </form>`);
  drawPhotos();
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
  const code = v('code');
  if (!code) errs.push(invalid(form, 'code', 'Upišite šifru artikla.'));
  else if (code !== edit.code && byCode(code)) errs.push(invalid(form, 'code', `Šifra ${code} već postoji.`));
  if (!v('name_sr') && !v('name_fr') && !v('name_en')) errs.push(invalid(form, 'name_sr', 'Upišite bar jedan naziv.'));
  const price = Number(v('price').replace(/\s/g, '').replace(',', '.'));
  if (v('price') === '' || !Number.isFinite(price) || price < 0) errs.push(invalid(form, 'price', 'Upišite cenu, na primer 12,50.'));
  const stockRaw = v('stock');
  if (stockRaw !== '' && !/^\d{1,7}$/.test(stockRaw)) errs.push(invalid(form, 'stock', 'Ceo broj, 0 ili više, ili prazno.'));
  const minRaw = v('min_stock');
  if (minRaw !== '' && !/^\d{1,7}$/.test(minRaw)) errs.push(invalid(form, 'min_stock', 'Ceo broj, 0 ili više, ili prazno.'));
  const sortRaw = v('sort');
  if (sortRaw !== '' && !/^-?\d{1,6}$/.test(sortRaw)) errs.push(invalid(form, 'sort', 'Ceo broj, na primer 10.'));
  if (errs.length) { errs[0].focus(); return; }

  const row = {
    code, category: v('category'),
    name_sr: v('name_sr'), name_fr: v('name_fr'), name_en: v('name_en'),
    note_sr: v('note_sr') || null, note_fr: v('note_fr') || null, note_en: v('note_en') || null,
    price: Math.round(price * 100) / 100, unit: v('unit'),
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
  D.products = D.products.filter((x) => x !== p);
  edit.saved = true;
  closeSheet();
  draw();
  let undone = false;
  notify(`${p.code} je obrisan.`, async () => {
    undone = true;
    try {
      D.products.push(one(await db('products', { method: 'POST', body: copy, prefer: 'return=representation' })));
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
  p ??= { email: '', name: '', parish: '', phone: '', address: '', active: true };
  editPriest = isNew ? null : p.id;
  openSheet(`<form class="sheet__inner" novalidate data-form="priest">
    ${head(isNew ? 'Novi sveštenik' : esc(p.name || p.email), isNew ? 'Sa ovim mejlom vidi cene i šalje porudžbine.' : '')}
    <div class="sheet__body">
      ${field({ id: 'p-email', label: 'Mejl', name: 'email', type: 'email', value: p.email, req: true, help: 'Adresa koju sveštenik upisuje na sajtu.', attrs: `autocomplete="off" inputmode="email" spellcheck="false"${isNew ? ' autofocus' : ''}` })}
      ${field({ id: 'p-name', label: 'Ime i prezime', name: 'name', value: p.name, help: 'Upisuje se u porudžbinu i PDF.', attrs: 'autocomplete="off"' })}
      ${field({ id: 'p-parish', label: 'Parohija ili crkva', name: 'parish', value: p.parish, attrs: 'autocomplete="off"' })}
      ${field({ id: 'p-phone', label: 'Telefon', name: 'phone', type: 'tel', value: p.phone, attrs: 'autocomplete="off" inputmode="tel"' })}
      ${field({ id: 'p-address', label: 'Adresa za dostavu', name: 'address', value: p.address, help: 'Upisuje se sama u porudžbinu; član je može menjati u svom nalogu.', attrs: 'autocomplete="off"' })}
      ${checkbox({ id: 'p-active', label: 'Vidi cene i može da naruči', name: 'active', checked: p.active, help: 'Isključite umesto brisanja kad neko privremeno ne treba pristup.' })}
    </div>
    ${foot(isNew ? 'Dodaj sveštenika' : 'Sačuvaj izmene', isNew ? '' : '<button class="btn btn--danger" type="button" data-delete-priest>Obriši sa liste</button>')}
  </form>`);
}
async function submitPriest(form) {
  const v = (n) => form.elements[n].value.trim();
  const email = v('email').toLowerCase();
  const errs = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.push(invalid(form, 'email', 'Upišite ceo mejl, na primer ime@parohija.fr.'));
  else if (D.priests.some((p) => p.email === email && p.id !== editPriest)) errs.push(invalid(form, 'email', 'Taj mejl je već na listi.'));
  if (errs.length) { errs[0].focus(); return; }
  const row = { email, name: v('name') || null, parish: v('parish') || null, phone: v('phone') || null, address: v('address') || null, active: form.elements.active.checked };
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
        <tbody>${o.items.map((l) => `<tr><th scope="row" class="c-code">${esc(l.code)}</th><td>${esc(l.name)}</td><td class="num">${l.qty}${l.unit === 'kg' ? ' kg' : ''}</td><td class="num">${esc(money.format(l.price))}</td><td class="num">${esc(money.format(l.price * l.qty))}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row" colspan="4">Ukupno</th><td class="num total">${esc(money.format(o.total))}</td></tr></tfoot>
      </table>
      <p class="order__stock">${o.status === 'done'
        ? (taken?.length ? `Skinuto sa stanja: ${taken.map(([c, n]) => `${esc(c)} × ${n}`).join(', ')}.` : 'Nijedan artikal iz porudžbine nema praćeno stanje, pa stanje nije menjano.')
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
  if (t.matches('[data-s] button')) { setParam('s', t.dataset.v === 'new' ? '' : t.dataset.v); return; }
  if (t.matches('[data-new="product"]')) { if (!D.cats.length) { notify('Prvo napravite kategoriju; svaki artikal pripada jednoj.', null, true); return; } productForm(null); return; }
  if (t.matches('[data-new="cat"]')) { catForm(null); return; }
  if (t.matches('[data-new="priest"]')) { priestForm(null); return; }
  if (t.matches('[data-edit]')) { const p = byCode(t.dataset.edit); byCodeBefore.set(p.code, (p.photos || []).map((ph) => ph.src)); productForm(p); return; }
  if (t.matches('[data-edit-cat]')) { catForm(catOf(t.dataset.editCat)); return; }
  if (t.matches('[data-edit-priest]')) { priestForm(D.priests.find((p) => p.id === Number(t.dataset.editPriest))); return; }
  if (t.matches('[data-open-order], tr.is-link')) {
    if (e.target.closest('a')) return;
    const id = Number(t.dataset.openOrder || t.dataset.order);
    const o = D.orders.find((x) => x.id === id);
    if (o) orderSheet(o);
    return;
  }
  if (t.matches('[data-status]')) { setStatus(Number(t.closest('[data-order-sheet]').dataset.orderSheet), t.dataset.status, t); return; }
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
  if (t.matches('[data-delete-cat]')) { deleteCat(); return; }
  if (t.matches('[data-delete-priest]')) { deletePriest(); return; }
  if (t.matches('[data-password]')) { passwordForm(); return; }
  if (t.matches('[data-signout]')) { signOut(); }
});

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
