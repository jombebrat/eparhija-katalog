// The member's account: sign in with a code sent by email, see past orders and their PDFs,
// order the same again, keep the details that fill in the order form.
// The database shows a signed-in member only their own row and their own orders.
import { esc, toCyrillic } from './render.js';

const D = JSON.parse(document.getElementById('account-data').textContent);
const S = D.s;
const $ = (s, el = document) => el.querySelector(s);
const fill = (s, v) => Object.entries(v).reduce((a, [k, x]) => a.replaceAll(`{${k}}`, x), s);
const money = new Intl.NumberFormat(D.locale, { style: 'currency', currency: 'EUR' });
const day = new Intl.DateTimeFormat(D.locale, { dateStyle: 'long', timeZone: 'Europe/Paris' });
const count = (n) => `${n} ${D.items[new Intl.PluralRules(D.locale).select(n)] ?? D.items.other}`;
const nameFor = (n) => (D.lang === 'sr' ? toCyrillic(n) : n || '');

const store = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* nothing */ } },
};

// ---------- talking to Supabase ----------
async function call(url, init) {
  let r;
  try { r = await fetch(url, init); } catch { throw Object.assign(new Error('offline'), { offline: true }); }
  const text = r.status === 204 ? '' : await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!r.ok) throw Object.assign(new Error(body?.error || body?.msg || body?.message || r.statusText), { status: r.status, code: body?.error_code || body?.error || body?.code });
  return body;
}
const headers = (extra = {}) => ({ apikey: D.api.key, 'Content-Type': 'application/json', ...extra });

const KEY = 'ek-member';
let session = store.get(KEY);
const keep = (j) => {
  session = j && { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), email: (j.user?.email || session?.email || '').toLowerCase() };
  if (session) store.set(KEY, session); else store.del(KEY);
};
let refreshing = null;
async function token() {
  if (!session) throw Object.assign(new Error('signed out'), { signedOut: true });
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  refreshing ??= call(`${D.api.url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: headers(), body: JSON.stringify({ refresh_token: session.refresh_token }) })
    .then(keep).finally(() => { refreshing = null; });
  try { await refreshing; } catch (e) { if (e.offline) throw e; keep(null); throw Object.assign(new Error('signed out'), { signedOut: true }); }
  return session.access_token;
}
async function rest(path, init = {}) {
  const t = await token();
  try {
    return await call(`${D.api.url}/rest/v1/${path}`, { ...init, headers: headers({ Authorization: `Bearer ${t}`, ...(init.headers || {}) }) });
  } catch (e) {
    if (e.status === 401) { keep(null); throw Object.assign(new Error('signed out'), { signedOut: true }); }
    throw e;
  }
}

// ---------- sign in ----------
const out = $('[data-out]'), inside = $('[data-in]');
const send = $('[data-send]'), verify = $('[data-verify]');
const help = $('[data-help]');
let email = '';
function say(text, error = false) { help.textContent = text; help.classList.toggle('is-error', error); }
function busy(form, on, label) {
  const b = $('[type="submit"]', form);
  if (on) { b.dataset.label = b.textContent; b.textContent = label; b.disabled = true; b.setAttribute('aria-busy', 'true'); } else { b.textContent = b.dataset.label || b.textContent; b.disabled = false; b.removeAttribute('aria-busy'); }
}
function showOut(msg = '') {
  $('[data-boot]').hidden = true;
  inside.hidden = true;
  out.hidden = false;
  send.hidden = false;
  verify.hidden = true;
  send.elements.email.value = session?.email || store.get('ek-email') || '';
  say(msg || S.acSendHelp, !!msg);
}
async function sendCode() {
  const r = await call(`${D.api.url}/functions/v1/order`, { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'code', email, lang: D.lang }) });
  return r;
}
const codeError = (e) => (e.offline ? S.loginFailed : e.status === 404 ? S.loginUnknown : e.status === 429 ? S.loginTooMany : e.status === 400 ? S.loginInvalid
  : e.code === 'mail_off' ? S.acMailOff : e.code === 'mail_failed' ? S.acMailFailed : S.loginFailed);

send.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = send.elements.email;
  email = input.value.trim().toLowerCase();
  input.removeAttribute('aria-invalid');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { input.setAttribute('aria-invalid', 'true'); say(S.loginInvalid, true); input.focus(); return; }
  busy(send, true, S.acSending);
  try {
    await sendCode();
    send.hidden = true;
    verify.hidden = false;
    $('[data-sent]').textContent = fill(S.acSent, { email });
    say(S.acNoCode);
    verify.elements.code.value = '';
    verify.elements.code.focus();
  } catch (err) {
    if (err.status === 404 || err.status === 400) input.setAttribute('aria-invalid', 'true');
    say(codeError(err), true);
    input.focus();
  } finally { busy(send, false); }
});
$('[data-again]').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  b.disabled = true;
  try { await sendCode(); say(fill(S.acSent, { email })); } catch (err) { say(codeError(err), true); } finally { b.disabled = false; verify.elements.code.focus(); }
});
$('[data-other]').addEventListener('click', () => { showOut(); send.elements.email.focus(); });

verify.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = verify.elements.code;
  const code = input.value.replace(/\D/g, '');
  input.removeAttribute('aria-invalid');
  if (code.length < 6) { input.setAttribute('aria-invalid', 'true'); say(S.acNoCode, true); input.focus(); return; }
  busy(verify, true, S.acSigningIn);
  try {
    // the code from the email signs in with Supabase Auth; older servers call it a magic link
    let j;
    try { j = await call(`${D.api.url}/auth/v1/verify`, { method: 'POST', headers: headers(), body: JSON.stringify({ type: 'email', email, token: code }) }); } catch (err) {
      if (err.offline) throw err;
      j = await call(`${D.api.url}/auth/v1/verify`, { method: 'POST', headers: headers(), body: JSON.stringify({ type: 'magiclink', email, token: code }) });
    }
    keep(j);
    store.set('ek-email', session.email); // the catalogue shows prices for this address too
    await enter();
  } catch (err) {
    input.setAttribute('aria-invalid', 'true');
    say(err.offline ? S.loginFailed : err.status === 429 ? S.loginTooMany : S.acWrongCode, true);
    input.select();
  } finally { busy(verify, false); }
});

// ---------- signed in ----------
let me = null;
let orders = null;
async function enter() {
  $('[data-boot]').hidden = true;
  out.hidden = true;
  inside.hidden = false;
  $('[data-name]').textContent = session.email;
  $('[data-meta]').textContent = '';
  loadOrders();
  try {
    const rows = await rest(`priests?select=name,parish,phone,address,email&email=eq.${encodeURIComponent(session.email)}`);
    me = rows?.[0] || null;
  } catch (e) {
    if (e.signedOut) { showOut(S.acSignedOut); return; }
  }
  drawMe();
}
function drawMe() {
  $('[data-name]').textContent = nameFor(me?.name) || session.email;
  $('[data-meta]').textContent = [me?.parish, session.email].filter(Boolean).join(' · ');
  const f = $('[data-details]');
  const saved = store.get('ek-form', {});
  f.elements.name.value = nameFor(me?.name || saved.name || '');
  f.elements.parish.value = me?.parish || saved.parish || '';
  f.elements.phone.value = me?.phone || saved.phone || '';
  f.elements.address.value = me?.address || saved.address || '';
}

const box = $('[data-orders]');
const STATUS = { new: S.acStatusNew, done: S.acStatusDone, cancelled: S.acStatusCancelled };
async function loadOrders() {
  box.innerHTML = `<div class="skel" aria-busy="true">${'<span class="skel__row"></span>'.repeat(3)}</div>`;
  try {
    orders = await rest('orders?select=id,created_at,status,items,total,lang&order=created_at.desc&limit=200');
    drawOrders();
  } catch (e) {
    if (e.signedOut) { showOut(S.acSignedOut); return; }
    box.innerHTML = `<div class="state state--error" role="alert"><p class="state__title">${esc(S.acOrdersError)}</p><p>${esc(e.offline ? S.loginFailed : e.message)}</p><button class="btn" type="button" data-retry>${esc(S.acRetry)}</button></div>`;
  }
}
function drawOrders() {
  if (!orders.length) {
    box.innerHTML = `<div class="state"><p class="state__title">${esc(S.acOrdersEmpty)}</p><p>${esc(S.acOrdersEmptyText)}</p><a class="btn" href="${esc(D.catalogue)}">${esc(S.acCatalogue)}</a></div>`;
    return;
  }
  box.innerHTML = `<ol class="orders" role="list">${orders.map((o) => `<li class="myorder" data-order="${o.id}">
      <div class="myorder__head">
        <p class="myorder__no">${esc(fill(S.acOrder, { n: o.id }))}</p>
        <span class="tag tag--${esc(o.status)}">${esc(STATUS[o.status] || o.status)}</span>
        <p class="myorder__date">${esc(day.format(new Date(o.created_at)))}</p>
        <p class="myorder__total">${esc(money.format(o.total))}</p>
      </div>
      <details class="myorder__lines">
        <summary>${esc(S.acLines)} <span class="myorder__count">(${esc(count(o.items.length))})</span></summary>
        <table class="lines">
          <thead><tr><th scope="col">${esc(S.code)}</th><th scope="col">${esc(S.acItem)}</th><th scope="col" class="num">${esc(S.acQty)}</th><th scope="col" class="num">${esc(S.acAmount)}</th></tr></thead>
          <tbody>${o.items.map((l) => `<tr><td class="code">${esc(l.code)}</td><td>${esc(l.name)}</td><td class="num">${esc(String(l.qty))}${l.unit === 'kg' ? ` ${esc(S.kg)}` : ''}</td><td class="num">${esc(money.format(l.price * l.qty))}</td></tr>`).join('')}</tbody>
        </table>
      </details>
      <div class="myorder__actions">
        <button class="btn" type="button" data-pdf="${o.id}">${esc(S.acPdf)}</button>
        <button class="textbtn" type="button" data-again-order="${o.id}">${esc(S.acReorder)}</button>
        <p class="myorder__msg" data-msg aria-live="polite"></p>
      </div>
    </li>`).join('')}</ol>`;
}

async function pdf(id, b) {
  const msg = $('[data-msg]', b.closest('.myorder'));
  const label = b.textContent;
  b.disabled = true; b.textContent = S.acPdfMaking; msg.textContent = ''; msg.classList.remove('is-error');
  try {
    const t = await token();
    const j = await call(`${D.api.url}/functions/v1/order`, { method: 'POST', headers: headers({ Authorization: `Bearer ${t}` }), body: JSON.stringify({ action: 'pdf', id }) });
    const bytes = Uint8Array.from(atob(j.pdf), (c) => c.charCodeAt(0));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    a.download = j.filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) {
    if (e.signedOut || e.status === 401) { keep(null); showOut(S.acSignedOut); return; }
    msg.textContent = S.acPdfFailed; msg.classList.add('is-error');
  } finally { b.disabled = false; b.textContent = label; }
}

// the same articles go back into the list, and the catalogue opens with it
async function orderAgain(id, b) {
  const o = orders.find((x) => x.id === id);
  const msg = $('[data-msg]', b.closest('.myorder'));
  b.disabled = true;
  let live = null;
  try {
    live = await call(`${D.api.url}/rest/v1/products?select=code,available&active=eq.true`, { headers: { apikey: D.api.key } });
  } catch { /* the catalogue checks again when the order is sent */ }
  const ok = live ? new Map(live.map((p) => [p.code, p.available])) : null;
  const list = store.get('eparhija-katalog-liste', {}) || {};
  const skipped = [];
  for (const l of o.items) {
    if (ok && !ok.get(l.code)) { skipped.push(l.code); continue; }
    list[l.code] = (list[l.code] || 0) + l.qty;
  }
  store.set('eparhija-katalog-liste', list);
  if (skipped.length && skipped.length === o.items.length) {
    msg.textContent = fill(S.acReorderSome, { codes: skipped.join(', ') });
    msg.classList.add('is-error');
    b.disabled = false;
    return;
  }
  if (skipped.length) {
    msg.textContent = fill(S.acReorderSome, { codes: skipped.join(', ') });
    setTimeout(() => { location.href = `${D.catalogue}#liste`; }, 2500);
    return;
  }
  location.href = `${D.catalogue}#liste`;
}

box.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.matches('[data-retry]')) loadOrders();
  else if (b.matches('[data-pdf]')) pdf(Number(b.dataset.pdf), b);
  else if (b.matches('[data-again-order]')) orderAgain(Number(b.dataset.againOrder), b);
});

$('[data-details]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const h = $('[data-details-help]', f);
  const v = (n) => f.elements[n].value.trim();
  busy(f, true, S.acSaving);
  h.textContent = ''; h.classList.remove('is-error');
  try {
    const rows = await rest('rpc/update_my_details', { method: 'POST', body: JSON.stringify({ p_name: v('name'), p_parish: v('parish'), p_phone: v('phone'), p_address: v('address') }) });
    me = (Array.isArray(rows) ? rows[0] : rows) || me;
    store.set('ek-form', { ...store.get('ek-form', {}), name: v('name'), parish: v('parish'), phone: v('phone'), address: v('address') });
    drawMe();
    h.textContent = S.acSaved;
  } catch (err) {
    if (err.signedOut) { showOut(S.acSignedOut); return; }
    h.textContent = S.acSaveFailed; h.classList.add('is-error');
  } finally { busy(f, false); }
});

$('[data-signout]').addEventListener('click', () => {
  const t = session?.access_token;
  keep(null);
  me = null; orders = null;
  showOut();
  if (t) call(`${D.api.url}/auth/v1/logout`, { method: 'POST', headers: headers({ Authorization: `Bearer ${t}` }) }).catch(() => {});
});

// ---------- start ----------
if (!D.api) { $('[data-boot]').hidden = true; out.hidden = false; say(S.acMailOff, true); send.querySelector('button').disabled = true; }
else if (session) enter(); else showOut();
