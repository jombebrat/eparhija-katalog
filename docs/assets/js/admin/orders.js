// Orders screen, one order's sheet and status, and the order PDF.
import { $, $$, C, SITE, call, db, esc, money, one, reason, token, when } from './api.js?v=bdf0fa49e0';
import { D, NEEDS, ST, empty, failed, load, optById, skeleton, stateOf } from './data.js?v=bdf0fa49e0';
import { saveFile } from './inquiries.js?v=bdf0fa49e0';
import { showHistory } from './history.js?v=bdf0fa49e0';
import { formError, head, openSheet } from './sheet.js?v=bdf0fa49e0';
import { draw } from './shell.js?v=bdf0fa49e0';
import { syncSeg } from './ui.js?v=bdf0fa49e0';

// ----- orders -----
export const STATUS = { new: 'Nova', processing: 'U obradi', ready: 'Spremna za preuzimanje', done: 'Izvršena', cancelled: 'Otkazana' };
export function drawOrders(r) {
  const box = $('[data-region="orders"]');
  const sc = $('[data-screen="porudzbine"]');
  const s = r.p.has('s') ? r.p.get('s') : 'new';
  syncSeg($('[data-s]', sc), s === 'all' ? 'all' : s);
  const st = stateOf(NEEDS.porudzbine);
  if (st === 'loading') { box.innerHTML = skeleton(); return; }
  if (st === 'error') { box.innerHTML = failed('Porudžbine', NEEDS.porudzbine); return; }
  const counts = { new: 0, processing: 0, ready: 0, done: 0, cancelled: 0, all: D.orders.length };
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
// ----- an order's PDF, made again by the server -----
export async function orderPdf(id, btn) {
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

// open a member's account page as that member: the server hands the admin a one-time code
export async function viewAs(email, lang, btn) {
  const win = window.open('about:blank', '_blank');
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Otvaranje…';
  try {
    const t = await token();
    const j = await call(`${C.url}/functions/v1/as-member`, {
      method: 'POST', headers: { apikey: C.key, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const dir = { fr: '', en: 'en/', sr: 'sr/' }[lang] ?? '';
    const slug = { fr: 'compte', en: 'account', sr: 'nalog' }[lang] ?? 'compte';
    const url = `${SITE}${dir}${slug}/#as=${encodeURIComponent(j.email)}:${j.code}`;
    if (win) win.location.href = url; else location.href = url;
  } catch (e) {
    win?.close();
    if (!e.signedOut) formError(btn.closest('.sheet__inner, form') || document.body, `Nalog nije otvoren. ${reason(e)}`);
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

// ----- one order -----
const LANG = { fr: 'francuski', en: 'engleski', sr: 'srpski' };
export function orderSheet(o) {
  const facts = [['Mejl', o.email && `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>`], ['Parohija', esc(o.parish || '')], ['Telefon', o.phone && `<a href="tel:${esc(o.phone.replace(/[^+\d]/g, ''))}">${esc(o.phone)}</a>`],
    ['Adresa za dostavu', esc(o.address || '').replace(/\n/g, '<br>')], ['Napomena', esc(o.note || '').replace(/\n/g, '<br>')], ['Jezik', LANG[o.lang]], ['PDF poslat mejlom', o.emailed ? 'da' : 'ne']].filter(([, x]) => x);
  const taken = o.stock_taken && Object.entries(o.stock_taken).filter(([, n]) => n > 0);
  const btn = (to, label, primary = false) => `<button class="btn${primary ? ' btn--primary' : ''}" type="button" data-status="${to}">${label}</button>`;
  const actions = ({
    new: btn('processing', 'Počni obradu', true) + btn('done', 'Označi kao izvršenu') + btn('cancelled', 'Otkaži porudžbinu'),
    processing: btn('ready', 'Spremna za preuzimanje', true) + btn('done', 'Označi kao izvršenu') + btn('cancelled', 'Otkaži porudžbinu') + btn('new', 'Vrati u nove'),
    ready: btn('done', 'Označi kao izvršenu', true) + btn('cancelled', 'Otkaži porudžbinu') + btn('processing', 'Vrati u obradu'),
    done: btn('new', 'Vrati u nove'),
    cancelled: btn('new', 'Vrati u nove'),
  })[o.status];
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
        : o.status === 'cancelled' ? 'Otkazana porudžbina ne menja stanje.' : 'Kada je označite kao izvršenu, naručene količine se skidaju sa stanja.'}</p>
      <section class="hist" aria-labelledby="hist-t"><h3 id="hist-t" class="hist__title">Istorija statusa</h3><ol class="hist__list" data-hist="order:${o.id}"><li class="sub">Učitavanje…</li></ol></section>
    </div>
    <footer class="sheet__foot">
      <p class="sheet__msg" role="alert" data-form-msg hidden></p>
      <div class="sheet__actions">${actions}<span class="spacer"></span><button class="btn" type="button" data-as-member="${esc(o.email)}" data-as-lang="${o.lang || 'fr'}">Uđi kao član</button><button class="btn" type="button" data-order-pdf>PDF</button><button class="btn" type="button" data-print>Štampaj</button></div>
    </footer>
  </div>`, { side: true });
  showHistory('order', o.id, STATUS, (x) => x);
}
export async function setStatus(id, status, btn) {
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
