// Catalogue: search, category chips, product detail, prices for members and the order list.
// Everything on the page works without this file; it only adds the tools.
// The catalogue itself is reloaded from the database, so what the admin changes shows at once.
import * as R from './render.js?v=2e5794a19b';

(() => {
  const D = JSON.parse(document.getElementById('catalogue-data').textContent);
  const S = D.s;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = new URL('../../', import.meta.url).href;
  const money = new Intl.NumberFormat(D.locale, { style: 'currency', currency: 'EUR' });
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const RISE = [{ opacity: 0, filter: 'blur(10px)', transform: 'translateY(14px)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }];
  const inView = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
  const plural = new Intl.PluralRules(D.locale);
  const countText = (n, forms = D.items) => `${n} ${forms[plural.select(n)] ?? forms.other}`;
  const fmt = (s, v) => Object.entries(v).reduce((a, [k, x]) => a.replace(`{${k}}`, x), s);
  const photo = (src, small = true) => R.photoUrl(root, src, small);
  const norm = R.norm;

  // ---------- search ----------
  const q = $('#q-hero');
  const clearBtn = $('[data-clear]');
  const status = $('[data-status]');
  const noMatch = $('[data-nomatch]');
  let cats = [], items = [], chips = [];
  let defaultStatus = status.textContent;
  const collect = () => { cats = $$('[data-cat]'); items = $$('[data-search]'); chips = $$('[data-chip]'); };
  collect();

  $$('[data-js], [data-find], [data-open-list]').forEach((el) => el.removeAttribute('hidden'));

  function filter(raw) {
    const terms = norm(raw).split(' ').filter(Boolean);
    let shown = 0;
    const back = [];
    items.forEach((el) => {
      const hit = terms.every((t) => el.dataset.search.includes(t));
      if (hit && el.hidden) back.push(el);
      el.hidden = !hit;
      if (hit) shown++;
    });
    // what comes back into the list rises into place, one after another
    if (!reduced()) back.filter(inView).slice(0, 16).forEach((el, i) => el.animate(RISE, { duration: 520, delay: i * 40, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
    cats.forEach((c) => {
      const any = $$('[data-search]', c).some((el) => !el.hidden);
      c.hidden = !any;
      const chip = chips.find((x) => x.dataset.chip === c.id);
      if (chip) chip.toggleAttribute('data-empty', !any);
    });
    clearBtn.hidden = !terms.length;
    if (!terms.length) { status.textContent = defaultStatus; noMatch.hidden = true; return; }
    status.textContent = fmt(S.matches, { n: countText(shown), q: raw.trim() });
    noMatch.hidden = shown > 0;
    noMatch.textContent = fmt(S.noMatch, { q: raw.trim() });
  }
  let timer;
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => filter(q.value), 80); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Escape' && q.value) { q.value = ''; filter(''); } });
  const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  clearBtn.addEventListener('click', () => { q.value = ''; filter(''); $('[data-to-search]')?.focus(); });
  $('[data-find]').addEventListener('submit', (e) => {
    e.preventDefault();
    filter(q.value);
    q.blur();
    document.getElementById('catalogue').scrollIntoView({ behavior: smooth() });
  });
  // the magnifier in the category bar goes back up to the search
  $('[data-to-search]')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: smooth() });
    q.focus({ preventScroll: true });
  });
  // a category link clears a search that would hide its section
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const target = document.getElementById(a.getAttribute('href').slice(1));
    if (target && target.hidden && q.value) { q.value = ''; filter(''); }
  });

  // ---------- chips follow the scroll ----------
  const rail = $('[data-chips]');
  let current = null;
  const setCurrent = (id) => {
    if (id === current) return;
    current = id;
    chips.forEach((c) => {
      const on = c.dataset.chip === id;
      c.setAttribute('aria-current', on ? 'true' : 'false');
      if (on) rail.scrollTo({ left: c.offsetLeft - rail.offsetLeft - (rail.clientWidth - c.offsetWidth) / 2, behavior: 'auto' });
    });
  };
  const seen = new Map();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => seen.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : null));
    const visible = [...seen].filter(([, v]) => v !== null).sort((a, b) => a[1] - b[1]);
    if (visible.length) setCurrent(visible[0][0]);
  }, { rootMargin: '-140px 0px -55% 0px' });
  const observe = () => { io.disconnect(); seen.clear(); current = null; cats.forEach((c) => io.observe(c)); };
  observe();

  // ---------- small storage helpers (this browser only) ----------
  const store = {
    get: (k, fallback = null) => { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: kept until the tab closes */ } },
    del: (k) => { try { localStorage.removeItem(k); } catch { /* nothing stored */ } },
  };

  // ---------- language: remembered, and the welcome asks for it ----------
  $$('a[data-lang]').forEach((a) => a.addEventListener('click', () => {
    store.set('ek-lang', a.getAttribute('lang').slice(0, 2));
    try { sessionStorage.setItem('ek-stay', '1'); } catch { /* fine */ }
  }));
  (() => {
    const want = store.get('ek-lang');
    let stay = false;
    try { stay = !!sessionStorage.getItem('ek-stay'); sessionStorage.setItem('ek-stay', '1'); } catch { stay = true; }
    const fromHere = document.referrer && new URL(document.referrer).origin === location.origin;
    if (want && want !== D.lang && D.lang === 'fr' && !stay && !fromHere && !location.hash && D.langs[want]) location.replace(D.langs[want]);
  })();

  // ---------- prices: only for an email on the members' list, asked from the server ----------
  let prices = null;
  let priest = null;
  const priceOf = (code) => (prices && code in prices ? prices[code] : null);
  const api = async (fn, payload) => {
    const r = await fetch(`${D.api.url}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(D.api.key ? { apikey: D.api.key } : {}) },
      body: JSON.stringify(payload),
    });
    let data = {};
    try { data = await r.json(); } catch { /* not json */ }
    return { status: r.status, data };
  };

  const account = $('[data-account]');
  const loginBtn = $('[data-login]');
  const profile = $('[data-profile]');
  // the members' PDF price list: a short-lived link, given only for an email on the members' list
  let fabN = null;   // the list's size last time, to bump the basket when it grows
  const pdfBtn = $('[data-pdf]');
  const pdfLabel = $('[data-pdf-label]');
  let pdfTimer;
  const pdfSay = (s, ms = 0) => { clearTimeout(pdfTimer); pdfLabel.textContent = s; if (ms) pdfTimer = setTimeout(() => { pdfLabel.textContent = S.pdfBtn; }, ms); };
  const pdfDialog = $('[data-pdf-dialog]');
  const getPdf = async (blank) => {
    const email = store.get('ek-email');
    if (!email || pdfBtn.disabled) return;
    pdfBtn.disabled = true; pdfSay(S.pdfWorking);
    try {
      const { status, data } = await api('prices', { email, pdf: true, blank });
      if (status === 200 && data.url) { pdfSay(S.pdfBtn); location.href = data.url; }
      else pdfSay(status === 404 && data.error === 'nopdf' ? S.pdfNone : S.pdfFailed, 5000);
    } catch { pdfSay(S.pdfFailed, 5000); }
    pdfBtn.disabled = false;
  };
  pdfBtn?.addEventListener('click', () => { if (!pdfBtn.disabled) pdfDialog.showModal(); });
  $('[data-pdf-cancel]', pdfDialog)?.addEventListener('click', () => pdfDialog.close());
  pdfDialog.querySelectorAll('[data-pdf-pick]').forEach((b) => b.addEventListener('click', () => { pdfDialog.close(); getPdf(b.dataset.pdfPick === 'blank'); }));
  function paintPrices() {
    const first = !!prices && !document.documentElement.classList.contains('priced');
    document.documentElement.classList.toggle('priced', !!prices);
    $$('[data-price]').forEach((el) => {
      const v = priceOf(el.dataset.price);
      const kg = D.p[el.dataset.price]?.kg;
      el.textContent = v === null ? '' : money.format(v) + (kg && el.tagName !== 'TD' ? ` ${S.perKg}` : '');
    });
    if (account) {
      account.hidden = !D.api;
      loginBtn.hidden = !!prices;
      profile.hidden = !prices;
      pdfBtn.hidden = !prices;
    }
    if (drawer.open) renderList();
    if (detail.open && dCode) paintDetailPrice();
    // the prices appear as a wave over what is on the screen
    if (first && !reduced()) $$('[data-price]').filter(inView).slice(0, 30).forEach((el, i) => el.animate(RISE, { duration: 650, delay: 150 + i * 45, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
  }
  async function checkEmail(email) {
    const { status, data } = await api('prices', { email });
    if (status === 200 && data.prices) {
      prices = data.prices; priest = data.priest || {};
      store.set('ek-email', email);
      const form = store.get('ek-form', {});
      store.set('ek-form', { name: form.name || priest.name || '', parish: form.parish || priest.parish || '', phone: form.phone || priest.phone || '', address: form.address || priest.address || '' });
      paintPrices();
      return 'ok';
    }
    if (status === 404) return 'unknown';
    if (status === 429) return 'too_many';
    if (status === 400) return 'invalid';
    return 'failed';
  }
  function signOut() {
    prices = null; priest = null;
    store.del('ek-email');
    paintPrices();
  }


  // ---------- the first thing a visitor sees: the warehouse as it is now, in motion ----------
  // Built from the cards on the page, so it always shows the articles that are really there. Once per visit.
  function startIntro() {
    window.__introMs = 0;
    const release = () => document.documentElement.classList.remove('intro-pending');
    let seen = false;
    try { seen = !!sessionStorage.getItem('ek-intro'); } catch { /* private mode: show it */ }
    const token = new URLSearchParams(location.search).get('ponuda');
    if (reduced() || seen || token || location.hash.length > 1) { release(); return Promise.resolve(); }
    const pics = [...new Set($$('.card__img img').map((i) => i.currentSrc || i.src).filter(Boolean))];
    if (pics.length < 30) { release(); return Promise.resolve(); }
    try { sessionStorage.setItem('ek-intro', '1'); } catch { /* fine */ }
    for (let i = pics.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pics[i], pics[j]] = [pics[j], pics[i]]; }
    const total = $$('.card').length - $$('.card--out').length, cats = $$('[data-cat]').length;
    const brand = $('.hero h1')?.textContent || '';
    const crest = $('.wordmark__grb')?.getAttribute('src') || '';
    const ov = document.createElement('div');
    ov.className = 'intro';
    const rowHtml = (n) => `<div class="intro__row">${pics.slice(n * 10, n * 10 + 10).map((u) => `<span class="intro__tile"><img src="${u}" alt=""></span>`).join('')}</div>`;
    ov.innerHTML = `<div class="intro__rows" aria-hidden="true">${rowHtml(0)}${rowHtml(1)}${rowHtml(2)}</div>
      <div class="intro__center">${crest ? `<img class="intro__crest" src="${crest}" alt="" width="48" height="56">` : ''}
        <p class="intro__title"></p>
        <p class="intro__nums"><span><b data-n="${total}">0</b> ${S.introAvail}</span><span><b data-n="${cats}">0</b> ${S.introCats}</span></p></div>
      <button class="intro__skip" type="button">${S.introSkip}</button>`;
    $('.intro__title', ov).textContent = brand;
    document.body.append(ov);
    document.documentElement.classList.add('intro-on');
    release();
    let early = false;
    ov.addEventListener('click', () => { early = true; });
    const ready = Promise.race([Promise.all(pics.slice(0, 30).map((u) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = u; }))), new Promise((r) => setTimeout(r, 1500))]);
    return ready.then(() => {
      const LIFE = 5600, OUT = 900;
      window.__introMs = LIFE + OUT;
      const ease = 'cubic-bezier(.22,1,.36,1)';
      $$('.intro__row', ov).forEach((row, r) => {
        const dir = r === 1 ? 1 : -1, far = 420 + r * 120;
        row.animate([{ transform: `translateX(${dir > 0 ? -far : 0}px)` }, { transform: `translateX(${dir > 0 ? 0 : -far}px)` }], { duration: LIFE + OUT, easing: 'linear', fill: 'both' });
        $$('.intro__tile', row).forEach((t, i) => t.animate([{ opacity: 0, transform: `translateY(${r % 2 ? -40 : 40}px) scale(0.85)` }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 120 + i * 55 + r * 90, easing: ease, fill: 'both' }));
      });
      const center = $('.intro__center', ov);
      center.animate([{ opacity: 0, transform: 'translateY(24px) scale(0.94)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 700, easing: ease, fill: 'both' });
      $$('[data-n]', ov).forEach((b) => {
        const to = Number(b.dataset.n), t0 = performance.now() + 1300, dur = 1500;
        const tick = (now) => { const k = Math.min(1, Math.max(0, (now - t0) / dur)); b.textContent = String(Math.round(to * (1 - (1 - k) ** 3))); if (k < 1 && ov.isConnected) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      return new Promise((resolve) => {
        let done = false;
        const end = (fast) => {
          if (done) return; done = true; clearTimeout(timer);
          ov.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.05)' }], { duration: fast ? 450 : OUT, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished.then(() => {
            ov.remove(); document.documentElement.classList.remove('intro-on'); window.__introMs = 0; resolve();
          });
        };
        const timer = setTimeout(() => end(false), LIFE);
        $('.intro__skip', ov).addEventListener('click', () => { window.__introMs = 450; end(true); });
        ov.addEventListener('click', () => { window.__introMs = 450; end(true); });
        addEventListener('keydown', (e) => { if (e.key === 'Escape') { window.__introMs = 450; end(true); } }, { once: true });
        if (early) end(true);
      });
    });
  }

  const introDone = startIntro();
  window.__introDone = introDone;
  // ---------- the welcome asks for the language, once ----------
  const welcome = $('[data-welcome]');
  function openWelcome() { welcome.showModal(); $('[aria-current="page"]', welcome)?.focus(); }
  welcome.addEventListener('click', (e) => {
    const a = e.target.closest('[data-pick]');
    if (!a) return;
    store.set('ek-welcome', 1);
    if (a.dataset.pick === D.lang) { e.preventDefault(); welcome.close(); }
  });
  welcome.addEventListener('close', () => store.set('ek-welcome', 1));

  // ---------- members sign in with their email to see prices ----------
  const loginDialog = $('[data-login-dialog]');
  const loginForm = $('[data-login-form]');
  const loginInput = $('#login-email');
  const loginHelp = $('[data-login-help]');
  const loginSubmit = $('[data-login-submit]');
  let afterLogin = null;
  function openLogin(then = null) {
    if (!D.api) return;
    afterLogin = then;
    loginHelp.textContent = '';
    loginInput.removeAttribute('aria-invalid');
    loginInput.value = store.get('ek-email') || store.get('ek-inq-email') || '';
    loginDialog.showModal();
    loginInput.focus();
  }
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = loginInput.value.trim().toLowerCase();
    if (!loginInput.checkValidity() || !email) {
      loginInput.setAttribute('aria-invalid', 'true');
      loginInput.setAttribute('aria-describedby', 'login-help');
      loginHelp.textContent = S.loginInvalid;
      loginInput.focus();
      return;
    }
    loginSubmit.setAttribute('aria-busy', 'true');
    loginSubmit.disabled = true;
    loginHelp.textContent = S.checking;
    let result = 'failed';
    try { result = await checkEmail(email); } catch { result = 'failed'; }
    loginSubmit.removeAttribute('aria-busy');
    loginSubmit.disabled = false;
    if (result === 'ok') {
      store.set('ek-welcome', 1);
      if (!reduced()) {
        const label = loginSubmit.textContent;
        loginSubmit.classList.add('is-ok'); loginSubmit.textContent = '✓';
        await new Promise((r) => setTimeout(r, 650));
        loginSubmit.classList.remove('is-ok'); loginSubmit.textContent = label;
      }
      loginDialog.close();
      const then = afterLogin; afterLogin = null;
      if (then) then();
      return;
    }
    loginInput.setAttribute('aria-invalid', 'true');
    loginHelp.textContent = { unknown: S.loginUnknown, too_many: S.loginTooMany, invalid: S.loginInvalid }[result] || S.loginFailed;
    loginInput.focus();
  });
  $('[data-login-skip]').addEventListener('click', () => loginDialog.close());
  loginBtn?.addEventListener('click', () => { opener = loginBtn; openLogin(); });

  // ---------- the list ----------
  // a line is an article ("P011") or an article with its option ("P064#57": the icon of St Nicholas)
  const KEY = 'eparhija-katalog-liste';
  const keyOf = (code, opt) => (opt ? `${code}#${opt}` : code);
  const splitKey = (k) => { const i = k.lastIndexOf('#'); return i < 0 ? { code: k, opt: null } : { code: k.slice(0, i), opt: Number(k.slice(i + 1)) }; };
  let OPT = {};
  const indexOptions = () => { OPT = {}; for (const [code, p] of Object.entries(D.p)) for (const [id, l, sku, out] of p.o || []) OPT[id] = { code, l, sku, out: !!out }; };
  indexOptions();
  const itemOf = (k) => {
    const { code, opt } = splitKey(k);
    const p = D.p[code];
    if (!p) return null;
    if (opt === null) return p.o ? null : { code, opt, p, name: p.n, sku: code, out: !!p.out };
    const o = OPT[opt];
    return o && o.code === code ? { code, opt, p, o, name: `${p.n}, ${o.l}`, sku: o.sku || code, out: o.out } : null;
  };
  const payload = () => Object.entries(list).map(([k, qty]) => { const { code, opt } = splitKey(k); return { code, qty, ...(opt ? { option: opt } : {}) }; });
  let list = store.get(KEY, {}) || {};
  for (const k of Object.keys(list)) if (!itemOf(k) || !(list[k] > 0)) delete list[k];
  const save = () => store.set(KEY, list);

  const drawer = $('[data-list-dialog]');
  const body = $('[data-list-body]');
  const foot = $('[data-list-foot]');

  // ----- feedback when something goes in the list: the picture flies to the basket, numbers roll, buttons spring -----
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const visible = (e) => e && e.getClientRects().length > 0;
  const basket = () => $$('.fab').find(visible) || $$('[data-open-list]').find(visible) || null;
  function bumpBasket() { $$('.fab').forEach((b) => { b.classList.remove('fab--bump'); void b.offsetWidth; b.classList.add('fab--bump'); }); }
  function fly(from) {
    const to = basket();
    if (still || !from || !to) return false;
    const src = from.closest('.card, tr, .detail, .opt')?.querySelector('img');
    const a = (src && visible(src) ? src : from).getBoundingClientRect(), t = to.getBoundingClientRect();
    if (!a.width) return false;
    const size = Math.min(96, Math.max(56, Math.min(a.width, a.height)));
    const g = document.createElement(src ? 'img' : 'span');
    g.className = 'flyer';
    if (src) { g.src = src.currentSrc || src.src; g.alt = ''; }
    Object.assign(g.style, { left: `${a.left + a.width / 2 - size / 2}px`, top: `${a.top + a.height / 2 - size / 2}px`, width: `${size}px`, height: `${size}px` });
    document.body.append(g);
    const dx = t.left + t.width / 2 - (a.left + a.width / 2), dy = t.top + t.height / 2 - (a.top + a.height / 2);
    const lift = Math.min(90, Math.abs(dy) * 0.25 + 30);
    g.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(0.7)`, opacity: 0.95, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.16)`, opacity: 0.35, offset: 1 },
    ], { duration: 720, easing: 'cubic-bezier(.45,0,.25,1)' }).finished.then(() => { g.remove(); bumpBasket(); }, () => g.remove());
    return true;
  }
  // a number rolls in from below when it grows, from above when it falls
  function roll(el, dir) {
    if (still || !el || !dir) return;
    el.animate([
      { transform: `translateY(${dir > 0 ? 55 : -55}%)`, opacity: 0, filter: 'blur(4px)' },
      { transform: 'none', opacity: 1, filter: 'blur(0)' },
    ], { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' });
  }

  // quantity is set right where the item is: "Add" turns into − n + on the card, the table row and the detail
  function stepperFor(btn) {
    if (btn._step) return btn._step;
    const el = document.createElement('span');
    el.className = 'qty qty--inline' + (btn.classList.contains('add--row') ? ' qty--row' : '') + (btn.classList.contains('add--big') ? ' qty--big' : '');
    el.hidden = true;
    el.innerHTML = '<button type="button" data-q="-1">−</button><input type="number" inputmode="numeric" min="0" max="999" step="1"><span class="qty__unit" hidden></span><button type="button" data-q="1">+</button>';
    el.addEventListener('click', (e) => {
      const q = e.target.closest('[data-q]');
      if (q) { if (Number(q.dataset.q) > 0) fly(btn); setQty(btn.dataset.add, (list[btn.dataset.add] || 0) + Number(q.dataset.q), btn); }
    });
    const input = el.querySelector('input');
    input.addEventListener('change', () => setQty(btn.dataset.add, Number(input.value), btn));
    input.addEventListener('focus', () => input.select());
    btn.after(el);
    btn._step = el;
    return el;
  }
  function setQty(code, v, btn) {
    v = Math.max(0, Math.min(999, Math.round(v) || 0));
    const was = list[code] || 0;
    if (v === 0) delete list[code]; else list[code] = v;
    save(); syncButtons(); if (drawer.open) renderList();
    if (was > 0 && v > 0 && v !== was) $$(`[data-add="${code}"]`).forEach((b) => b._step && roll($('input', b._step), v > was ? 1 : -1));
    if (v === 0 && btn) btn.focus();
  }
  function syncButtons() {
    $$('[data-add]').forEach((b) => {
      const code = b.dataset.add;
      const it = itemOf(code);
      if (!it) return;
      const p = { ...it.p, n: it.name };
      const q = list[code] || 0;
      const st = stepperFor(b);
      const appears = st.hidden && q > 0;
      b.hidden = q > 0;
      st.hidden = q === 0;
      if (appears && !still) { st.classList.remove('is-new'); void st.offsetWidth; st.classList.add('is-new'); }
      b.textContent = S.add;
      b.removeAttribute('aria-pressed');
      const input = $('input', st);
      if (document.activeElement !== input) input.value = q;
      input.setAttribute('aria-label', `${S.qty}: ${p.n}`);
      const [minus, plus] = $$('[data-q]', st);
      minus.setAttribute('aria-label', `${q <= 1 ? S.remove : S.less}: ${p.n}`);
      plus.setAttribute('aria-label', `${S.more}: ${p.n}`);
      const unit = $('.qty__unit', st);
      unit.hidden = !p.kg; unit.textContent = p.kg ? S.kg : '';
    });
    // "Choose" on a card says how many of its options are in the list
    $$('[data-choose]').forEach((b) => {
      const c = b.dataset.choose;
      const m = Object.keys(list).filter((k) => splitKey(k).code === c).length;
      b.textContent = m ? `${S.choose} (${m})` : S.choose;
      b.classList.toggle('add--has', m > 0);
    });
    const n = Object.keys(list).length;
    if (still && n > (fabN ?? n)) bumpBasket();
    fabN = n;
    $$('[data-count]').forEach((c) => { if (c.textContent !== String(n)) { const was = Number(c.textContent) || 0; c.textContent = n; roll(c, n > was ? 1 : -1); } });
    $$('[data-open-list]').forEach((b) => b.toggleAttribute('data-has', n > 0));
    $$('.fab').forEach((b) => b.setAttribute('aria-label', fmt(S.cartLabel, { n: countText(n) })));
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    fly(b);
    setQty(b.dataset.add, 1, null);
    $('[data-q="1"]', stepperFor(b)).focus();
  });

  const lineSum = (k) => (priceOf(splitKey(k).code) ?? 0) * list[k];
  const sum = () => Object.keys(list).reduce((a, k) => a + lineSum(k), 0);
  const el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text !== undefined) x.textContent = text; return x; };

  let lastOrder = null;
  function renderList() {
    const codes = Object.keys(list);
    body.innerHTML = '';
    foot.innerHTML = '';
    $('#drawer-title').textContent = quote && !quote.gone ? fmt(S.quoteTitle, { n: quote.number }) : S.list;
    if (lastOrder) return renderDone();
    if (quote) return renderQuote();
    if (lastInquiry) return renderInquiryDone();
    if (!codes.length) {
      const box = el('div', 'drawer__empty');
      box.append(el('b', '', S.emptyTitle), el('p', '', S.emptyText));
      const a = el('a', 'btn btn--quiet', S.browse); a.href = '#catalogue'; a.dataset.close = '';
      box.append(a);
      body.append(box);
      return;
    }
    for (const code of codes) {
      const it = itemOf(code);
      if (!it) continue;
      const p = it.p;
      const pr = priceOf(it.code);
      const row = el('div', 'line');
      row.innerHTML = `
        <span class="line__img">${p.ph[0] ? `<img src="${photo(p.ph[0][0])}" alt="" width="56" height="56">` : ''}</span>
        <span class="line__name"></span>
        <span class="line__sum"></span>
        <div class="line__ctl">
          <span class="qty">
            <button type="button" data-step="-1"></button>
            <input type="number" inputmode="numeric" min="1" max="999" step="1">
            <button type="button" data-step="1"></button>
            ${p.kg ? '<span class="qty__unit"></span>' : ''}
          </span>
          <button class="line__remove" type="button" data-remove></button>
        </div>`;
      const name = $('.line__name', row);
      name.textContent = p.n;
      const sub = el('span', 'line__sub');
      if (it.o) sub.append(el('span', 'line__opt', it.o.l));
      if (!p.kg) sub.append(el('span', '', it.sku));
      if (pr !== null) sub.append(el('span', '', `${money.format(pr)}${p.kg ? ` ${S.perKg}` : ''}`));
      if (it.out) sub.append(el('span', 'line__out', S.outOfStock));
      name.append(sub);
      const lineTotal = $('.line__sum', row);
      lineTotal.textContent = pr === null ? '' : money.format(lineSum(code));
      const input = $('input', row);
      input.value = list[code];
      input.setAttribute('aria-label', `${S.qty}: ${it.name}`);
      const [minus, plus] = $$('[data-step]', row);
      minus.textContent = '−'; minus.setAttribute('aria-label', `${S.less}: ${it.name}`); minus.disabled = list[code] <= 1;
      plus.textContent = '+'; plus.setAttribute('aria-label', `${S.more}: ${it.name}`);
      if (p.kg) $('.qty__unit', row).textContent = S.kg;
      const rm = $('[data-remove]', row);
      rm.textContent = S.remove; rm.setAttribute('aria-label', `${S.remove}: ${it.name}`);
      const set = (v) => {
        list[code] = Math.max(1, Math.min(999, Math.round(v) || 1));
        input.value = list[code]; minus.disabled = list[code] <= 1;
        if (pr !== null) lineTotal.textContent = money.format(lineSum(code));
        const t = $('[data-total]', foot); if (t) t.textContent = money.format(sum());
        save(); syncButtons();
      };
      minus.addEventListener('click', () => set(list[code] - 1));
      plus.addEventListener('click', () => set(list[code] + 1));
      input.addEventListener('change', () => set(Number(input.value)));
      rm.addEventListener('click', () => {
        delete list[code]; save(); syncButtons(); renderList();
        (body.querySelector('[data-remove]') || $('[data-close]', drawer)).focus();
      });
      body.append(row);
    }
    if (prices) renderListFoot(); else renderGuestFoot();
  }

  function listActions() {
    const help = el('p', 'drawer__help'); help.setAttribute('aria-live', 'polite'); help.id = 'order-help';
    const copy = el('button', 'textbtn', S.copy); copy.type = 'button';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(listText()); help.textContent = S.copied; } catch { help.textContent = S.copyFailed; }
    });
    const clear = el('button', 'textbtn', S.clearList); clear.type = 'button';
    clear.addEventListener('click', () => { list = {}; save(); syncButtons(); renderList(); $('[data-close]', drawer).focus(); });
    const row = el('div', 'drawer__more'); row.append(copy, clear);
    return { help, row };
  }

  // two ways on from the list: a priest of the Eparchy types his email and sees the prices here;
  // anyone else sends the list to the warehouse, which answers with a quote
  function renderGuestFoot() {
    const gate = el('form', 'gate'); gate.noValidate = true;
    const label = el('label', 'gate__label', S.gateLead); label.htmlFor = 'gate-email';
    const input = el('input'); input.id = 'gate-email'; input.name = 'email'; input.type = 'email';
    input.autocomplete = 'email'; input.inputMode = 'email'; input.spellcheck = false; input.placeholder = S.emailPlaceholder;
    const go = el('button', 'btn btn--primary', S.showPrices); go.type = 'submit';
    const gateHelp = el('p', 'drawer__help'); gateHelp.id = 'gate-help'; gateHelp.setAttribute('aria-live', 'polite');
    gate.append(el('b', 'gate__title', S.gatePriest), label, input, go, gateHelp);
    input.addEventListener('input', () => input.removeAttribute('aria-invalid'));
    gate.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = input.value.trim().toLowerCase();
      const wrong = (msg) => { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', 'gate-help'); gateHelp.textContent = msg; input.focus(); };
      if (!emailOk(email)) return wrong(email ? S.loginInvalid : S.emailMissing);
      go.disabled = true; go.setAttribute('aria-busy', 'true'); gateHelp.textContent = S.checking;
      let result = 'failed';
      try { result = await checkEmail(email); } catch { result = 'failed'; }
      if (result === 'ok') { store.set('ek-welcome', 1); $('input', foot)?.focus(); return; }
      go.disabled = false; go.removeAttribute('aria-busy');
      wrong({ unknown: S.gateUnknown, too_many: S.loginTooMany, invalid: S.loginInvalid }[result] || S.loginFailed);
    });

    const other = el('div', 'gate-other');
    const ask = el('button', 'btn btn--quiet', S.askPrices); ask.type = 'button';
    ask.addEventListener('click', () => { foot.innerHTML = ''; renderInquiryForm(); $('#iq-email', foot)?.focus(); });
    other.append(el('b', 'gate__title', S.gateOther), el('p', 'drawer__guest', S.gateOtherLead), ask);

    const { help, row } = listActions();
    if (D.api) foot.append(gate, other);
    else foot.append(el('p', 'drawer__guest', S.guestList));
    foot.append(help, row);
  }

  const formField = (prefix, saved) => (name, label, type = 'text', opt = false, tag = 'input', auto = '') => {
    const wrap = el('div', 'field');
    const id = `${prefix}-${name}`;
    const lab = el('label', '', label); lab.htmlFor = id;
    if (opt) lab.append(el('span', 'field__opt', ` (${S.optional})`));
    const input = el(tag); input.id = id; input.name = name;
    if (tag === 'input') input.type = type;
    if (tag === 'textarea') input.rows = 2;
    if (auto) input.autocomplete = auto;
    if (type === 'email') { input.inputMode = 'email'; input.spellcheck = false; }
    input.maxLength = name === 'note' ? 1000 : name === 'address' ? 300 : 160;
    input.value = name === 'name' && D.lang === 'sr' ? R.toCyrillic(saved.name) : saved[name] || '';
    wrap.append(lab, input);
    return wrap;
  };
  const emailOk = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

  let lastInquiry = null;
  function renderInquiryForm() {
    const form = el('form', 'order-form'); form.noValidate = true;
    const saved = { ...store.get('ek-form', {}), email: store.get('ek-inq-email') || '' };
    const field = formField('iq', saved);
    const grid = el('div', 'order-form__grid');
    grid.append(field('name', S.formName, 'text', false, 'input', 'name'), field('email', S.emailLabel, 'email', false, 'input', 'email'),
      field('parish', S.formParish, 'text', true, 'input', 'organization'), field('phone', S.formPhone, 'tel', true, 'input', 'tel'));
    const note = field('note', S.formNote, 'text', true, 'textarea');
    // left empty by people; filled by robots
    const trap = el('div', 'trap'); trap.setAttribute('aria-hidden', 'true');
    const hp = el('input'); hp.name = 'website'; hp.tabIndex = -1; hp.autocomplete = 'off'; trap.append(hp);
    const send = el('button', 'btn btn--primary', S.inqSend); send.type = 'submit';
    const help = el('p', 'drawer__help'); help.setAttribute('aria-live', 'polite'); help.id = 'inq-help';
    const back = el('button', 'textbtn', S.cancel); back.type = 'button';
    back.addEventListener('click', () => renderList());
    form.append(el('p', 'drawer__guest', S.guestList), grid, note, trap, send, help, back);
    foot.append(form);
    form.addEventListener('input', (e) => e.target.removeAttribute('aria-invalid'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const email = String(data.email || '').trim().toLowerCase();
      const input = $('#iq-email', form);
      if (!emailOk(email)) {
        input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', 'inq-help');
        help.textContent = email ? S.loginInvalid : S.emailMissing; input.focus(); return;
      }
      input.removeAttribute('aria-invalid');
      store.set('ek-inq-email', email);
      store.set('ek-form', { ...store.get('ek-form', {}), name: data.name, parish: data.parish, phone: data.phone });
      send.disabled = true; send.setAttribute('aria-busy', 'true'); send.textContent = S.sending; help.textContent = '';
      let res = null;
      try {
        res = await api('order', { action: 'inquiry', lang: D.lang, items: payload(), ...data, email });
      } catch { res = null; }
      send.disabled = false; send.removeAttribute('aria-busy'); send.textContent = S.inqSend;
      if (res && res.status === 200 && res.data.ok) { lastInquiry = res.data; renderList(); $('[data-done-close]', foot)?.focus(); return; }
      help.textContent = res && res.status === 429 ? S.inqTooMany
        : res && res.data?.error === 'choose' ? fmt(S.orderChoose, { codes: (res.data.codes || []).join(', ') })
        : res && res.status === 400 && res.data?.error === 'invalid' ? S.loginInvalid : S.inqFailed;
    });
  }
  function renderInquiryDone() {
    const box = el('div', 'drawer__done');
    box.setAttribute('role', 'status');
    box.append(el('b', '', S.inqDone), el('p', '', S.inqDoneText));
    body.append(box);
    const row = el('div', 'drawer__actions');
    const ok = el('button', 'btn btn--quiet', S.done); ok.type = 'button'; ok.dataset.doneClose = '';
    ok.addEventListener('click', () => { lastInquiry = null; drawer.close(); });
    row.append(ok);
    foot.append(row);
  }

  // ---------- a quote from the warehouse, opened from its email: order it as it is ----------
  let quote = null;
  async function loadQuote(token) {
    let r = null;
    try { r = await api('order', { action: 'quote-get', token }); } catch { r = null; }
    quote = r && r.status === 200 && r.data.lines ? { ...r.data, token } : { gone: true };
    renderList();
    drawer.showModal();
  }
  function renderQuote() {
    if (quote.gone) {
      const box = el('div', 'drawer__empty');
      box.append(el('p', '', S.quoteGone));
      body.append(box);
      return;
    }
    const lead = el('p', 'drawer__guest', S.quoteLead);
    body.append(lead);
    for (const l of quote.lines) {
      const row = el('div', 'line line--quote');
      const p = D.p[l.code];
      row.innerHTML = `<span class="line__img">${p?.ph?.[0] ? `<img src="${photo(p.ph[0][0])}" alt="" width="56" height="56">` : ''}</span><span class="line__name"></span><span class="line__sum"></span>`;
      const name = $('.line__name', row);
      name.textContent = l.name;
      const sub = el('span', 'line__sub');
      sub.append(el('span', '', l.sku || l.code), el('span', '', `${l.qty}${l.unit === 'kg' ? ` ${S.kg}` : ''} × ${money.format(l.price)}${l.unit === 'kg' ? ` ${S.perKg}` : ''}`));
      name.append(sub);
      $('.line__sum', row).textContent = money.format(l.price * l.qty);
      body.append(row);
    }
    const form = el('form', 'order-form'); form.noValidate = true;
    const field = formField('qf', { name: quote.name, parish: quote.parish, phone: quote.phone, address: store.get('ek-form', {}).address });
    const total = el('p', 'drawer__total');
    total.append(el('span', '', S.total), el('b', '', money.format(quote.total)));
    const grid = el('div', 'order-form__grid');
    grid.append(field('name', S.formName, 'text', false, 'input', 'name'), field('parish', S.formParish, 'text', true, 'input', 'organization'),
      field('phone', S.formPhone, 'tel', true, 'input', 'tel'), field('address', S.formAddress, 'text', true, 'input', 'street-address'));
    const note = field('note', S.formNote, 'text', true, 'textarea');
    const send = el('button', 'btn btn--primary', S.quoteOrder); send.type = 'submit';
    const help = el('p', 'drawer__help'); help.setAttribute('aria-live', 'polite'); help.id = 'quote-help';
    form.append(total, el('p', 'drawer__member', `${S.quoteFor}: ${quote.email}`), grid, note, send, help);
    foot.append(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const nameInput = $('#qf-name', form);
      if (String(data.name || '').trim().length < 2) {
        nameInput.setAttribute('aria-invalid', 'true'); nameInput.setAttribute('aria-describedby', 'quote-help');
        help.textContent = S.nameMissing; nameInput.focus(); return;
      }
      send.disabled = true; send.setAttribute('aria-busy', 'true'); send.textContent = S.sending; help.textContent = '';
      let res = null;
      try { res = await api('order', { action: 'quote-order', token: quote.token, ...data }); } catch { res = null; }
      send.disabled = false; send.removeAttribute('aria-busy'); send.textContent = S.quoteOrder;
      if (res && res.status === 200 && res.data.number) { lastOrder = res.data; quote = null; renderList(); $('[data-done-pdf]', foot)?.focus(); return; }
      if (res && (res.status === 404 || res.status === 410)) { quote = { gone: true }; renderList(); return; }
      help.textContent = res && res.data?.error === 'unavailable' ? fmt(S.orderUnavailable, { codes: (res.data.codes || []).join(', ') }) : S.orderFailed;
    });
  }

  // members: the foot of the list is the total and one button; the details come on the next screen
  function renderListFoot() {
    const total = el('p', 'drawer__total');
    total.append(el('span', '', S.total));
    const tb = el('b', '', money.format(sum())); tb.dataset.total = '';
    total.append(tb);
    const next = el('a', 'btn btn--primary', S.listNext); next.href = D.checkout;
    const { help, row } = listActions();
    foot.append(total, next, help, row);
  }

  function renderDone() {
    const o = lastOrder;
    const box = el('div', 'drawer__done');
    box.setAttribute('role', 'status');
    box.insertAdjacentHTML('afterbegin', '<svg class="done__check" viewBox="0 0 52 52" width="56" height="56" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l8 8 15-17"/></svg>');
    box.append(el('b', '', fmt(S.orderDone, { n: o.number })), el('p', '', o.emailed ? S.orderDoneMail : S.orderDoneNoMail));
    body.append(box);
    let url = '';
    const row = el('div', 'drawer__actions');
    if (o.pdf) {
      const bytes = Uint8Array.from(atob(o.pdf), (c) => c.charCodeAt(0));
      url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = el('a', 'btn btn--primary', S.downloadPdf); a.href = url; a.download = o.filename; a.dataset.donePdf = '';
      row.append(a);
    }
    if (D.account && prices) { const a = el('a', 'btn btn--quiet', S.acLink); a.href = D.account; row.append(a); }
    const ok = el('button', 'btn btn--quiet', S.done); ok.type = 'button';
    if (!o.pdf) ok.dataset.donePdf = '';
    ok.addEventListener('click', () => { lastOrder = null; if (url) URL.revokeObjectURL(url); drawer.close(); });
    row.append(ok);
    foot.append(row);
  }

  function listText() {
    const lines = Object.keys(list).map((k) => itemOf(k) && [k, itemOf(k)]).filter(Boolean).map(([k, it]) => {
      const pr = priceOf(it.code);
      const price = pr === null ? '' : `  (${money.format(pr)}${it.p.kg ? ` ${S.perKg}` : ''})  = ${money.format(lineSum(k))}`;
      return it.p.kg ? `${list[k]} ${S.kg}  ${it.name}${price}` : `${list[k]} ×  ${it.sku}  ${it.name}${price}`;
    });
    return `${S.mailHello}\n\n${lines.join('\n')}${prices ? `\n\n${S.total}: ${money.format(sum())}` : ''}\n\n${D.mailFields.join('\n')}\n`;
  }

  let opener = null;
  $$('[data-open-list]').forEach((b) => b.addEventListener('click', () => {
    opener = b; renderList(); drawer.showModal();
    if (still) return;
    b.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.86)', offset: 0.25 }, { transform: 'scale(1.1)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 480, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    drawer.classList.add('opening'); clearTimeout(drawer._op); drawer._op = setTimeout(() => drawer.classList.remove('opening'), 2200);
    const tot = $('.drawer__total b', foot);
    if (tot) countTo(tot);
  }));
  // the total counts up from nothing when the basket opens
  function countTo(node) {
    const full = node.textContent, m = full.match(/\d[\d.,\s\u00a0]*/);
    if (!m) return;
    const digits = m[0].replace(/[^\d]/g, ''), dec = /[.,]\d{1,2}\s*$/.test(m[0].trim()) ? m[0].trim().match(/[.,](\d{1,2})$/)[1].length : 0;
    const to = Number(digits) / 10 ** dec;
    if (!(to > 0)) return;
    const t0 = performance.now() + 350, dur = 1000;
    node.textContent = full.replace(m[0], money.format(0).replace(/[^\d.,\s\u00a0]/g, '').trim());
    const tick = (now) => {
      const k = Math.min(1, Math.max(0, (now - t0) / dur));
      node.textContent = k >= 1 ? full : full.replace(m[0], money.format(to * (1 - (1 - k) ** 3)).replace(/[^\d.,\s\u00a0]/g, '').trim());
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  drawer.addEventListener('close', () => { lastOrder = null; lastInquiry = null; quote = null; });

  // ---------- product detail ----------
  const detail = $('[data-detail-dialog]');
  const dImg = new Image();
  dImg.decoding = 'async';
  $('[data-detail-photo]').append(dImg);
  const dThumbs = $('[data-detail-thumbs]');
  const dAdd = $('[data-detail-add]');
  const dPrice = $('[data-detail-price]');
  let dCode = null;
  function paintDetailPrice() {
    const v = priceOf(dCode);
    dPrice.hidden = v === null;
    dPrice.textContent = v === null ? '' : money.format(v) + (D.p[dCode].kg ? ` ${S.perKg}` : '');
  }
  // the options of an article: one row each, with its own Add; a search box when the list is long
  const dOpts = $('[data-detail-opts]');
  const dOptsList = $('[data-opts-list]');
  const dOptsQ = $('[data-opts-q]');
  const dOptsNone = $('[data-opts-none]');
  function drawOpts(code) {
    const p = D.p[code];
    $('[data-opts-head]').textContent = fmt(S.optsHead, { n: p.o.length });
    $('[data-opts-findbox]').hidden = p.o.length < 8;
    dOptsList.innerHTML = '';
    detail.classList.toggle('detail--many', p.o.length > 12);
    for (const [id, l, sku, out] of p.o) {
      const li = el('li', `opt${out ? ' opt--out' : ''}`);
      li.dataset.search = norm(`${l} ${sku}`);
      const txt = el('span', 'opt__text');
      txt.append(el('span', 'opt__name', l), el('span', 'opt__code', sku));
      li.append(txt);
      if (out) li.append(el('span', 'opt__out', S.outOfStock));
      else {
        const b = el('button', 'add add--row', S.add); b.type = 'button';
        b.dataset.add = keyOf(code, id);
        li.append(b);
      }
      dOptsList.append(li);
    }
  }
  function filterOpts() {
    const terms = norm(dOptsQ.value).split(' ').filter(Boolean);
    let n = 0;
    $$('li', dOptsList).forEach((li) => { const hit = terms.every((t) => li.dataset.search.includes(t)); li.hidden = !hit; if (hit) n++; });
    dOptsNone.hidden = n > 0;
  }
  dOptsQ.addEventListener('input', filterOpts);
  dOptsQ.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dOptsQ.value) { e.preventDefault(); dOptsQ.value = ''; filterOpts(); } });

  function show(i) {
    const p = D.p[dCode];
    if (!p.ph.length) return;
    const [f, w, h] = p.ph[i];
    dImg.src = photo(f, false); dImg.width = w; dImg.height = h; dImg.alt = p.n;
    $$('button', dThumbs).forEach((b, j) => b.setAttribute('aria-current', j === i ? 'true' : 'false'));
  }
  // a few more articles of the same category, with a photo, nearest by code first
  const dRelated = $('[data-detail-related]');
  const dRelList = $('[data-related-list]');
  function drawRelated(code) {
    const me = D.p[code];
    const keys = Object.keys(D.p);
    const at = keys.indexOf(code);
    const more = keys.filter((k) => k !== code && D.p[k].c === me.c && D.p[k].ph.length)
      .sort((x, y) => Math.abs(keys.indexOf(x) - at) - Math.abs(keys.indexOf(y) - at)).slice(0, 4);
    dRelList.innerHTML = '';
    dRelated.hidden = !more.length;
    for (const k of more) {
      const li = el('li', 'related__item');
      const b = el('button', 'related__btn'); b.type = 'button';
      const img = new Image(); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.src = photo(D.p[k].ph[0][0]);
      b.append(img, el('span', 'related__name', D.p[k].n));
      b.addEventListener('click', () => openDetail(k, opener));
      li.append(b); dRelList.append(li);
    }
  }
  // the detail grows out of the card that was clicked
  function flipOpen(from) {
    if (reduced()) return;
    const src = from?.closest?.('.card, tr, .shelf, li, .opt') || from;
    const r = detail.getBoundingClientRect();
    const a = src?.getClientRects?.().length ? src.getBoundingClientRect() : null;
    const start = a && r.width
      ? { transform: `translate(${a.left - r.left}px, ${a.top - r.top}px) scale(${Math.max(0.2, a.width / r.width)}, ${Math.max(0.2, a.height / r.height)})`, opacity: 0.15, filter: 'blur(10px)' }
      : { transform: 'translateY(18px) scale(0.94)', opacity: 0, filter: 'blur(10px)' };
    detail.style.transformOrigin = a ? '0 0' : '50% 50%';
    detail.animate([start, { transform: 'none', opacity: 1, filter: 'blur(0)' }], { duration: 600, easing: 'cubic-bezier(.22,1,.36,1)' });
  }
  function openDetail(code, from) {
    const p = D.p[code];
    if (!p || (!p.ph.length && !p.o)) return false;
    dCode = code; opener = from;
    $('[data-detail-name]').textContent = p.n;
    $('[data-detail-cat]').textContent = D.cats[p.c];
    $('[data-detail-code]').textContent = `${S.code} ${code}`;
    const stock = $('[data-detail-stock]');
    stock.hidden = !!p.o || !!p.out; stock.textContent = S.inStock;
    drawRelated(code);
    paintDetailPrice();
    const note = $('[data-detail-note]');
    note.hidden = !p.note; note.textContent = p.note || '';
    dThumbs.innerHTML = '';
    if (p.ph.length > 1) p.ph.forEach(([f], i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', fmt(S.photoOf, { i: i + 1, n: p.ph.length }));
      b.innerHTML = `<img src="${photo(f)}" alt="">`;
      b.addEventListener('click', () => show(i));
      dThumbs.append(b);
    });
    $('[data-detail-photo]').hidden = !p.ph.length;
    dOpts.hidden = !p.o;
    if (p.o) {
      // the article is chosen through its options; a search that found it by a saint's name narrows them
      delete dAdd.dataset.add;
      if (dAdd._step) dAdd._step.hidden = true;
      dAdd.hidden = true;
      drawOpts(code);
      const t = norm(q.value).split(' ').filter(Boolean);
      const own = norm(`${p.n} ${code}`);
      dOptsQ.value = t.length && !t.every((x) => own.includes(x)) && p.o.some(([, l, sku]) => t.every((x) => norm(`${l} ${sku}`).includes(x))) ? q.value.trim() : '';
      filterOpts();
    } else if (p.out) {
      delete dAdd.dataset.add;
      if (dAdd._step) dAdd._step.hidden = true;
      dAdd.hidden = false; dAdd.disabled = true; dAdd.textContent = S.outOfStock;
      dAdd.setAttribute('aria-label', `${S.outOfStock}: ${p.n}`);
    } else {
      dAdd.disabled = false;
      dAdd.dataset.add = code;
      dAdd.setAttribute('aria-label', fmt(D.addLabel, { name: p.n }));
    }
    show(0); syncButtons();
    const wasOpen = detail.open;
    if (!wasOpen) { detail.showModal(); flipOpen(from); }
    detail.scrollTop = 0;
    // on a phone the search box would open the keyboard: start on the first option instead
    if (p.o) ($('.opt:not([hidden]) [data-add]', dOptsList) || $('[data-close]', detail)).focus({ preventScroll: true });
    return true;
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-detail]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (openDetail(a.dataset.detail, a.closest('.card')?.querySelector('.card__name a') || a)) e.preventDefault();
  });
  // "Choose" on a card opens the article with its options
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-choose]');
    if (b) openDetail(b.dataset.choose, b);
  });

  // ---------- dialogs: close on button, backdrop, Escape; focus returns ----------
  [detail, drawer, welcome].forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
    });
    dlg.addEventListener('close', () => { if (opener && document.contains(opener) && !welcome.open && !loginDialog.open && !drawer.open) opener.focus(); opener = null; });
  });

  // ---------- the live catalogue: what the admin changed shows without a rebuild ----------
  async function refreshCatalogue() {
    const head = { apikey: D.api.key };
    const cols = 'code,category,name_fr,name_en,name_sr,note_fr,note_en,note_sr,unit,available,photos,sort';
    const [rc, rp, ro] = await Promise.all([
      fetch(`${D.api.url}/rest/v1/categories?select=*&order=sort`, { headers: head }),
      fetch(`${D.api.url}/rest/v1/products?select=${cols}&active=eq.true&order=sort`, { headers: head }),
      fetch(`${D.api.url}/rest/v1/options?select=id,product,sku,label_sr,label_fr,label_en,available,active,sort&active=eq.true&order=product,sort`, { headers: head }),
    ]);
    if (!rc.ok || !rp.ok || !ro.ok) return;
    const model = R.fromDb(await rc.json(), await rp.json(), await ro.json());
    if (!model.products.length) return;
    const ctx = { lang: D.lang, S: { ...S, ...{ items: D.items, sizes: D.sizes, locale: D.locale } }, root };
    const fresh = R.clientData(model, ctx);
    const sig = (p) => JSON.stringify(p);
    const same = sig(fresh.p) === sig(D.p) && sig(fresh.cats) === sig(D.cats) && Object.keys(fresh.p).join() === Object.keys(D.p).join();
    if (same) return;
    D.p = fresh.p; D.cats = fresh.cats;
    indexOptions();
    $('[data-shelves]').innerHTML = R.shelves(model, ctx);
    rail.innerHTML = R.chips(model, ctx);
    const host = $('[data-sections]');
    $$('[data-cat]', host).forEach((c) => c.remove());
    host.insertAdjacentHTML('beforeend', R.sections(model, ctx));
    defaultStatus = R.countText(ctx.S, model.products.length);
    for (const k of Object.keys(list)) if (!itemOf(k)) delete list[k];
    save();
    collect(); observe(); syncButtons(); paintPrices();
    filter(q.value);
  }

  // ---------- start ----------
  syncButtons();
  paintPrices();
  if (D.api) {
    refreshCatalogue().catch(() => { /* offline: the page as built stays */ });
    const email = store.get('ek-email');
    if (email) {
      checkEmail(email).then((r) => { if (r === 'unknown') signOut(); }).catch(() => { /* offline: no prices this time */ });
    }
    const token = new URLSearchParams(location.search).get('ponuda');
    if (token) {
      store.set('ek-welcome', 1);
      history.replaceState(null, '', location.pathname + location.hash);
      loadQuote(token);
    } else if (!store.get('ek-welcome')) {
      introDone.then(openWelcome);
    }
  }
  // "Order again" on the account page comes back here with the list filled
  if (location.hash === '#liste') {
    history.replaceState(null, '', location.pathname + location.search);
    if (!welcome.open) { renderList(); drawer.showModal(); }
  }
})();

// ----- entering the page: the name types itself, articles rise out of a blur as they come into view -----
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const h = document.querySelector('.hero h1');
  const after = window.__introDone || Promise.resolve();
  if (h && !h.children.length) {
    const text = h.textContent;
    h.setAttribute('aria-label', text);
    h.style.minHeight = `${h.offsetHeight}px`;
    h.textContent = ' ';
    let n = 0;
    after.then(() => setTimeout(() => {
      const t = setInterval(() => { n++; h.textContent = text.slice(0, n); if (n >= text.length) { clearInterval(t); h.removeAttribute('aria-label'); h.style.minHeight = ''; } }, 34);
    }, 250));
  }
  const cards = [...document.querySelectorAll('.card')];
  cards.forEach((c) => c.classList.add('pre'));
  const io = new IntersectionObserver((entries) => {
    let n = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.style.setProperty('--rd', String(n++ % 8));
      e.target.classList.remove('pre');
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -5% 0px' });
  after.then(() => cards.forEach((c) => io.observe(c)));
})();

// ----- dialogs close the way they open: they shrink back and blur out -----
(() => {
  const nativeClose = HTMLDialogElement.prototype.close, nativeShow = HTMLDialogElement.prototype.showModal;
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  HTMLDialogElement.prototype.close = function (v) {
    if (calm() || !this.open || this._closing || !this.matches('.welcome, .detail, .drawer')) return nativeClose.call(this, v);
    this._closing = true;
    this.classList.add('closing');
    setTimeout(() => { this._closing = false; this.classList.remove('closing'); nativeClose.call(this, v); }, 280);
  };
  HTMLDialogElement.prototype.showModal = function () {
    if (this._closing) { this._closing = false; this.classList.remove('closing'); nativeClose.call(this); }
    return nativeShow.call(this);
  };
  document.querySelectorAll('dialog.welcome, dialog.detail, dialog.drawer').forEach((d) => d.addEventListener('cancel', (e) => { if (!calm()) { e.preventDefault(); d.close(); } }));
})();
