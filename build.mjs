// Builds the three language pages from the data files.
// Usage: node build.mjs   (no dependencies, Node 18 or newer)
// Writes docs/index.html (French), docs/en/index.html and docs/sr/index.html.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const catalogue = read('data/catalogue.json');
const site = read('data/site.json');
const strings = read('data/strings.json');

const LANGS = [
  { id: 'fr', dir: '' },
  { id: 'en', dir: 'en/' },
  { id: 'sr', dir: 'sr/' },
];

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// French typography: thin no-break space before : ; ? ! and inside « », true apostrophe everywhere
const typo = (lang, s) => {
  let t = String(s).replace(/'/g, '\u2019');
  if (lang === 'fr') t = t.replace(/ ([:;?!»])/g, '\u202F$1').replace(/« /g, '«\u202F');
  return t;
};
const T = (lang, key, vars = {}) => {
  let s = strings[lang][key];
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return typo(lang, s);
};
const t = (lang, s) => esc(typo(lang, s));
const money = (lang, n) => new Intl.NumberFormat(strings[lang].locale, { style: 'currency', currency: 'EUR' }).format(n);
const count = (lang, n, key = 'items') => {
  const forms = strings[lang][key];
  const cat = new Intl.PluralRules(strings[lang].locale).select(n);
  return `${n}\u00A0${forms[cat] ?? forms.other}`;
};

// search index: lower case, no accents, Serbian Cyrillic to Latin, so "brojanica" finds "бројаница"
const CYR = { а:'a',б:'b',в:'v',г:'g',д:'d',ђ:'dj',е:'e',ж:'z',з:'z',и:'i',ј:'j',к:'k',л:'l',љ:'lj',м:'m',н:'n',њ:'nj',о:'o',п:'p',р:'r',с:'s',т:'t',ћ:'c',у:'u',ф:'f',х:'h',ц:'c',ч:'c',џ:'dz',ш:'s',đ:'dj' };
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[а-шђјљњћџđ]/g, (c) => CYR[c] ?? c).replace(/[’'`]/g, ' ').replace(/\s+/g, ' ').trim();
const codeKeys = (code) => { const c = code.toLowerCase(); return [c, c.replace(/^p/, 'r').replace(/^h/, 'n')]; };

const cats = catalogue.categories;
const products = catalogue.products;
const byCat = Object.fromEntries(cats.map((c) => [c.id, products.filter((p) => p.cat === c.id)]));
const candleRows = catalogue.candles.rows;
const candleId = (fmt) => 'bougie-' + fmt.replace('/', '-');
const totalItems = products.length;

const img = (root, f, small = true) => `${root}assets/img/p/${f}${small ? '-s' : ''}.webp`;

// ---------- page ----------
function page(lang, dir) {
  const S = strings[lang];
  const root = dir ? '../' : './';
  const here = (l) => (l.dir ? root + l.dir : root);
  const absolute = (l) => (site.url ? site.url.replace(/\/?$/, '/') + l.dir : '');
  const fill = (key, text) => `<span class="fill" data-fill="${key}">${t(lang, text)}</span>`;

  const shelfImg = {
    encensoirs: 'H004', icones: 'P074', chandeliers: 'A001', veilleuses: 'P142', croix: 'P020', pendentifs: 'H016',
    culte: 'H020', encens: 'P146', chapelets: 'P111', enfants: 'N001', livres: 'P084',
  };
  const productBy = Object.fromEntries(products.map((p) => [p.code, p]));

  const shelves = cats.map((c, i) => {
    const n = c.id === 'bougies' ? count(lang, candleRows.length + 1, 'sizes') : count(lang, byCat[c.id].length);
    const ph = c.id === 'bougies' ? catalogue.candles.photos[0] : productBy[shelfImg[c.id]].photos[0];
    return `<li class="shelf"><a href="#${c.id}">
          <span class="shelf__img"><img src="${img(root, ph.file)}" width="${ph.w}" height="${ph.h}" alt="" ${i < 8 ? 'fetchpriority="' + (i < 4 ? 'high' : 'auto') + '"' : 'loading="lazy"'} decoding="async"></span>
          <span class="shelf__name">${t(lang, c.name[lang])}</span>
          <span class="shelf__count">${n}</span>
        </a></li>`;
  }).join('\n        ');

  const chips = cats.map((c) => `<a href="#${c.id}" data-chip="${c.id}">${t(lang, c.name[lang])}</a>`).join('');

  const card = (p) => {
    const name = p.name[lang];
    const search = norm([p.name.fr, p.name.en, p.name.sr, ...codeKeys(p.code)].join(' '));
    const ph = p.photos[0];
    const pic = ph
      ? `<a class="card__img" href="${img(root, ph.file, false)}" data-detail="${esc(p.code)}" tabindex="-1" aria-hidden="true"><img src="${img(root, ph.file)}" width="${ph.w}" height="${ph.h}" alt="" loading="lazy" decoding="async"></a>`
      : `<span class="card__img card__img--none" aria-hidden="true"><span>${t(lang, S.noPhoto)}</span></span>`;
    return `<li class="card" data-code="${esc(p.code)}" data-search="${esc(search)}">
          ${pic}
          <h3 class="card__name">${ph ? `<a href="${img(root, ph.file, false)}" data-detail="${esc(p.code)}">${t(lang, name)}</a>` : t(lang, name)}</h3>
          <p class="card__meta"><span class="card__code">${esc(p.code)}</span><span class="card__price">${money(lang, p.price)}</span></p>
          <button class="add" type="button" data-add="${esc(p.code)}" aria-pressed="false" aria-label="${esc(T(lang, 'addLabel', { name }))}">${t(lang, S.add)}</button>
        </li>`;
  };

  const sections = cats.map((c) => {
    if (c.id === 'bougies') return candlesSection(c);
    const list = byCat[c.id];
    return `<section class="cat" id="${c.id}" aria-labelledby="h-${c.id}" data-cat>
        <div class="cat__head"><h2 id="h-${c.id}">${t(lang, c.name[lang])}</h2><p class="cat__count">${count(lang, list.length)}</p></div>
        <ul class="grid" role="list">
        ${list.map(card).join('\n        ')}
        </ul>
      </section>`;
  }).join('\n      ');

  function candlesSection(c) {
    const ph = catalogue.candles.photos[0];
    const rows = candleRows.map((r) => {
      const name = T(lang, 'candle', { f: r.fmt });
      return `<tr data-code="${candleId(r.fmt)}" data-search="${esc(norm([strings.fr.candle, strings.en.candle, strings.sr.candle].map((x) => x.replace('{f}', r.fmt)).join(' ') + ' ' + norm(c.name.fr + ' ' + c.name.en + ' ' + c.name.sr)))}">
              <th scope="row">${esc(r.fmt)}</th>
              <td class="num">${esc(r.h)}&nbsp;×&nbsp;${esc(r.w)}&nbsp;cm</td>
              <td class="num price">${money(lang, r.price)}</td>
              <td class="act"><button class="add add--row" type="button" data-add="${candleId(r.fmt)}" aria-pressed="false" aria-label="${esc(T(lang, 'addLabel', { name }))}">${t(lang, S.add)}</button></td>
            </tr>`;
    }).join('\n            ');
    const dk = catalogue.candles.dikiri;
    const dkName = S.dikiri;
    return `<section class="cat cat--candles" id="${c.id}" aria-labelledby="h-${c.id}" data-cat>
        <div class="cat__head"><h2 id="h-${c.id}">${t(lang, c.name[lang])}</h2><p class="cat__count">${count(lang, candleRows.length + 1, 'sizes')}</p></div>
        <div class="candles">
          <figure class="candles__photo"><img src="${img(root, ph.file, false)}" width="${ph.W}" height="${ph.H}" alt="" loading="lazy" decoding="async"></figure>
          <div class="candles__body">
            <p class="lead">${t(lang, S.candlesLead)}</p>
            <div class="table-wrap" tabindex="0" role="region" aria-labelledby="h-${c.id}">
            <table class="candles__table">
              <caption>${t(lang, S.candlesCaption)}</caption>
              <thead><tr><th scope="col">${t(lang, S.thFormat)}</th><th scope="col" class="num">${t(lang, S.thSize)}</th><th scope="col" class="num">${t(lang, S.thPrice)}</th><th scope="col" class="act"><span class="visually-hidden">${t(lang, S.thList)}</span></th></tr></thead>
              <tbody>
            ${rows}
            <tr data-code="bougie-dikiri" data-search="${esc(norm(strings.fr.dikiri + ' ' + strings.en.dikiri + ' ' + strings.sr.dikiri + ' ' + c.name.fr + ' ' + c.name.en + ' ' + c.name.sr))}">
              <th scope="row">${t(lang, dkName)}</th>
              <td class="num note">${t(lang, S.dikiriNote)}</td>
              <td class="num price">${money(lang, dk.price)}</td>
              <td class="act"><button class="add add--row" type="button" data-add="bougie-dikiri" aria-pressed="false" aria-label="${esc(T(lang, 'addLabel', { name: dkName }))}">${t(lang, S.add)}</button></td>
            </tr>
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </section>`;
  }

  // data the script needs: names and prices in this language, photos, strings
  const data = {
    lang, locale: S.locale, email: site.email || '',
    s: Object.fromEntries(['add', 'added', 'noMatch', 'matches', 'photoOf', 'emptyTitle', 'emptyText', 'qty', 'less', 'more', 'remove', 'total', 'send', 'copy', 'copied', 'copyFailed', 'noEmail', 'clearList', 'mailSubject', 'mailHello', 'kg', 'perKg', 'close', 'code', 'browse'].map((k) => [k, T(lang, k)])),
    mailFields: S.mailFields.map((f) => typo(lang, f)),
    items: S.items, sizes: S.sizes,
    cats: Object.fromEntries(cats.map((c) => [c.id, typo(lang, c.name[lang])])),
    p: Object.fromEntries(products.map((p) => [p.code, { n: typo(lang, p.name[lang]), c: p.cat, pr: p.price, ph: p.photos.map((x) => [x.file, x.W, x.H]), ...(p.note ? { note: typo(lang, p.note[lang]) } : {}) }])),
  };
  for (const r of candleRows) data.p[candleId(r.fmt)] = { n: T(lang, 'candle', { f: r.fmt }), c: 'bougies', pr: r.price, ph: [[catalogue.candles.photos[0].file, catalogue.candles.photos[0].W, catalogue.candles.photos[0].H]], kg: 1, code: r.fmt };
  data.p['bougie-dikiri'] = { n: typo(lang, S.dikiri), c: 'bougies', pr: catalogue.candles.dikiri.price, ph: [[catalogue.candles.photos[1].file, catalogue.candles.photos[1].W, catalogue.candles.photos[1].H]], kg: 1, code: typo(lang, S.dikiri) };

  const contactRows = [
    `<div class="facts__row"><dt>${t(lang, S.rowEmail)}</dt><dd>${site.email ? `<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>` : fill('email', S.fillEmail)}</dd></div>`,
    site.phone ? `<div class="facts__row"><dt>${t(lang, S.rowPhone)}</dt><dd><a href="tel:${esc(site.phone.replace(/[^+\d]/g, ''))}">${esc(site.phone)}</a></dd></div>` : '',
    `<div class="facts__row"><dt>${t(lang, S.rowAddress)}</dt><dd>${site.address?.[lang] ? t(lang, site.address[lang]).replace(/\n/g, '<br>') : fill('address', S.fillAddress)}</dd></div>`,
    `<div class="facts__row"><dt>${t(lang, S.rowPrices)}</dt><dd>${t(lang, S.pricesNote)}</dd></div>`,
  ].filter(Boolean).join('\n            ');

  const alternates = LANGS.map((l) => `<link rel="alternate" hreflang="${strings[l.id].htmlLang}" href="${site.url ? absolute(l) : here(l)}">`).join('\n  ')
    + `\n  <link rel="alternate" hreflang="x-default" href="${site.url ? absolute(LANGS[0]) : here(LANGS[0])}">`;
  const thisLang = LANGS.find((l) => l.id === lang);

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
  ${site.url ? `<meta property="og:url" content="${absolute(thisLang)}">\n  <meta property="og:image" content="${site.url.replace(/\/?$/, '/')}assets/img/share.jpg">` : ''}
  <link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
  <link rel="preload" href="${root}assets/fonts/onest-${lang === 'sr' ? 'cyrillic' : 'latin'}-400-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="${root}assets/fonts/onest-${lang === 'sr' ? 'cyrillic' : 'latin'}-700-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="${root}assets/css/site.css">
  <script>document.documentElement.className = 'js';</script>
</head>
<body>
  <a class="skip" href="#catalogue">${t(lang, S.skip)}</a>
  <header class="slab">
    <div class="container slab__inner">
      <a class="wordmark" href="${root}${dir}"><b>${t(lang, S.org)}</b><span>${t(lang, S.sub)}</span></a>
      <nav class="langs" aria-label="${t(lang, S.langsLabel)}">
        ${LANGS.map((l) => `<a href="${here(l)}" hreflang="${strings[l.id].htmlLang}" lang="${strings[l.id].htmlLang}" aria-label="${esc(strings[l.id].langName)}" data-lang${l.id === lang ? ' aria-current="page"' : ''}><span class="l-long">${esc(strings[l.id].langName)}</span><span class="l-short" aria-hidden="true">${esc(strings[l.id].langShort)}</span></a>`).join('\n        ')}
      </nav>
      <button class="listbtn" type="button" data-open-list hidden>${t(lang, S.list)} <span class="listbtn__n" data-count>0</span></button>
    </div>
  </header>

  <main id="main">
    <section class="hero">
      <div class="container hero__grid">
        <div class="hero__text">
          <h1>${t(lang, S.h1)}</h1>
          <p class="lead">${t(lang, S.lead)}</p>
          <form class="find" action="#catalogue" data-find hidden>
            <label for="q-hero">${t(lang, S.findLabel)}</label>
            <div class="find__row">
              <input id="q-hero" type="search" name="q" placeholder="${t(lang, S.findPlaceholder)}" autocomplete="off" spellcheck="false">
              <button class="btn btn--primary" type="submit">${t(lang, S.findButton)}</button>
            </div>
          </form>
          <p class="hero__links"><a class="btn btn--primary" href="#catalogue" data-nojs>${t(lang, S.browse)}</a><a class="textlink" href="#commander">${t(lang, S.how)}</a></p>
        </div>
        <nav class="shelves" aria-label="${t(lang, S.catsLabel)}">
          <ul role="list">
        ${shelves}
          </ul>
        </nav>
      </div>
    </section>

    <section class="catalogue" id="catalogue" aria-label="${t(lang, S.sub)}">
      <div class="bar">
        <div class="container bar__inner">
          <div class="bar__find" data-js hidden>
            <label class="visually-hidden" for="q">${t(lang, S.findLabel)}</label>
            <input id="q" type="search" placeholder="${t(lang, S.barPlaceholder)}" autocomplete="off" spellcheck="false">
            <button class="bar__clear" type="button" data-clear hidden>${t(lang, S.clear)}</button>
          </div>
          <nav class="chips" aria-label="${t(lang, S.catsLabel)}" data-chips>${chips}</nav>
          <p class="bar__status" role="status" data-status>${count(lang, totalItems)}</p>
          <button class="listbtn listbtn--bar" type="button" data-open-list hidden>${t(lang, S.list)} <span class="listbtn__n" data-count>0</span></button>
        </div>
      </div>
      <div class="container">
      <p class="nomatch" data-nomatch hidden></p>
      ${sections}
      </div>
    </section>

    <section class="order" id="commander" aria-labelledby="h-order">
      <div class="container order__grid">
        <div class="order__text">
          <h2 id="h-order">${t(lang, S.orderH2)}</h2>
          <p class="lead">${t(lang, S.orderLead)}</p>
          <ol class="steps">
            ${S.steps.map((s) => `<li>${t(lang, s)}</li>`).join('\n            ')}
          </ol>
        </div>
        <div class="order__facts">
          <dl class="facts">
            ${contactRows}
          </dl>
          <button class="btn btn--primary" type="button" data-open-list hidden>${t(lang, S.openList)}</button>
        </div>
      </div>
    </section>
  </main>

  <footer class="colophon">
    <div class="container colophon__inner">
      <p><b>${t(lang, S.orgFull)}.</b> ${t(lang, S.footerLine)} ${t(lang, S.footerPhotos)}</p>
      <p>${t(lang, S.otherLangs)} ${LANGS.filter((l) => l.id !== lang).map((l) => `<a href="${here(l)}" hreflang="${strings[l.id].htmlLang}" lang="${strings[l.id].htmlLang}" data-lang>${esc(strings[l.id].langName)}</a>`).join(` ${lang === 'fr' ? 'et' : lang === 'en' ? 'and' : 'и'} `)}.</p>
      <p>© ${new Date().getFullYear()} ${t(lang, S.org)}</p>
    </div>
  </footer>

  <dialog class="detail" data-detail-dialog aria-labelledby="detail-name">
    <div class="detail__inner">
      <div class="detail__media">
        <figure class="detail__photo" data-detail-photo></figure>
        <div class="detail__thumbs" data-detail-thumbs></div>
      </div>
      <div class="detail__text">
        <h2 id="detail-name" class="detail__name" data-detail-name></h2>
        <p class="detail__meta" data-detail-meta></p>
        <p class="detail__price" data-detail-price></p>
        <p class="detail__note" data-detail-note hidden></p>
        <button class="add add--big" type="button" data-detail-add aria-pressed="false">${t(lang, S.add)}</button>
      </div>
      <button class="iconbtn detail__close" type="button" data-close aria-label="${t(lang, S.close)}"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg></button>
    </div>
  </dialog>

  <dialog class="drawer" data-list-dialog aria-labelledby="drawer-title">
    <div class="drawer__inner">
      <div class="drawer__head">
        <h2 id="drawer-title">${t(lang, S.list)}</h2>
        <button class="iconbtn" type="button" data-close aria-label="${t(lang, S.close)}"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg></button>
      </div>
      <div class="drawer__body" data-list-body></div>
      <div class="drawer__foot" data-list-foot></div>
    </div>
  </dialog>

  <script type="application/json" id="catalogue-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
  <script src="${root}assets/js/app.js" defer></script>
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
