// Finishing an order: the admin attaches the invoice made in Erplain and a tracking code, reads the message the member
// will get (in the member's language), and sends it. The order becomes "done" (stock is taken, as before).
import { $, C, call, db, esc, one, reason, token } from './api.js?v=c9b2bf5879';
import { D, ST, load } from './data.js?v=c9b2bf5879';
import { checkbox, field, formError, head, openSheet, select, sheet } from './sheet.js?v=c9b2bf5879';
import { draw } from './shell.js?v=c9b2bf5879';
import { notify } from './ui.js?v=c9b2bf5879';

// carriers and where the member can follow the parcel
export const CARRIERS = [
  ['', 'Bez praćenja', null],
  ['colissimo', 'Colissimo', (c) => `https://www.laposte.fr/outils/suivre-vos-envois?code=${c}`],
  ['chronopost', 'Chronopost', (c) => `https://www.chronopost.fr/tracking-no-denomination?listeNumerosLT=${c}`],
  ['dpd', 'DPD', (c) => `https://www.dpd.fr/trace/${c}`],
  ['ups', 'UPS', (c) => `https://www.ups.com/track?tracknum=${c}`],
  ['dhl', 'DHL', (c) => `https://www.dhl.com/fr-fr/home/tracking.html?tracking-id=${c}`],
  ['other', 'Drugi prevoznik', null],
];
export const trackUrl = (carrier, code) => CARRIERS.find((c) => c[0] === carrier)?.[2]?.(encodeURIComponent(code)) || '';
const carrierName = (v) => CARRIERS.find((c) => c[0] === v)?.[1] || '';

// the member's message, in the language the member orders in: the text is the admin's (tab Poruke), these are the starting texts
const WORDS = {
  fr: { track: 'Suivi du colis{via} : {code}', invoice: 'La facture est jointe à ce message.' },
  en: { track: 'Parcel tracking{via}: {code}', invoice: 'The invoice is attached to this message.' },
  sr: { track: 'Праћење пошиљке{via}: {code}', invoice: 'Фактура је у прилогу ове поруке.' },
};
export const DEFAULTS = {
  fr: { subject: 'Votre commande n° {n} est terminée et expédiée', body: 'Bonjour,\n\nVotre commande n° {n} est terminée et expédiée.\n\n{tracking}\n\n{invoice}\n\nMerci pour votre confiance.\n\nL’entrepôt du Diocèse d’Europe occidentale' },
  en: { subject: 'Your order no. {n} is complete and shipped', body: 'Hello,\n\nYour order no. {n} is complete and has been shipped.\n\n{tracking}\n\n{invoice}\n\nThank you for your trust.\n\nThe warehouse of the Eparchy of Western Europe' },
  sr: { subject: 'Ваша поруџбина бр. {n} је завршена и послата', body: 'Добар дан,\n\nВаша поруџбина бр. {n} је завршена и послата.\n\n{tracking}\n\n{invoice}\n\nХвала на поверењу.\n\nМагацин Епархије западноевропске' },
};
export const templateOf = (lang) => {
  const row = D.templates.find((t) => t.key === 'shipped' && t.lang === lang);
  return row ? { subject: row.subject, body: row.body } : DEFAULTS[lang] || DEFAULTS.fr;
};
// a template with the order's numbers filled in; an empty {tracking} or {invoice} takes its blank line with it
export function render(tpl, lang, { n, carrier = '', code = '', invoice = false }) {
  const w = WORDS[lang] || WORDS.fr;
  let tracking = '';
  if (code) {
    const via = carrier && carrier !== 'other' ? ` (${carrierName(carrier)})` : '';
    const url = trackUrl(carrier, code);
    tracking = w.track.replace('{via}', via).replace('{code}', code) + (url ? `\n${url}` : '');
  }
  const f = (t) => t.replaceAll('{n}', n).replaceAll('{tracking}', tracking).replaceAll('{invoice}', invoice ? w.invoice : '').replace(/\n{3,}/g, '\n\n').trim();
  return { subject: f(tpl.subject).replace(/\s*\n\s*/g, ' '), message: f(tpl.body) };
}
export const draftFor = (o, ctx = {}) => render(templateOf(o.lang), o.lang, { n: o.id, ...ctx });

// the form, in the order's sheet
export async function finishForm(o) {
  await load('templates');
  const draft = draftFor(o, { carrier: o.carrier || '', code: o.tracking_code || '', invoice: !!o.invoice_path });
  const again = o.status === 'done';
  touched = !!o.shipped_note;
  openSheet(`<form class="sheet__inner" data-form="finish" data-id="${o.id}" novalidate>
    ${head(again ? `Faktura i praćenje, porudžbina br. ${o.id}` : `Završi porudžbinu br. ${o.id}`, esc(o.name || o.email))}
    <div class="sheet__body">
      ${again ? '' : '<div class="field"><p class="field__help">Porudžbina postaje izvršena, naručene količine se skidaju sa stanja, a član dobija poruku ispod.</p></div>'}
      <div class="field">
        <label for="f-invoice">Faktura iz Erplaina (PDF)</label>
        <input class="input" id="f-invoice" name="invoice" type="file" accept="application/pdf,.pdf" aria-describedby="f-invoice-h">
        <p class="field__help" id="f-invoice-h" data-help="">${o.invoice_path ? `Već priložena: ${esc(o.invoice_name || 'faktura.pdf')}. Novi fajl je zamenjuje.` : 'Nije obavezno. Ide kao prilog mejlu, a član je vidi i na svom nalogu.'}</p>
      </div>
      ${select({ id: 'f-carrier', label: 'Prevoznik', name: 'carrier', options: CARRIERS.map(([v, t]) => [v, t]), value: o.carrier || '' })}
      ${field({ id: 'f-code', label: 'Kod za praćenje', name: 'code', value: o.tracking_code || '', attrs: 'autocomplete="off" spellcheck="false"' })}
      ${checkbox({ id: 'f-send', label: 'Pošalji mejl članu', name: 'send', checked: true, help: `Ide na ${o.email}. Ako mejl još nije podešen, podaci se samo sačuvaju.` })}
      ${field({ id: 'f-subject', label: 'Naslov mejla', name: 'subject', value: draft.subject })}
      <div class="field">
        <label for="f-message">Poruka (${{ fr: 'francuski', en: 'engleski', sr: 'srpski' }[o.lang] || 'francuski'})</label>
        <textarea class="input" id="f-message" name="message" rows="11" aria-describedby="f-message-h">${esc(o.shipped_note || draft.message)}</textarea>
        <p class="field__help" id="f-message-h" data-help="">Poruku možete menjati. Kod i fajl je sami dopunjuju dok je ne dirnete.</p>
      </div>
    </div>
    <footer class="sheet__foot">
      <p class="sheet__msg" role="alert" data-form-msg hidden></p>
      <div class="sheet__actions"><button class="btn btn--primary" type="submit">${again ? 'Sačuvaj' : 'Završi porudžbinu'}</button><button class="btn" type="button" data-close>Odustani</button></div>
    </footer>
  </form>`, { side: true });
}

// the message follows the code and the file until the admin edits it by hand
let touched = false;
sheet.addEventListener('input', (e) => { if (e.target.id === 'f-message') touched = true; });
sheet.addEventListener('input', refill);
sheet.addEventListener('change', refill);
function refill(e) {
  const f = e.target.form;
  if (!f || f.dataset.form !== 'finish') return;
  if (!['f-carrier', 'f-code', 'f-invoice'].includes(e.target.id)) return;
  const o = D.orders.find((x) => x.id === Number(f.dataset.id));
  if (!o) return;
  const d = draftFor(o, { carrier: f.elements.carrier.value, code: f.elements.code.value.trim(), invoice: !!(f.elements.invoice.files[0] || o.invoice_path) });
  if (touched) return;
  f.elements.message.value = d.message;
}
sheet.addEventListener('close', () => { touched = false; });

export async function submitFinish(form, after) {
  const o = D.orders.find((x) => x.id === Number(form.dataset.id));
  const btn = $('[type=submit]', form);
  const file = form.elements.invoice.files[0];
  const code = form.elements.code.value.trim();
  const carrier = form.elements.carrier.value;
  const send = form.elements.send.checked;
  const subject = form.elements.subject.value.trim();
  const message = form.elements.message.value.trim();
  if (file && !/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { formError(form, 'Faktura mora biti PDF.'); return; }
  if (file && file.size > 10 * 1024 * 1024) { formError(form, 'Faktura je veća od 10 MB.'); return; }
  if (code && !carrier) { formError(form, 'Izaberite prevoznika za kod za praćenje.'); return; }
  if (send && (!subject || !message)) { formError(form, 'Naslov i poruka mejla ne smeju biti prazni.'); return; }
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Čuvanje…';
  const wasDone = o.status === 'done';
  try {
    const t = await token();
    const patch = { carrier: carrier || null, tracking_code: code || null, shipped_at: o.shipped_at || new Date().toISOString(), shipped_note: message || null };
    if (!wasDone) patch.status = 'done';
    let oldPath = null;
    if (file) {
      const path = `${o.id}-${Date.now()}.pdf`;
      await call(`${C.url}/storage/v1/object/invoices/${path}`, {
        method: 'POST', headers: { apikey: C.key, Authorization: `Bearer ${t}`, 'Content-Type': 'application/pdf' }, body: file,
      });
      oldPath = o.invoice_path;
      Object.assign(patch, { invoice_path: path, invoice_name: file.name.slice(0, 120) });
    }
    Object.assign(o, one(await db(`orders?id=eq.${o.id}`, { method: 'PATCH', body: patch, prefer: 'return=representation' })));
    if (oldPath) call(`${C.url}/storage/v1/object/invoices/${oldPath}`, { method: 'DELETE', headers: { apikey: C.key, Authorization: `Bearer ${t}` } }).catch(() => {});
    if (!wasDone && ST.products === 'ready') load('products', true);
    let note = wasDone ? 'Sačuvano.' : `Porudžbina br. ${o.id} je izvršena.`;
    let bad = false;
    if (send) {
      try {
        const j = await call(`${C.url}/functions/v1/ship`, {
          method: 'POST', headers: { apikey: C.key, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: o.id, subject, message }),
        });
        if (j.sent) note += ` Mejl se šalje na ${o.email}.`;
        else { bad = true; note += j.reason === 'mail_off' ? ' Mejl nije poslat jer slanje mejla još nije podešeno.' : ' Mejl nije poslat, pokušajte ponovo.'; }
      } catch (e) {
        if (e.signedOut) throw e;
        bad = true; note += ` Mejl nije poslat. ${reason(e)}`;
      }
    }
    after(o);
    draw();
    notify(note, null, bad);
  } catch (e) {
    if (e.signedOut) return;
    btn.disabled = false; btn.textContent = label;
    formError(form, `Nije sačuvano. ${reason(e)}`);
  }
}

// an invoice from the private bucket, opened in a new tab
export async function openInvoice(path, btn) {
  btn.disabled = true;
  const win = window.open('about:blank', '_blank');
  try {
    const t = await token();
    const r = await fetch(`${C.url}/storage/v1/object/authenticated/invoices/${path}`, { headers: { apikey: C.key, Authorization: `Bearer ${t}` } });
    if (!r.ok) throw new Error('Faktura nije nađena.');
    const url = URL.createObjectURL(await r.blob());
    if (win) win.location.href = url; else location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    win?.close();
    if (!e.signedOut) notify(reason(e), null, true);
  } finally { btn.disabled = false; }
}
