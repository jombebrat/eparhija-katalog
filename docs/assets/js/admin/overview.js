// Overview screen: counters, quick actions, map of parishes.
import { $, esc, money, norm, plural, thumb } from './api.js?v=c9b2bf5879';
import { D, NEEDS, byCode, failed, low, nameOf, skeleton, stateOf, moreBtn, shownOf } from './data.js?v=c9b2bf5879';
import { INQ } from './inquiries.js?v=c9b2bf5879';
import { STATUS } from './orders.js?v=c9b2bf5879';
import { DAY, counted, monthChart, qtyText, reorderList, salesBy, statsModel, whole } from './stats.js?v=c9b2bf5879';

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

export function drawOverview() {
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
  const top = [...sales].sort((a, b) => b[1].value - a[1].value);
  const topMax = top[0]?.[1].value || 1;
  const topShown = shownOf('ovbest', top, 6);
  const best = `<section class="panel" aria-labelledby="h-ov-best">
      <div class="panel__head"><h2 id="h-ov-best">Najprodavanije</h2><p class="panel__sub">Poslednjih 90 dana, po iznosu.</p></div>
      ${top.length ? `<ol class="toplist" role="list">${topShown.map(([code, s], i) => {
        const p = byCode(code); const ph = p?.photos?.[0];
        return `<li class="toplist__item"><span class="toplist__rank">${i + 1}</span>
          <span class="toplist__img">${ph ? `<img src="${esc(thumb(ph))}" alt="" width="${ph.w}" height="${ph.h}" loading="lazy">` : ''}</span>
          <span class="toplist__text"><b>${esc(p ? nameOf(p) : s.name)}</b><span class="sub">${esc(code)} · ${esc(s.unit === 'kg' ? qtyText(s.qty, s.unit) : `${s.qty} kom.`)} · ${plural(s.orders, 'porudžbina', 'porudžbine', 'porudžbina')}</span>
            <span class="toplist__bar"><span style="width:${(s.value / topMax) * 100}%"></span></span></span>
          <span class="toplist__value">${esc(money.format(s.value))}</span></li>`;
      }).join('')}</ol>${moreBtn('ovbest', top.length, 6)}` : '<p class="state__hint">U poslednjih 90 dana nema prodaje.</p>'}
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

  // the articles at a glance, and the things the admin does most
  const nAll = D.products.length, nOn = D.products.filter((p) => p.active).length;
  const nOut = D.products.filter((p) => p.stock === 0).length, nLow = D.products.filter((p) => low(p) && p.stock !== 0).length;
  const art = (n, label, sub, href, warn) => `<a class="kpi${warn && n ? ' kpi--warn' : ''}" href="${href}"><span class="kpi__label">${label}</span><span class="kpi__n">${n}</span><span class="kpi__sub">${sub}</span></a>`;
  const arts = `<div class="ov__arts" role="group" aria-label="Artikli">
      ${art(nAll, 'Artikala ukupno', 'u magacinu', '#artikli')}
      ${art(nOn, 'Aktivnih', `${nAll - nOn} skrivenih na sajtu`, '#artikli?f=')}
      ${art(nOut, 'Bez zaliha', nOut ? 'stanje je nula' : 'svega ima', '#artikli?f=out', true)}
      ${art(nLow, 'Niske zalihe', nLow ? 'ispod minimuma' : 'u redu', '#artikli?f=low', true)}
    </div>`;
  const quick = `<div class="quick" aria-label="Brze radnje">
      <button class="btn btn--primary" type="button" data-new="product">Novi artikal</button>
      <button class="btn" type="button" data-pdf-refresh>Osveži PDF katalog</button>
      <a class="btn" href="#porudzbine">Nove porudžbine</a>
      <a class="btn" href="#upiti">Upiti za cene</a>
    </div>`;
  box.innerHTML = `${quick}${wait}${arts}${kpis}${chart}<div class="pair">${best}${map}</div>${feed}`;
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
