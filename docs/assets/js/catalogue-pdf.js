// The price-list PDF: every active article with its photo and price, names in Serbian (Cyrillic), French and English,
// in one file. Made in the admin panel's browser (photos are decoded by the browser, so WebP works) with pdf-lib,
// kept in the private bucket `catalogue`, and handed only to members whose email is on the list.
// Libraries: assets/vendor (pdf-lib 1.17.1, @pdf-lib/fontkit 1.1.1, both MIT). Font: Onest (OFL).
const W = 595.28, H = 841.89, MX = 40, GAP = 14, FOOT = 46;
const BAND = 118, STRIP = 34, PHOTO_H = 118;

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
async function jpeg(url, max = 460) {
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
  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.82));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

// products: rows of the table products (with price); cats, options: rows of their tables.
// photoUrl(src) gives the address of an article's small photo; siteBase is where assets/ lives.
export async function buildCatalogue({ products, cats, options, photoUrl, siteBase, now = new Date(), onProgress = () => {} }) {
  const { PDFLib, fontkit } = await loadLibs();
  const { PDFDocument, rgb } = PDFLib;
  const INK = rgb(0.086, 0.086, 0.086), PAPER = rgb(1, 1, 1), MUTED = rgb(0.4, 0.4, 0.4), SOFT = rgb(0.74, 0.74, 0.72);
  const RULE = rgb(0.88, 0.88, 0.86), GOLD = rgb(0.72, 0.53, 0.14), ON_DARK = rgb(0.8, 0.8, 0.78);

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

  // ----- photos -----
  const imgs = new Map();
  const want = [...new Set(sections.flatMap((s) => s.items.map((p) => p.photos?.[0]?.src).filter(Boolean)))];
  let done = 0;
  const queue = [...want];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const src = queue.shift();
      try { const j = await jpeg(photoUrl(src)); imgs.set(src, { img: await doc.embedJpg(j.bytes), w: j.w, h: j.h }); } catch { /* the article gets a blank frame */ }
      onProgress(`Fotografije ${++done} / ${want.length}`);
    }
  }));

  // ----- drawing helpers (y counts from the top of the page) -----
  const safe = (s) => String(s ?? '').replace(/[   ]/g, ' ').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  const width = (s, f, size) => f.widthOfTextAtSize(s, size);
  function wrap(text, f, size, maxW, maxLines) {
    const words = safe(text).split(' ').filter(Boolean);
    const lines = []; let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (width(t, f, size) <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      let last = lines.slice(maxLines - 1).join(' ');
      while (last.length > 1 && width(`${last}…`, f, size) > maxW) last = last.slice(0, -1);
      lines.length = maxLines; lines[maxLines - 1] = `${last.trimEnd()}…`;
    }
    return lines;
  }
  const text = (pg, s, x, top, size, f = reg, color = INK, opts = {}) => {
    const str = safe(s);
    if (!str) return;
    const w = width(str, f, size);
    const px = opts.align === 'right' ? x - w : opts.align === 'center' ? x - w / 2 : x;
    pg.drawText(str, { x: px, y: H - top - size * 0.8, size, font: f, color });
  };
  const rect = (pg, x, top, w, h, color, border) => pg.drawRectangle({ x, y: H - top - h, width: w, height: h, ...(color ? { color } : {}), ...(border ? { borderColor: border, borderWidth: 0.6 } : {}) });
  const pill = (pg, label, xRight, top, h = 16) => {
    const w = width(label, bold, 9) + 14;
    rect(pg, xRight - w, top, w, h, INK);
    text(pg, label, xRight - w / 2, top + (h - 9 * 0.8) / 2 - 0.4, 9, bold, PAPER, { align: 'center' });
  };
  const fitImage = (pg, e, x, top, bw, bh, pad = 9) => {
    const s = Math.min((bw - 2 * pad) / e.w, (bh - 2 * pad) / e.h);
    const w = e.w * s, h = e.h * s;
    pg.drawImage(e.img, { x: x + (bw - w) / 2, y: H - top - bh + (bh - h) / 2, width: w, height: h });
  };
  const namesOf = (c) => [safe(c.name_sr), safe(c.name_fr), safe(c.name_en)];
  const countLine = (n) => `${n} ${srPlural(n, 'артикал', 'артикла', 'артикала')} · ${n} article${n > 1 ? 's' : ''} · ${n} item${n > 1 ? 's' : ''}`;

  // ----- cover -----
  onProgress('Slažem stranice…');
  const cover = doc.addPage([W, H]);
  rect(cover, 0, 0, W, 470, INK);
  cover.drawImage(emblem, { x: MX, y: H - 40 - 74, width: 56, height: 74 });
  text(cover, 'КАТАЛОГ', MX, 168, 62, bold, PAPER);
  text(cover, 'CATALOGUE', MX, 238, 22, bold, ON_DARK);
  const tag = `Ценовник ${now.getFullYear()}  ·  Liste de prix  ·  Price list`;
  const tagW = width(tag, bold, 11) + 28;
  rect(cover, MX, 282, tagW, 28, PAPER);
  text(cover, tag, MX + 14, 282 + (28 - 8.8) / 2 - 0.4, 11, bold, INK);
  // six covers of the categories, straddling the dark block's edge
  const tiles = sections.map((s) => { const c = live.find((p) => p.code === s.cat.cover) || s.items.find((p) => p.photos?.length); return c && imgs.get(c.photos?.[0]?.src); }).filter(Boolean).slice(0, 6);
  const TW = (W - 2 * MX - 2 * 10) / 3, TH = 108;
  tiles.forEach((e, i) => {
    const x = MX + (i % 3) * (TW + 10), top = 346 + Math.floor(i / 3) * (TH + 10);
    rect(cover, x, top, TW, TH, PAPER, RULE);
    fitImage(cover, e, x, top, TW, TH, 8);
  });
  const nameTop = 346 + (tiles.length > 3 ? 2 : 1) * (TH + 10) + 22;
  text(cover, 'Магацин Епархије западноевропске', MX, nameTop, 17, bold);
  text(cover, 'Entrepôt du Diocèse d’Europe occidentale', MX, nameTop + 26, 10.5, reg, MUTED);
  text(cover, 'Warehouse of the Eparchy of Western Europe', MX, nameTop + 41, 10.5, reg, MUTED);
  text(cover, 'MAGACIN ZAPADNOEVROPSKI SASU · 23, rue du Simplon, 75018 Paris · RCS Paris 981 254 600 · FR52981254600', MX, H - 74, 7.5, reg, MUTED);
  text(cover, `Ажурирано · Mis à jour · Updated: ${parisDate(now)}   ·   magacinzapadnoevropski.com`, MX, H - 60, 7.5, reg, MUTED);
  rect(cover, MX, H - 86, 28, 2.5, GOLD);

  // ----- the contents page is filled in last, when the page numbers are known -----
  const toc = doc.addPage([W, H]);

  // ----- sections -----
  let pg = null, y = 0, curSection = null;
  const pageNo = () => doc.getPageCount();
  const strip = (s) => {
    pg = doc.addPage([W, H]);
    rect(pg, 0, 0, W, STRIP, INK);
    const [sr, fr, en] = namesOf(s.cat);
    text(pg, sr, MX, 10.5, 11, bold, PAPER);
    text(pg, `${fr}  ·  ${en}`, MX + width(safe(sr), bold, 11) + 12, 12.3, 8.5, reg, SOFT);
    y = STRIP + 20;
  };
  const band = (s) => {
    pg = doc.addPage([W, H]);
    rect(pg, 0, 0, W, BAND, INK);
    const [sr, fr, en] = namesOf(s.cat);
    text(pg, sr, MX, 34, 30, bold, PAPER);
    text(pg, `${fr}  ·  ${en}`, MX, 76, 11.5, reg, ON_DARK);
    text(pg, countLine(s.items.length), W - MX, 78, 8.5, reg, SOFT, { align: 'right' });
    rect(pg, MX, 100, 28, 2.5, GOLD);
    y = BAND + 24;
  };
  const room = (h, s) => { if (y + h > H - FOOT) strip(s); };
  const starts = [];

  const colW = (W - 2 * MX - 2 * GAP) / 3;
  function cell(p, x, top, rowH, lines) {
    const ph = p.photos?.[0]?.src && imgs.get(p.photos[0].src);
    rect(pg, x, top, colW, PHOTO_H, PAPER, RULE);
    if (ph) fitImage(pg, ph, x, top, colW, PHOTO_H);
    let t = top + PHOTO_H + 8;
    for (const l of lines.sr) { text(pg, l, x, t, 9, bold); t += 11; }
    for (const l of lines.fr) { text(pg, l, x, t + 0.5, 7.5, reg, MUTED); t += 9.5; }
    for (const l of lines.en) { text(pg, l, x, t + 0.5, 7.5, reg, MUTED); t += 9.5; }
    if (lines.opts) text(pg, lines.opts, x, t + 1, 7.5, bold, GOLD);
    const fy = top + rowH - 18;
    text(pg, p.code, x, fy + 4.4, 8, bold, MUTED);
    pill(pg, price(p.price, p.unit), x + colW, fy);
  }
  function grid(s) {
    for (let i = 0; i < s.items.length; i += 3) {
      const row = s.items.slice(i, i + 3).map((p) => {
        const n = (optsOf.get(p.code) || []).length;
        const sr = wrap(p.name_sr || p.name_fr || p.name_en || p.code, bold, 9, colW, 2);
        const fr = wrap(p.name_fr, reg, 7.5, colW, 2);
        const en = p.name_en && safe(p.name_en) !== safe(p.name_fr) ? wrap(p.name_en, reg, 7.5, colW, 2) : [];
        const opts = n ? `${n} ${srPlural(n, 'опција', 'опције', 'опција')} · ${n} ${n > 1 ? 'options' : 'option'}` : '';
        return { p, lines: { sr, fr: p.name_sr ? fr : [], en: p.name_sr ? en : [], opts }, h: PHOTO_H + 8 + sr.length * 11 + (p.name_sr ? fr.length + en.length : 0) * 9.5 + (opts ? 10 : 0) + 8 + 18 };
      });
      const rowH = Math.max(...row.map((r) => r.h));
      room(rowH, s);
      row.forEach((r, k) => cell(r.p, MX + k * (colW + GAP), y, rowH, r.lines));
      y += rowH + 16;
    }
  }
  function table(s) {
    for (const p of s.items) {
      room(34, s);
      text(pg, p.name_sr || p.name_fr || p.code, MX, y + 2, 10.5, bold);
      text(pg, [safe(p.name_fr), safe(p.name_en)].filter((v, i, a) => v && a.indexOf(v) === i).join('  ·  '), MX, y + 16.5, 8, reg, MUTED);
      text(pg, p.code, W - MX - 120, y + 7.2, 8.5, bold, MUTED, { align: 'right' });
      pill(pg, price(p.price, p.unit), W - MX, y + 3);
      rect(pg, MX, y + 29.5, W - 2 * MX, 0.5, RULE);
      y += 34;
    }
  }
  function optionsList(s) {
    const withOpts = s.items.filter((p) => (optsOf.get(p.code) || []).length);
    for (const p of withOpts) {
      const list = optsOf.get(p.code).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.label_sr).localeCompare(String(b.label_sr), 'sr'));
      const body = wrap(list.map((o) => safe(o.label_sr || o.label_fr || o.label_en)).join('  ·  '), reg, 8, W - 2 * MX, 40);
      room(Math.min(40, 20 + body.length * 11), s);
      text(pg, `${p.code}  ${safe(p.name_sr || p.name_fr)}`, MX, y, 9.5, bold);
      text(pg, `${list.length} ${srPlural(list.length, 'опција', 'опције', 'опција')} · ${list.length} ${list.length > 1 ? 'options' : 'option'}: ${safe(p.name_fr)} / ${safe(p.name_en)}`, MX, y + 13, 7.5, reg, MUTED);
      y += 28;
      for (const l of body) { room(11, s); text(pg, l, MX, y, 8, reg, INK); y += 11; }
      y += 12;
    }
  }
  for (const s of sections) {
    curSection = s;
    band(s);
    starts.push(pageNo());
    s.cat.layout === 'table' ? table(s) : grid(s);
    optionsList(s);
  }

  // ----- contents -----
  rect(toc, 0, 0, W, BAND, INK);
  text(toc, 'САДРЖАЈ', MX, 34, 30, bold, PAPER);
  text(toc, 'Sommaire  ·  Contents', MX, 76, 11.5, reg, ON_DARK);
  rect(toc, MX, 100, 28, 2.5, GOLD);
  let ty = BAND + 30;
  sections.forEach((s, i) => {
    const [sr, fr, en] = namesOf(s.cat);
    text(toc, sr, MX, ty, 13, bold);
    text(toc, `${fr}  ·  ${en}  ·  ${s.items.length}`, MX, ty + 18, 8.5, reg, MUTED);
    text(toc, String(starts[i]), W - MX, ty + 2, 13, bold, INK, { align: 'right' });
    rect(toc, MX, ty + 34, W - 2 * MX, 0.5, RULE);
    ty += 46;
  });
  const note = [
    'Цене су у еврима и важе за чланове Епархије. Стање залиха погледајте на сајту.',
    'Prix en euros, réservés aux membres du Diocèse. Pour le stock, consultez le site.',
    'Prices in euros, for members of the Eparchy. See the website for current stock.',
  ];
  ty = Math.max(ty + 12, H - FOOT - 70);
  note.forEach((l, i) => text(toc, l, MX, ty + i * 14, 9, i === 0 ? bold : reg, i === 0 ? INK : MUTED));

  // ----- footers -----
  doc.getPages().forEach((p, i) => {
    if (i === 0) return;
    rect(p, MX, H - FOOT + 12, W - 2 * MX, 0.5, RULE);
    text(p, 'Магацин Епархије западноевропске  ·  Entrepôt du Diocèse d’Europe occidentale  ·  Warehouse of the Eparchy', MX, H - FOOT + 20, 7, reg, MUTED);
    text(p, `${i + 1}`, W - MX, H - FOOT + 19, 8.5, bold, INK, { align: 'right' });
  });

  onProgress('Sastavljam PDF…');
  const out = await doc.save();
  return { bytes: out, pages: doc.getPageCount(), articles: sections.reduce((a, s) => a + s.items.length, 0) };
}
