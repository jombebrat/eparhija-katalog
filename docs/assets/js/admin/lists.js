// Categories and contacts (clergy) lists with their quick edits.
import { $, db, esc, norm, one, reason } from './api.js?v=53224adb82';
import { D, GROUPS, NEEDS, empty, failed, groupOf, markupOf, skeleton, stateOf } from './data.js?v=53224adb82';
import { pdfLater } from './pdf.js?v=53224adb82';
import { notify, syncInput } from './ui.js?v=53224adb82';

// ----- categories -----
export function drawCats() {
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
export function drawPriests(r) {
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
export async function saveMarkup(form) {
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
export async function savePriestActive(box) {
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
