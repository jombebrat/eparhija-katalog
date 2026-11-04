// Shared motion (screen change, counters), small input helpers and the notice bar with undo.
import { $, $$ } from './api.js?v=0d0dfe6320';

export const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export function fadeOut(old) {
  if (!old || old.hidden || calm()) return;
  const rc = old.getBoundingClientRect();
  const g = old.cloneNode(true);
  g.removeAttribute('data-screen'); g.removeAttribute('id'); g.setAttribute('aria-hidden', 'true');
  g.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
  g.classList.remove('reveal');
  Object.assign(g.style, { top: `${rc.top}px`, left: `${rc.left}px`, width: `${rc.width}px`, height: `${Math.min(rc.height, innerHeight - Math.max(rc.top, 0))}px` });
  g.classList.add('ghost');
  document.body.append(g);
  setTimeout(() => g.remove(), 450);
}
export function typeTitle(h) {
  if (!h || calm() || h.children.length) return;
  const text = h.textContent;
  h.setAttribute('aria-label', text);
  h.textContent = '\u00a0';
  let n = 0;
  setTimeout(() => {
    const t = setInterval(() => { n++; h.textContent = text.slice(0, n); if (n >= text.length) { clearInterval(t); h.removeAttribute('aria-label'); } }, 38);
  }, 300);
}
const countFmt = (d) => new Intl.NumberFormat('sr-Latn-RS', { minimumFractionDigits: d, maximumFractionDigits: d });
export function countUps(sc) {
  if (!sc || calm() || !sc.classList.contains('reveal')) return;
  for (const el of sc.querySelectorAll('.kpi__n:not([data-counted]), .figures dd:not([data-counted])')) {
    el.dataset.counted = '1';
    const full = el.textContent, m = full.match(/\d[\d.\s\u00a0]*(?:,\d+)?/);
    if (!m) continue;
    const dec = m[0].includes(',') ? m[0].split(',')[1].length : 0;
    const to = parseFloat(m[0].replace(/[.\s\u00a0]/g, '').replace(',', '.'));
    if (!Number.isFinite(to) || to === 0) continue;
    const f = countFmt(dec), t0 = performance.now() + 450, dur = 1200;
    el.textContent = full.replace(m[0], f.format(0));
    const tick = (now) => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      el.textContent = p >= 1 ? full : full.replace(m[0], f.format(to * (1 - (1 - p) ** 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
// the pill behind the current tab: its leading edge moves first and faster, the trailing edge catches up
export function syncInput(el, v) { if (el && document.activeElement !== el && el.value !== v) el.value = v; }
export function syncSeg(seg, v) { $$('button', seg).forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.v || '') === v))); }

// ---------- the notice: undo after a delete, and failures ----------
export const bar = $('[data-undo]');
let barTimer = 0;
export function notify(text, undo = null, error = false) {
  $('[data-undo-text]', bar).textContent = text;
  const b = $('[data-undo-btn]', bar);
  b.hidden = !undo;
  b.onclick = undo ? () => { hideBar(); undo(); } : null;
  bar.classList.toggle('undo--error', error);
  bar.hidden = false;
  clearTimeout(barTimer);
  barTimer = setTimeout(hideBar, undo ? 10000 : error ? 12000 : 6000);
}
export function hideBar() { bar.hidden = true; clearTimeout(barTimer); }
$('[data-undo-close]', bar).addEventListener('click', hideBar);
