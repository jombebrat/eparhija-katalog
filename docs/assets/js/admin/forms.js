// The category and contact forms.
import { $, db, eq, esc, one, plural, reason, slug } from './api.js?v=5945b4a4e1';
import { D, GROUPS, catOf, groupOf, nameOf, route } from './data.js?v=5945b4a4e1';
import { busy, checkbox, closeSheet, field, foot, formError, head, invalid, openSheet, select, sheet } from './sheet.js?v=5945b4a4e1';
import { draw } from './shell.js?v=5945b4a4e1';
import { notify } from './ui.js?v=5945b4a4e1';

// ----- the category form -----
let editCat = null;
export function catForm(c) {
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
export async function submitCat(form) {
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
export async function deleteCat() {
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
export function priestForm(p) {
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
    ${foot(isNew ? 'Dodaj kontakt' : 'Sačuvaj izmene', isNew ? '' : `<button class="btn" type="button" data-as-member="${esc(p.email)}" data-as-lang="fr">Uđi kao član</button><button class="btn btn--danger" type="button" data-delete-priest>Obriši sa liste</button>`)}
  </form>`);
}
export async function submitPriest(form) {
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
export async function deletePriest() {
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
