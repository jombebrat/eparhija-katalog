// Statistics screen: sales by month, what to reorder, CSV exports.
import { $, esc, money, plural, when } from './api.js?v=64c2840099';
import { D, NEEDS, byCode, catName, empty, failed, low, nameOf, route, skeleton, stateOf, moreBtn, shownOf } from './data.js?v=64c2840099';
import { STATUS } from './orders.js?v=64c2840099';
import { syncSeg } from './ui.js?v=64c2840099';

export const DAY = 864e5;
const PERIODS = { 30: '30 dana', 90: '90 dana', 365: '12 meseci', sve: 'od početka' };
export const whole = new Intl.NumberFormat('sr-Latn-RS', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const qtyText = (n, unit) => (unit === 'kg' ? `${String(n).replace('.', ',')} kg` : String(n));
const dayText = new Intl.DateTimeFormat('sr-Latn-RS', { dateStyle: 'medium', timeZone: 'Europe/Paris' });
const monthLong = new Intl.DateTimeFormat('sr-Latn-RS', { month: 'long', year: 'numeric' });
const monthShort = new Intl.DateTimeFormat('sr-Latn-RS', { month: 'short' });
export const counted = () => D.orders.filter((o) => o.status !== 'cancelled');

// per article: quantity, value and number of orders, from the order lines
export function salesBy(orders) {
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
export function statsModel(r) {
  const per = periodOf(r);
  const since = per === 'sve' ? 0 : Date.now() - Number(per) * DAY;
  const live = counted();
  const inPeriod = live.filter((o) => Date.parse(o.created_at) >= since);
  const sales = salesBy(inPeriod);
  const ever = salesBy(live);
  const pace = salesBy(live.filter((o) => Date.parse(o.created_at) >= Date.now() - 90 * DAY));
  return { per, live, inPeriod, sales, ever, pace };
}

export function reorderList(m) {
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
export function monthChart(live) {
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

export function drawStats(r) {
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

  const ranked = [...m.sales].sort((a, b) => (by === 'iznos' ? b[1].value - a[1].value : b[1].qty - a[1].qty) || b[1].orders - a[1].orders);
  const rankedAll = ranked, rankedShown = shownOf('best', ranked, 10);
  const best = `<section class="panel" aria-labelledby="h-best">
      <div class="panel__head panel__head--row"><h2 id="h-best">Najviše se prodaje</h2>
        <div class="seg seg--s" role="group" aria-label="Poređaj" data-po><button type="button" data-v="kol" aria-pressed="${by === 'kol'}">po količini</button><button type="button" data-v="iznos" aria-pressed="${by === 'iznos'}">po iznosu</button></div></div>
      ${rankedAll.length ? `<div class="tbl-wrap"><table class="tbl tbl--compact">
        <thead><tr><th scope="col" class="num opt">#</th><th scope="col">Artikal</th><th scope="col" class="num">Količina</th><th scope="col" class="num">Iznos</th><th scope="col" class="num opt">Porudžbina</th></tr></thead>
        <tbody>${rankedShown.map(([code, s], i) => `<tr><td class="num opt">${i + 1}</td><th scope="row"><span class="c-code">${codeBtn(code)}</span> <span class="sub">${esc(name(code, s.name))}</span></th>
          <td class="num">${esc(qtyText(s.qty, s.unit))}</td><td class="num">${esc(money.format(s.value))}</td><td class="num opt">${s.orders}</td></tr>`).join('')}</tbody>
      </table></div>${moreBtn('best', rankedAll.length, 10)}` : '<p class="state__hint">U ovom periodu nema prodaje.</p>'}
    </section>`;

  const least = D.products.filter((p) => p.active).map((p) => ({ p, s: m.sales.get(p.code), last: m.ever.get(p.code)?.last || 0 }))
    .sort((a, b) => (a.s?.qty || 0) - (b.s?.qty || 0) || a.last - b.last || catOrder(a.p) - catOrder(b.p) || a.p.sort - b.p.sort);
  const leastShown = shownOf('least', least, 10);
  const never = D.products.filter((p) => p.active && !m.sales.has(p.code)).length;
  const worst = `<section class="panel" aria-labelledby="h-least">
      <div class="panel__head"><h2 id="h-least">Najmanje se prodaje</h2><p class="panel__sub">${esc(never ? `${plural(never, 'artikal nije poručen', 'artikla nisu poručena', 'artikala nije poručeno')} u ovom periodu; ovde su oni koji najduže čekaju.` : 'Svaki artikal je poručen bar jednom u ovom periodu.')}</p></div>
      <div class="tbl-wrap"><table class="tbl tbl--compact">
        <thead><tr><th scope="col">Artikal</th><th scope="col" class="num">Količina</th><th scope="col" class="num">Poslednji put poručen</th><th scope="col" class="num opt">Stanje</th></tr></thead>
        <tbody>${leastShown.map(({ p, s, last }) => `<tr><th scope="row"><span class="c-code">${codeBtn(p.code)}</span> <span class="sub">${esc(nameOf(p))}</span></th>
          <td class="num">${s ? esc(qtyText(s.qty, p.unit)) : '0'}</td><td class="num">${last ? esc(dayText.format(new Date(last))) : 'nikad'}</td><td class="num opt">${p.stock ?? '—'}</td></tr>`).join('')}</tbody>
      </table></div>${moreBtn('least', least.length, 10)}
    </section>`;

  const people = new Map();
  for (const o of m.inPeriod) {
    const x = people.get(o.email) || { name: o.name || o.email, parish: o.parish || '', n: 0, value: 0, last: 0 };
    x.n++; x.value += Number(o.total); x.last = Math.max(x.last, Date.parse(o.created_at));
    people.set(o.email, x);
  }
  const topPeople = [...people.values()].sort((a, b) => b.value - a.value);
  const topShown = shownOf('people', topPeople, 10);
  const who = `<section class="panel" aria-labelledby="h-people">
      <div class="panel__head"><h2 id="h-people">Članovi koji najviše poručuju</h2></div>
      <div class="tbl-wrap"><table class="tbl tbl--compact">
        <thead><tr><th scope="col">Član</th><th scope="col" class="num">Porudžbina</th><th scope="col" class="num">Iznos</th><th scope="col" class="num">Poslednja</th></tr></thead>
        <tbody>${topShown.map((x) => `<tr><th scope="row">${esc(x.name)}<span class="sub">${esc(x.parish)}</span></th><td class="num">${x.n}</td><td class="num">${esc(money.format(x.value))}</td><td class="num">${esc(dayText.format(new Date(x.last)))}</td></tr>`).join('')}</tbody>
      </table></div>${moreBtn('people', topPeople.length, 10)}
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
export function csv(name, rows) {
  const cell = (v) => { const x = v === null || v === undefined ? '' : String(v); return /[;"\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  const text = `﻿${rows.map((r) => r.map(cell).join(';')).join('\r\n')}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const dec = (n) => (n === null || n === undefined || n === '' ? '' : String(Math.round(Number(n) * 100) / 100).replace('.', ','));
export const today = () => new Date().toISOString().slice(0, 10);
export function csvProducts() {
  csv(`artikli-${today()}.csv`, [['Šifra', 'Kategorija', 'Naziv (srpski)', 'Naziv (francuski)', 'Naziv (engleski)', 'Cena (€)', 'Nabavna cena (€)', 'Jedinica', 'Stanje', 'Poruči kad padne na', 'Na sajtu'],
    ...D.products.map((p) => [p.code, catName(p.category), p.name_sr, p.name_fr, p.name_en, dec(p.price), dec(p.cost), p.unit === 'kg' ? 'kg' : 'komad', p.stock ?? '', p.min_stock ?? '', p.active ? 'da' : 'ne'])]);
}
export function csvOrders() {
  const rows = [['Broj', 'Datum', 'Status', 'Mejl', 'Ime', 'Parohija', 'Šifra', 'Artikal', 'Količina', 'Cena (€)', 'Iznos (€)']];
  for (const o of D.orders) for (const l of o.items || []) rows.push([o.id, when.format(new Date(o.created_at)), STATUS[o.status], o.email, o.name || '', o.parish || '', l.code, l.name, dec(l.qty), dec(l.price), dec(l.qty * l.price)]);
  csv(`porudzbine-${today()}.csv`, rows);
}
export function csvStats() {
  const m = statsModel(route());
  csv(`prodaja-${m.per}-${today()}.csv`, [['Šifra', 'Naziv', 'Kategorija', 'Količina', 'Iznos (€)', 'Porudžbina', 'Stanje'],
    ...D.products.map((p) => { const s = m.sales.get(p.code); return [p.code, nameOf(p), catName(p.category), dec(s?.qty || 0), dec(s?.value || 0), s?.orders || 0, p.stock ?? '']; })
      .sort((a, b) => Number(String(b[4]).replace(',', '.')) - Number(String(a[4]).replace(',', '.')))]);
}
