// The article form: tabs, options, photos, saving and deleting.
import { $, $$, addPhoto, db, eq, esc, one, reason, removeFiles, thumb } from './api.js?v=d45242a137';
import { D, allRows, byCode, nameOf, optionsOf, route } from './data.js?v=d45242a137';
import { busy, checkbox, closeSheet, field, foot, formError, head, invalid, setOnSheetClose, openSheet, select, sheet, showPanel } from './sheet.js?v=d45242a137';
import { draw } from './shell.js?v=d45242a137';
import { notify } from './ui.js?v=d45242a137';

// ----- the article form -----
export let edit = null; // { code (old), photos, added: [] }
export function productForm(p) {
  const isNew = !p;
  const cat = p?.category || route().p.get('k') || D.cats[0]?.id || '';
  const nextSort = Math.max(0, ...D.products.filter((x) => x.category === cat).map((x) => x.sort)) + 10;
  p ??= { code: '', category: cat, name_sr: '', name_fr: '', name_en: '', note_sr: '', note_fr: '', note_en: '', price: '', unit: 'piece', stock: null, min_stock: null, active: true, status: 'published', sort: nextSort, photos: [] };
  edit = { code: isNew ? null : p.code, photos: [...(p.photos || [])], added: [], removed: [], saved: false, options: isNew ? [] : optionsOf(p.code).map((o) => ({ ...o })), dropped: [] };
  setOnSheetClose(() => { if (!edit?.saved && edit?.added.length) removeFiles(edit.added); edit = null; });
  const price = p.price === '' ? '' : String(p.price).replace('.', ',');
  openSheet(`<form class="sheet__inner" novalidate data-form="product">
    ${head(isNew ? 'Novi artikal' : esc(`${p.code} · ${nameOf(p)}`), isNew ? 'Pojavljuje se u katalogu čim ga sačuvate, osim ako ga ostavite kao nacrt.' : 'Izmene se vide na sajtu pri sledećem otvaranju stranice.')}
    <div class="ptabs" role="tablist" aria-label="Odeljci artikla" data-ptabs><button class="ptabs__t" type="button" role="tab" id="pt-osnovno" aria-controls="pp-osnovno" aria-selected="true" data-ptab="osnovno">Osnovno</button><button class="ptabs__t" type="button" role="tab" id="pt-opisi" aria-controls="pp-opisi" aria-selected="false" data-ptab="opisi" tabindex="-1">Opisi</button><button class="ptabs__t" type="button" role="tab" id="pt-fotografije" aria-controls="pp-fotografije" aria-selected="false" data-ptab="fotografije" tabindex="-1">Fotografije</button><button class="ptabs__t" type="button" role="tab" id="pt-cena" aria-controls="pp-cena" aria-selected="false" data-ptab="cena" tabindex="-1">Cena i opcije</button><button class="ptabs__t" type="button" role="tab" id="pt-zalihe" aria-controls="pp-zalihe" aria-selected="false" data-ptab="zalihe" tabindex="-1">Zalihe</button><button class="ptabs__t" type="button" role="tab" id="pt-vidljivost" aria-controls="pp-vidljivost" aria-selected="false" data-ptab="vidljivost" tabindex="-1">Vidljivost</button></div>
    <div class="sheet__body">
    <div class="tabpanel" role="tabpanel" id="pp-osnovno" aria-labelledby="pt-osnovno" data-panel="osnovno">
      <div class="row2">
        ${field({ id: 'f-code', label: 'Šifra', name: 'code', value: p.code, req: true, help: 'Kao u katalogu: P011, H016, 10/1.', attrs: `autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40"${isNew ? ' autofocus' : ''}` })}
        ${select({ id: 'f-cat', label: 'Kategorija', name: 'category', value: p.category, options: D.cats.map((c) => [c.id, c.name_sr || c.name_fr]) })}
      </div>
      <fieldset class="group">
        <legend class="visually-hidden">Naziv</legend>
        ${field({ id: 'f-name-sr', label: 'Srpski', name: 'name_sr', value: p.name_sr, attrs: 'lang="sr" autocomplete="off"', help: 'Bar jedan naziv. Prazan prevod zamenjuje francuski ili srpski.' })}
        ${field({ id: 'f-name-fr', label: 'Francuski', name: 'name_fr', value: p.name_fr, attrs: 'lang="fr" autocomplete="off"' })}
        ${field({ id: 'f-name-en', label: 'Engleski', name: 'name_en', value: p.name_en, attrs: 'lang="en" autocomplete="off"' })}
      </fieldset>
    </div>
    <div class="tabpanel" role="tabpanel" id="pp-opisi" aria-labelledby="pt-opisi" data-panel="opisi" hidden>
      <fieldset class="group">
        <legend>Napomena ili dimenzije <span class="req req--quiet">nije obavezno</span></legend>
        ${field({ id: 'f-note-sr', label: 'Srpski', name: 'note_sr', value: p.note_sr, attrs: 'lang="sr" autocomplete="off"', help: 'Kod sveća ovde stoje dimenzije, na primer 72 × 4,5 cm.' })}
        ${field({ id: 'f-note-fr', label: 'Francuski', name: 'note_fr', value: p.note_fr, attrs: 'lang="fr" autocomplete="off"' })}
        ${field({ id: 'f-note-en', label: 'Engleski', name: 'note_en', value: p.note_en, attrs: 'lang="en" autocomplete="off"' })}
      </fieldset>
    </div>
    <div class="tabpanel" role="tabpanel" id="pp-fotografije" aria-labelledby="pt-fotografije" data-panel="fotografije" hidden>
      <fieldset class="group">
        <legend class="visually-hidden">Fotografije</legend>
        <ul class="photos" role="list" data-photos></ul>
        <div class="photos__add">
          <input class="visually-hidden" id="f-files" type="file" accept="image/*" multiple data-files>
          <label class="btn" for="f-files">Dodaj fotografije</label>
          <p class="field__help" data-photo-msg aria-live="polite">Prva fotografija je naslovna. JPG, PNG ili WebP; sajt ih sam smanjuje.</p>
        </div>
      </fieldset>
    </div>
    <div class="tabpanel" role="tabpanel" id="pp-cena" aria-labelledby="pt-cena" data-panel="cena" hidden>
      <div class="row2">
        ${field({ id: 'f-price', label: 'Cena u evrima', name: 'price', value: price, req: true, help: 'Vide je samo sveštenici sa liste.', attrs: 'inputmode="decimal" autocomplete="off" placeholder="12,50"' })}
        ${select({ id: 'f-unit', label: 'Prodaje se na', name: 'unit', value: p.unit, options: [['piece', 'komad'], ['kg', 'kilogram']] })}
      </div>
      <div class="row2">
        ${field({ id: 'f-cost', label: 'Nabavna cena u evrima', name: 'cost', value: p.cost === null || p.cost === undefined ? '' : String(p.cost).replace('.', ','), help: 'Ne vidi se na sajtu. Služi za zaradu u Pregledu.', attrs: 'inputmode="decimal" autocomplete="off" placeholder="nije upisana"' })}
      </div>
      <fieldset class="group">
        <legend>Opcije <span class="req req--quiet">nije obavezno</span></legend>
        <p class="field__help opts-ed__help">Na primer sveci na ikoni. Svaka opcija ima svoju šifru (kao u Erplainu) i svoje stanje, a cena je cena artikla. Kad artikal ima opcije, član na sajtu bira jednu.</p>
        <div class="opts-ed" data-opts-ed></div>
        <p><button class="btn btn--s" type="button" data-opt-add>Dodaj opciju</button></p>
      </fieldset>
    </div>
    <div class="tabpanel" role="tabpanel" id="pp-zalihe" aria-labelledby="pt-zalihe" data-panel="zalihe" hidden>
      <div class="row2">
        ${field({ id: 'f-stock', label: 'Stanje u magacinu', name: 'stock', value: p.stock ?? '', help: 'Prazno: ne prati se. 0: na sajtu piše da ga nema.', attrs: 'inputmode="numeric" autocomplete="off"' })}
        ${field({ id: 'f-min', label: 'Poruči kad padne na', name: 'min_stock', value: p.min_stock ?? '', help: 'Na toj količini artikal ide na listu za naručivanje.', attrs: 'inputmode="numeric" autocomplete="off"' })}
      </div>
      <div class="row2">
        ${field({ id: 'f-sort', label: 'Redosled u kategoriji', name: 'sort', value: p.sort, help: 'Manji broj stoji pre.', attrs: 'inputmode="numeric" autocomplete="off"' })}
      </div>
    </div>
    <div class="tabpanel" role="tabpanel" id="pp-vidljivost" aria-labelledby="pt-vidljivost" data-panel="vidljivost" hidden>
      <div class="field">
        <span class="field__label" id="f-status-l">Status</span>
        <div class="seg" role="radiogroup" aria-labelledby="f-status-l" data-status-seg>
          <label class="seg__opt"><input class="visually-hidden" type="radio" name="status" value="published"${p.status !== 'draft' ? ' checked' : ''}><span>Objavljen</span></label>
          <label class="seg__opt"><input class="visually-hidden" type="radio" name="status" value="draft"${p.status === 'draft' ? ' checked' : ''}><span>Nacrt</span></label>
        </div>
        <p class="field__help">Nacrt vidite samo vi, ne prikazuje se na sajtu ni u korpi. Objavite ga kad je sve spremno.</p>
      </div>
      ${checkbox({ id: 'f-active', label: 'Prikaži na sajtu', name: 'active', checked: p.active, help: 'Sakriven artikal ostaje u bazi, ali se ne vidi u katalogu.' })}
    </div>
    </div>
    ${foot(isNew ? 'Dodaj artikal' : 'Sačuvaj izmene', isNew ? '' : '<button class="btn btn--danger" type="button" data-delete-product>Obriši artikal</button>')}
  </form>`);
  drawPhotos();
  drawOptEditor();
}
// ----- the options of an article, edited in its form and saved with it -----
export function readOptEditor() {
  if (!edit) return;
  $$('[data-oi]', sheet).forEach((row) => {
    const o = edit.options[Number(row.dataset.oi)];
    const v = (n) => row.querySelector(`[name="${n}"]`).value.trim();
    Object.assign(o, { label_sr: v('o-sr'), label_fr: v('o-fr') || null, label_en: v('o-en') || null, sku: v('o-sku') || null, stockRaw: v('o-stock'), active: row.querySelector('[name="o-on"]').checked });
  });
}
export function drawOptEditor() {
  const box = $('[data-opts-ed]', sheet);
  if (!box || !edit) return;
  const n = edit.options.length;
  box.innerHTML = n ? `<div class="opt-ed opt-ed--head" aria-hidden="true"><span>Srpski</span><span>Francuski</span><span>Engleski</span></div>
    ${edit.options.map((o, i) => {
      const stock = o.stockRaw ?? (o.stock ?? '');
      const label = o.label_sr || `opcija ${i + 1}`;
      return `<div class="opt-ed" data-oi="${i}">
        <input class="input" name="o-sr" lang="sr" value="${esc(o.label_sr || '')}" placeholder="Srpski" aria-label="Opcija ${i + 1}, srpski naziv" autocomplete="off">
        <input class="input" name="o-fr" lang="fr" value="${esc(o.label_fr || '')}" placeholder="Francuski" aria-label="${esc(label)}, francuski" autocomplete="off">
        <input class="input" name="o-en" lang="en" value="${esc(o.label_en || '')}" placeholder="Engleski" aria-label="${esc(label)}, engleski" autocomplete="off">
        <input class="input" name="o-sku" value="${esc(o.sku || '')}" placeholder="Šifra" aria-label="${esc(label)}, šifra" autocomplete="off" spellcheck="false">
        <input class="input input--stock" name="o-stock" value="${esc(String(stock))}" placeholder="Stanje" inputmode="numeric" aria-label="${esc(label)}, stanje (prazno: ne prati se)" autocomplete="off">
        <label class="check opt-ed__on"><input type="checkbox" name="o-on"${o.active !== false ? ' checked' : ''}><span>Na sajtu</span><span class="visually-hidden">, ${esc(label)}</span></label>
        <button class="btn btn--s" type="button" data-opt-del="${i}" aria-label="Ukloni ${esc(label)}">Ukloni</button>
      </div>`;
    }).join('')}` : '<p class="photos__none">Bez opcija: član stavlja sam artikal u listu.</p>';
}
async function saveOptions(code) {
  const before = new Map(optionsOf(code).map((o) => [o.id, o]));
  const rows = edit.options.map((o, i) => ({ ...o, sort: (i + 1) * 10, stock: o.stockRaw === undefined ? o.stock ?? null : o.stockRaw === '' ? null : Number(o.stockRaw) }));
  const body = (o) => ({ label_sr: o.label_sr, label_fr: o.label_fr, label_en: o.label_en, sku: o.sku, stock: o.stock, active: o.active !== false, sort: o.sort });
  const fresh = rows.filter((o) => !o.id);
  const changed = rows.filter((o) => o.id && JSON.stringify(body(o)) !== JSON.stringify(body(before.get(o.id) || {})));
  if (fresh.length) await db('options', { method: 'POST', body: fresh.map((o) => ({ product: code, ...body(o) })) });
  for (const o of changed) await db(`options?id=${eq(o.id)}`, { method: 'PATCH', body: body(o) });
  if (edit.dropped.length) await db(`options?id=in.(${edit.dropped.join(',')})`, { method: 'DELETE' });
  if (fresh.length || changed.length || edit.dropped.length) D.options = await allRows('options?select=*&order=product.asc,sort.asc,id.asc');
}
export function drawPhotos() {
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
export async function addFiles(input) {
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

export async function submitProduct(form) {
  const v = (n) => form.elements[n].value.trim();
  const errs = [];
  let formMsg = '';
  const code = v('code');
  if (!code) errs.push(invalid(form, 'code', 'Upišite šifru artikla.'));
  else if (code !== edit.code && byCode(code)) errs.push(invalid(form, 'code', `Šifra ${code} već postoji.`));
  if (!v('name_sr') && !v('name_fr') && !v('name_en')) errs.push(invalid(form, 'name_sr', 'Upišite bar jedan naziv.'));
  const price = Number(v('price').replace(/\s/g, '').replace(',', '.'));
  if (v('price') === '' || !Number.isFinite(price) || price < 0) errs.push(invalid(form, 'price', 'Upišite cenu, na primer 12,50.'));
  const stockRaw = v('stock');
  if (stockRaw !== '' && !/^\d{1,7}$/.test(stockRaw)) errs.push(invalid(form, 'stock', 'Ceo broj, 0 ili više, ili prazno.'));
  const costRaw = v('cost').replace(/\s/g, '').replace(',', '.');
  if (costRaw !== '' && !(Number.isFinite(Number(costRaw)) && Number(costRaw) >= 0)) errs.push(invalid(form, 'cost', 'Upišite cenu, na primer 8,00, ili ostavite prazno.'));
  const minRaw = v('min_stock');
  if (minRaw !== '' && !/^\d{1,7}$/.test(minRaw)) errs.push(invalid(form, 'min_stock', 'Ceo broj, 0 ili više, ili prazno.'));
  const sortRaw = v('sort');
  if (sortRaw !== '' && !/^-?\d{1,6}$/.test(sortRaw)) errs.push(invalid(form, 'sort', 'Ceo broj, na primer 10.'));
  readOptEditor();
  edit.options.forEach((o, i) => {
    const row = $(`[data-oi="${i}"]`, sheet);
    const bad = (name, msg) => { const el = row.querySelector(`[name="${name}"]`); el.setAttribute('aria-invalid', 'true'); errs.push(el); if (!formMsg) formMsg = msg; };
    if (!o.label_sr) bad('o-sr', `Opcija ${i + 1}: upišite srpski naziv ili je uklonite.`);
    if (o.stockRaw && !/^\d{1,7}$/.test(o.stockRaw)) bad('o-stock', `${o.label_sr || `Opcija ${i + 1}`}: stanje je ceo broj, 0 ili više, ili prazno.`);
  });
  if (errs.length) { showPanel(form, errs[0].closest('[data-panel]')?.dataset.panel); errs[0].focus(); if (formMsg) formError(form, formMsg); return; }

  const row = {
    code, category: v('category'),
    name_sr: v('name_sr'), name_fr: v('name_fr'), name_en: v('name_en'),
    note_sr: v('note_sr') || null, note_fr: v('note_fr') || null, note_en: v('note_en') || null,
    price: Math.round(price * 100) / 100, unit: v('unit'), cost: costRaw === '' ? null : Math.round(Number(costRaw) * 100) / 100,
    stock: stockRaw === '' ? null : Number(stockRaw), min_stock: minRaw === '' ? null : Number(minRaw), sort: sortRaw === '' ? 0 : Number(sortRaw),
    status: form.elements.status.value === 'draft' ? 'draft' : 'published',
    active: form.elements.status.value === 'draft' ? false : form.elements.active.checked, photos: edit.photos,
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
    if (old !== null && old !== code) D.options.forEach((o) => { if (o.product === old) o.product = code; });
    try { await saveOptions(code); } catch (e) {
      busy(form, false);
      edit.code = code;
      if (!e.signedOut) formError(form, `Artikal je sačuvan, ali opcije nisu. ${reason(e)}`);
      draw();
      return;
    }
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
export const byCodeBefore = new Map();

export async function deleteProduct() {
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
  const opts = optionsOf(p.code).map(({ id, available, updated_at, ...o }) => o);
  D.options = D.options.filter((o) => o.product !== p.code);
  D.products = D.products.filter((x) => x !== p);
  edit.saved = true;
  closeSheet();
  draw();
  let undone = false;
  notify(`${p.code} je obrisan.`, async () => {
    undone = true;
    try {
      D.products.push(one(await db('products', { method: 'POST', body: copy, prefer: 'return=representation' })));
      if (opts.length) { await db('options', { method: 'POST', body: opts }); D.options = await allRows('options?select=*&order=product.asc,sort.asc,id.asc'); }
      draw();
    } catch (e) { if (!e.signedOut) notify(`${p.code} nije vraćen. ${reason(e)}`, null, true); }
  });
  setTimeout(() => { if (!undone) removeFiles((copy.photos || []).map((ph) => ph.src)); }, 12000);
}
