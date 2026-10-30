// Builds the three language pages.
// Usage: node build.mjs   (Node 18 or newer, no packages to install)
// Reads the catalogue from Supabase when it can (and saves it to data/catalogue.json), otherwise from that file.
// Writes docs/index.html (French), docs/en/index.html and docs/sr/index.html.
// The pages load the live catalogue again in the browser, so admin changes show without a rebuild;
// the build only keeps the first paint, search engines and visitors without JavaScript up to date.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from './docs/assets/js/render.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const site = read('data/site.json');
const strings = read('data/strings.json');
const legal = read('data/legal.json');

const LANGS = [
  { id: 'fr', dir: '' },
  { id: 'en', dir: 'en/' },
  { id: 'sr', dir: 'sr/' },
];

const PUBLIC_PRODUCT_COLUMNS = 'code,category,name_fr,name_en,name_sr,note_fr,note_en,note_sr,unit,available,photos,sort';
const PUBLIC_OPTION_COLUMNS = 'id,product,sku,label_sr,label_fr,label_en,available,active,sort';

async function loadCatalogue() {
  const snapshot = read('data/catalogue.json');
  if (site.supabaseUrl && site.supabaseKey && !process.env.OFFLINE) {
    try {
      const get = async (q) => {
        const r = await fetch(`${site.supabaseUrl}/rest/v1/${q}`, { headers: { apikey: site.supabaseKey }, signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`${q}: ${r.status}`);
        return r.json();
      };
      const [categories, products, options] = await Promise.all([
        get('categories?select=*&order=sort'),
        get(`products?select=${PUBLIC_PRODUCT_COLUMNS}&active=eq.true&order=sort`),
        get(`options?select=${PUBLIC_OPTION_COLUMNS}&active=eq.true&order=product,sort`),
      ]);
      writeFileSync(join(ROOT, 'data/catalogue.json'), JSON.stringify({ _about: snapshot._about, categories, products, options }, null, 1) + '\n');
      console.log(`catalogue from the database: ${products.length} articles, ${options.length} options`);
      return { categories, products, options };
    } catch (e) {
      console.log(`database not reachable (${e.message}), using data/catalogue.json`);
    }
  }
  return snapshot;
}

// Every stylesheet and script is linked with ?v=<its content hash>, and so are the files they import,
// so a phone never keeps an old copy after an update.
const ASSETS = join(ROOT, 'docs/assets');
const hashOf = (rel) => createHash('sha256').update(readFileSync(join(ASSETS, rel))).digest('hex').slice(0, 10);
function stamp(rel, deps) {
  const file = join(ASSETS, rel);
  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const [ref, v] of Object.entries(deps)) {
    after = after.replace(new RegExp(`(['"(]\\./${ref.replace(/\./g, '\\.')})(\\?v=[0-9a-f]+)?(['")])`, 'g'), `$1?v=${v}$3`);
  }
  if (after !== before) writeFileSync(file, after);
  return hashOf(rel);
}
const leaf = { 'render.js': hashOf('js/render.js'), 'tokens.css': hashOf('css/tokens.css'), 'base.css': hashOf('css/base.css'), 'fonts.css': hashOf('css/fonts.css') };
const css3 = { 'tokens.css': leaf['tokens.css'], 'base.css': leaf['base.css'], 'fonts.css': leaf['fonts.css'] };
const V = {
  app: stamp('js/app.js', { 'render.js': leaf['render.js'] }),
  admin: stamp('js/admin.js', { 'render.js': leaf['render.js'], 'catalogue-pdf.js': hashOf('js/catalogue-pdf.js') }),
  account: stamp('js/account.js', { 'render.js': leaf['render.js'] }),
  site: stamp('css/site.css', css3),
  adminCss: stamp('css/admin.css', css3),
};
V.accountCss = stamp('css/account.css', { 'site.css': V.site });
V.legalCss = stamp('css/legal.css', { 'site.css': V.site });

const raw = await loadCatalogue();
const model = R.fromDb(raw.categories, raw.products, raw.options || []);

const esc = R.esc;
const typo = R.typo;
const T = (lang, key, vars = {}) => {
  let s = strings[lang][key];
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return typo(lang, s);
};
const t = (lang, s) => esc(typo(lang, s));

const CLIENT_STRINGS = ['add', 'added', 'noMatch', 'matches', 'photoOf', 'emptyTitle', 'emptyText', 'qty', 'less', 'more', 'remove', 'total', 'copy', 'copied', 'copyFailed', 'clearList', 'mailHello', 'kg', 'perKg', 'close', 'code', 'browse',
  'loginUnknown', 'loginTooMany', 'loginFailed', 'loginInvalid', 'checking', 'showPrices', 'signOut', 'pricesFor', 'guestList', 'formName', 'formParish', 'formPhone', 'formAddress', 'formNote', 'optional', 'nameMissing',
  'sendOrder', 'sending', 'orderDone', 'orderDoneMail', 'orderDoneNoMail', 'downloadPdf', 'orderFailed', 'orderUnknown', 'orderUnavailable', 'done', 'outOfStock', 'related', 'inStock',
  'noPhoto', 'addLabel', 'acLink', 'list', 'cartLabel', 'askPrices', 'gatePriest', 'gateLead', 'gateUnknown', 'gateOther', 'gateOtherLead', 'emailPlaceholder', 'inqSend', 'inqDone', 'inqDoneText', 'inqFailed', 'inqTooMany',
  'emailMissing', 'emailLabel', 'quoteTitle', 'quoteLead', 'quoteOrder', 'quoteGone', 'quoteFor', 'cancel', 'pdfBtn', 'pdfChooseTitle', 'pdfChooseLead', 'pdfBlank', 'pdfWithPrices', 'pdfWorking', 'pdfNone', 'pdfFailed', 'choose', 'chooseLabel', 'optCount', 'optsHead', 'optsFind', 'optsFindPh', 'optsNone', 'orderChoose', 'candlesLead', 'candlesCaption', 'thFormat', 'thSize', 'thDetail', 'thPrice', 'thPriceUnit', 'thList'];

const X = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';
// national flags, drawn small: France, the United Kingdom (for English), Serbia (the civil flag)
let flagN = 0;
const FLAG = {
  fr: () => '<svg viewBox="0 0 3 2" aria-hidden="true"><rect width="1" height="2" fill="#002654"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#CE1126"/></svg>',
  en: () => { const n = ++flagN; return `<svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><clipPath id="uk${n}"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath><path d="M0,0v30h60v-30z" fill="#012169"/><path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0L60,30M60,0L0,30" clip-path="url(#uk${n})" stroke="#C8102E" stroke-width="4"/><path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></svg>`; },
  sr: () => '<svg viewBox="0 0 3 2" aria-hidden="true"><rect width="3" height="2" fill="#fff"/><rect width="3" height="1.3333" fill="#0C4076"/><rect width="3" height="0.6667" fill="#C6363C"/></svg>',
};
// the header's language links: a flag and the short code; the full name is the link's accessible name
const flagLinks = (lang, hrefOf) => LANGS.map((l) => `<a href="${hrefOf(l)}" hreflang="${strings[l.id].htmlLang}" lang="${strings[l.id].htmlLang}" aria-label="${esc(strings[l.id].langName)}" data-lang${l.id === lang ? ' aria-current="page"' : ''}><span class="flag">${FLAG[l.id]()}</span><span class="l-code" aria-hidden="true">${l.id.toUpperCase()}</span></a>`).join('\n        ');
const ICON = {
  cart: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3.5h2.2l2.5 11.4a1.6 1.6 0 0 0 1.6 1.3h8.5a1.6 1.6 0 0 0 1.6-1.2l1.8-7.5H6"/><circle cx="9.5" cy="20" r="1.4"/><circle cx="17.5" cy="20" r="1.4"/></svg>',
  person: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.6-4 4.6-6 8-6s6.4 2 8 6"/></svg>',
  pdf: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>',
  search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
};

// the company behind the site, and the way to its legal notice, at the foot of every page
const legalPath = (l) => `${l.dir}${legal[l.id].slug}/`;
const legalLine = (lang, root) => `<p>${t(lang, legal[lang].companyLine)} <a href="${root}${legalPath(LANGS.find((l) => l.id === lang))}">${t(lang, legal[lang].title)}</a></p>`;

function page(lang, dir) {
  const S = strings[lang];
  const root = dir ? '../' : './';
  const here = (l) => (l.dir ? root + l.dir : root);
  const absolute = (l) => (site.url ? site.url.replace(/\/?$/, '/') + l.dir : '');
  const ctx = { lang, S, root };
  const cd = R.clientData(model, ctx);

  const apiUrl = (process.env.SITE_API_URL || site.supabaseUrl || '').replace(/\/$/, '');
  const data = {
    lang, locale: S.locale,
    api: apiUrl ? { url: apiUrl, key: site.supabaseKey || '' } : null,
    langs: Object.fromEntries(LANGS.map((l) => [l.id, here(l)])),
    s: Object.fromEntries(CLIENT_STRINGS.map((k) => [k, T(lang, k)])),
    mailFields: S.mailFields.map((f) => typo(lang, f)),
    addLabel: typo(lang, S.addLabel),
    items: S.items, sizes: S.sizes,
    cats: cd.cats, p: cd.p,
    account: `${root}${dir}${S.acSlug}/`,
  };

  const alternates = LANGS.map((l) => `<link rel="alternate" hreflang="${strings[l.id].htmlLang}" href="${site.url ? absolute(l) : here(l)}">`).join('\n  ')
    + `\n  <link rel="alternate" hreflang="x-default" href="${site.url ? absolute(LANGS[0]) : here(LANGS[0])}">`;
  const thisLang = LANGS.find((l) => l.id === lang);
  const langLinks = (cls = '') => LANGS.map((l) => `<a href="${here(l)}" hreflang="${strings[l.id].htmlLang}" lang="${strings[l.id].htmlLang}" aria-label="${esc(strings[l.id].langName)}" data-lang${l.id === lang ? ' aria-current="page"' : ''}${cls}><span class="l-long">${esc(strings[l.id].langName)}</span><span class="l-short" aria-hidden="true">${esc(strings[l.id].langShort)}</span></a>`).join('\n        ');

  return `<!doctype html>
<html lang="${S.htmlLang}" class="no-js">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t(lang, S.title)}</title>
  <meta name="description" content="${t(lang, S.description)}">
  <meta name="theme-color" content="#232323">
  ${site.url ? `<link rel="canonical" href="${absolute(thisLang)}">` : ''}
  ${alternates}
  <meta property="og:type" content="website">
  <meta property="og:title" content="${t(lang, S.title)}">
  <meta property="og:description" content="${t(lang, S.description)}">
  <meta property="og:locale" content="${S.ogLocale}">
  ${site.url ? `<meta property="og:url" content="${absolute(thisLang)}">
  <meta property="og:site_name" content="${t(lang, S.brand)}">
  <meta property="og:image" content="${site.url.replace(/\/?$/, '/')}assets/img/share-${lang}.jpg?v=${hashOf(`img/share-${lang}.jpg`)}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${t(lang, S.brand)}">
  <meta name="twitter:card" content="summary_large_image">` : ''}
  <link rel="icon" href="${root}favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="${root}apple-touch-icon.png">
  <link rel="preload" href="${root}assets/fonts/onest-${lang === 'sr' ? 'cyrillic' : 'latin'}-400-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="${root}assets/fonts/onest-${lang === 'sr' ? 'cyrillic' : 'latin'}-700-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="${root}assets/css/site.css?v=${V.site}">
  ${apiUrl ? `<link rel="preconnect" href="${esc(apiUrl)}" crossorigin>` : ''}
  <script>document.documentElement.className = 'js';</script>
</head>
<body>
  <a class="skip" href="#catalogue">${t(lang, S.skip)}</a>
  <header class="slab">
    <div class="container slab__inner">
      <a class="wordmark" href="${root}${dir}"><img class="wordmark__grb" src="${root}assets/img/grb-112.webp" width="48" height="56" alt=""><span class="visually-hidden">${t(lang, S.brand)}</span></a>
      <nav class="langs" aria-label="${t(lang, S.langsLabel)}">
        ${flagLinks(lang, here)}
      </nav>
      <div class="account" data-account hidden>
        <button class="listbtn listbtn--login" type="button" data-login>${t(lang, S.memberLogin)}</button>
        <button class="listbtn listbtn--pdf" type="button" data-pdf hidden>${ICON.pdf}<span data-pdf-label aria-live="polite">${t(lang, S.pdfBtn)}</span></button>
        <a class="listbtn listbtn--profile" data-profile hidden href="${root}${thisLang.dir}${S.acSlug}/">${ICON.person}${t(lang, S.acLink)}</a>
      </div>
    </div>
  </header>

  <main id="main">
    <section class="hero">
      <div class="container hero__grid">
        <div class="hero__text">
          <h1>${t(lang, S.brand)}</h1>
          <form class="find" action="#catalogue" data-find hidden>
            <label for="q-hero">${t(lang, S.findLabel)}</label>
            <div class="find__row">
              <input id="q-hero" type="search" name="q" placeholder="${t(lang, S.findPlaceholder)}" autocomplete="off" spellcheck="false">
              <button class="btn btn--primary" type="submit">${t(lang, S.findButton)}</button>
            </div>
          </form>
          <p class="hero__links" data-nojs><a class="btn btn--primary" href="#catalogue">${t(lang, S.browse)}</a></p>
        </div>
        <nav class="shelves" aria-labelledby="h-shelves">
          <h2 class="shelves__title" id="h-shelves">${t(lang, S.catsTitle)}</h2>
          <ul role="list" data-shelves>
        ${R.shelves(model, ctx)}
          </ul>
        </nav>
      </div>
    </section>

    <section class="catalogue" id="catalogue" aria-label="${t(lang, S.sub)}">
      <div class="bar">
        <div class="container bar__inner">
          <button class="bar__search" type="button" data-to-search data-js hidden aria-label="${t(lang, S.searchJump)}">${ICON.search}</button>
          <nav class="chips" aria-label="${t(lang, S.catsLabel)}" data-chips>${R.chips(model, ctx)}</nav>
          <p class="bar__status" role="status" data-status>${esc(R.countText(S, model.products.length))}</p>
          <button class="bar__clear" type="button" data-clear hidden>${t(lang, S.clear)}</button>
        </div>
      </div>
      <div class="container" data-sections>
      <p class="nomatch" data-nomatch hidden></p>
      ${R.sections(model, ctx)}
      </div>
    </section>

  </main>

  <footer class="colophon">
    <div class="container colophon__inner">
      <img class="colophon__grb" src="${root}assets/img/grb-112.webp" width="48" height="56" alt="">
      <div class="colophon__text">
        <p><b>${t(lang, S.brand)}.</b> ${t(lang, S.orgFull)}, ${t(lang, S.address)}.</p>
        <p>${t(lang, S.footerLine)} ${t(lang, S.footerPhotos)}</p>
        ${legalLine(lang, root)}
        <p>${t(lang, S.otherLangs)} ${LANGS.filter((l) => l.id !== lang).map((l) => `<a href="${here(l)}" hreflang="${strings[l.id].htmlLang}" lang="${strings[l.id].htmlLang}" data-lang>${esc(strings[l.id].langName)}</a>`).join(` ${lang === 'fr' ? 'et' : lang === 'en' ? 'and' : 'и'} `)}. <a href="${root}${dir}${S.acSlug}/">${t(lang, S.acLink)}</a> · <a href="${root}admin/">${t(lang, S.admin)}</a></p>
      </div>
    </div>
  </footer>

  <dialog class="detail" data-detail-dialog aria-labelledby="detail-name">
    <div class="detail__inner">
      <div class="detail__media">
        <figure class="detail__photo" data-detail-photo></figure>
        <div class="detail__thumbs" data-detail-thumbs></div>
      </div>
      <div class="detail__text">
        <p class="detail__cat" data-detail-cat></p>
        <h2 id="detail-name" class="detail__name" data-detail-name></h2>
        <p class="detail__tags"><span class="detail__code" data-detail-code></span><span class="detail__stock" data-detail-stock hidden></span></p>
        <p class="detail__price" data-detail-price></p>
        <p class="detail__note" data-detail-note hidden></p>
        <button class="add add--big" type="button" data-detail-add>${t(lang, S.add)}</button>
        <div class="opts" data-detail-opts hidden>
          <h3 class="opts__head" id="opts-head" data-opts-head></h3>
          <div class="opts__find" data-opts-findbox hidden>
            <label class="visually-hidden" for="opts-q">${t(lang, S.optsFind)}</label>
            <input id="opts-q" type="search" placeholder="${t(lang, S.optsFindPh)}" autocomplete="off" spellcheck="false" data-opts-q>
          </div>
          <ul class="opts__list" role="list" aria-labelledby="opts-head" data-opts-list></ul>
          <p class="opts__none" data-opts-none hidden>${t(lang, S.optsNone)}</p>
        </div>
        <div class="related" data-detail-related hidden>
          <h3 class="related__head">${t(lang, S.related)}</h3>
          <ul class="related__list" role="list" data-related-list></ul>
        </div>
      </div>
      <button class="iconbtn detail__close" type="button" data-close aria-label="${t(lang, S.close)}">${X}</button>
    </div>
  </dialog>

  <dialog class="welcome" data-welcome aria-labelledby="welcome-title">
    <div class="welcome__inner">
      <img class="welcome__grb" src="${root}assets/img/grb-240.webp" width="82" height="96" alt="">
      <h2 id="welcome-title">${esc(S.langPick)}</h2>
      <p class="welcome__lead">${t(lang, S.langPickLead)}</p>
      <div class="welcome__langs">
        ${LANGS.map((l) => `<a class="welcome__lang" href="${here(l)}" hreflang="${strings[l.id].htmlLang}" lang="${strings[l.id].htmlLang}" data-lang data-pick="${l.id}"${l.id === lang ? ' aria-current="page"' : ''}><span class="flag flag--big">${FLAG[l.id]()}</span><span>${esc(strings[l.id].langName)}</span></a>`).join('\n        ')}
      </div>
    </div>
  </dialog>

  <dialog class="welcome" data-pdf-dialog aria-labelledby="pdfchoose-title">
    <div class="welcome__inner">
      <img class="welcome__grb" src="${root}assets/img/grb-240.webp" width="82" height="96" alt="">
      <h2 id="pdfchoose-title">${t(lang, S.pdfChooseTitle)}</h2>
      <p class="welcome__lead">${t(lang, S.pdfChooseLead)}</p>
      <div class="welcome__actions">
        <button class="btn btn--primary" type="button" data-pdf-pick="blank">${t(lang, S.pdfBlank)}</button>
        <button class="btn" type="button" data-pdf-pick="priced">${t(lang, S.pdfWithPrices)}</button>
        <button class="textbtn" type="button" data-pdf-cancel>${t(lang, S.cancel)}</button>
      </div>
    </div>
  </dialog>

  <dialog class="welcome" data-login-dialog aria-labelledby="login-title">
    <form class="welcome__inner" data-login-form novalidate>
      <img class="welcome__grb" src="${root}assets/img/grb-240.webp" width="82" height="96" alt="">
      <h2 id="login-title">${t(lang, S.welcomeTitle)}</h2>
      <p class="welcome__lead">${t(lang, S.loginLead)}</p>
      <label for="login-email">${t(lang, S.emailLabel)}</label>
      <input id="login-email" name="email" type="email" autocomplete="email" inputmode="email" spellcheck="false" placeholder="${t(lang, S.emailPlaceholder)}" required>
      <p class="welcome__help" id="login-help" data-login-help aria-live="polite"></p>
      <div class="welcome__actions">
        <button class="btn btn--primary" type="submit" data-login-submit>${t(lang, S.showPrices)}</button>
        <button class="textbtn" type="button" data-login-skip>${t(lang, S.cancel)}</button>
      </div>
    </form>
  </dialog>

  <dialog class="drawer" data-list-dialog aria-labelledby="drawer-title">
    <div class="drawer__inner">
      <div class="drawer__head">
        <h2 id="drawer-title">${t(lang, S.list)}</h2>
        <button class="iconbtn" type="button" data-close aria-label="${t(lang, S.close)}">${X}</button>
      </div>
      <div class="drawer__scroll">
        <div class="drawer__body" data-list-body></div>
        <div class="drawer__foot" data-list-foot></div>
      </div>
    </div>
  </dialog>

  <button class="fab" type="button" data-open-list hidden aria-label="${t(lang, S.list)}">${ICON.cart}<span class="fab__n" data-count>0</span></button>

  <script type="application/json" id="catalogue-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
  <script type="module" src="${root}assets/js/app.js?v=${V.app}"></script>
</body>
</html>
`;
}

for (const l of LANGS) {
  const out = join(ROOT, 'docs', l.dir, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page(l.id, l.dir));
  console.log('wrote', out.replace(ROOT + '/', ''));
}

// ---------- the admin panel (Serbian, Latin script) ----------
function adminPage() {
  const apiUrl = (process.env.SITE_API_URL || site.supabaseUrl || '').replace(/\/$/, '');
  const config = { url: apiUrl, key: site.supabaseKey || '', userDomain: 'magacin.example.com' };
  const field = (id, label, type, ac, extra = '') => `<div class="field">
          <label for="${id}">${label}</label>
          <input class="input" id="${id}" name="${type === 'password' ? 'password' : 'email'}" type="${type}" autocomplete="${ac}" required aria-required="true"${extra}>
        </div>`;
  const seg = (attr, label, items) => `<div class="field"><span class="field__label" id="${attr}-l">${label}</span><div class="seg" role="group" aria-labelledby="${attr}-l" data-${attr}>
          ${items.map(([v, t, n]) => `<button type="button" data-v="${v}" aria-pressed="false">${t}${n !== undefined ? ` <span class="seg__n" data-n="${n}"></span>` : ''}</button>`).join('\n          ')}
        </div></div>`;
  return `<!doctype html>
<html lang="sr-Latn">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Administracija · Magacin Eparhije zapadnoevropske</title>
  <meta name="description" content="Administracija magacina: artikli i stanje, kategorije, sveštenstvo i porudžbine.">
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" href="../favicon.png" type="image/png">
  <link rel="preload" href="../assets/fonts/onest-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
  <script>try { var th = localStorage.getItem('ek-theme'); if (th === 'dark' || th === 'light') document.documentElement.dataset.theme = th; } catch (e) {}</script>
  <link rel="stylesheet" href="../assets/css/admin.css?v=${V.adminCss}">
</head>
<body class="adm">
  <a class="skip" href="#main">Preskoči na sadržaj</a>
  <p class="boot" data-boot>Učitavanje…</p>

  <main class="gate" id="gate" hidden>
    <form class="gate__form" data-login novalidate>
      <img class="gate__grb" src="../assets/img/grb-240.webp" width="82" height="96" alt="">
      <p class="gate__org">Magacin Eparhije zapadnoevropske</p>
      <h1>Prijava za administratore</h1>
      ${field('l-email', 'Korisničko ime ili mejl', 'text', 'username', ' autocapitalize="none" autocorrect="off" spellcheck="false"')}
      ${field('l-pass', 'Lozinka', 'password', 'current-password')}
      <p class="gate__msg" role="alert" data-login-msg hidden></p>
      <button class="btn btn--primary btn--block" type="submit">Prijavi se</button>
      <p class="gate__note">Nalog otvara vlasnik sajta. <a href="../">Nazad na katalog</a></p>
    </form>
  </main>

  <div class="app" id="app" hidden>
    <aside class="side">
      <a class="bar__brand" href="#pregled" aria-label="Administracija magacina, pregled">
        <img src="../assets/img/grb-112.webp" width="34" height="40" alt="">
        <span class="bar__name">Magacin <span class="bar__sub">administracija</span></span>
      </a>
      <nav class="tabs" aria-label="Odeljci">
        <p class="tabs__group">Glavno</p>
        <a href="#pregled" data-tab="pregled"><svg class="tabs__ic" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/></svg><span>Pregled</span></a>
        <a href="#upiti" data-tab="upiti"><svg class="tabs__ic" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.5h13v8h-7l-3.5 3v-3h-2.5z"/></svg><span>Upiti</span> <span class="tabs__n" data-new-inquiries hidden></span></a>
        <a href="#porudzbine" data-tab="porudzbine"><svg class="tabs__ic" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2.5l1.7 8h8l1.5-5.5H6"/><circle cx="8" cy="16" r="1"/><circle cx="14" cy="16" r="1"/></svg><span>Porudžbine</span> <span class="tabs__n" data-new-orders hidden></span></a>
        <a href="#artikli" data-tab="artikli"><svg class="tabs__ic" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.8 16.5 6v8L10 17.2 3.5 14V6z"/><path d="M3.8 6.1 10 9.3l6.2-3.2M10 9.3v7.8"/></svg><span>Artikli</span></a>
        <a href="#statistika" data-tab="statistika"><svg class="tabs__ic" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16V9M10 16V4M16 16v-5"/></svg><span>Statistika</span></a>
        <p class="tabs__group">Podešavanja</p>
        <a href="#svestenstvo" data-tab="svestenstvo"><svg class="tabs__ic" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="7" r="2.8"/><path d="M2.5 16c.5-2.8 2.5-4.2 5-4.2s4.5 1.4 5 4.2"/><path d="M13 4.4a2.8 2.8 0 0 1 0 5.2M14.5 12c1.6.5 2.7 1.8 3 4"/></svg><span>Sveštenstvo</span></a>
        <a href="#kategorije" data-tab="kategorije"><svg class="tabs__ic" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5.5h14M3 10h14M3 14.5h9"/></svg><span>Kategorije</span></a>
      </nav>
    </aside>
    <div class="shell">
    <header class="bar">
      <div class="bar__me">
        <div class="theme" role="group" aria-label="Izgled: dan ili noć" data-theme-switch>
          <button type="button" data-theme-set="light" aria-pressed="false" title="Dan" aria-label="Dan"><svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="10" cy="10" r="3.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4"/></svg></button>
          <button type="button" data-theme-set="auto" aria-pressed="true" title="Prema uređaju" aria-label="Prema uređaju"><svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="6.5"/><path d="M10 3.5v13a6.5 6.5 0 0 0 0-13z" fill="currentColor"/></svg></button>
          <button type="button" data-theme-set="dark" aria-pressed="false" title="Noć" aria-label="Noć"><svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 11.5A6.5 6.5 0 0 1 8.5 3.5a6.5 6.5 0 1 0 8 8z"/></svg></button>
        </div>
        <button class="btn btn--quiet btn--s bar__pdf" type="button" data-pdf-refresh title="Osveži PDF cenovnik">Osveži PDF</button>
        <button class="btn btn--quiet btn--s profile__btn" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="profile-menu" data-profile>
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="7" r="3.25" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 17c.8-3 3.2-4.5 6.5-4.5s5.7 1.5 6.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          Profil
        </button>
        <div class="profile" id="profile-menu" data-profile-menu hidden>
          <p class="profile__who"><span class="profile__label">Prijavljeni ste kao</span><span class="profile__email" data-me></span></p>
          <a class="profile__item" href="../" target="_blank" rel="noopener">Otvori sajt</a>
          <button class="profile__item" type="button" data-password>Promena lozinke</button>
          <button class="profile__item profile__item--out" type="button" data-signout>Odjava</button>
        </div>
      </div>
    </header>

    <main id="main" class="screens" tabindex="-1">
      <section class="screen" data-screen="pregled" aria-labelledby="h-pregled">
        <div class="screen__head">
          <div><h1 id="h-pregled">Pregled</h1><p class="screen__sub" data-today></p></div>
        </div>
        <section class="panel pdfcard" aria-labelledby="h-pdf">
          <div class="panel__head"><h2 id="h-pdf">PDF cenovnik za članove</h2><p class="panel__sub">Svi artikli sa slikama i cenama, na srpskom, francuskom i engleskom, u jednom fajlu. Članovi ga preuzimaju sa sajta, posetioci bez prijave ga ne vide.</p></div>
          <p class="pdfcard__state" data-pdf-state aria-live="polite">Proveravam…</p>
          <div class="pdfcard__actions">
            <button class="btn btn--primary" type="button" data-pdf-refresh>Osveži PDF</button>
            <button class="btn" type="button" data-pdf-get hidden>Pregledaj PDF</button>
          </div>
          <p class="pdfcard__help">PDF se osvežava sam jednom dnevno, čim otvorite administraciju, i pravi se u dve verzije: sa cenama i bez cena. Dugme ga osvežava odmah, na primer posle unosa novih artikala. Dok traje, ostavite stranicu otvorenom.</p>
        </section>
        <div class="region ov" data-region="overview"></div>
      </section>

      <section class="screen" data-screen="upiti" aria-labelledby="h-upiti" hidden>
        <div class="screen__head">
          <div><h1 id="h-upiti">Upiti za cene</h1><p class="screen__sub">Posetioci bez naloga šalju listu; vi im šaljete ponudu sa cenama.</p></div>
        </div>
        <div class="toolbar">
          ${seg('s', 'Status', [['new', 'Novi', 'new'], ['sent', 'Ponuda poslata', 'sent'], ['ordered', 'Poručeno', 'ordered'], ['closed', 'Zatvoreni', 'closed'], ['all', 'Svi', 'all']])}
        </div>
        <div class="region" data-region="inquiries"></div>
      </section>

      <section class="screen" data-screen="artikli" aria-labelledby="h-artikli" hidden>
        <div class="screen__head">
          <h1 id="h-artikli">Artikli i stanje</h1>
          <div class="screen__actions"><button class="btn" type="button" data-pdf-refresh>Osveži PDF cenovnik</button><button class="btn" type="button" data-csv="products">Izvezi u Excel (CSV)</button><button class="btn btn--primary" type="button" data-new="product">Novi artikal</button></div>
        </div>
        <div class="toolbar" role="search">
          <div class="field field--grow"><label for="q-artikli">Pretraga</label><input class="input" id="q-artikli" type="search" name="q" autocomplete="off" spellcheck="false" placeholder="P011, кадионица" data-q></div>
          <div class="field"><label for="k-artikli">Kategorija</label><span class="select"><select class="input" id="k-artikli" name="k" data-k><option value="">Sve kategorije</option></select></span></div>
          ${seg('f', 'Prikaz', [['', 'Svi', ''], ['out', 'Nema na stanju', 'out'], ['low', 'Za naručivanje', 'low'], ['hidden', 'Sakriveni', 'hidden']])}
        </div>
        <div class="region" data-region="products"></div>
      </section>

      <section class="screen" data-screen="kategorije" aria-labelledby="h-kategorije" hidden>
        <div class="screen__head">
          <h1 id="h-kategorije">Kategorije</h1>
          <button class="btn btn--primary" type="button" data-new="cat">Nova kategorija</button>
        </div>
        <div class="region" data-region="cats"></div>
      </section>

      <section class="screen" data-screen="svestenstvo" aria-labelledby="h-svestenstvo" hidden>
        <div class="screen__head">
          <div><h1 id="h-svestenstvo">Sveštenstvo</h1><p class="screen__sub" data-priest-count></p></div>
          <button class="btn btn--primary" type="button" data-new="priest">Dodaj sveštenika</button>
        </div>
        <div class="toolbar" role="search">
          <div class="field field--grow"><label for="q-svestenstvo">Pretraga</label><input class="input" id="q-svestenstvo" type="search" name="q" autocomplete="off" spellcheck="false" placeholder="ime, parohija ili mejl" data-q></div>
        </div>
        <div class="region" data-region="priests"></div>
      </section>

      <section class="screen" data-screen="porudzbine" aria-labelledby="h-porudzbine" hidden>
        <div class="screen__head">
          <h1 id="h-porudzbine">Porudžbine</h1>
          <button class="btn" type="button" data-csv="orders">Izvezi u Excel (CSV)</button>
        </div>
        <div class="toolbar">
          ${seg('s', 'Status', [['new', 'Nove', 'new'], ['done', 'Izvršene', 'done'], ['cancelled', 'Otkazane', 'cancelled'], ['all', 'Sve', 'all']])}
        </div>
        <div class="region" data-region="orders"></div>
      </section>

      <section class="screen" data-screen="statistika" aria-labelledby="h-statistika" hidden>
        <div class="screen__head">
          <h1 id="h-statistika">Statistika</h1>
          <button class="btn" type="button" data-csv="stats">Izvezi prodaju (CSV)</button>
        </div>
        <div class="toolbar">
          ${seg('p', 'Period', [['30', 'Poslednjih 30 dana'], ['90', '90 dana'], ['365', '12 meseci'], ['sve', 'Od početka']])}
        </div>
        <div class="region stats" data-region="stats"></div>
      </section>
    </main>
    </div>
  </div>

  <div class="undo" data-undo role="status" hidden>
    <span data-undo-text></span>
    <button class="btn btn--s btn--on-ink" type="button" data-undo-btn hidden>Poništi</button>
    <button class="icon-btn icon-btn--on-ink" type="button" data-undo-close aria-label="Zatvori obaveštenje">${X}</button>
  </div>
  <dialog class="sheet" data-sheet aria-labelledby="sheet-title"></dialog>
  <noscript><p class="boot">Administracija radi samo sa uključenim JavaScriptom.</p></noscript>

  <script type="application/json" id="admin-config">${JSON.stringify(config).replace(/</g, '\\u003c')}</script>
  <script type="module" src="../assets/js/admin.js?v=${V.admin}"></script>
</body>
</html>
`;
}
mkdirSync(join(ROOT, 'docs/admin'), { recursive: true });
writeFileSync(join(ROOT, 'docs/admin/index.html'), adminPage());
console.log('wrote docs/admin/index.html');

// ---------- the member's account page, one per language ----------
const ACCOUNT_STRINGS = ['acTitle', 'acEmail', 'acSend', 'acSendHelp', 'acSending', 'acSent', 'acCode', 'acSignIn', 'acSigningIn', 'acAgain', 'acOther',
  'acWrongCode', 'acNoCode', 'acMailOff', 'acMailFailed', 'acSignedOut', 'acOrders', 'acOrdersEmpty', 'acOrdersEmptyText', 'acOrdersError', 'acRetry',
  'acOrder', 'acStatusNew', 'acStatusDone', 'acStatusCancelled', 'acLines', 'acPdf', 'acPdfMaking', 'acPdfFailed', 'acReorder', 'acReorderSome',
  'acSave', 'acSaving', 'acSaved', 'acSaveFailed', 'acItem', 'acQty', 'acAmount', 'acCatalogue', 'code', 'total', 'kg', 'signOut',
  'loginUnknown', 'loginTooMany', 'loginInvalid', 'loginFailed', 'formName', 'formParish', 'formPhone', 'formAddress', 'optional', 'pricesFor'];
const accountPath = (l) => `${l.dir}${strings[l.id].acSlug}/`;
function accountPage(lang) {
  const S = strings[lang];
  const me = LANGS.find((l) => l.id === lang);
  const root = '../'.repeat(accountPath(me).split('/').filter(Boolean).length);
  const catalogue = root + me.dir;
  const apiUrl = (process.env.SITE_API_URL || site.supabaseUrl || '').replace(/\/$/, '');
  const data = {
    lang, locale: S.locale, catalogue,
    api: apiUrl ? { url: apiUrl, key: site.supabaseKey || '' } : null,
    s: Object.fromEntries(ACCOUNT_STRINGS.map((k) => [k, T(lang, k)])), items: S.items,
  };
  const langLinks = flagLinks(lang, (l) => `${root}${accountPath(l)}`);
  const opt = ` <span class="field__opt">(${t(lang, S.optional)})</span>`;
  const input = (id, name, label, type, auto, optional = true) => `<div class="field"><label for="${id}">${t(lang, label)}${optional ? opt : ''}</label><input id="${id}" name="${name}" type="${type}" autocomplete="${auto}"></div>`;
  return `<!doctype html>
<html lang="${S.htmlLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t(lang, S.acTitle)} · ${t(lang, S.brand)}</title>
  <meta name="description" content="${t(lang, S.acDescription)}">
  <meta name="robots" content="noindex">
  ${LANGS.map((l) => `<link rel="alternate" hreflang="${strings[l.id].htmlLang}" href="${root}${accountPath(l)}">`).join('\n  ')}
  <link rel="icon" href="${root}favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="${root}apple-touch-icon.png">
  <link rel="stylesheet" href="${root}assets/css/account.css?v=${V.accountCss}">
  <script>document.documentElement.className = 'js';</script>
</head>
<body class="acct-page">
  <a class="skip" href="#main">${t(lang, S.skip)}</a>
  <header class="slab">
    <div class="container slab__inner">
      <a class="wordmark" href="${catalogue}"><img class="wordmark__grb" src="${root}assets/img/grb-112.webp" width="48" height="56" alt=""><span class="visually-hidden">${t(lang, S.brand)}</span></a>
      <nav class="langs" aria-label="${t(lang, S.langsLabel)}">
        ${langLinks}
      </nav>
      <a class="listbtn" href="${catalogue}">${t(lang, S.acCatalogue)}</a>
    </div>
  </header>

  <main id="main" class="acct">
    <div class="container acct__inner">
      <h1>${t(lang, S.acTitle)}</h1>
      <p class="acct__boot" data-boot>…</p>
      <noscript><p>${t(lang, S.acLead)}</p></noscript>

      <section class="acct__out" data-out hidden aria-labelledby="h-signin">
        <h2 id="h-signin" class="visually-hidden">${t(lang, S.acSignIn)}</h2>
        <p class="acct__lead">${t(lang, S.acLead)}</p>
        <form class="acct__form" data-send novalidate>
          <div class="field"><label for="ac-email">${t(lang, S.acEmail)}</label><input id="ac-email" name="email" type="email" autocomplete="email" inputmode="email" spellcheck="false" required aria-required="true" aria-describedby="ac-help"></div>
          <button class="btn btn--primary" type="submit">${t(lang, S.acSend)}</button>
        </form>
        <details class="acct__pw" data-pw>
          <summary>${t(lang, S.acPw)}</summary>
          <form class="acct__form" data-pwform novalidate>
            <div class="field"><label for="ac-pw">${t(lang, S.acPwLabel)}</label><input id="ac-pw" name="pw" type="password" autocomplete="current-password" required></div>
            <button class="btn" type="submit">${t(lang, S.acSignIn)}</button>
          </form>
        </details>
        <form class="acct__form" data-verify novalidate hidden>
          <p class="acct__sent" data-sent></p>
          <div class="field"><label for="ac-code">${t(lang, S.acCode)}</label><input id="ac-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" spellcheck="false" required aria-required="true" aria-describedby="ac-help"></div>
          <button class="btn btn--primary" type="submit">${t(lang, S.acSignIn)}</button>
          <p class="acct__links"><button class="textbtn" type="button" data-again>${t(lang, S.acAgain)}</button><button class="textbtn" type="button" data-other>${t(lang, S.acOther)}</button></p>
        </form>
        <p class="acct__help" id="ac-help" data-help>${t(lang, S.acSendHelp)}</p>
        <p class="acct__prices" data-prices-for hidden><span data-prices-who></span> <button class="textbtn" type="button" data-forget>${t(lang, S.signOut)}</button></p>
      </section>

      <section class="acct__in" data-in hidden aria-labelledby="h-orders">
        <div class="acct__who">
          <div><p class="acct__name" data-name></p><p class="acct__meta" data-meta></p></div>
          <button class="btn" type="button" data-signout>${t(lang, S.signOut)}</button>
        </div>
        <div class="acct__cols">
          <section class="acct__orders">
            <h2 id="h-orders">${t(lang, S.acOrders)}</h2>
            <div data-orders aria-live="polite"></div>
          </section>
          <section class="acct__details" aria-labelledby="h-details">
            <h2 id="h-details">${t(lang, S.acDetails)}</h2>
            <p class="acct__meta">${t(lang, S.acDetailsLead)}</p>
            <form class="acct__form" data-details novalidate>
              ${input('ad-name', 'name', S.formName, 'text', 'name', false)}
              ${input('ad-parish', 'parish', S.formParish, 'text', 'organization')}
              ${input('ad-phone', 'phone', S.formPhone, 'tel', 'tel')}
              <div class="field"><label for="ad-address">${t(lang, S.formAddress)}${opt}</label><textarea id="ad-address" name="address" rows="3" autocomplete="street-address"></textarea></div>
              <button class="btn" type="submit">${t(lang, S.acSave)}</button>
              <p class="acct__help" data-details-help aria-live="polite"></p>
            </form>
          </section>
        </div>
      </section>
    </div>
  </main>

  <footer class="colophon">
    <div class="container colophon__inner">
      <img class="colophon__grb" src="${root}assets/img/grb-112.webp" width="48" height="56" alt="">
      <div class="colophon__text">
        <p><b>${t(lang, S.brand)}.</b> ${t(lang, S.orgFull)}, ${t(lang, S.address)}.</p>
        ${legalLine(lang, root)}
      </div>
    </div>
  </footer>

  <script type="application/json" id="account-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
  <script type="module" src="${root}assets/js/account.js?v=${V.account}"></script>
</body>
</html>
`;
}
for (const l of LANGS) {
  const out = join(ROOT, 'docs', accountPath(l), 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, accountPage(l.id));
  console.log('wrote', out.replace(ROOT + '/', ''));
}

// ---------- the legal notice and privacy page, one per language ----------
function legalPage(lang) {
  const S = strings[lang];
  const L = legal[lang];
  const me = LANGS.find((l) => l.id === lang);
  const root = '../'.repeat(legalPath(me).split('/').filter(Boolean).length);
  const catalogue = root + me.dir;
  const contact = () => {
    const parts = [];
    const colon = lang === 'fr' ? '\u00a0:' : ':';
    if (site.email) parts.push(`${t(lang, L.contactEmail)}${colon} <a href="mailto:${esc(site.email)}">${esc(site.email)}</a>`);
    if (site.phone) parts.push(`${t(lang, L.contactPhone)}${colon} <a href="tel:${esc(site.phone.replace(/[^+\d]/g, ''))}">${esc(site.phone)}</a>`);
    parts.push(t(lang, L.contactPost));
    return parts.join('<br>');
  };
  const dl = (rows) => `<dl class="legal__dl">${rows.map(([k, v]) => `\n          <div><dt>${t(lang, k)}</dt><dd>${v === '{contact}' ? contact() : t(lang, v).replace(/(\d) (?=\d)/g, '$1\u00a0')}</dd></div>`).join('')}\n        </dl>`;
  const sections = L.sections.map((s, i) => `
      <section class="legal__sec" aria-labelledby="l-${i + 1}">
        <h2 id="l-${i + 1}">${t(lang, s.h)}</h2>
        ${(s.p || []).map((p) => `<p>${t(lang, p)}</p>`).join('\n        ')}
        ${s.dl ? dl(s.dl) : ''}
      </section>`).join('\n');
  return `<!doctype html>
<html lang="${S.htmlLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t(lang, L.title)} · ${t(lang, S.brand)}</title>
  <meta name="description" content="${t(lang, L.description)}">
  ${LANGS.map((l) => `<link rel="alternate" hreflang="${strings[l.id].htmlLang}" href="${root}${legalPath(l)}">`).join('\n  ')}
  <link rel="icon" href="${root}favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="${root}apple-touch-icon.png">
  <link rel="stylesheet" href="${root}assets/css/legal.css?v=${V.legalCss}">
</head>
<body class="legal-page">
  <a class="skip" href="#main">${t(lang, S.skip)}</a>
  <header class="slab">
    <div class="container slab__inner">
      <a class="wordmark" href="${catalogue}"><img class="wordmark__grb" src="${root}assets/img/grb-112.webp" width="48" height="56" alt=""><span class="visually-hidden">${t(lang, S.brand)}</span></a>
      <nav class="langs" aria-label="${t(lang, S.langsLabel)}">
        ${flagLinks(lang, (l) => `${root}${legalPath(l)}`)}
      </nav>
      <a class="listbtn" href="${catalogue}">${t(lang, S.acCatalogue)}</a>
    </div>
  </header>

  <main id="main" class="legal">
    <div class="container legal__inner">
      <header class="legal__head">
        <h1>${t(lang, L.title)}</h1>
        <p class="legal__updated">${t(lang, L.updated)}</p>
      </header>
${sections}
    </div>
  </main>

  <footer class="colophon">
    <div class="container colophon__inner">
      <img class="colophon__grb" src="${root}assets/img/grb-112.webp" width="48" height="56" alt="">
      <div class="colophon__text">
        <p><b>${t(lang, S.brand)}.</b> ${t(lang, S.orgFull)}, ${t(lang, S.address)}.</p>
        <p>${t(lang, L.companyLine)}</p>
      </div>
    </div>
  </footer>
</body>
</html>
`;
}
for (const l of LANGS) {
  const out = join(ROOT, 'docs', legalPath(l), 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, legalPage(l.id));
  console.log('wrote', out.replace(ROOT + '/', ''));
}
