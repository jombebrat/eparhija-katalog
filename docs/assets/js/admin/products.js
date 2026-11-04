// Articles screen: list, search, sort, pages, bulk actions and quick edits.
import { $, $$, db, eq, esc, money, norm, one, plural, reason, thumb } from './api.js?v=5945b4a4e1';
import { D, NEEDS, byCode, catName, empty, failed, isDraft, ledgerCounts, low, nameOf, optStock, optionsOf, skeleton, stateOf } from './data.js?v=5945b4a4e1';
import { draw } from './shell.js?v=5945b4a4e1';
import { notify, syncInput, syncSeg } from './ui.js?v=5945b4a4e1';

// ----- articles: the stock ledger -----
export const productKey = (p) => norm([p.code, p.code.replace(/^p/i, 'r').replace(/^h/i, 'n'), p.name_sr, p.name_fr, p.name_en].join(' '));
export function drawProducts(r) {
  const box = $('[data-region="products"]');
  const sc = $('[data-screen="artikli"]');
  const q = r.p.get('q') || '', k = r.p.get('k') || '', f = r.p.get('f') || '';
  syncInput($('[data-q]', sc), q);
  const sel = $('[data-k]', sc);
  const opts = `<option value="">Sve kategorije</option>${D.cats.map((c) => `<option value="${esc(c.id)}">${esc(c.name_sr || c.name_fr)}</option>`).join('')}`;
  if (sel.dataset.built !== String(D.cats.length) + D.cats.map((c) => c.id + c.name_sr).join()) { sel.innerHTML = opts; sel.dataset.built = String(D.cats.length) + D.cats.map((c) => c.id + c.name_sr).join(); }
  sel.value = k;
  syncSeg($('[data-f]', sc), f);

  const st = stateOf(NEEDS.artikli);
  if (st === 'loading') { box.innerHTML = skeleton(); return; }
  if (st === 'error') { box.innerHTML = failed('Artikli', NEEDS.artikli); return; }

  const order = Object.fromEntries(D.cats.map((c, i) => [c.id, i]));
  const all = [...D.products].sort((a, b) => (order[a.category] ?? 99) - (order[b.category] ?? 99) || a.sort - b.sort || a.code.localeCompare(b.code));
  const counts = ledgerCounts(all);
  $$('[data-f] [data-n]', sc).forEach((s) => { s.textContent = counts[s.dataset.n]; });

  if (!all.length) {
    box.innerHTML = empty('Još nema artikala.', 'Artikli koje ovde dodate pojavljuju se u katalogu na sva tri jezika.', '<button class="btn btn--primary" type="button" data-new="product">Novi artikal</button>');
    return;
  }
  const nq = norm(q);
  const list = all.filter((p) => (!k || p.category === k) && (!f || (f === 'out' ? p.stock === 0 : f === 'low' ? low(p) : f === 'draft' ? isDraft(p) : !p.active && !isDraft(p))) && (!nq || productKey(p).includes(nq)));
  if (!list.length) {
    box.innerHTML = empty('Nijedan artikal ne odgovara.', f === 'out' && !q && !k ? 'Svaki artikal čije se stanje prati ima bar jedan komad.' : f === 'low' && !q && !k ? 'Nijedan artikal nije pao na granicu za naručivanje. Granica se upisuje u artiklu.' : 'Proverite šifru ili naziv, ili izaberite drugu kategoriju.',
      '<button class="btn" type="button" data-clear>Prikaži sve artikle</button>');
    return;
  }
  const sort = r.p.get('o') || '';
  const key = sort.replace(/^-/, ''), dir = sort.startsWith('-') ? -1 : 1;
  const sorters = { code: (p) => p.code, name: (p) => norm(p.name_sr || p.name_fr || p.name_en || ''), price: (p) => Number(p.price), stock: (p) => (p.stock === null || p.stock === undefined ? -1 : p.stock) };
  if (sorters[key]) list.sort((a, b) => { const x = sorters[key](a), y = sorters[key](b); return (typeof x === 'string' ? x.localeCompare(y, 'sr', { numeric: true }) : x - y) * dir; });
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const pg = Math.min(Math.max(1, Number(r.p.get('pg')) || 1), pages);
  const shown = list.slice((pg - 1) * PAGE, pg * PAGE);
  shownCodes = shown.map((p) => p.code);
  const th = (k, label, cls = '') => `<th scope="col"${cls ? ` class="${cls}"` : ''} aria-sort="${key === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'}"><button class="sortbtn" type="button" data-sort="${k}">${label}<span class="sortbtn__ic" aria-hidden="true">${key === k ? (dir > 0 ? '↑' : '↓') : ''}</span></button></th>`;
  const pager = pages > 1 ? `<nav class="pager" aria-label="Stranice">
      <button class="btn btn--s" type="button" data-pg="${pg - 1}"${pg === 1 ? ' disabled' : ''}>Prethodna</button>
      <span class="pager__at">${(pg - 1) * PAGE + 1}–${Math.min(pg * PAGE, list.length)} od ${list.length}</span>
      <button class="btn btn--s" type="button" data-pg="${pg + 1}"${pg === pages ? ' disabled' : ''}>Sledeća</button>
    </nav>` : '';
  const stillHere = new Set(D.products.map((p) => p.code));
  for (const c of [...picked]) if (!stillHere.has(c)) picked.delete(c);
  box.innerHTML = `<p class="region__count" aria-live="polite">${esc(plural(list.length, 'artikal', 'artikla', 'artikala'))}${list.length < all.length ? ` od ${all.length}` : ''}<span class="region__hint">Stanje: upišite broj i pritisnite Enter. Prazno polje znači da se stanje ne prati.</span></p>
  <div class="bulk" data-bulk hidden role="region" aria-label="Radnje za izabrane artikle"></div>
  <table class="tbl tbl--products">
    <thead><tr><th scope="col" class="c-sel"><label class="check"><input type="checkbox" data-pick-all aria-label="Izaberi sve na ovoj stranici"></label></th><th scope="col"><span class="visually-hidden">Fotografija</span></th>${th('code', 'Šifra')}${th('name', 'Naziv')}<th scope="col">Kategorija</th>${th('price', 'Cena', 'num')}${th('stock', 'Stanje', 'num')}<th scope="col">Na sajtu</th><th scope="col"><span class="visually-hidden">Izmena</span></th></tr></thead>
    <tbody>${shown.map(productRow).join('')}</tbody>
  </table>${pager}`;
  drawBulk();
}
export const PAGE = 25;
export let shownCodes = [];
export const picked = new Set();
export function drawBulk() {
  const bar = $('[data-bulk]');
  if (!bar) return;
  const n = picked.size;
  bar.hidden = !n;
  const all = $('[data-pick-all]');
  if (all) { all.checked = shownCodes.length > 0 && shownCodes.every((c) => picked.has(c)); all.indeterminate = !all.checked && shownCodes.some((c) => picked.has(c)); }
  if (!n) { bar.innerHTML = ''; return; }
  bar.innerHTML = `<span class="bulk__n"><b>${n}</b> ${n === 1 ? 'izabran' : 'izabrano'}</span>
    <button class="btn btn--s" type="button" data-bulk-act="publish">Objavi</button>
    <button class="btn btn--s" type="button" data-bulk-act="draft">U nacrt</button>
    <button class="btn btn--s" type="button" data-bulk-act="show">Prikaži na sajtu</button>
    <button class="btn btn--s" type="button" data-bulk-act="hide">Sakrij</button>
    <span class="select select--s"><select class="input" data-bulk-cat aria-label="Premesti u kategoriju"><option value="">Premesti u…</option>${D.cats.map((c) => `<option value="${esc(c.id)}">${esc(c.name_sr || c.name_fr)}</option>`).join('')}</select></span>
    <button class="btn btn--quiet btn--s" type="button" data-bulk-act="clear">Poništi izbor</button>`;
}
export async function bulk(act, cat) {
  const codes = [...picked];
  if (!codes.length) return;
  const body = act === 'publish' ? { status: 'published' } : act === 'draft' ? { status: 'draft', active: false } : act === 'show' ? { active: true } : act === 'hide' ? { active: false } : { category: cat };
  if (act === 'show' && codes.some((c) => isDraft(byCode(c)))) { notify('Nacrti se ne mogu prikazati na sajtu. Prvo ih objavite.', null, true); return; }
  const bar = $('[data-bulk]');
  $$('button, select', bar).forEach((b) => { b.disabled = true; });
  try {
    const rows = await db(`products?code=in.(${codes.map((c) => `"${c.replace(/"/g, '\\"')}"`).map(encodeURIComponent).join(',')})`, { method: 'PATCH', body, prefer: 'return=representation' });
    if (!Array.isArray(rows) || rows.length !== codes.length) throw Object.assign(new Error('denied'), { code: '42501' });
    rows.forEach((row) => Object.assign(byCode(row.code), row));
    notify(`${codes.length === 1 ? '1 artikal je izmenjen' : `${codes.length} artikala je izmenjeno`}.`);
    picked.clear();
  } catch (e) {
    if (!e.signedOut) notify(`Izmena nije sačuvana. ${reason(e)}`, null, true);
  }
  draw();
}

export function stockTag(p) {
  if (p.stock === 0) return '<span class="tag tag--out">nema</span>';
  if (low(p)) return `<span class="tag tag--low" title="Granica za naručivanje: ${p.min_stock}">poruči</span>`;
  return '';
}
function productRow(p) {
  const ph = p.photos?.[0];
  const c = esc(p.code);
  return `<tr data-code="${c}"${p.active ? '' : ' class="is-hidden"'}${picked.has(p.code) ? ' aria-selected="true"' : ''}>
      <td class="c-sel"><label class="check"><input type="checkbox" data-pick="${c}"${picked.has(p.code) ? ' checked' : ''}><span class="visually-hidden">Izaberi ${c}</span></label></td>
      <td class="c-photo">${ph ? `<img src="${esc(thumb(ph))}" width="${ph.w}" height="${ph.h}" alt="" loading="lazy" decoding="async">` : '<span class="nophoto" aria-hidden="true"></span>'}</td>
      <th scope="row" class="c-code">${c}</th>
      <td class="c-name">${p.name_sr ? `<span lang="sr">${esc(p.name_sr)}</span><span class="sub" lang="fr">${esc(p.name_fr || '')}</span>` : `<span lang="${p.name_fr ? 'fr' : 'en'}">${esc(nameOf(p))}</span>`}${isDraft(p) ? '<span class="tag tag--draft">nacrt</span>' : ''}</td>
      <td class="c-cat" data-label="Kategorija">${esc(catName(p.category))}</td>
      <td class="num c-price" data-label="Cena">${esc(money.format(p.price))}${p.unit === 'kg' ? ' / kg' : ''}</td>
      <td class="num c-stock" data-label="Stanje">${optionsOf(p.code).length
        ? `<span class="stock stock--opts"><span class="stock__sum">${optStock(p.code)}</span><span class="sub">${esc(plural(optionsOf(p.code).length, 'opcija', 'opcije', 'opcija'))}</span>${optionsOf(p.code).every((o) => o.stock === 0) ? '<span class="tag tag--out">nema</span>' : ''}</span>`
        : `<span class="stock"><input class="input input--stock" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${p.stock ?? ''}" placeholder="—" aria-label="Stanje, ${c}" data-stock="${c}">${stockTag(p)}</span>`}</td>
      <td class="c-on" data-label="Na sajtu"><label class="check"><input type="checkbox" data-active="${c}"${p.active ? ' checked' : ''}${isDraft(p) ? ' disabled title="Nacrt se ne prikazuje; prvo ga objavite"' : ''}><span class="visually-hidden">${c} na sajtu</span></label></td>
      <td class="c-act"><button class="btn btn--s" type="button" data-edit="${c}" aria-label="Uredi ${c}">Uredi</button></td>
    </tr>`;
}
function refreshRow(code) {
  const tr = $(`tr[data-code="${CSS.escape(code)}"]`);
  const p = byCode(code);
  if (!tr || !p) return;
  tr.classList.toggle('is-hidden', !p.active);
  const s = $('.stock', tr);
  const inp = $('[data-stock]', tr);
  if (inp) {
    $('.tag', s)?.remove();
    s.insertAdjacentHTML('beforeend', stockTag(p));
    if (document.activeElement !== inp) inp.value = p.stock ?? '';
  }
  const sc = $('[data-screen="artikli"]');
  const counts = ledgerCounts(D.products);
  $$('[data-f] [data-n]', sc).forEach((n) => { n.textContent = counts[n.dataset.n]; });
}

const saving = new Set();
export async function saveStock(input) {
  const code = input.dataset.stock;
  const p = byCode(code);
  if (!p || saving.has(code)) return;
  const raw = input.value.trim();
  if (raw !== '' && !/^\d{1,7}$/.test(raw)) {
    input.setAttribute('aria-invalid', 'true');
    notify(`Stanje za ${code} mora biti ceo broj (0 ili više), ili prazno ako se ne prati.`, null, true);
    return;
  }
  input.removeAttribute('aria-invalid');
  const v = raw === '' ? null : Number(raw);
  if (v === p.stock) return;
  saving.add(code);
  input.setAttribute('aria-busy', 'true');
  input.closest('tr')?.classList.add('is-saving');
  try {
    Object.assign(p, one(await db(`products?code=${eq(code)}`, { method: 'PATCH', body: { stock: v }, prefer: 'return=representation' })));
  } catch (e) {
    if (!e.signedOut) notify(`Stanje za ${code} nije sačuvano. ${reason(e)}`, null, true);
    input.value = p.stock ?? '';
  } finally {
    saving.delete(code);
    input.removeAttribute('aria-busy');
    input.closest('tr')?.classList.remove('is-saving');
    refreshRow(code);
  }
}
export async function saveActive(box) {
  const code = box.dataset.active;
  const p = byCode(code);
  if (!p) return;
  box.disabled = true;
  try {
    Object.assign(p, one(await db(`products?code=${eq(code)}`, { method: 'PATCH', body: { active: box.checked }, prefer: 'return=representation' })));
  } catch (e) {
    if (!e.signedOut) notify(`${code} nije izmenjen. ${reason(e)}`, null, true);
  } finally {
    box.disabled = false;
    box.checked = p.active;
    refreshRow(code);
  }
}


// ----- stock: the current figures, the receipts, issues and corrections, and the ledger of every change -----
