// Price inquiries: list, the quote sheet and its send/member actions.
import { showHistory } from './history.js?v=d45242a137';
import { $, $$, C, call, db, esc, money, one, reason, token, when } from './api.js?v=d45242a137';
import { D, NEEDS, byCode, empty, failed, nameOf, optById, skeleton, stateOf } from './data.js?v=d45242a137';
import { formError, head, openSheet, sheet } from './sheet.js?v=d45242a137';
import { draw } from './shell.js?v=d45242a137';
import { notify, syncSeg } from './ui.js?v=d45242a137';

// ----- price inquiries: a visitor's list, answered with a quote in one click -----
export const INQ = { new: 'Nov', sent: 'Ponuda poslata', ordered: 'Poručeno', closed: 'Zatvoren' };
const LANGNAME = { fr: 'francuski', en: 'engleski', sr: 'srpski' };
const decIn = (v) => Number(String(v).trim().replace(/\s/g, '').replace(',', '.'));
export function saveFile(b64, filename, type = 'application/pdf') {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function drawInquiries(r) {
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

export function inquirySheet(i) {
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
      <section class="hist" aria-labelledby="hist-t"><h3 id="hist-t" class="hist__title">Istorija statusa</h3><ol class="hist__list" data-hist="inquiry:${i.id}"><li class="sub">Učitavanje…</li></ol></section>
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
  </div>`, { side: true });
  quoteSums();
  showHistory('inquiry', i.id, INQ, (x) => (x === 'sent' ? 'done' : x === 'ordered' ? 'new' : x === 'closed' ? 'cancelled' : 'low'));
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

export async function sendQuote(id, send, btn) {
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
export async function addMember(id, btn) {
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
export async function setInquiry(id, status, btn) {
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
