// Catalogue: search, category chips, product detail and the order list.
// Everything on the page works without this file; it only adds the tools.
(() => {
  const D = JSON.parse(document.getElementById('catalogue-data').textContent);
  const S = D.s;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = document.querySelector('link[rel="icon"]').getAttribute('href').replace('favicon.svg', '');
  const money = new Intl.NumberFormat(D.locale, { style: 'currency', currency: 'EUR' });
  const plural = new Intl.PluralRules(D.locale);
  const countText = (n, forms = D.items) => `${n} ${forms[plural.select(n)] ?? forms.other}`;
  const fmt = (s, v) => Object.entries(v).reduce((a, [k, x]) => a.replace(`{${k}}`, x), s);
  const photo = (f, small = true) => `${root}assets/img/p/${f}${small ? '-s' : ''}.webp`;

  // ---------- search ----------
  const CYR = { а:'a',б:'b',в:'v',г:'g',д:'d',ђ:'dj',е:'e',ж:'z',з:'z',и:'i',ј:'j',к:'k',л:'l',љ:'lj',м:'m',н:'n',њ:'nj',о:'o',п:'p',р:'r',с:'s',т:'t',ћ:'c',у:'u',ф:'f',х:'h',ц:'c',ч:'c',џ:'dz',ш:'s',đ:'dj' };
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[а-шђјљњћџđ]/g, (c) => CYR[c] ?? c).replace(/[’'`]/g, ' ').replace(/\s+/g, ' ').trim();

  const q = $('#q');
  const qHero = $('#q-hero');
  const clearBtn = $('[data-clear]');
  const status = $('[data-status]');
  const noMatch = $('[data-nomatch]');
  const cats = $$('[data-cat]');
  const items = $$('[data-search]');
  const chips = $$('[data-chip]');
  const total = $$('.card').length;
  const defaultStatus = status.textContent;

  $$('[data-js], [data-find], [data-open-list]').forEach((el) => el.removeAttribute('hidden'));

  function filter(raw) {
    const terms = norm(raw).split(' ').filter(Boolean);
    let shown = 0;
    items.forEach((el) => {
      const hit = terms.every((t) => el.dataset.search.includes(t));
      el.hidden = !hit;
      if (hit && el.classList.contains('card')) shown++;
      if (hit && el.tagName === 'TR') shown++;
    });
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
  clearBtn.addEventListener('click', () => { q.value = ''; filter(''); q.focus(); });
  $('[data-find]').addEventListener('submit', (e) => {
    e.preventDefault();
    q.value = qHero.value;
    filter(q.value);
    document.getElementById('catalogue').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    q.focus({ preventScroll: true });
  });
  // a category link clears a search that would hide its section
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', () => {
    const target = document.getElementById(a.getAttribute('href').slice(1));
    if (target && target.hidden && q.value) { q.value = ''; filter(''); }
  }));

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
  cats.forEach((c) => io.observe(c));

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

  // ---------- prices: only for an email on the clergy list, asked from the server ----------
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
  const who = $('[data-who]');
  const loginBtn = $('[data-login]');
  const logoutBtn = $('[data-logout]');
  function paintPrices() {
    document.documentElement.classList.toggle('priced', !!prices);
    $$('[data-price]').forEach((el) => {
      const v = priceOf(el.dataset.price);
      const kg = D.p[el.dataset.price]?.kg;
      el.textContent = v === null ? '' : money.format(v) + (kg && el.tagName !== 'TD' ? ` ${S.perKg}` : '');
    });
    if (account) {
      account.hidden = !D.api;
      loginBtn.hidden = !!prices;
      logoutBtn.hidden = !prices;
      who.hidden = !prices;
      who.textContent = prices ? fmt(S.pricesFor, { who: priest?.name || store.get('ek-email') || '' }) : '';
    }
    if (drawer.open) renderList();
    if (detail.open && dCode) paintDetailPrice();
  }
  async function checkEmail(email) {
    const { status, data } = await api('prices', { email });
    if (status === 200 && data.prices) {
      prices = data.prices; priest = data.priest || {};
      store.set('ek-email', email);
      const form = store.get('ek-form', {});
      store.set('ek-form', { name: form.name || priest.name || '', parish: form.parish || priest.parish || '', phone: form.phone || priest.phone || '', address: form.address || '' });
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
  logoutBtn?.addEventListener('click', () => { signOut(); loginBtn.focus(); });

  // ---------- the welcome: language, email, or carry on without prices ----------
  const welcome = $('[data-welcome]');
  const loginForm = $('[data-login-form]');
  const loginInput = $('#login-email');
  const loginHelp = $('[data-login-help]');
  const loginSubmit = $('[data-login-submit]');
  let afterLogin = null;
  function openWelcome(then = null) {
    if (!D.api) return;
    afterLogin = then;
    loginHelp.textContent = '';
    loginInput.removeAttribute('aria-invalid');
    loginInput.value = store.get('ek-email') || '';
    welcome.showModal();
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
      welcome.close();
      const then = afterLogin; afterLogin = null;
      if (then) then();
      return;
    }
    loginInput.setAttribute('aria-invalid', 'true');
    loginHelp.textContent = { unknown: S.loginUnknown, too_many: S.loginTooMany, invalid: S.loginInvalid }[result] || S.loginFailed;
    loginInput.focus();
  });
  $('[data-login-skip]').addEventListener('click', () => { store.set('ek-welcome', 1); welcome.close(); });
  welcome.addEventListener('cancel', () => store.set('ek-welcome', 1));
  loginBtn?.addEventListener('click', () => { opener = loginBtn; openWelcome(); });

  // ---------- the list ----------
  const KEY = 'eparhija-katalog-liste';
  let list = store.get(KEY, {}) || {};
  for (const k of Object.keys(list)) if (!D.p[k] || !(list[k] > 0)) delete list[k];
  const save = () => store.set(KEY, list);

  const drawer = $('[data-list-dialog]');
  const body = $('[data-list-body]');
  const foot = $('[data-list-foot]');

  // quantity is set right where the item is: "Add" turns into − n + on the card, the table row and the detail
  function stepperFor(btn) {
    if (btn._step) return btn._step;
    const el = document.createElement('span');
    el.className = 'qty qty--inline' + (btn.classList.contains('add--row') ? ' qty--row' : '') + (btn.classList.contains('add--big') ? ' qty--big' : '');
    el.hidden = true;
    el.innerHTML = '<button type="button" data-q="-1">−</button><input type="number" inputmode="numeric" min="0" max="999" step="1"><span class="qty__unit" hidden></span><button type="button" data-q="1">+</button>';
    el.addEventListener('click', (e) => {
      const q = e.target.closest('[data-q]');
      if (q) setQty(btn.dataset.add, (list[btn.dataset.add] || 0) + Number(q.dataset.q), btn);
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
    if (v === 0) delete list[code]; else list[code] = v;
    save(); syncButtons(); if (drawer.open) renderList();
    if (v === 0 && btn) btn.focus();
  }
  function syncButtons() {
    $$('[data-add]').forEach((b) => {
      const code = b.dataset.add;
      const p = D.p[code];
      if (!p) return;
      const q = list[code] || 0;
      const st = stepperFor(b);
      b.hidden = q > 0;
      st.hidden = q === 0;
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
    const n = Object.keys(list).length;
    $$('[data-count]').forEach((c) => { c.textContent = n; });
    $$('[data-open-list]').forEach((b) => b.toggleAttribute('data-has', n > 0));
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    setQty(b.dataset.add, 1, null);
    $('[data-q="1"]', stepperFor(b)).focus();
  });

  const lineSum = (code) => (priceOf(code) ?? 0) * list[code];
  const sum = () => Object.keys(list).reduce((a, k) => a + lineSum(k), 0);
  const el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text !== undefined) x.textContent = text; return x; };

  let lastOrder = null;
  function renderList() {
    const codes = Object.keys(list);
    body.innerHTML = '';
    foot.innerHTML = '';
    if (lastOrder) return renderDone();
    if (!codes.length) {
      const box = el('div', 'drawer__empty');
      box.append(el('b', '', S.emptyTitle), el('p', '', S.emptyText));
      const a = el('a', 'btn btn--quiet', S.browse); a.href = '#catalogue'; a.dataset.close = '';
      box.append(a);
      body.append(box);
      return;
    }
    for (const code of codes) {
      const p = D.p[code];
      const pr = priceOf(code);
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
      if (!p.kg) sub.append(el('span', '', code));
      if (pr !== null) sub.append(el('span', '', `${money.format(pr)}${p.kg ? ` ${S.perKg}` : ''}`));
      name.append(sub);
      const lineTotal = $('.line__sum', row);
      lineTotal.textContent = pr === null ? '' : money.format(lineSum(code));
      const input = $('input', row);
      input.value = list[code];
      input.setAttribute('aria-label', `${S.qty}: ${p.n}`);
      const [minus, plus] = $$('[data-step]', row);
      minus.textContent = '−'; minus.setAttribute('aria-label', `${S.less}: ${p.n}`); minus.disabled = list[code] <= 1;
      plus.textContent = '+'; plus.setAttribute('aria-label', `${S.more}: ${p.n}`);
      if (p.kg) $('.qty__unit', row).textContent = S.kg;
      const rm = $('[data-remove]', row);
      rm.textContent = S.remove; rm.setAttribute('aria-label', `${S.remove}: ${p.n}`);
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
    if (prices) renderOrderForm(); else renderGuestFoot();
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

  function renderGuestFoot() {
    const p = el('p', 'drawer__guest', S.guestList);
    const go = el('button', 'btn btn--primary', S.showPrices); go.type = 'button';
    go.addEventListener('click', () => { opener = $('.bar [data-open-list]'); drawer.close(); openWelcome(() => { renderList(); drawer.showModal(); }); });
    const { help, row } = listActions();
    foot.append(p, go, help, row);
    if (!D.api) go.hidden = true;
  }

  function renderOrderForm() {
    const form = el('form', 'order-form'); form.noValidate = true;
    const saved = store.get('ek-form', {});
    const field = (name, label, type = 'text', opt = false, tag = 'input', auto = '') => {
      const wrap = el('div', 'field');
      const id = `of-${name}`;
      const lab = el('label', '', label); lab.htmlFor = id;
      if (opt) lab.append(el('span', 'field__opt', ` (${S.optional})`));
      const input = el(tag); input.id = id; input.name = name;
      if (tag === 'input') input.type = type;
      if (tag === 'textarea') input.rows = 2;
      if (auto) input.autocomplete = auto;
      input.maxLength = name === 'note' ? 1000 : name === 'address' ? 300 : 160;
      input.value = saved[name] || '';
      input.addEventListener('change', () => { const f = store.get('ek-form', {}); f[name] = input.value; store.set('ek-form', f); });
      wrap.append(lab, input);
      return wrap;
    };
    const total = el('p', 'drawer__total');
    total.append(el('span', '', S.total));
    const tb = el('b', '', money.format(sum())); tb.dataset.total = '';
    total.append(tb);
    const grid = el('div', 'order-form__grid');
    grid.append(field('name', S.formName, 'text', false, 'input', 'name'), field('parish', S.formParish, 'text', true, 'input', 'organization'),
      field('phone', S.formPhone, 'tel', true, 'input', 'tel'), field('address', S.formAddress, 'text', true, 'input', 'street-address'));
    const note = field('note', S.formNote, 'text', true, 'textarea');
    const send = el('button', 'btn btn--primary', S.sendOrder); send.type = 'submit';
    const { help, row } = listActions();
    form.append(total, grid, note, send, help);
    foot.append(form, row);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const nameInput = $('#of-name', form);
      if (String(data.name || '').trim().length < 2) {
        nameInput.setAttribute('aria-invalid', 'true'); nameInput.setAttribute('aria-describedby', 'order-help');
        help.textContent = S.nameMissing; nameInput.focus(); return;
      }
      nameInput.removeAttribute('aria-invalid');
      store.set('ek-form', { name: data.name, parish: data.parish, phone: data.phone, address: data.address });
      send.disabled = true; send.setAttribute('aria-busy', 'true'); send.textContent = S.sending; help.textContent = '';
      let res = null;
      try {
        res = await api('order', { email: store.get('ek-email'), lang: D.lang, items: Object.entries(list).map(([code, qty]) => ({ code, qty })), ...data });
      } catch { res = null; }
      send.disabled = false; send.removeAttribute('aria-busy'); send.textContent = S.sendOrder;
      if (res && res.status === 200 && res.data.number) {
        lastOrder = res.data;
        list = {}; save(); syncButtons(); renderList();
        $('[data-done-pdf]', foot)?.focus();
        return;
      }
      if (res && res.status === 404) { signOut(); help.textContent = S.loginUnknown; return; }
      help.textContent = res && res.data?.error === 'unknown_item' ? S.orderUnknown : res && res.status === 429 ? S.loginTooMany : S.orderFailed;
    });
  }

  function renderDone() {
    const o = lastOrder;
    const box = el('div', 'drawer__done');
    box.setAttribute('role', 'status');
    box.append(el('b', '', fmt(S.orderDone, { n: o.number })), el('p', '', o.emailed ? S.orderDoneMail : S.orderDoneNoMail));
    body.append(box);
    const bytes = Uint8Array.from(atob(o.pdf), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = el('a', 'btn btn--primary', S.downloadPdf); a.href = url; a.download = o.filename; a.dataset.donePdf = '';
    const ok = el('button', 'btn btn--quiet', S.done); ok.type = 'button';
    ok.addEventListener('click', () => { lastOrder = null; URL.revokeObjectURL(url); drawer.close(); });
    const row = el('div', 'drawer__actions'); row.append(a, ok);
    foot.append(row);
  }

  function listText() {
    const lines = Object.keys(list).map((code) => {
      const p = D.p[code];
      const pr = priceOf(code);
      const price = pr === null ? '' : `  (${money.format(pr)}${p.kg ? ` ${S.perKg}` : ''})  = ${money.format(lineSum(code))}`;
      return p.kg ? `${list[code]} ${S.kg}  ${p.n}${price}` : `${list[code]} ×  ${code}  ${p.n}${price}`;
    });
    return `${S.mailHello}\n\n${lines.join('\n')}${prices ? `\n\n${S.total}: ${money.format(sum())}` : ''}\n\n${D.mailFields.join('\n')}\n`;
  }

  let opener = null;
  $$('[data-open-list]').forEach((b) => b.addEventListener('click', () => { opener = b; renderList(); drawer.showModal(); }));
  drawer.addEventListener('close', () => { if (lastOrder) { lastOrder = null; } });

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
  function show(i) {
    const p = D.p[dCode];
    const [f, w, h] = p.ph[i];
    dImg.src = photo(f, false); dImg.width = w; dImg.height = h; dImg.alt = p.n;
    $$('button', dThumbs).forEach((b, j) => b.setAttribute('aria-current', j === i ? 'true' : 'false'));
  }
  function openDetail(code, from) {
    const p = D.p[code];
    if (!p || !p.ph.length) return false;
    dCode = code; opener = from;
    $('[data-detail-name]').textContent = p.n;
    $('[data-detail-meta]').textContent = `${D.cats[p.c]}, ${S.code.toLowerCase()} ${code}`;
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
    dAdd.dataset.add = code;
    dAdd.setAttribute('aria-label', fmt(D.addLabel, { name: p.n }));
    show(0); syncButtons();
    detail.showModal();
    return true;
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-detail]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (openDetail(a.dataset.detail, a.closest('.card')?.querySelector('.card__name a') || a)) e.preventDefault();
  });

  // ---------- dialogs: close on button, backdrop, Escape; focus returns ----------
  [detail, drawer, welcome].forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
    });
    dlg.addEventListener('close', () => { if (opener && document.contains(opener) && !welcome.open && !drawer.open) opener.focus(); opener = null; });
  });

  // ---------- start ----------
  syncButtons();
  paintPrices();
  if (D.api) {
    const email = store.get('ek-email');
    if (email) {
      checkEmail(email).then((r) => { if (r === 'unknown') signOut(); }).catch(() => { /* offline: no prices this time */ });
    } else if (!store.get('ek-welcome')) {
      openWelcome();
    }
  }
})();
