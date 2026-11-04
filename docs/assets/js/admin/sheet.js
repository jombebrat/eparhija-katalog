// The side sheet (dialog) and the form pieces every form uses.
import { $, $$, X, esc } from './api.js?v=7648825353';

// ---------- the side sheet ----------
export const sheet = $('[data-sheet]');
let onSheetClose = null;
export const setOnSheetClose = (f) => { onSheetClose = f; };
export function openSheet(html, { side = false } = {}) {
  sheet.classList.toggle('sheet--side', side);
  sheet.innerHTML = html;
  sheet.showModal();
  sheet.scrollTop = 0;
}
export function closeSheet() { if (sheet.open) sheet.close(); }
sheet.addEventListener('close', () => {
  const f = onSheetClose;
  onSheetClose = null;
  sheet.innerHTML = '';
  f?.();
});
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) closeSheet();
  if (e.target.closest('[data-close]')) closeSheet();
});

export const head = (title, sub = '') => `<header class="sheet__head"><div><h2 id="sheet-title">${title}</h2>${sub ? `<p class="sheet__sub">${sub}</p>` : ''}</div><button class="icon-btn" type="button" data-close aria-label="Zatvori">${X}</button></header>`;
export const field = ({ id, label, name, value = '', type = 'text', req = false, help = '', attrs = '', cls = '' }) => `<div class="field ${cls}">
    <label for="${id}">${label}${req ? ' <span class="req">obavezno</span>' : ''}</label>
    <input class="input" id="${id}" name="${name}" type="${type}" value="${esc(value ?? '')}"${req ? ' aria-required="true"' : ''} aria-describedby="${id}-h" ${attrs}>
    <p class="field__help" id="${id}-h" data-help="${esc(help)}">${esc(help)}</p>
  </div>`;
export const select = ({ id, label, name, options, value, help = '', cls = '' }) => `<div class="field ${cls}">
    <label for="${id}">${label}</label>
    <span class="select"><select class="input" id="${id}" name="${name}" aria-describedby="${id}-h">${options.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></span>
    <p class="field__help" id="${id}-h" data-help="${esc(help)}">${esc(help)}</p>
  </div>`;
export const checkbox = ({ id, label, name, checked, help = '' }) => `<div class="field field--check">
    <label class="check check--label" for="${id}"><input type="checkbox" id="${id}" name="${name}"${checked ? ' checked' : ''} aria-describedby="${id}-h"> ${label}</label>
    <p class="field__help" id="${id}-h" data-help="${esc(help)}">${esc(help)}</p>
  </div>`;
export function showPanel(form, name) {
  if (!name) return;
  $$('[data-panel]', form).forEach((el) => { el.hidden = el.dataset.panel !== name; });
  $$('[data-ptab]', form).forEach((b) => { const on = b.dataset.ptab === name; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-ptab]'); if (b) showPanel(b.closest('form'), b.dataset.ptab); });
document.addEventListener('keydown', (e) => {
  const b = e.target.closest?.('[data-ptab]');
  if (!b || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
  const all = $$('[data-ptab]', b.closest('form')); let i = all.indexOf(b);
  i = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length;
  e.preventDefault(); showPanel(b.closest('form'), all[i].dataset.ptab); all[i].focus();
});
export function invalid(form, name, msg) {
  const el = form.elements[name];
  el.setAttribute('aria-invalid', 'true');
  const h = $(`#${el.id}-h`);
  h.textContent = msg;
  h.classList.add('is-error');
  return el;
}
function clearInvalid(el) {
  if (!el?.hasAttribute?.('aria-invalid')) return;
  el.removeAttribute('aria-invalid');
  const h = $(`#${el.id}-h`);
  if (h) { h.textContent = h.dataset.help; h.classList.remove('is-error'); }
}
sheet.addEventListener('input', (e) => clearInvalid(e.target));
export function busy(form, on, label) {
  const b = $('[type="submit"]', form);
  if (!b) return;
  if (on) { b.dataset.label = b.textContent; b.textContent = label; b.disabled = true; form.setAttribute('aria-busy', 'true'); } else { b.textContent = b.dataset.label || b.textContent; b.disabled = false; form.removeAttribute('aria-busy'); }
}
export const formError = (form, msg) => { const m = $('[data-form-msg]', form); m.textContent = msg; m.hidden = !msg; };
export const foot = (save, del = '') => `<footer class="sheet__foot">
    <p class="sheet__msg" role="alert" data-form-msg hidden></p>
    <div class="sheet__actions"><button class="btn btn--primary" type="submit">${save}</button><button class="btn" type="button" data-close>Otkaži</button>${del ? `<span class="spacer"></span>${del}` : ''}</div>
  </footer>`;
