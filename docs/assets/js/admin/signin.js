// Sign in, sign out and the first load after signing in.
import { hooks, $, $$, USER_DOMAIN, auth, db, fromAuth, keep, reason, session, shown } from './api.js?v=5945b4a4e1';
import { D, ST, load } from './data.js?v=5945b4a4e1';
import { pdfOnEnter } from './pdf.js?v=5945b4a4e1';
import { closeSheet } from './sheet.js?v=5945b4a4e1';
import { draw } from './shell.js?v=5945b4a4e1';
import { hideBar } from './ui.js?v=5945b4a4e1';

// ---------- sign in, sign out ----------
export function showGate(msg = '') {
  closeSheet();
  hideBar();
  $('#app').hidden = true;
  $('#gate').hidden = false;
  $('[data-boot]').hidden = true;
  const m = $('[data-login-msg]');
  m.textContent = msg;
  m.hidden = !msg;
  document.title = 'Prijava · Magacin Eparhije zapadnoevropske';
}
function showApp() {
  $('#gate').hidden = true;
  $('[data-boot]').hidden = true;
  $('#app').hidden = false;
  $('[data-me]').textContent = shown(session.email);
  document.title = 'Administracija · Magacin Eparhije zapadnoevropske';
  for (const k of Object.keys(ST)) ST[k] = 'idle';
  draw();
  load('orders');
  load('inquiries');
  pdfOnEnter();
}
export async function enter() {
  let ok;
  try { ok = await db('rpc/is_admin', { method: 'POST', body: {} }); } catch (e) {
    if (e.signedOut) return;
    showGate(e.offline ? reason(e) : `Provera naloga nije uspela. ${reason(e)}`);
    return;
  }
  if (ok !== true) {
    const who = session?.email;
    await auth('logout', {}, session?.access_token).catch(() => {});
    keep(null);
    showGate(`Nalog ${shown(who)} nema administratorska prava. Vlasnik sajta ga može dodati u tabelu admins.`);
    return;
  }
  showApp();
}
export async function signOut() {
  const t = session?.access_token;
  keep(null);
  for (const k of Object.keys(D)) D[k] = [];
  showGate('Odjavljeni ste.');
  if (t) auth('logout', {}, t).catch(() => {});
}

$('[data-login]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const login = f.elements.email.value.trim(), password = f.elements.password.value;
  const email = !login || login.includes('@') ? login : `${login.toLowerCase()}@${USER_DOMAIN}`;
  $$('[aria-invalid]', f).forEach((el) => el.removeAttribute('aria-invalid'));
  const m = $('[data-login-msg]');
  if (!email || !password) {
    const el = !email ? f.elements.email : f.elements.password;
    el.setAttribute('aria-invalid', 'true');
    m.textContent = !email ? 'Upišite korisničko ime ili mejl.' : 'Upišite lozinku.';
    m.hidden = false;
    el.focus();
    return;
  }
  const b = $('[type="submit"]', f);
  b.disabled = true;
  b.textContent = 'Prijavljivanje…';
  m.hidden = true;
  try {
    fromAuth(await auth('token?grant_type=password', { email, password }));
    f.elements.password.value = '';
    await enter();
  } catch (err) {
    m.textContent = err.offline ? reason(err)
      : err.status === 429 ? 'Previše pokušaja. Sačekajte nekoliko minuta.'
        : err.status === 400 || err.status === 401 ? (err.code === 'email_not_confirmed' ? 'Mejl naloga nije potvrđen. U Supabase-u otvorite korisnika i potvrdite ga.' : 'Korisničko ime ili lozinka nisu tačni.')
          : `Prijava nije uspela. ${reason(err)}`;
    m.hidden = false;
    if (!err.offline && (err.status === 400 || err.status === 401)) { f.elements.password.setAttribute('aria-invalid', 'true'); f.elements.password.select(); }
  } finally {
    b.disabled = false;
    b.textContent = 'Prijavi se';
  }
});
hooks.gate = showGate;
