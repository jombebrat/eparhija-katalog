// Catalogue markup, shared by build.mjs (the pages as built) and app.js (the live catalogue from the database).
// Pure functions: data and strings in, HTML strings out. No prices here: they reach the page only for the clergy.

const CYR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z', и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'c', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz', ш: 's', đ: 'dj' };
// lower case, no accents, Serbian Cyrillic to Latin: "brojanica" finds "бројаница"
export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[а-шђјљњћџđ]/g, (c) => CYR[c] ?? c).replace(/[’'`]/g, ' ').replace(/\s+/g, ' ').trim();
// codes are typed in either script: P074 and Р074, H016 and Н016
const codeKeys = (code) => { const c = String(code).toLowerCase(); return [c, c.replace(/^p/, 'r').replace(/^h/, 'n')]; };

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// French typography: thin no-break space before : ; ? ! and inside « », true apostrophe everywhere
export const typo = (lang, s) => {
  let t = String(s ?? '').replace(/'/g, '’');
  if (lang === 'fr') t = t.replace(/ ([:;?!»])/g, ' $1').replace(/« /g, '« ');
  return t;
};
const tx = (lang, s) => esc(typo(lang, s));
export const countText = (S, n, key = 'items') => {
  const forms = S[key];
  return `${n} ${forms[new Intl.PluralRules(S.locale).select(n)] ?? forms.other}`;
};

// a photo is a file of the site (p074-1) or an uploaded one (a full Storage URL without its .webp ending)
export const photoUrl = (root, src, small = true) =>
  (/^https?:/.test(src) ? src : `${root}assets/img/p/${src}`) + (small ? '-s.webp' : '.webp');

// rows from the database, or the snapshot in data/catalogue.json, into one shape.
// options: the saint or feast of an icon, each with its own code; an article with options is out only when all are.
export function fromDb(categories, products, options = []) {
  // a translation left empty in the admin falls back to another language rather than a blank
  const tri = (o, k) => {
    const fr = o[`${k}_fr`] || '', en = o[`${k}_en`] || '', sr = o[`${k}_sr`] || '';
    return { fr: fr || en || sr, en: en || fr || sr, sr: sr || fr || en };
  };
  const opts = {};
  for (const o of options) if (o.active !== false) (opts[o.product] ??= []).push({ id: o.id, sku: o.sku || '', label: tri(o, 'label'), available: o.available !== false, sort: o.sort ?? 0 });
  return {
    categories: categories.map((c) => ({ id: c.id, name: tri(c, 'name'), layout: c.layout || 'grid', cover: c.cover || null, sort: c.sort ?? 0 }))
      .sort((a, b) => a.sort - b.sort),
    products: products.map((p) => {
      const o = (opts[p.code] || []).sort((a, b) => a.sort - b.sort);
      return {
        code: p.code, category: p.category, name: tri(p, 'name'),
        note: p.note_fr || p.note_en || p.note_sr ? tri(p, 'note') : null,
        unit: p.unit || 'piece', available: p.available !== false && (!o.length || o.some((x) => x.available)),
        photos: Array.isArray(p.photos) ? p.photos : [], sort: p.sort ?? 0, options: o,
      };
    }).sort((a, b) => a.sort - b.sort),
  };
}

export const searchKey = (p, catName) => norm([p.name.fr, p.name.en, p.name.sr, ...codeKeys(p.code), catName?.fr, catName?.en, catName?.sr,
  ...(p.options || []).flatMap((o) => [o.label.fr, o.label.en, o.label.sr, o.sku])].filter(Boolean).join(' '));

// options in the reader's alphabet, saints by their name: "Saint Nicolas" files under N, "Св. архангел Михаило" under М
const TITLE_WORDS = /^(saints?|sainte|sts?|св\.|света|свети|пресвета|archange|archangel|апостоли?|архангел|архиђакон|пророк|врачи|владика|кнез|цар|the|les?|la|l’)\s+/i;
const sortName = (s) => { let t = String(s || ''), u; while ((u = t.replace(TITLE_WORDS, '')) !== t) t = u; return t; };
export const sortedOptions = (p, lang, locale) => {
  const col = new Intl.Collator(locale || lang, { sensitivity: 'base' });
  return [...(p.options || [])].sort((a, b) => col.compare(sortName(a.label[lang]), sortName(b.label[lang])) || col.compare(a.label[lang], b.label[lang]) || a.sku.localeCompare(b.sku));
};

const byCategory = (m) => Object.fromEntries(m.categories.map((c) => [c.id, m.products.filter((p) => p.category === c.id)]));
const coverOf = (m, c, list) => (list.find((p) => p.code === c.cover && p.photos.length) || list.find((p) => p.photos.length))?.photos[0];

// ---------- the home page index of categories ----------
export function shelves(m, { lang, S, root }) {
  const by = byCategory(m);
  return m.categories.filter((c) => by[c.id].length).map((c, i) => {
    const list = by[c.id];
    const ph = coverOf(m, c, list);
    const n = list.length;
    const words = countText(S, n, c.layout === 'table' ? 'sizes' : 'items').replace(/^\d+/, '');
    return `<li class="shelf"><a href="#${esc(c.id)}">
          <span class="shelf__img">${ph ? `<img src="${esc(photoUrl(root, ph.src))}" width="${ph.w}" height="${ph.h}" alt="" ${i < 8 ? `fetchpriority="${i < 4 ? 'high' : 'auto'}"` : 'loading="lazy"'} decoding="async">` : ''}</span>
          <span class="shelf__name">${tx(lang, c.name[lang])}</span>
          <span class="shelf__count">${n}<span class="visually-hidden">${esc(words)}</span></span>
        </a></li>`;
  }).join('\n        ');
}

export function chips(m, { lang }) {
  const by = byCategory(m);
  return m.categories.filter((c) => by[c.id].length).map((c) => `<a href="#${esc(c.id)}" data-chip="${esc(c.id)}">${tx(lang, c.name[lang])}</a>`).join('');
}

// ---------- one card, one row ----------
function addButton(p, { lang, S }, cls = 'add') {
  const name = typo(lang, p.name[lang]);
  if (p.available && p.options?.length) return `<button class="${cls} add--choose" type="button" data-choose="${esc(p.code)}" aria-haspopup="dialog" aria-label="${esc(typo(lang, S.chooseLabel).replace('{name}', name))}">${tx(lang, S.choose)}</button>`;
  if (!p.available) return `<button class="${cls} add--out" type="button" disabled aria-label="${esc(`${S.outOfStock}: ${name}`)}">${tx(lang, S.outOfStock)}</button>`;
  return `<button class="${cls}" type="button" data-add="${esc(p.code)}" aria-label="${esc(typo(lang, S.addLabel).replace('{name}', name))}">${tx(lang, S.add)}</button>`;
}

function card(p, ctx, catName) {
  const { lang, S, root } = ctx;
  const name = p.name[lang];
  const ph = p.photos[0];
  const big = ph ? esc(photoUrl(root, ph.src, false)) : '';
  const pic = ph
    ? `<a class="card__img" href="${big}" data-detail="${esc(p.code)}" tabindex="-1" aria-hidden="true"><img src="${esc(photoUrl(root, ph.src))}" width="${ph.w}" height="${ph.h}" alt="" loading="lazy" decoding="async"></a>`
    : `<span class="card__img card__img--none" aria-hidden="true"><span>${tx(lang, S.noPhoto)}</span></span>`;
  return `<li class="card${p.available ? '' : ' card--out'}" data-code="${esc(p.code)}" data-search="${esc(searchKey(p, catName))}">
          ${pic}
          <h3 class="card__name">${ph ? `<a href="${big}" data-detail="${esc(p.code)}">${tx(lang, name)}</a>` : tx(lang, name)}</h3>
          <p class="card__meta"><span class="card__code">${esc(p.code)}</span><span class="card__price" data-price="${esc(p.code)}"></span></p>
          ${p.options?.length ? `<p class="card__opts">${tx(lang, S.optCount.replace('{n}', p.options.length))}</p>` : ''}
          ${addButton(p, ctx)}
        </li>`;
}

function row(p, ctx, catName) {
  const { lang } = ctx;
  return `<tr data-code="${esc(p.code)}" data-search="${esc(searchKey(p, catName))}"${p.available ? '' : ' class="row--out"'}>
              <th scope="row">${esc(p.code)}</th>
              <td class="num note">${tx(lang, p.note?.[lang] ?? '')}</td>
              <td class="num price" data-price="${esc(p.code)}"></td>
              <td class="act">${addButton(p, ctx, 'add add--row')}</td>
            </tr>`;
}

// ---------- the catalogue, category by category ----------
export function sections(m, ctx) {
  const { lang, S, root } = ctx;
  const by = byCategory(m);
  return m.categories.filter((c) => by[c.id].length).map((c) => {
    const list = by[c.id];
    const head = `<div class="cat__head"><h2 id="h-${esc(c.id)}">${tx(lang, c.name[lang])}</h2><p class="cat__count">${esc(countText(S, list.length, c.layout === 'table' ? 'sizes' : 'items'))}</p></div>`;
    if (c.layout !== 'table') {
      return `<section class="cat" id="${esc(c.id)}" aria-labelledby="h-${esc(c.id)}" data-cat>
        ${head}
        <ul class="grid" role="list">
        ${list.map((p) => card(p, ctx, c.name)).join('\n        ')}
        </ul>
      </section>`;
    }
    const ph = coverOf(m, c, list);
    const candles = c.id === 'bougies';
    return `<section class="cat cat--candles" id="${esc(c.id)}" aria-labelledby="h-${esc(c.id)}" data-cat>
        ${head}
        <div class="candles">
          ${ph ? `<figure class="candles__photo"><img src="${esc(photoUrl(root, ph.src, false))}" width="${ph.W}" height="${ph.H}" alt="" loading="lazy" decoding="async"></figure>` : ''}
          <div class="candles__body">
            ${candles ? `<p class="lead">${tx(lang, S.candlesLead)}</p>` : ''}
            <div class="table-wrap" tabindex="0" role="region" aria-labelledby="h-${esc(c.id)}">
            <table class="candles__table">
              ${candles ? `<caption>${tx(lang, S.candlesCaption)}</caption>` : ''}
              <thead><tr><th scope="col">${tx(lang, S.thFormat)}</th><th scope="col" class="num">${tx(lang, candles ? S.thSize : S.thDetail)}</th><th scope="col" class="num price">${tx(lang, list.some((p) => p.unit === 'kg') ? S.thPrice : S.thPriceUnit)}</th><th scope="col" class="act"><span class="visually-hidden">${tx(lang, S.thList)}</span></th></tr></thead>
              <tbody>
            ${list.map((p) => row(p, ctx, c.name)).join('\n            ')}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </section>`;
  }).join('\n      ');
}

// what the page script needs for each article, in this language
// o: the options as [id, label, code] (+ 1 when out of stock), in the order the reader looks for them
export function clientData(m, { lang, S }) {
  const cats = Object.fromEntries(m.categories.map((c) => [c.id, typo(lang, c.name[lang])]));
  const p = Object.fromEntries(m.products.map((x) => [x.code, {
    n: typo(lang, x.name[lang]), c: x.category, ph: x.photos.map((f) => [f.src, f.W, f.H]),
    ...(x.unit === 'kg' ? { kg: 1 } : {}), ...(x.available ? {} : { out: 1 }),
    ...(x.options?.length ? { o: sortedOptions(x, lang, S?.locale).map((o) => [o.id, typo(lang, o.label[lang]), o.sku, ...(o.available ? [] : [1])]) } : {}),
    ...(x.note && m.categories.find((c) => c.id === x.category)?.layout !== 'table' ? { note: typo(lang, x.note[lang]) } : {}),
  }]));
  return { cats, p, total: m.products.length };
}
// A member's name for the Serbian pages and PDF: the French title in Serbian, the name in Cyrillic.
// "P. Jovan Pavlović" → "о. Јован Павловић". A name with a word that is not Serbian Latin (Guilhem Bousquet, Paulo Brandão) stays as written.
const TITLES = [
  [/^mère higoumène(?=\s|$)/i, 'Игуманија'], [/^moine-prêtre(?=\s|$)/i, 'Јеромонах'], [/^archiprêtre(?=\s|$)/i, 'Протојереј'],
  [/^archimandrite(?=\s|$)/i, 'Архимандрит'], [/^hiéromoine(?=\s|$)/i, 'Јеромонах'], [/^hiérodiacre(?=\s|$)/i, 'Јерођакон'],
  [/^protodiacre(?=\s|$)/i, 'Протођакон'], [/^diacre(?=\s|$)/i, 'Ђакон'], [/^moniale(?=\s|$)/i, 'Монахиња'], [/^moine(?=\s|$)/i, 'Монах'],
  [/^(?:p\.|père)(?=\s|$)/i, 'о.'],
];
const LAT = { a: 'а', b: 'б', c: 'ц', č: 'ч', ć: 'ћ', d: 'д', đ: 'ђ', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'ј', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', r: 'р', s: 'с', š: 'ш', t: 'т', u: 'у', v: 'в', z: 'з', ž: 'ж' };
const DIGRAPH = { lj: 'љ', nj: 'њ', dž: 'џ' };
const serbian = (w) => /^[a-zčćđšž]+$/iu.test(w) && !/[qwxy]/i.test(w);
const word = (w) => {
  let out = '';
  for (let i = 0; i < w.length; i++) {
    const two = w.slice(i, i + 2), d = DIGRAPH[two.toLowerCase()];
    const up = (c, src) => (src !== src.toLowerCase() ? c.toUpperCase() : c);
    if (d) { out += up(d, two[0]); i++; continue; }
    out += up(LAT[w[i].toLowerCase()], w[i]);
  }
  return out;
};
export function toCyrillic(name) {
  let s = String(name ?? '').trim();
  let title = '';
  for (const [re, t] of TITLES) if (re.test(s)) { title = t; s = s.replace(re, '').trim(); break; }
  const words = s.match(/\p{L}+/gu) || [];
  if (words.every(serbian)) s = s.replace(/\p{L}+/gu, word);
  return [title, s].filter(Boolean).join(' ');
}
