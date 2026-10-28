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
    let k = 0;
    cats.forEach((c) => { if (!c.hidden) c.dataset.tone = k++ % 2 ? 'b' : 'a'; });
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

  // ---------- the list (kept in this browser only) ----------
  const KEY = 'eparhija-katalog-liste';
  let list = {};
  try { list = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { list = {}; }
  for (const k of Object.keys(list)) if (!D.p[k] || !(list[k] > 0)) delete list[k];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode: the list lives until the tab closes */ } };

  const drawer = $('[data-list-dialog]');
  const body = $('[data-list-body]');
  const foot = $('[data-list-foot]');

  function syncButtons() {
    $$('[data-add]').forEach((b) => {
      const on = !!list[b.dataset.add];
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.textContent = on ? S.added : S.add;
    });
    const n = Object.keys(list).length;
    $$('[data-count]').forEach((c) => { c.textContent = n; });
    $$('[data-open-list]').forEach((b) => b.toggleAttribute('data-has', n > 0));
    syncDetailButton();
  }
  function toggle(code) {
    if (list[code]) delete list[code]; else list[code] = 1;
    save(); syncButtons(); if (drawer.open) renderList();
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (b) toggle(b.dataset.add);
  });

  const lineSum = (code) => D.p[code].pr * list[code];
  const sum = () => Object.keys(list).reduce((a, k) => a + lineSum(k), 0);

  function renderList() {
    const codes = Object.keys(list);
    if (!codes.length) {
      body.innerHTML = `<div class="drawer__empty"><b></b><p></p><a class="btn btn--quiet" href="#catalogue" data-close></a></div>`;
      $('b', body).textContent = S.emptyTitle;
      $('p', body).textContent = S.emptyText;
      $('a', body).textContent = S.browse;
      foot.innerHTML = '';
      return;
    }
    body.innerHTML = '';
    for (const code of codes) {
      const p = D.p[code];
      const row = document.createElement('div');
      row.className = 'line';
      const unit = p.kg ? ` ${S.perKg}` : '';
      row.innerHTML = `
        <span class="line__img">${p.ph[0] ? `<img src="${photo(p.ph[0][0])}" alt="" width="56" height="56">` : ''}</span>
        <span class="line__name"></span>
        <span class="line__sum"></span>
        <div class="line__ctl">
          <span class="qty">
            <button type="button" data-step="-1"></button>
            <input type="number" inputmode="numeric" min="1" max="999" step="1">
            <button type="button" data-step="1"></button>
            ${p.kg ? `<span class="qty__unit"></span>` : ''}
          </span>
          <button class="line__remove" type="button" data-remove></button>
        </div>`;
      const name = $('.line__name', row);
      name.textContent = p.n;
      const sub = document.createElement('span');
      sub.className = 'line__sub';
      if (!p.kg) { const c = document.createElement('span'); c.textContent = code; sub.append(c); }
      const u = document.createElement('span'); u.textContent = `${money.format(p.pr)}${unit}`; sub.append(u);
      name.append(sub);
      $('.line__sum', row).textContent = money.format(lineSum(code));
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
        $('.line__sum', row).textContent = money.format(lineSum(code));
        $('[data-total]', foot).textContent = money.format(sum());
        save();
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
    foot.innerHTML = `
      <p class="drawer__total"><span></span><b data-total></b></p>
      <div class="drawer__actions">
        <a class="btn btn--primary" data-send></a>
        <button class="btn btn--quiet" type="button" data-copy></button>
      </div>
      <p class="drawer__help" data-help aria-live="polite"></p>
      <button class="drawer__clear" type="button" data-clear-list></button>`;
    $('.drawer__total span', foot).textContent = S.total;
    $('[data-total]', foot).textContent = money.format(sum());
    const send = $('[data-send]', foot);
    send.textContent = S.send;
    const help = $('[data-help]', foot);
    if (D.email) {
      send.href = 'mailto:' + D.email;
      send.addEventListener('click', () => { send.href = `mailto:${D.email}?subject=${encodeURIComponent(S.mailSubject)}&body=${encodeURIComponent(mailText())}`; });
    } else {
      send.setAttribute('aria-disabled', 'true');
      send.setAttribute('role', 'link');
      send.addEventListener('click', (e) => { e.preventDefault(); help.textContent = S.noEmail; });
    }
    const copy = $('[data-copy]', foot);
    copy.textContent = S.copy;
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(mailText()); help.textContent = S.copied; }
      catch { help.textContent = S.copyFailed; }
    });
    const clear = $('[data-clear-list]', foot);
    clear.textContent = S.clearList;
    clear.addEventListener('click', () => { list = {}; save(); syncButtons(); renderList(); $('[data-close]', drawer).focus(); });
  }

  function mailText() {
    const lines = Object.keys(list).map((code) => {
      const p = D.p[code];
      return p.kg
        ? `${list[code]} ${S.kg}  ${p.n}  (${money.format(p.pr)} ${S.perKg})  = ${money.format(lineSum(code))}`
        : `${list[code]} ×  ${code}  ${p.n}  (${money.format(p.pr)})  = ${money.format(lineSum(code))}`;
    });
    return `${S.mailHello}\n\n${lines.join('\n')}\n\n${S.total}: ${money.format(sum())}\n\n${D.mailFields.join('\n')}\n`;
  }

  let opener = null;
  $$('[data-open-list]').forEach((b) => b.addEventListener('click', () => { opener = b; renderList(); drawer.showModal(); }));

  // ---------- product detail ----------
  const detail = $('[data-detail-dialog]');
  const dImg = new Image();
  dImg.decoding = 'async';
  $('[data-detail-photo]').append(dImg);
  const dThumbs = $('[data-detail-thumbs]');
  const dAdd = $('[data-detail-add]');
  let dCode = null;
  function syncDetailButton() {
    if (!dCode) return;
    const on = !!list[dCode];
    dAdd.setAttribute('aria-pressed', on ? 'true' : 'false');
    dAdd.textContent = on ? S.added : S.add;
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
    $('[data-detail-price]').textContent = money.format(p.pr);
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
    show(0); syncDetailButton();
    detail.showModal();
    return true;
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-detail]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (openDetail(a.dataset.detail, a.closest('.card')?.querySelector('.card__name a') || a)) e.preventDefault();
  });

  // ---------- dialogs: close on button, backdrop, Escape; focus returns ----------
  [detail, drawer].forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
    });
    dlg.addEventListener('close', () => { if (opener && document.contains(opener)) opener.focus(); opener = null; });
  });

  syncButtons();
})();
