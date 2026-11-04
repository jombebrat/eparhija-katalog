// The checkout page: what is in the basket, who is sending the order, and the send button.
// "Continue" in the basket of the catalogue leads here. The list and the member's email are kept in this browser by the catalogue.
import { esc, photoUrl, toCyrillic } from './render.js?v=2e5794a19b';

const D = JSON.parse(document.getElementById('checkout-data').textContent);
const S = D.s;
const $ = (s, el = document) => el.querySelector(s);
const fill = (s, v) => Object.entries(v).reduce((a, [k, x]) => a.replaceAll(`{${k}}`, x), s);
const money = new Intl.NumberFormat(D.locale, { style: 'currency', currency: 'EUR' });
const store = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* nothing */ } },
};
// The details of the last order are kept per e-mail address: someone else signing in on this browser must not inherit them.
const formKey = (email) => String(email || '').trim().toLowerCase();
const formFor = (email) => { const f = store.get('ek-form', {}) || {}; return f.for && f.for === formKey(email) ? f : {}; };
const keepForm = (email, patch) => store.set('ek-form', { ...formFor(email), ...patch, for: formKey(email) });
const KEY = 'eparhija-katalog-liste';
const box = $('[data-co]');
const show = (html) => { $('[data-boot]').hidden = true; box.innerHTML = html; };
const splitKey = (k) => { const i = k.lastIndexOf('#'); return i < 0 ? { code: k, opt: null } : { code: k.slice(0, i), opt: Number(k.slice(i + 1)) }; };
const api = async (fn, payload) => {
  const r = await fetch(`${D.api.url}/functions/v1/${fn}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(D.api.key ? { apikey: D.api.key } : {}) }, body: JSON.stringify(payload),
  });
  let data = {};
  try { data = await r.json(); } catch { /* not json */ }
  return { status: r.status, data };
};
const message = (title, text, actions = '') => `<div class="co__msg"><p class="co__msg-title">${esc(title)}</p>${text ? `<p>${esc(text)}</p>` : ''}<p class="co__msg-act">${actions}</p></div>`;
const toCatalogue = (label, primary = true) => `<a class="btn${primary ? ' btn--primary' : ''}" href="${esc(D.catalogue)}">${esc(label)}</a>`;

// the lines of the list that still exist in the catalogue
const list = store.get(KEY, {}) || {};
const lines = Object.entries(list).map(([k, qty]) => {
  const { code, opt } = splitKey(k);
  const p = D.p[code];
  if (!p || !(qty > 0)) return null;
  if (opt === null) return p.o ? null : { code, qty, name: p.n, sku: code, kg: !!p.kg, ph: p.ph };
  const o = p.o?.[opt];
  return o ? { code, opt, qty, name: `${p.n}, ${o[0]}`, sku: o[1] || code, kg: !!p.kg, ph: p.ph } : null;
}).filter(Boolean);

let prices = null;
const price = (l) => (prices && l.code in prices ? prices[l.code] : null);
const sum = () => lines.reduce((a, l) => a + (price(l) ?? 0) * l.qty, 0);

async function start() {
  if (!lines.length) return show(message(S.emptyTitle, S.emptyText, toCatalogue(S.browse)));
  const email = store.get('ek-email');
  if (!email || !D.api) return show(message(S.coNeedEmail, '', toCatalogue(S.acCatalogue)));
  let res = null;
  try { res = await api('prices', { email }); } catch { res = null; }
  if (res && res.status === 404) { store.del('ek-email'); return show(message(S.loginUnknown, '', toCatalogue(S.acCatalogue))); }
  if (!res || res.status !== 200 || !res.data.prices) return show(message(S.orderFailed, '', toCatalogue(S.reviewBack, false)));
  prices = res.data.prices;
  drawForm(email, res.data.priest || {});
}

function drawForm(email, priest) {
  const saved = { ...priest, ...Object.fromEntries(Object.entries(formFor(email)).filter(([k, v]) => v && k !== 'for')) };
  const val = (n) => (n === 'name' && D.lang === 'sr' ? toCyrillic(saved.name) : saved[n] || '');
  const field = (name, label, type, optional, auto, tag = 'input') => `<div class="field"><label for="co-${name}">${esc(label)}${optional ? ` <span class="field__opt">(${esc(S.optional)})</span>` : ''}</label>${tag === 'textarea'
    ? `<textarea id="co-${name}" name="${name}" rows="3" maxlength="1000">${esc(val(name))}</textarea>`
    : `<input id="co-${name}" name="${name}" type="${type}" autocomplete="${auto}" maxlength="${name === 'address' ? 300 : 160}" value="${esc(val(name))}">`}</div>`;
  show(`<div class="co">
    <section class="co__card" aria-labelledby="co-list">
      <h2 id="co-list">${esc(S.list)}</h2>
      <ul class="co__lines" role="list">${lines.map((l) => `<li>
        <span class="co__img">${l.ph ? `<img src="${esc(photoUrl(D.root, l.ph, true))}" alt="" width="48" height="48" loading="lazy">` : ''}</span>
        <span class="co__name">${esc(l.name)}<span class="co__sku">${l.kg ? '' : esc(l.sku)}</span></span>
        <span class="co__qty">${l.qty}${l.kg ? ` ${esc(S.kg)}` : ' ×'}</span>
        <span class="co__sum">${price(l) === null ? '' : esc(money.format(price(l) * l.qty))}</span></li>`).join('')}</ul>
      <p class="drawer__total"><span>${esc(S.total)}</span><b>${esc(money.format(sum()))}</b></p>
      <a class="textbtn" href="${esc(D.catalogue)}">← ${esc(S.reviewBack)}</a>
    </section>
    <form class="co__card order-form co__form" novalidate aria-labelledby="co-who">
      <h2 id="co-who">${esc(S.reviewWho)}</h2>
      <p class="co__for">${esc(S.quoteFor)}: ${esc(email)}</p>
      <div class="order-form__grid">${field('name', S.formName, 'text', false, 'name')}${field('parish', S.formParish, 'text', true, 'organization')}${field('phone', S.formPhone, 'tel', true, 'tel')}${field('address', S.formAddress, 'text', true, 'street-address')}</div>
      ${field('note', S.formNote, 'text', true, '', 'textarea')}
      <button class="btn btn--primary" type="submit">${esc(S.sendOrder)}</button>
      <p class="drawer__help" id="co-help" aria-live="polite"></p>
    </form>
  </div>`);
  const form = $('.co__form');
  const help = $('#co-help');
  form.addEventListener('input', (e) => e.target.removeAttribute('aria-invalid'));
  form.addEventListener('change', (e) => keepForm(email, { [e.target.name]: e.target.value }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const nameInput = $('#co-name');
    if (String(data.name || '').trim().length < 2) {
      nameInput.setAttribute('aria-invalid', 'true'); nameInput.setAttribute('aria-describedby', 'co-help');
      help.textContent = S.nameMissing; nameInput.focus(); return;
    }
    keepForm(email, { name: data.name, parish: data.parish, phone: data.phone, address: data.address });
    const send = $('[type=submit]', form);
    send.disabled = true; send.setAttribute('aria-busy', 'true'); send.textContent = S.sending; help.textContent = '';
    let r = null;
    try {
      r = await api('order', { email, lang: D.lang, items: lines.map((l) => ({ code: l.code, qty: l.qty, ...(l.opt ? { option: l.opt } : {}) })), ...data });
    } catch { r = null; }
    send.disabled = false; send.removeAttribute('aria-busy'); send.textContent = S.sendOrder;
    if (r && r.status === 200 && r.data.number) { store.set(KEY, {}); return done(r.data); }
    if (r && r.status === 404) { store.del('ek-email'); return show(message(S.loginUnknown, '', toCatalogue(S.acCatalogue))); }
    const codes = (r?.data?.codes || []).join(', ');
    help.textContent = r?.data?.error === 'unknown_item' ? S.orderUnknown
      : r?.data?.error === 'choose' ? fill(S.orderChoose, { codes })
      : r?.data?.error === 'unavailable' ? fill(S.orderUnavailable, { codes })
      : r?.status === 429 ? S.loginTooMany : S.orderFailed;
  });
}

function done(o) {
  let pdf = '';
  if (o.pdf) {
    const bytes = Uint8Array.from(atob(o.pdf), (c) => c.charCodeAt(0));
    pdf = `<a class="btn btn--primary" href="${URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))}" download="${esc(o.filename)}">${esc(S.downloadPdf)}</a>`;
  }
  show(`<div class="co__done" role="status">
    <svg class="done__check" viewBox="0 0 52 52" width="56" height="56" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l8 8 15-17"/></svg>
    <p class="co__msg-title">${esc(fill(S.orderDone, { n: o.number }))}</p>
    <p>${esc(o.emailed ? S.orderDoneMail : S.orderDoneNoMail)}</p>
    <p class="co__msg-act">${pdf}<a class="btn btn--quiet" href="${esc(D.account)}">${esc(S.acLink)}</a>${toCatalogue(S.acCatalogue, false)}</p>
  </div>`);
  $('.co__done a')?.focus();
  window.scrollTo(0, 0);
}

start();
