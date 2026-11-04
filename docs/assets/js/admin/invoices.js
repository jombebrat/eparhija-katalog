// Invoices: the history of invoices imported from Erplain (an order whose note starts with "[Erplain FAC-…]").
import { $, $$, esc, money, when } from './api.js?v=bdf0fa49e0';
import { D, NEEDS, empty, failed, skeleton, stateOf } from './data.js?v=bdf0fa49e0';
import { syncInput, syncSeg } from './ui.js?v=bdf0fa49e0';

const PAID = { paid: 'Plaćena', unpaid: 'Neplaćena', cancelled: 'Otkazana' };
// the invoice behind an order: its number, the amount with tax and whether it was paid
export function invoiceOf(o) {
  const m = /^\[Erplain ([^\]]+)\](.*)$/.exec(o.note || '');
  if (!m) return null;
  const ttc = /TTC ([\d.]+)/.exec(m[2]);
  return { no: m[1], ttc: ttc ? Number(ttc[1]) : null, state: o.status === 'cancelled' ? 'cancelled' : /nije plaćena/.test(m[2]) ? 'unpaid' : 'paid', date: new Date(o.created_at) };
}
const year = (i) => String(i.date.getFullYear());

export function drawInvoices(r) {
  const box = $('[data-region="invoices"]');
  const sc = $('[data-screen="fakture"]');
  const q = (r.p.get('q') || '').toLowerCase();
  const y = r.p.get('y') || '';
  const f = r.p.get('f') || '';
  syncInput($('[data-q]', sc), r.p.get('q') || '');
  const st = stateOf(NEEDS.fakture);
  if (st === 'loading') { box.innerHTML = skeleton(); return; }
  if (st === 'error') { box.innerHTML = failed('Fakture', NEEDS.fakture); return; }
  const all = D.orders.map((o) => ({ o, i: invoiceOf(o) })).filter((x) => x.i);
  const years = [...new Set(all.map((x) => year(x.i)))].sort().reverse();
  const yb = $('[data-y]', sc);
  yb.innerHTML = `<button type="button" data-v="" aria-pressed="false">Sve</button>${years.map((v) => `<button type="button" data-v="${v}" aria-pressed="false">${v}</button>`).join('')}`;
  syncSeg(yb, y);
  syncSeg($('[data-f]', sc), f);
  $('[data-invoice-count]').textContent = all.length ? `${all.length} faktura iz Erplaina` : '';
  if (!all.length) {
    box.innerHTML = empty('Još nema faktura.', 'Ovde se prikazuju fakture uvezene iz Erplaina.');
    return;
  }
  const list = all.filter(({ o, i }) => (!y || year(i) === y) && (!f || i.state === f)
    && (!q || `${i.no} ${o.name || ''} ${o.parish || ''} ${o.email}`.toLowerCase().includes(q)));
  if (!list.length) { box.innerHTML = empty('Nijedna faktura ne odgovara.', 'Promenite godinu, filter ili pretragu.', '<button class="btn" type="button" data-clear>Prikaži sve</button>'); return; }
  const sum = list.filter((x) => x.i.state !== 'cancelled');
  const ht = sum.reduce((a, x) => a + Number(x.o.total), 0);
  const ttc = sum.reduce((a, x) => a + (x.i.ttc ?? 0), 0);
  const open = list.filter((x) => x.i.state === 'unpaid').reduce((a, x) => a + (x.i.ttc ?? 0), 0);
  box.innerHTML = `<dl class="facts facts--row"><div><dt>Prikazano</dt><dd>${list.length}</dd></div><div><dt>Ukupno bez PDV-a</dt><dd>${esc(money.format(ht))}</dd></div><div><dt>Ukupno sa PDV-om</dt><dd>${esc(money.format(ttc))}</dd></div><div><dt>Neplaćeno (sa PDV-om)</dt><dd>${esc(money.format(open))}</dd></div></dl>
  <table class="tbl tbl--orders tbl--invoices">
    <thead><tr><th scope="col">Faktura</th><th scope="col">Datum</th><th scope="col">Naručilac</th><th scope="col" class="num">Bez PDV-a</th><th scope="col" class="num">Sa PDV-om</th><th scope="col">Status</th></tr></thead>
    <tbody>${list.map(({ o, i }) => `<tr data-order="${o.id}" class="is-link">
      <th scope="row" class="c-no"><button class="link" type="button" data-open-order="${o.id}" aria-label="Faktura ${esc(i.no)}, otvori">${esc(i.no)}</button></th>
      <td data-label="Datum">${esc(when.format(i.date).replace(/,? \d{1,2}:\d{2}$/, ''))}</td>
      <td class="c-name"><span>${esc(o.name || o.email)}</span><span class="sub">${esc(o.parish || '')}</span></td>
      <td class="num" data-label="Bez PDV-a">${esc(money.format(o.total))}</td>
      <td class="num" data-label="Sa PDV-om">${i.ttc === null ? '—' : esc(money.format(i.ttc))}</td>
      <td data-label="Status"><span class="tag tag--${i.state === 'paid' ? 'done' : i.state === 'unpaid' ? 'processing' : 'cancelled'}">${PAID[i.state]}</span></td>
    </tr>`).join('')}</tbody>
  </table>`;
  void $$;
}
