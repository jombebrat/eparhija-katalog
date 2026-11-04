// The automatic messages: the text the member gets when an order is finished and sent, in each language.
// The admin edits it here; the dialog "Završi porudžbinu" starts from it.
import { $, $$, db, esc, one, reason } from './api.js?v=0d0dfe6320';
import { D, NEEDS, failed, skeleton, stateOf } from './data.js?v=0d0dfe6320';
import { DEFAULTS, render, templateOf } from './shipping.js?v=0d0dfe6320';
import { notify } from './ui.js?v=0d0dfe6320';

const LANGS = [['fr', 'Francuski', 'fr'], ['en', 'Engleski', 'en'], ['sr', 'Srpski (ćirilica)', 'sr-Cyrl']];
const SAMPLE = { n: 1234, carrier: 'colissimo', code: '6A12345678901', invoice: true };

export function drawMessages() {
  const box = $('[data-region="messages"]');
  const st = stateOf(NEEDS.poruke);
  if (st === 'loading') { box.innerHTML = skeleton(5); return; }
  if (st === 'error') { box.innerHTML = failed('Poruke', NEEDS.poruke); return; }
  if (box.dataset.done) return; // not while the admin is typing
  box.dataset.done = '1';
  box.innerHTML = `<div class="msgs">
    <p class="msgs__help">Ovo je poruka koju član dobija kada označite porudžbinu kao izvršenu. Pre slanja je uvek možete izmeniti u prozoru porudžbine.
      U tekst možete upisati: <code>{n}</code> broj porudžbine, <code>{tracking}</code> red sa kodom za praćenje (nestaje ako kod nije upisan) i <code>{invoice}</code> rečenicu o priloženoj fakturi (nestaje ako fakture nema).</p>
    ${LANGS.map(([l, name, tag]) => {
    const t = templateOf(l);
    return `<form class="msg" data-tpl-form="${l}" novalidate>
      <h2 class="msg__title">${name}</h2>
      <div class="field"><label for="ms-${l}">Naslov</label><input class="input" id="ms-${l}" name="subject" lang="${tag}" value="${esc(t.subject)}"></div>
      <div class="field"><label for="mb-${l}">Poruka</label><textarea class="input" id="mb-${l}" name="body" lang="${tag}" rows="10">${esc(t.body)}</textarea></div>
      <details class="msg__prev"><summary>Primer: kako izgleda</summary><pre class="msg__pre" lang="${tag}" data-prev></pre></details>
      <p class="sheet__msg" role="alert" data-form-msg hidden></p>
      <div class="msg__act"><button class="btn btn--primary" type="submit">Sačuvaj</button><button class="btn" type="button" data-tpl-reset="${l}">Vrati početni tekst</button></div>
    </form>`;
  }).join('')}</div>`;
  $$('[data-tpl-form]', box).forEach(preview);
}

function preview(form) {
  const l = form.dataset.tplForm;
  const r = render({ subject: form.elements.subject.value, body: form.elements.body.value }, l, SAMPLE);
  $('[data-prev]', form).textContent = `${r.subject}\n\n${r.message}`;
}
document.addEventListener('input', (e) => { const f = e.target.closest?.('[data-tpl-form]'); if (f) preview(f); });
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tpl-reset]');
  if (!b) return;
  const f = b.closest('form');
  f.elements.subject.value = DEFAULTS[b.dataset.tplReset].subject;
  f.elements.body.value = DEFAULTS[b.dataset.tplReset].body;
  preview(f);
});

export async function saveTemplate(form) {
  const lang = form.dataset.tplForm;
  const subject = form.elements.subject.value.trim();
  const body = form.elements.body.value.trim();
  const msg = $('[data-form-msg]', form);
  msg.hidden = true;
  if (!subject || !body) { msg.textContent = 'Naslov i poruka ne smeju biti prazni.'; msg.hidden = false; return; }
  const btn = $('[type=submit]', form);
  btn.disabled = true;
  try {
    const row = one(await db('message_templates?on_conflict=key,lang', {
      method: 'POST', body: { key: 'shipped', lang, subject, body, updated_at: new Date().toISOString() },
      prefer: 'resolution=merge-duplicates,return=representation',
    }));
    const i = D.templates.findIndex((t) => t.key === 'shipped' && t.lang === lang);
    if (i >= 0) D.templates[i] = row; else D.templates.push(row);
    notify(`Poruka (${LANGS.find((x) => x[0] === lang)[1].toLowerCase()}) je sačuvana.`);
  } catch (e) {
    if (!e.signedOut) { msg.textContent = `Nije sačuvano. ${reason(e)}`; msg.hidden = false; }
  } finally { btn.disabled = false; }
}
