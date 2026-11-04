// One search for the whole admin: articles, orders and inquiries. A result opens like the same row in its own screen.
import { $, $$, esc, money, norm } from './api.js?v=64c2840099';
import { D, ST, load, catName } from './data.js?v=64c2840099';
import { productKey } from './products.js?v=64c2840099';
import { STATUS } from './orders.js?v=64c2840099';
import { INQ } from './inquiries.js?v=64c2840099';

const input = $('[data-gs]');
const box = $('[data-gs-res]');
const WHAT = ['products', 'cats', 'priests', 'groups', 'orders', 'inquiries'];
const MAX = 6;
let timer = 0;

const inqTag = (s) => (s === 'sent' ? 'done' : s === 'ordered' ? 'new' : s === 'closed' ? 'cancelled' : 'low');
const hasAll = (key, words) => words.every((w) => key.includes(w));

function results(q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  const num = /^\d+$/.test(q.trim()) ? Number(q.trim()) : null;
  const products = D.products.filter((p) => hasAll(productKey(p), words))
    .sort((a, b) => (norm(b.code).startsWith(words[0]) ? 1 : 0) - (norm(a.code).startsWith(words[0]) ? 1 : 0));
  const orders = D.orders.filter((o) => (num !== null && o.id === num) || hasAll(norm([o.id, o.name, o.email, o.parish].join(' ')), words));
  const inquiries = D.inquiries.filter((i) => (num !== null && i.id === num) || hasAll(norm([i.id, i.name, i.email, i.parish].join(' ')), words));
  return { products, orders, inquiries };
}

function draw() {
  const q = input.value.trim();
  if (!q) { hide(); return; }
  if (WHAT.some((w) => ST[w] === 'loading' || ST[w] === 'idle')) { box.hidden = false; box.innerHTML = '<p class="gs__note">Učitavanje…</p>'; return; }
  const r = results(q);
  const group = (title, list, row) => (list.length ? `<section class="gs__grp" aria-label="${title}"><h3 class="gs__title">${title} <span class="gs__n">${list.length}</span></h3>${list.slice(0, MAX).map(row).join('')}</section>` : '');
  const html = group('Artikli', r.products, (p) => `<button class="gs__it" type="button" data-edit="${esc(p.code)}"><span class="gs__main"><b>${esc(p.code)}</b> ${esc(p.name_sr || p.name_fr || '')}</span><span class="gs__sub">${esc(catName(p.category))}</span></button>`)
    + group('Porudžbine', r.orders, (o) => `<button class="gs__it" type="button" data-open-order="${o.id}"><span class="gs__main"><b>br. ${o.id}</b> ${esc(o.name || o.email)}</span><span class="gs__sub">${esc(money.format(o.total))} <span class="tag tag--${o.status}">${STATUS[o.status]}</span></span></button>`)
    + group('Upiti', r.inquiries, (i) => `<button class="gs__it" type="button" data-open-inq="${i.id}"><span class="gs__main"><b>br. ${i.id}</b> ${esc(i.name || i.email)}</span><span class="gs__sub"><span class="tag tag--${inqTag(i.status)}">${INQ[i.status]}</span></span></button>`);
  box.hidden = false;
  box.innerHTML = html || `<p class="gs__note">Ništa nije nađeno za „${esc(q)}“.</p>`;
}
function hide() { box.hidden = true; box.innerHTML = ''; }
function prefetch() { for (const w of WHAT) if (ST[w] === 'idle') load(w).then(() => { if (document.activeElement === input) draw(); }); }

input.addEventListener('focus', prefetch);
input.addEventListener('input', () => { prefetch(); clearTimeout(timer); timer = setTimeout(draw, 80); });
input.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { input.value = ''; hide(); input.blur(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); $('.gs__it', box)?.focus(); }
  if (e.key === 'Enter') { e.preventDefault(); $('.gs__it', box)?.click(); }
});
box.addEventListener('keydown', (e) => {
  const items = $$('.gs__it', box), i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, i + 1)]?.focus(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) input.focus(); else items[i - 1].focus(); }
  if (e.key === 'Escape') { input.focus(); }
});
// a result opens through the same click handler as the row it stands for; then the search steps aside
box.addEventListener('click', (e) => { if (e.target.closest('.gs__it')) setTimeout(() => { input.value = ''; hide(); }, 0); });
document.addEventListener('click', (e) => { if (!e.target.closest('.gs')) hide(); });
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if ((e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
    if ($('#app').hidden || $('[data-sheet]').open) return;
    e.preventDefault(); input.focus(); input.select();
  }
});
