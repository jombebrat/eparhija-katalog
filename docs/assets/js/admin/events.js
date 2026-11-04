// Click, change, input and submit handlers for the whole admin.
import { $, $$ } from './api.js?v=0d0dfe6320';
import { D, ST, byCode, catOf, load, route, setParam, MORE } from './data.js?v=0d0dfe6320';
import { catForm, deleteCat, deletePriest, priestForm, submitCat, submitPriest } from './forms.js?v=0d0dfe6320';
import { addMember, inquirySheet, sendQuote, setInquiry } from './inquiries.js?v=0d0dfe6320';
import { saveMarkup, savePriestActive } from './lists.js?v=0d0dfe6320';
import { deleteOrder, orderPdf, orderSheet, setStatus, viewAs } from './orders.js?v=0d0dfe6320';
import { saveTemplate } from './messages.js?v=0d0dfe6320';
import { finishForm, openInvoice, submitFinish } from './shipping.js?v=0d0dfe6320';
import { openPdf, refreshPdf } from './pdf.js?v=0d0dfe6320';
import { addFiles, byCodeBefore, deleteProduct, drawOptEditor, drawPhotos, edit, productForm, readOptEditor, submitProduct } from './product-form.js?v=0d0dfe6320';
import { bulk, drawBulk, picked, saveActive, saveStock, shownCodes } from './products.js?v=0d0dfe6320';
import { closeProfile, passwordForm, submitPassword } from './profile.js?v=0d0dfe6320';
import { closeSheet, sheet } from './sheet.js?v=0d0dfe6320';
import { draw } from './shell.js?v=0d0dfe6320';
import { signOut } from './signin.js?v=0d0dfe6320';
import { csvOrders, csvProducts, csvStats } from './stats.js?v=0d0dfe6320';
import { loadMoves, moveForm, submitMove } from './stock.js?v=0d0dfe6320';
import { notify } from './ui.js?v=0d0dfe6320';

// ---------- events ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, a, tr.is-link');
  if (!t) return;
  if (t.matches('[data-retry]') && t.dataset.retry === 'moves') { loadMoves(); return; }
  if (t.matches('[data-retry]')) { t.dataset.retry.split(' ').forEach((w) => { if (ST[w] === 'error') load(w, true); }); return; }
  if (t.matches('[data-clear]')) { history.replaceState(null, '', `#${route().tab}`); draw(); return; }
  if (t.matches('[data-z] button')) { setParam('pg', ''); setParam('z', t.dataset.v); return; }
  if (t.matches('[data-move]')) { moveForm({ kind: t.dataset.move, code: t.dataset.code || '', opt: t.dataset.opt || '' }); return; }
  if (t.matches('[data-moves-more]')) { loadMoves(true); return; }
  if (t.matches('[data-s-all]')) { setParam('s', 'all'); return; }
  if (t.matches('[data-f] button')) { setParam('pg', ''); setParam('f', t.dataset.v); return; }
  if (t.matches('[data-sort]')) { const k = t.dataset.sort, cur = route().p.get('o') || ''; setParam('pg', ''); setParam('o', cur === k ? `-${k}` : cur === `-${k}` ? '' : k); return; }
  if (t.matches('[data-pg]')) { setParam('pg', t.dataset.pg === '1' ? '' : t.dataset.pg); $(`[data-screen="${route().tab}"]`).scrollIntoView({ block: 'start' }); return; }
  if (t.matches('[data-bulk-act]')) { if (t.dataset.bulkAct === 'clear') { picked.clear(); $$('[data-pick]').forEach((c) => { c.checked = false; c.closest('tr').removeAttribute('aria-selected'); }); drawBulk(); } else bulk(t.dataset.bulkAct); return; }
  if (t.matches('[data-g] button')) { setParam('g', t.dataset.v === 'svestenstvo' ? '' : t.dataset.v); return; }
  if (t.matches('[data-more]')) { const k = t.dataset.more; if (MORE.has(k)) MORE.delete(k); else MORE.add(k); draw(); return; }
  if (t.matches('[data-y] button')) { setParam('y', t.dataset.v); return; }
  if (t.matches('[data-s] button')) { setParam('s', t.dataset.v === 'new' ? '' : t.dataset.v); return; }
  if (t.matches('[data-new="product"]')) { if (!D.cats.length) { notify('Prvo napravite kategoriju; svaki artikal pripada jednoj.', null, true); return; } productForm(null); return; }
  if (t.matches('[data-new="cat"]')) { catForm(null); return; }
  if (t.matches('[data-new="priest"]')) { priestForm(null); return; }
  if (t.matches('[data-edit]')) { const p = byCode(t.dataset.edit); byCodeBefore.set(p.code, (p.photos || []).map((ph) => ph.src)); productForm(p); return; }
  if (t.matches('[data-edit-cat]')) { catForm(catOf(t.dataset.editCat)); return; }
  if (t.matches('[data-edit-priest]')) { priestForm(D.priests.find((p) => p.id === Number(t.dataset.editPriest))); return; }
  if (t.matches('tr[data-inq]')) { const i = D.inquiries.find((x) => x.id === Number(t.dataset.inq)); if (i && !e.target.closest('a')) inquirySheet(i); return; }
  if (t.matches('[data-open-order], tr.is-link')) {
    if (e.target.closest('a')) return;
    const id = Number(t.dataset.openOrder || t.dataset.order);
    const o = D.orders.find((x) => x.id === id);
    if (o) orderSheet(o);
    return;
  }
  if (t.matches('[data-finish]')) { const o = D.orders.find((x) => x.id === Number(t.closest('[data-order-sheet]').dataset.orderSheet)); if (o) finishForm(o); return; }
  if (t.matches('[data-invoice]')) { openInvoice(t.dataset.invoice, t); return; }
  if (t.matches('[data-delete-order]')) { deleteOrder(Number(t.closest('[data-order-sheet]').dataset.orderSheet), t); return; }
  if (t.matches('[data-status]')) { setStatus(Number(t.closest('[data-order-sheet]').dataset.orderSheet), t.dataset.status, t); return; }
  if (t.matches('[data-open-inq], tr[data-inq]')) {
    if (e.target.closest('a')) return;
    const i = D.inquiries.find((x) => x.id === Number(t.dataset.openInq || t.dataset.inq));
    if (i) inquirySheet(i);
    return;
  }
  if (t.matches('[data-quote]')) { sendQuote(Number(t.closest('[data-inq-sheet]').dataset.inqSheet), t.dataset.quote === 'send', t); return; }
  if (t.matches('[data-add-member]')) { addMember(Number(t.closest('[data-inq-sheet]').dataset.inqSheet), t); return; }
  if (t.matches('[data-inq-status]')) { setInquiry(Number(t.closest('[data-inq-sheet]').dataset.inqSheet), t.dataset.inqStatus, t); return; }
  if (t.matches('[data-print]')) { window.print(); return; }
  if (t.matches('[data-as-member]')) { viewAs(t.dataset.asMember, t.dataset.asLang, t); return; }
  if (t.matches('[data-order-pdf]')) { orderPdf(Number(t.closest('[data-order-sheet]').dataset.orderSheet), t); return; }
  if (t.matches('[data-csv]')) { ({ products: csvProducts, orders: csvOrders, stats: csvStats })[t.dataset.csv](); return; }
  if (t.matches('[data-p] button')) { setParam('p', t.dataset.v === '90' ? '' : t.dataset.v); return; }
  if (t.matches('[data-po] button')) { setParam('po', t.dataset.v === 'kol' ? '' : t.dataset.v); return; }
  if (t.matches('[data-ph-move]')) {
    const i = Number(t.dataset.phMove), j = i + Number(t.dataset.dir);
    [edit.photos[i], edit.photos[j]] = [edit.photos[j], edit.photos[i]];
    drawPhotos();
    $(`[data-ph-move="${j}"][data-dir="${t.dataset.dir}"]`, sheet)?.focus() || $(`[data-ph-move="${j}"]`, sheet)?.focus();
    return;
  }
  if (t.matches('[data-ph-del]')) {
    const i = Number(t.dataset.phDel);
    edit.photos.splice(i, 1);
    drawPhotos();
    ($(`[data-ph-del="${Math.min(i, edit.photos.length - 1)}"]`, sheet) || $('label[for="f-files"]', sheet))?.focus();
    return;
  }
  if (t.matches('[data-delete-product]')) { deleteProduct(); return; }
  if (t.matches('[data-opt-add]')) {
    readOptEditor();
    edit.options.push({ label_sr: '', label_fr: null, label_en: null, sku: null, stock: null, active: true });
    drawOptEditor();
    $(`[data-oi="${edit.options.length - 1}"] [name="o-sr"]`, sheet)?.focus();
    return;
  }
  if (t.matches('[data-opt-del]')) {
    readOptEditor();
    const i = Number(t.dataset.optDel);
    const [o] = edit.options.splice(i, 1);
    if (o?.id) edit.dropped.push(o.id);
    drawOptEditor();
    ($(`[data-opt-del="${Math.min(i, edit.options.length - 1)}"]`, sheet) || $('[data-opt-add]', sheet))?.focus();
    return;
  }
  if (t.matches('[data-delete-cat]')) { deleteCat(); return; }
  if (t.matches('[data-delete-priest]')) { deletePriest(); return; }
  if (t.matches('[data-pdf-refresh]')) { refreshPdf(t); return; }
  if (t.matches('[data-pdf-get]')) { openPdf(t); return; }
  if (t.matches('[data-password]')) { closeProfile(); passwordForm(); return; }
  if (t.matches('[data-signout]')) { closeProfile(); signOut(); }
});


document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches('[data-stock]')) saveStock(t);
  else if (t.matches('[data-active]')) saveActive(t);
  else if (t.matches('[data-priest-active]')) savePriestActive(t);
  else if (t.matches('[data-mv-kind]')) { setParam('pg', ''); setParam('mk', t.value); }
  else if (t.matches('[data-k]')) { setParam('pg', ''); setParam('k', t.value); }
  else if (t.matches('[data-pick]')) { t.checked ? picked.add(t.dataset.pick) : picked.delete(t.dataset.pick); t.closest('tr').toggleAttribute('aria-selected', t.checked); drawBulk(); }
  else if (t.matches('[data-pick-all]')) { shownCodes.forEach((c) => (t.checked ? picked.add(c) : picked.delete(c))); $$('[data-pick]').forEach((c) => { c.checked = t.checked; c.closest('tr').toggleAttribute('aria-selected', t.checked); }); drawBulk(); }
  else if (t.matches('[data-bulk-cat]')) { if (t.value) bulk('cat', t.value); }
  else if (t.matches('[data-files]')) addFiles(t);
});
document.addEventListener('focusin', (e) => { if (e.target.matches('[data-stock]')) e.target.select(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-stock]')) { e.preventDefault(); saveStock(e.target); }
  if (e.key === 'Escape' && e.target.matches('[data-stock]')) { const p = byCode(e.target.dataset.stock); e.target.value = p?.stock ?? ''; e.target.removeAttribute('aria-invalid'); }
});
document.addEventListener('change', (e) => { if (e.target.matches('[data-prm]')) { const { name, value } = e.target; setParam('pg', ''); setParam(name, value); } });
let typing = 0;
document.addEventListener('input', (e) => {
  if (!e.target.matches('[data-q]')) return;
  clearTimeout(typing);
  const v = e.target.value;
  typing = setTimeout(() => { setParam('pg', ''); setParam('q', v.trim()); }, 120);
});
sheet.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  ({ product: submitProduct, cat: submitCat, priest: submitPriest, password: submitPassword, move: submitMove, finish: (x) => submitFinish(x, orderSheet) })[f.dataset.form]?.(f);
});
document.addEventListener('submit', (e) => {
  const f = e.target;
  if (f.matches?.('[data-markup-form]')) { e.preventDefault(); saveMarkup(f); }
  if (f.matches?.('[data-tpl-form]')) { e.preventDefault(); saveTemplate(f); }
});
window.addEventListener('hashchange', () => { closeSheet(); draw(); });
