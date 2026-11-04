// The data the screens show (loaded once, kept here), lookups, the address (route) and the loading/empty/error states.
import { db, esc, reason } from './api.js?v=7648825353';
import { draw } from './shell.js?v=7648825353';

// ---------- data ----------
export const D = { products: [], cats: [], priests: [], groups: [], orders: [], inquiries: [], options: [], templates: [] };
export const ST = { products: 'idle', cats: 'idle', priests: 'idle', groups: 'idle', orders: 'idle', inquiries: 'idle', templates: 'idle' };
export const GROUPS = [['svestenstvo', 'Sveštenstvo'], ['ostali', 'Ostali kontakti']];
export const groupOf = (p) => p.grp || 'svestenstvo';
export const markupOf = (g) => Number(D.groups.find((x) => x.grp === g)?.markup ?? 0);
export const allRows = async (path) => {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const page = await db(`${path}&limit=1000&offset=${from}`);
    all.push(...page);
    if (page.length < 1000) return all;
  }
};
const ERR = {};
export const Q = {
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
  templates: () => db('message_templates?select=*&order=key.asc,lang.asc'),
};
export async function load(what, force = false) {
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
export const byCode = (code) => D.products.find((p) => p.code === code);
export const optionsOf = (code) => D.options.filter((o) => o.product === code);
export const optById = (id) => D.options.find((o) => o.id === Number(id));
export const optStock = (code) => optionsOf(code).reduce((a, o) => a + (o.stock ?? 0), 0);
// at or under its reorder point (or gone): time to order more
export const isDraft = (p) => p.status === 'draft';
export const low = (p) => p.stock !== null && p.stock !== undefined && (p.stock === 0 || (p.min_stock !== null && p.min_stock !== undefined && p.stock <= p.min_stock));
export const ledgerCounts = (all) => ({ '': all.length, out: all.filter((p) => p.stock === 0).length, low: all.filter(low).length, draft: all.filter(isDraft).length, hidden: all.filter((p) => !p.active && !isDraft(p)).length });
export const catOf = (id) => D.cats.find((c) => c.id === id);
export const catName = (id) => { const c = catOf(id); return c ? c.name_sr || c.name_fr || c.id : id; };
export const nameOf = (p) => p.name_sr || p.name_fr || p.name_en || p.code;

// ---------- routes: the tab and its filters live in the address ----------
export const TABS = ['pregled', 'upiti', 'porudzbine', 'fakture', 'artikli', 'zalihe', 'statistika', 'svestenstvo', 'kategorije', 'poruke'];
export const NEEDS = {
  pregled: ['orders', 'products', 'inquiries', 'priests', 'cats'], upiti: ['inquiries', 'products', 'priests'],
  artikli: ['products', 'cats'], zalihe: ['products', 'cats'], kategorije: ['cats', 'products'], svestenstvo: ['priests', 'groups'], porudzbine: ['orders', 'products'], fakture: ['orders'], poruke: ['templates'], statistika: ['orders', 'products', 'cats'],
};
export function route() {
  const [tab, qs] = location.hash.slice(1).split('?');
  return { tab: TABS.includes(tab) ? tab : 'pregled', p: new URLSearchParams(qs || '') };
}
export function setParam(k, v) {
  const r = route();
  if (v) r.p.set(k, v); else r.p.delete(k);
  const s = r.p.toString();
  history.replaceState(null, '', `#${r.tab}${s ? `?${s}` : ''}`);
  draw();
}
export const stateOf = (list) => (list.some((w) => ST[w] === 'error') ? 'error' : list.every((w) => ST[w] === 'ready') ? 'ready' : 'loading');

// ---------- the four states of a region ----------
export const skeleton = (rows = 8) => `<div class="skel" aria-busy="true" aria-label="Učitavanje">${'<span class="skel__row"></span>'.repeat(rows)}</div>`;
export const failed = (what, list) => `<div class="state state--error" role="alert">
    <p class="state__title">${esc(what)} se nisu učitali.</p>
    <p>${esc(reason(list.map((w) => ERR[w]).find(Boolean)))}</p>
    <button class="btn" type="button" data-retry="${list.join(' ')}">Pokušaj ponovo</button>
  </div>`;
export const empty = (title, text, action = '') => `<div class="state"><p class="state__title">${esc(title)}</p><p>${esc(text)}</p>${action}</div>`;

// lists that show their first rows and open to the whole list on a click (kept while the admin is open)
export const MORE = new Set();
export const shownOf = (key, all, limit) => (MORE.has(key) ? all : all.slice(0, limit));
export const moreBtn = (key, total, limit) => (total > limit
  ? `<p class="more"><button class="btn btn--s" type="button" data-more="${key}" aria-expanded="${MORE.has(key)}">${MORE.has(key) ? `Prikaži samo prvih ${limit}` : `Prikaži sve (${total})`}</button></p>` : '');

// ---------- date range and sort order of the order and invoice lists ----------
export const rangeOf = (r) => ({ from: r.p.get('od') || '', to: r.p.get('do') || '', sort: r.p.get('o') || '' });
export const inRange = (at, { from, to }) => (!from || at >= Date.parse(`${from}T00:00:00`)) && (!to || at <= Date.parse(`${to}T23:59:59`));
export function syncRange(sc, r) {
  const { from, to, sort } = rangeOf(r);
  const set = (n, v) => { const el = sc.querySelector(`[name="${n}"]`); if (el && el.value !== v) el.value = v; };
  set('od', from); set('do', to); set('o', sort);
}
const label = (x) => String(x.parish || x.name || x.email || '');
export const byLabel = (a, b) => label(a).localeCompare(label(b), 'fr', { sensitivity: 'base' }) || String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' });
