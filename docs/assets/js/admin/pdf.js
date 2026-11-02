// The members' PDF price list: made here, kept in the private bucket, offered to members.
import { $, $$, C, SITE, call, photoUrl, plural, reason, session, token } from './api.js?v=2ba7833fc5';
import { D, Q, markupOf } from './data.js?v=2ba7833fc5';
import { notify } from './ui.js?v=2ba7833fc5';

// ---------- the members' PDF price list ----------
// Made here, in the browser, from the articles as they are now; kept in the private bucket `catalogue`.
// The site hands it to members only (function `prices`, after the email check).
const PDF_NAME = 'cenovnik.pdf';
const PDF_NAME_GROUP = (g) => `cenovnik-${g}.pdf`;
const PDF_NAME_BLANK ='cenovnik-bez-cena.pdf';   // the same list with a line instead of each price, for parishes to write their own
let pdfBusy = false;
const pdfWhen = new Intl.DateTimeFormat('sr-Latn-RS', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
async function pdfInfo() {
  const t = await token();
  const rows = await call(`${C.url}/storage/v1/object/list/catalogue`, {
    method: 'POST', headers: { apikey: C.key, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 10, search: 'cenovnik' }),
  });
  return (rows || []).find((r) => r.name === PDF_NAME) || null;
}
export async function drawPdfCard() {
  const state = $('[data-pdf-state]');
  if (!state || pdfBusy) return;
  try {
    const f = await pdfInfo();
    const got = $('[data-pdf-get]');
    got.hidden = !f;
    const size = f?.metadata?.size ? `, ${(f.metadata.size / 1048576).toFixed(1).replace('.', ',')} MB` : '';
    state.textContent = f ? `Poslednji put osvežen: ${pdfWhen.format(new Date(f.updated_at || f.created_at))}${size}.` : 'PDF još nije napravljen. Pritisnite „Osveži PDF“.';
    state.classList.remove('is-error');
  } catch (e) {
    if (e.signedOut) return;
    state.textContent = 'Ne mogu da proverim PDF. Pokušajte ponovo kasnije.';
  }
}
// the PDF made from the database as it is now, without touching what is on the screen
async function makePdf(say) {
  say('Učitavam artikle…');
  const [products, cats, groups] = await Promise.all([Q.products(), Q.cats(), Q.groups()]);
  D.groups = groups;
  const { buildCatalogue } = await import('../catalogue-pdf.js?v=0d7a5f5e72');
  const t = await token();
  let r;
  // one priced list per group (the clergy's at the article price, the others' with their markup) and the blank one
  const at = (g) => products.map((p) => ({ ...p, price: Math.round(Number(p.price) * (1 + markupOf(g) / 100) * 100) / 100 }));
  for (const [name, withPrices, list] of [[PDF_NAME, true, at('svestenstvo')], [PDF_NAME_GROUP('ostali'), true, at('ostali')], [PDF_NAME_BLANK, false, products]]) {
    r = await buildCatalogue({
      products: list, cats, options: D.options, prices: withPrices,
      photoUrl: (src) => photoUrl(SITE, src, true), siteBase: SITE, onProgress: say,
    });
    say('Čuvam PDF…');
    await call(`${C.url}/storage/v1/object/catalogue/${name}`, {
      method: 'POST',
      headers: { apikey: C.key, Authorization: `Bearer ${t}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true', 'cache-control': 'no-cache' },
      body: new Blob([r.bytes], { type: 'application/pdf' }),
    });
  }
  try { localStorage.removeItem(PDF_DIRTY); } catch { /* fine */ }
  return r;
}
export async function refreshPdf() {
  if (pdfBusy) return;
  pdfBusy = true;
  clearTimeout(pdfTimer);
  const state = $('[data-pdf-state]');
  const buttons = $$('[data-pdf-refresh]');
  const labels = buttons.map((b) => b.textContent);
  buttons.forEach((b) => { b.disabled = true; });
  const say = (s) => { state.textContent = s; buttons.forEach((b) => { b.textContent = s.length < 28 ? s : 'Pravim PDF…'; }); };
  try {
    const r = await makePdf(say);
    pdfBusy = false;
    await drawPdfCard();
    notify(`PDF je osvežen: ${plural(r.articles, 'artikal', 'artikla', 'artikala')}, ${plural(r.pages, 'strana', 'strane', 'strana')}.`);
  } catch (e) {
    if (e.signedOut) return;
    state.textContent = `PDF nije osvežen. ${reason(e)}`;
    notify('PDF nije osvežen.', null, true);
  } finally {
    pdfBusy = false;
    buttons.forEach((b, i) => { b.disabled = false; b.textContent = labels[i]; });
  }
}
// After every change to articles, options or categories the PDF is made again, a minute after the last change.
// A new stock figure does not change it. If the tab is closed before that, the next visit makes it first thing.
const PDF_DIRTY = 'ek-pdf-dirty';
const PDF_WAIT = 60000;
let pdfTimer;
export function pdfLater(ms) {
  clearTimeout(pdfTimer);
  pdfTimer = setTimeout(autoPdf, ms);
  const state = $('[data-pdf-state]');
  if (state && !pdfBusy) state.textContent = 'PDF se pravi za trenutak, jer je stariji od jednog dana.';
}
async function autoPdf() {
  if (pdfBusy || !session) return;
  if (!$('#app') || $('#app').hidden) return;
  pdfBusy = true;
  const state = $('[data-pdf-state]');
  const say = (s) => { if (state) state.textContent = s; };
  try {
    await makePdf(say);
    pdfBusy = false;
    await drawPdfCard();
  } catch (e) {
    if (e.signedOut) return;
    pdfBusy = false;
    say(`PDF se nije osvežio sam. ${reason(e)} Pritisnite „Osveži PDF“.`);
  } finally { pdfBusy = false; }
}
// on entering: a PDF that is missing, or was left stale by a closed tab, is made at once
const PDF_DAY = 24 * 3600 * 1000;
export async function pdfOnEnter() {
  const check = async () => {
    try {
      const f = await pdfInfo();
      const age = f ? Date.now() - new Date(f.updated_at || f.created_at).getTime() : Infinity;
      if (age > PDF_DAY) pdfLater(4000);
    } catch (e) { /* the card says it */ }
  };
  await check();
  setInterval(check, 3600 * 1000);   // an admin tab left open overnight still makes it
}
export async function openPdf(btn) {
  btn.disabled = true;
  try {
    const t = await token();
    const r = await fetch(`${C.url}/storage/v1/object/authenticated/catalogue/${PDF_NAME}`, { headers: { apikey: C.key, Authorization: `Bearer ${t}` } });
    if (!r.ok) throw new Error('PDF nije nađen.');
    const url = URL.createObjectURL(await r.blob());
    window.open(url, '_blank', 'noopener') || (location.href = url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    if (!e.signedOut) notify(reason(e), null, true);
  } finally { btn.disabled = false; }
}
