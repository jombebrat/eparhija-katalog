// The price-list PDF: every active article with its photo and price, names in Serbian (Cyrillic), French and English,
// in one file. Made in the admin panel's browser (photos are decoded by the browser, so WebP works) with pdf-lib,
// kept in the private bucket `catalogue`, and handed only to members whose email is on the list.
// Libraries: assets/vendor (pdf-lib 1.17.1, @pdf-lib/fontkit 1.1.1, both MIT). Font: Onest (OFL).
//
// Design: burgundy cover; ivory pages with white product cards; burgundy headings and prices; antique-gold hairlines.
// Articles with options (the motifs of an icon) get their own section after the cards of their category:
// a heading, the number of options, and the options in two columns, split into SVETITELJI (names that start with "Св.")
// and OSTALO only when both groups are big enough. Names are never changed, merged or dropped.
const W = 595.28, H = 841.89, MX = 42, GAP = 14, FOOT = 50;
const PHOTO_H = 114, PAD = 10;

let libs = null;
function script(src) {
  return new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => no(new Error(`Ne mogu da učitam ${src}`));
    document.head.append(s);
  });
}
export async function loadLibs() {
  if (libs) return libs;
  if (!(window.PDFLib && window.fontkit)) {
    const base = new URL('../vendor/', import.meta.url).href;
    await script(`${base}pdf-lib.min.js?v=1.17.1`);
    await script(`${base}fontkit.umd.min.js?v=1.1.1`);
  }
  libs = { PDFLib: window.PDFLib, fontkit: window.fontkit };
  return libs;
}

const srPlural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
export const price = (n, unit) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace('.', ',')} €${unit === 'kg' ? ' / kg' : ''}`;
};
const parisDate = (d) => new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' }).format(d).replace(/\//g, '.');

async function bytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
// a photo as a JPEG on white, at most `max` px on its longer side
async function jpeg(url, max = 520) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const bmp = await createImageBitmap(await r.blob());
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
  cx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.84));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

// products: rows of the table products (with price); cats, options: rows of their tables.
// photoUrl(src) gives the address of an article's small photo; siteBase is where assets/ lives.
export async function buildCatalogue({ products, cats, options, photoUrl, siteBase, now = new Date(), onProgress = () => {} }) {
  const { PDFLib, fontkit } = await loadLibs();
  const { PDFDocument, rgb } = PDFLib;
  const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  const BURG = hex('#702832'), GOLD = hex('#B3945E'), IVORY = hex('#F6F3EC'), CHAR = hex('#34312F'), WHITE = hex('#FFFFFF'), BEIGE = hex('#EAE5DA'), PAGE = hex('#FDFCFA');
  const SOFT = hex('#6E6A66');           // charcoal, lighter, for translations and codes (contrast 5:1 on white)
  const ON_BURG = hex('#EBDCC0');        // ivory-gold text on the burgundy cover

  onProgress('Učitavam font i grb…');
  const [regB, boldB, emblemB] = await Promise.all([
    bytes(`${siteBase}assets/fonts/pdf/onest-400.ttf`), bytes(`${siteBase}assets/fonts/pdf/onest-700.ttf`), bytes(`${siteBase}assets/img/grb-480.png`),
  ]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(regB, { subset: true });
  const bold = await doc.embedFont(boldB, { subset: true });
  const emblem = await doc.embedPng(emblemB);
  doc.setTitle('Каталог · Catalogue · Catalog, Magacin Zapadnoevropski');
  doc.setAuthor('MAGACIN ZAPADNOEVROPSKI');
  doc.setSubject('Ценовник · Liste de prix · Price list');
  doc.setCreationDate(now); doc.setModificationDate(now);

  const live = products.filter((p) => p.active !== false);
  const optsOf = new Map();
  for (const o of options) if (o.active !== false) (optsOf.get(o.product) || optsOf.set(o.product, []).get(o.product)).push(o);
  const sections = [...cats].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.id).localeCompare(b.id))
    .map((c) => ({ cat: c, items: live.filter((p) => p.category === c.id).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.code.localeCompare(b.code)) }))
    .filter((s) => s.items.length);
  if (!sections.length) throw new Error('Nema nijednog artikla za PDF.');

  // what the file contains that deserves a second look (not changed, only reported)
  const notes = { duplicates: [], noPhoto: [], noPrice: [] };
  for (const [code, list] of optsOf) {
    const seen = new Map();
    for (const o of list) { const k = String(o.label_sr || '').trim(); seen.set(k, (seen.get(k) || 0) + 1); }
    for (const [k, n] of seen) if (n > 1) notes.duplicates.push({ code, label: k, times: n });
  }
  for (const p of live) {
    if (!p.photos?.length) notes.noPhoto.push(p.code);
    if (!(Number(p.price) > 0)) notes.noPrice.push(p.code);
  }

  // ----- photos -----
  const imgs = new Map();
  const want = [...new Set(sections.flatMap((s) => s.items.map((p) => p.photos?.[0]?.src).filter(Boolean)))];
  let done = 0;
  const queue = [...want];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const src = queue.shift();
      try { const j = await jpeg(photoUrl(src)); imgs.set(src, { img: await doc.embedJpg(j.bytes), w: j.w, h: j.h }); } catch { /* the card gets a blank frame */ }
      onProgress(`Fotografije ${++done} / ${want.length}`);
    }
  }));

  // ----- drawing helpers (y counts from the top of the page) -----
  const safe = (s) => String(s ?? '').replace(/[   ]/g, ' ').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  const width = (s, f, size) => f.widthOfTextAtSize(s, size);
  function wrap(text, f, size, maxW, maxLines = 99) {
    const words = safe(text).split(' ').filter(Boolean);
    const lines = []; let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (width(t, f, size) <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {   // only used for the product cards' translations; option names are never cut
      let last = lines.slice(maxLines - 1).join(' ');
      while (last.length > 1 && width(`${last}…`, f, size) > maxW) last = last.slice(0, -1);
      lines.length = maxLines; lines[maxLines - 1] = `${last.trimEnd()}…`;
    }
    return lines;
  }
  const text = (pg, s, x, top, size, f = reg, color = CHAR, opts = {}) => {
    const str = safe(s);
    if (!str) return 0;
    const w = width(str, f, size);
    const px = opts.align === 'right' ? x - w : opts.align === 'center' ? x - w / 2 : x;
    pg.drawText(str, { x: px, y: H - top - size * 0.8, size, font: f, color });
    return w;
  };
  // letter-spaced capitals for small labels
  const spaced = (pg, s, x, top, size, f, color, track = 1.4, align = 'left') => {
    const str = safe(s);
    const total = [...str].reduce((a, ch) => a + width(ch, f, size) + track, -track);
    let px = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    for (const ch of str) { pg.drawText(ch, { x: px, y: H - top - size * 0.8, size, font: f, color }); px += width(ch, f, size) + track; }
    return total;
  };
  const rect = (pg, x, top, w, h, color, border, bw = 0.6) => pg.drawRectangle({ x, y: H - top - h, width: w, height: h, ...(color ? { color } : {}), ...(border ? { borderColor: border, borderWidth: bw } : {}) });
  const line = (pg, x1, top, x2, color = GOLD, th = 0.6) => pg.drawLine({ start: { x: x1, y: H - top }, end: { x: x2, y: H - top }, thickness: th, color });
  const card = (pg, x, top, w, h, r = 4) => {
    const d = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    pg.drawSvgPath(d, { x, y: H - top, color: WHITE, borderColor: BEIGE, borderWidth: 0.8 });
  };
  const fitImage = (pg, e, x, top, bw, bh, pad = 8) => {
    const s = Math.min((bw - 2 * pad) / e.w, (bh - 2 * pad) / e.h);
    const w = e.w * s, h = e.h * s;
    pg.drawImage(e.img, { x: x + (bw - w) / 2, y: H - top - bh + (bh - h) / 2, width: w, height: h });
  };
  const namesOf = (c) => [safe(c.name_sr), safe(c.name_fr), safe(c.name_en)];
  const countLine = (n) => `${n} ${srPlural(n, 'артикал', 'артикла', 'артикала')}  ·  ${n} article${n > 1 ? 's' : ''}  ·  ${n} item${n > 1 ? 's' : ''}`;
  const pageOf = () => { const p = doc.addPage([W, H]); rect(p, 0, 0, W, H, PAGE); return p; };

  // ----- cover -----
  onProgress('Slažem stranice…');
  const cover = doc.addPage([W, H]);
  rect(cover, 0, 0, W, H, BURG);
  rect(cover, 26, 26, W - 52, H - 52, null, GOLD, 0.8);
  rect(cover, 31, 31, W - 62, H - 62, null, GOLD, 0.3);
  const cx0 = W / 2;
  cover.drawImage(emblem, { x: cx0 - 38, y: H - 64 - 100, width: 76, height: 100 });
  spaced(cover, 'MAGACIN ZAPADNOEVROPSKI', cx0, 196, 11.5, bold, GOLD, 3.2, 'center');
  text(cover, 'КАТАЛОГ', cx0, 262, 66, bold, IVORY, { align: 'center' });
  spaced(cover, 'CATALOGUE', cx0, 352, 19, reg, GOLD, 7, 'center');
  line(cover, cx0 - 26, 400, cx0 + 26, GOLD, 1);
  text(cover, `Ценовник ${now.getFullYear()}  ·  Liste de prix  ·  Price list`, cx0, 424, 14, bold, IVORY, { align: 'center' });
  text(cover, 'Магацин Епархије западноевропске', cx0, 610, 18, bold, IVORY, { align: 'center' });
  text(cover, 'Entrepôt du Diocèse d’Europe occidentale', cx0, 640, 12, reg, ON_BURG, { align: 'center' });
  text(cover, 'Warehouse of the Eparchy of Western Europe', cx0, 658, 12, reg, ON_BURG, { align: 'center' });
  line(cover, 60, H - 112, W - 60, GOLD, 0.4);
  text(cover, 'MAGACIN ZAPADNOEVROPSKI SASU  ·  23, rue du Simplon, 75018 Paris  ·  RCS Paris 981 254 600  ·  FR52981254600', cx0, H - 98, 8, reg, ON_BURG, { align: 'center' });
  text(cover, `Ажурирано  ·  Mis à jour  ·  Updated: ${parisDate(now)}   ·   magacinzapadnoevropski.com`, cx0, H - 82, 8, reg, ON_BURG, { align: 'center' });

  // ----- the contents page is filled in last, when the page numbers are known -----
  const toc = pageOf();

  // ----- sections -----
  let pg = null, y = 0;
  const pageNo = () => doc.getPageCount();
  const limit = () => H - FOOT;
  const running = (s) => {   // continuation page: the category's name, small, over a gold hairline
    pg = pageOf();
    const [sr, fr, en] = namesOf(s.cat);
    const w = text(pg, sr, MX, 24, 10, bold, BURG);
    text(pg, `${fr}  ·  ${en}`, MX + w + 10, 25, 8.5, reg, SOFT);
    line(pg, MX, 42, W - MX, GOLD, 0.5);
    y = 62;
  };
  const opening = (s) => {   // a category's first page
    pg = pageOf();
    const [sr, fr, en] = namesOf(s.cat);
    text(pg, sr, MX, 46, 30, bold, BURG);
    text(pg, countLine(s.items.length), W - MX, 58, 8.5, reg, SOFT, { align: 'right' });
    rect(pg, MX, 90, 34, 2, GOLD);
    text(pg, fr, MX, 104, 11.5, reg, CHAR);
    text(pg, en, MX, 120, 11.5, reg, SOFT);
    y = 152;
  };
  const room = (h, s) => { if (y + h > limit()) running(s); };
  const starts = [];

  const colW = (W - 2 * MX - 2 * GAP) / 3;
  function cell(p, x, top, rowH, lines) {
    card(pg, x, top, colW, rowH);
    const ph = p.photos?.[0]?.src && imgs.get(p.photos[0].src);
    if (ph) fitImage(pg, ph, x, top, colW, PHOTO_H, 10);
    let t = top + PHOTO_H + 8;
    for (const l of lines.sr) { text(pg, l, x + PAD, t, 10, bold, CHAR); t += 12.6; }
    for (const l of lines.fr) { text(pg, l, x + PAD, t + 1, 8.5, reg, SOFT); t += 10.8; }
    for (const l of lines.en) { text(pg, l, x + PAD, t + 1, 8.5, reg, SOFT); t += 10.8; }
    if (lines.opts) text(pg, lines.opts, x + PAD, t + 2, 8.5, bold, BURG);
    const fy = top + rowH - 26;
    line(pg, x + PAD, fy, x + colW - PAD, GOLD, 0.4);
    text(pg, p.code, x + PAD, fy + 9, 8.5, reg, SOFT);
    text(pg, price(p.price, p.unit), x + colW - PAD, fy + 6.5, 12.5, bold, BURG, { align: 'right' });
  }
  function grid(s) {
    const tw = colW - 2 * PAD;
    for (let i = 0; i < s.items.length; i += 3) {
      const row = s.items.slice(i, i + 3).map((p) => {
        const n = (optsOf.get(p.code) || []).length;
        const sr = wrap(p.name_sr || p.name_fr || p.name_en || p.code, bold, 10, tw, 3);
        const fr = p.name_sr ? wrap(p.name_fr, reg, 8.5, tw, 2) : [];
        const en = p.name_sr && p.name_en && safe(p.name_en) !== safe(p.name_fr) ? wrap(p.name_en, reg, 8.5, tw, 2) : [];
        const opts = n ? `${n} ${srPlural(n, 'мотив', 'мотива', 'мотива')}  ·  ${n} ${n > 1 ? 'options' : 'option'}` : '';
        return { p, lines: { sr, fr, en, opts }, h: PHOTO_H + 8 + sr.length * 12.6 + (fr.length + en.length) * 10.8 + (opts ? 13 : 0) + 12 + 26 };
      });
      const rowH = Math.max(...row.map((r) => r.h));
      room(rowH, s);
      row.forEach((r, k) => cell(r.p, MX + k * (colW + GAP), y, rowH, r.lines));
      y += rowH + GAP;
    }
  }
  function table(s) {   // the wax candles: one row per size
    for (const p of s.items) {
      room(40, s);
      text(pg, p.name_sr || p.name_fr || p.code, MX, y + 2, 11, bold, CHAR);
      text(pg, [safe(p.name_fr), safe(p.name_en)].filter((v, i, a) => v && a.indexOf(v) === i).join('  ·  '), MX, y + 18, 8.5, reg, SOFT);
      text(pg, p.code, W - MX - 110, y + 6, 8.5, reg, SOFT, { align: 'right' });
      text(pg, price(p.price, p.unit), W - MX, y + 3, 13, bold, BURG, { align: 'right' });
      line(pg, MX, y + 35, W - MX, BEIGE, 0.6);
      y += 40;
    }
  }

  // ----- the options of an article: its own section, two columns -----
  const OPT_SIZE = 9.5, OPT_LEAD = 12, OPT_ROW = 6;                      // line height, space between entries
  const optColW = (W - 2 * MX - 28) / 2;
  const heading = (s, p, list, again) => {
    const [fr, en] = [safe(p.name_fr), safe(p.name_en)];
    const w = text(pg, `${p.code}  ·  ${safe(p.name_sr || p.name_fr)}`, MX, y, again ? 12 : 15, bold, BURG);
    if (again) text(pg, `наставак  ·  suite  ·  continued`, MX + w + 10, y + 2.5, 8.5, reg, SOFT);
    y += again ? 20 : 24;
    if (!again) {
      text(pg, [fr, en].filter((v, i, a) => v && a.indexOf(v) === i).join('  ·  '), MX, y, 9.5, reg, SOFT);
      y += 16;
      const n = list.length;
      spaced(pg, `${n} ${srPlural(n, 'МОТИВ', 'МОТИВА', 'МОТИВА')}  ·  ${n} ${n > 1 ? 'MODÈLES' : 'MODÈLE'}  ·  ${n} ${n > 1 ? 'OPTIONS' : 'OPTION'}`, MX, y, 8.5, bold, CHAR, 1.2);
      y += 15;
    }
    line(pg, MX, y, W - MX, GOLD, 0.6);
    y += 14;
  };
  const group = (name, n) => {
    spaced(pg, name, MX, y, 8.5, bold, BURG, 1.6);
    line(pg, MX, y + 14, W - MX, BEIGE, 0.5);
    y += 22;
  };
  const entryH = (label) => wrap(label, reg, OPT_SIZE, optColW - 10).length * OPT_LEAD + OPT_ROW;
  // entries [{label}] flowed into two columns, as far down the page as they go; returns how many were placed
  function flow(entries, s, p) {
    let rest = entries.slice();
    while (rest.length) {
      const avail = limit() - y;
      const hs = rest.map((e) => entryH(e));
      // how many fit in two columns of `avail`
      let take = 0, sum = 0;
      while (take < rest.length && sum + hs[take] <= 2 * avail - 2 * (OPT_LEAD + OPT_ROW)) { sum += hs[take]; take++; }
      const left = rest.length - take;
      if (take < rest.length) {
        if (take < 6) { running(s); heading(s, p, optsOf.get(p.code), true); continue; }
        if (left < 6) take = Math.max(6, take - (6 - left));          // never leave one or two entries alone on the next page
      }
      const chunk = rest.slice(0, take);
      // balance: the left column gets half of the height, the right the remainder
      const total = chunk.reduce((a, e) => a + entryH(e), 0);
      let acc = 0, split = 0;
      while (split < chunk.length && acc + entryH(chunk[split]) / 2 < total / 2) { acc += entryH(chunk[split]); split++; }
      split = Math.max(1, Math.min(chunk.length, split));
      const cols = [chunk.slice(0, split), chunk.slice(split)];
      let tall = 0;
      cols.forEach((col, k) => {
        let yy = y;
        for (const e of col) {
          for (const l of wrap(e, reg, OPT_SIZE, optColW - 10)) { text(pg, l, MX + k * (optColW + 28), yy, OPT_SIZE, reg, CHAR); yy += OPT_LEAD; }
          yy += OPT_ROW;
        }
        tall = Math.max(tall, yy - y);
      });
      y += tall + 4;
      rest = rest.slice(take);
      if (rest.length) { running(s); heading(s, p, optsOf.get(p.code), true); }
    }
  }
  function optionsSection(s, p) {
    const list = [...optsOf.get(p.code)].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.label_sr).localeCompare(String(b.label_sr), 'sr'));
    const labels = list.map((o) => safe(o.label_sr || o.label_fr || o.label_en));
    const saints = labels.filter((l) => l.startsWith('Св.')), other = labels.filter((l) => !l.startsWith('Св.'));
    const grouped = saints.length >= 6 && other.length >= 3;           // only when the names themselves show the groups
    const need = 24 + 16 + 15 + 14 + (grouped ? 22 : 0) + 3 * (OPT_LEAD + OPT_ROW) * 2;
    if (y + need > limit()) running(s); else y += 8;
    heading(s, p, list, false);
    if (!grouped) return flow(labels, s, p);
    const place = (name, arr) => { if (y + 22 + 4 * (OPT_LEAD + OPT_ROW) > limit()) { running(s); heading(s, p, list, true); } group(name, arr.length); flow(arr, s, p); };
    place(`СВЕТИТЕЉИ  ·  ${saints.length}`, saints);
    place(`ОСТАЛО  ·  ${other.length}`, other);
  }
  for (const s of sections) {
    opening(s);
    starts.push(pageNo());
    s.cat.layout === 'table' ? table(s) : grid(s);
    for (const p of s.items) if ((optsOf.get(p.code) || []).length) { optionsSection(s, p); y += 10; }
  }

  // ----- contents -----
  text(toc, 'САДРЖАЈ', MX, 46, 30, bold, BURG);
  rect(toc, MX, 90, 34, 2, GOLD);
  text(toc, 'Sommaire  ·  Contents', MX, 104, 11.5, reg, SOFT);
  let ty = 152;
  sections.forEach((s, i) => {
    const [sr, fr, en] = namesOf(s.cat);
    text(toc, sr, MX, ty, 14, bold, BURG);
    text(toc, `${fr}  ·  ${en}`, MX, ty + 20, 9.5, reg, SOFT);
    text(toc, `${s.items.length}`, W - MX - 54, ty + 4, 9.5, reg, SOFT, { align: 'right' });
    text(toc, String(starts[i]), W - MX, ty, 14, bold, CHAR, { align: 'right' });
    line(toc, MX, ty + 33, W - MX, GOLD, 0.4);
    ty += 44;
  });
  const note = [
    'Цене су у еврима и важе за чланове Епархије. Стање залиха погледајте на сајту.',
    'Prix en euros, réservés aux membres du Diocèse. Pour le stock, consultez le site.',
    'Prices in euros, for members of the Eparchy. See the website for current stock.',
  ];
  ty = Math.min(ty + 10, H - FOOT - 56);
  note.forEach((l, i) => text(toc, l, MX, ty + i * 15, 9.5, i === 0 ? bold : reg, i === 0 ? CHAR : SOFT));

  // ----- footers -----
  doc.getPages().forEach((p, i) => {
    if (i === 0) return;
    line(p, MX, H - FOOT + 10, W - MX, GOLD, 0.5);
    text(p, 'Магацин Епархије западноевропске  ·  Entrepôt du Diocèse d’Europe occidentale  ·  Warehouse of the Eparchy', MX, H - FOOT + 19, 8, reg, SOFT);
    text(p, `${i + 1}`, W - MX, H - FOOT + 18, 10, bold, BURG, { align: 'right' });
  });

  onProgress('Sastavljam PDF…');
  const out = await doc.save();
  return { bytes: out, pages: doc.getPageCount(), articles: sections.reduce((a, s) => a + s.items.length, 0), notes };
}
