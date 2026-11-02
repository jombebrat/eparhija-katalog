// Profile menu, day/night theme and the password dialog.
import { $, $$, auth, esc, reason, session, shown, token } from './api.js?v=e72fe27b4f';
import { busy, closeSheet, field, foot, formError, head, invalid, openSheet } from './sheet.js?v=e72fe27b4f';
import { notify } from './ui.js?v=e72fe27b4f';

// ----- password -----
export function passwordForm() {
  openSheet(`<form class="sheet__inner" novalidate data-form="password">
    ${head('Promena lozinke', esc(shown(session?.email)))}
    <div class="sheet__body">
      <input type="email" name="username" autocomplete="username" value="${esc(session?.email || '')}" hidden>
      ${field({ id: 'w-new', label: 'Nova lozinka', name: 'password', type: 'password', req: true, help: 'Najmanje 10 znakova.', attrs: 'autocomplete="new-password" minlength="10" autofocus' })}
      ${field({ id: 'w-again', label: 'Ponovite novu lozinku', name: 'again', type: 'password', req: true, attrs: 'autocomplete="new-password"' })}
    </div>
    ${foot('Promeni lozinku')}
  </form>`);
}
export async function submitPassword(form) {
  const a = form.elements.password.value, b = form.elements.again.value;
  if (a.length < 10) { invalid(form, 'password', 'Lozinka je kraća od 10 znakova.').focus(); return; }
  if (a !== b) { invalid(form, 'again', 'Lozinke se ne poklapaju.').focus(); return; }
  busy(form, true, 'Čuvanje…');
  try {
    await auth('user', { password: a }, await token(), 'PUT');
    closeSheet();
    notify('Lozinka je promenjena. Sledeći put se prijavite novom.');
  } catch (e) {
    busy(form, false);
    if (!e.signedOut) formError(form, e.code === 'same_password' ? 'Nova lozinka je ista kao stara.' : e.code === 'weak_password' ? 'Lozinka je preslaba; dodajte brojeve ili znakove.' : `Lozinka nije promenjena. ${reason(e)}`);
  }
}

// day or night: automatic follows the device; the choice is kept in this browser
(function theme() {
  const root = document.documentElement;
  const get = () => { try { return localStorage.getItem('ek-theme') || 'auto'; } catch { return 'auto'; } };
  const apply = (v) => {
    if (v === 'light' || v === 'dark') root.dataset.theme = v; else delete root.dataset.theme;
    $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === v)));
  };
  apply(get());
  $$('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.themeSet;
    try { if (v === 'auto') localStorage.removeItem('ek-theme'); else localStorage.setItem('ek-theme', v); } catch { /* fine */ }
    apply(v);
  }));
})();

// the profile menu: who is signed in, the site, the password, sign out
const profileBtn = $('[data-profile]');
const profileMenu = $('[data-profile-menu]');
export function closeProfile(back = false) {
  if (profileMenu.hidden) return;
  profileMenu.hidden = true; profileBtn.setAttribute('aria-expanded', 'false');
  if (back) profileBtn.focus();
}
profileBtn.addEventListener('click', () => {
  const open = profileMenu.hidden;
  profileMenu.hidden = !open; profileBtn.setAttribute('aria-expanded', String(open));
  if (open) $('.profile__item', profileMenu).focus();
});
document.addEventListener('click', (e) => { if (!e.target.closest('.bar__me')) closeProfile(); });
profileMenu.addEventListener('click', (e) => { if (e.target.closest('a')) closeProfile(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !profileMenu.hidden) closeProfile(true); });
