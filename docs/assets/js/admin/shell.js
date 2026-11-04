// The frame: tab pill, drawing the current screen, badges and the folding side menu.
import { $, $$, plural } from './api.js?v=7648825353';
import { D, NEEDS, ST, TABS, load, route } from './data.js?v=7648825353';
import { drawInquiries } from './inquiries.js?v=7648825353';
import { drawCats, drawPriests } from './lists.js?v=7648825353';
import { drawOrders } from './orders.js?v=7648825353';
import { drawMessages } from './messages.js?v=7648825353';
import { drawInvoices } from './invoices.js?v=7648825353';
import { drawOverview } from './overview.js?v=7648825353';
import { drawPdfCard } from './pdf.js?v=7648825353';
import { drawProducts } from './products.js?v=7648825353';
import { drawStats } from './stats.js?v=7648825353';
import { drawStock } from './stock.js?v=7648825353';
import { countUps, fadeOut, typeTitle } from './ui.js?v=7648825353';

// ---------- draw ----------
let shownTab = '';

// ----- opening a screen: the old one blurs away, the title types itself, the numbers count up -----
const pillNav = $('.tabs');
const pillEl = document.createElement('span');
pillEl.className = 'tabs__pill'; pillEl.setAttribute('aria-hidden', 'true');
pillNav.prepend(pillEl);
let pillAt = -1;
function movePill() {
  const a = $('.tabs a[aria-current="page"]');
  if (!a || !matchMedia('(min-width: 60.01rem)').matches) { pillEl.classList.remove('is-on'); pillNav.classList.remove('has-pill'); pillAt = -1; return; }
  const top = a.offsetTop, bottom = pillNav.offsetHeight - (a.offsetTop + a.offsetHeight);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches || pillAt < 0;
  const down = top > pillAt;
  pillEl.style.transition = calm ? 'none' : `top ${down ? 0.8 : 0.5}s cubic-bezier(.65,0,.35,1), bottom ${down ? 0.5 : 0.8}s cubic-bezier(.65,0,.35,1)`;
  pillEl.style.top = `${top}px`; pillEl.style.bottom = `${bottom}px`;
  pillEl.classList.add('is-on'); pillNav.classList.add('has-pill');
  pillAt = top;
}
addEventListener('resize', () => { pillAt = -1; movePill(); });
export function draw() {
  if ($('#app').hidden) return;
  const r = route();
  if (shownTab && shownTab !== r.tab) fadeOut($(`[data-screen="${shownTab}"]`));
  for (const t of TABS) {
    $(`[data-screen="${t}"]`).hidden = t !== r.tab;
    const a = $(`[data-tab="${t}"]`);
    if (t === r.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  movePill();
  if (shownTab !== r.tab) {
    // the new screen slides in from the side the pill is travelling to
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const sc = $(`[data-screen="${r.tab}"]`);
      // the cards and rows rise one after another, for the three seconds the screen is new (what loads later rises too)
      sc.classList.add('reveal'); clearTimeout(sc._rv); sc._rv = setTimeout(() => sc.classList.remove('reveal'), 3000);
    }
    typeTitle($(`[data-screen="${r.tab}"] h1`));
    shownTab = r.tab;
    const a = $(`[data-tab="${r.tab}"]`), row = a.parentElement;
    // on a phone the tab row scrolls sideways: keep the current tab in view
    if (row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, a.offsetLeft - row.offsetLeft - 16);
  }
  for (const w of NEEDS[r.tab]) if (ST[w] === 'idle') { load(w); return; }
  if (r.tab === 'pregled') drawPdfCard();
  ({ pregled: drawOverview, upiti: drawInquiries, artikli: drawProducts, zalihe: drawStock, kategorije: drawCats, svestenstvo: drawPriests, porudzbine: drawOrders, fakture: drawInvoices, poruke: drawMessages, statistika: drawStats })[r.tab](r);
  countUps($(`[data-screen="${r.tab}"]`));
  drawBadge();
}

function drawBadge() {
  const n = D.orders.filter((o) => o.status === 'new').length;
  const b = $('[data-new-orders]');
  b.textContent = n ? String(n) : '';
  b.hidden = !n;
  $('[data-tab="porudzbine"]').setAttribute('aria-label', n ? `Porudžbine, ${plural(n, 'nova', 'nove', 'novih')}` : 'Porudžbine');
  const m = D.inquiries.filter((i) => i.status === 'new').length;
  const c = $('[data-new-inquiries]');
  c.textContent = m ? String(m) : '';
  c.hidden = !m;
  $('[data-tab="upiti"]').setAttribute('aria-label', m ? `Upiti, ${plural(m, 'nov', 'nova', 'novih')}` : 'Upiti');
}

// ---------- the side menu folds to icons ----------
(() => {
  const app = $('#app'), btn = $('[data-fold]');
  if (!app || !btn) return;
  const labels = $$('.tabs a').map((a) => [a, $('span:not(.tabs__n)', a)?.textContent || '']);
  const set = (on) => {
    app.toggleAttribute('data-fold', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Raširi meni' : 'Skupi meni';
    labels.forEach(([a, t]) => { if (on) a.title = t; else a.removeAttribute('title'); });
    try { localStorage.setItem('adm-fold', on ? '1' : ''); } catch (e) { /* private window */ }
  };
  let was = false; try { was = localStorage.getItem('adm-fold') === '1'; } catch (e) { /* ignore */ }
  set(was);
  btn.addEventListener('click', () => set(!app.hasAttribute('data-fold')));
})();
