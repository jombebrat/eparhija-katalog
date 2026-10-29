// Builds the order PDF (A4) with pdf-lib. Pure: data and the font/emblem bytes in, PDF bytes out,
// so it runs in Deno and in Node. Fonts: Onest (OFL, assets/OFL.txt). Emblem: coat of arms of the SPC.
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { T, LOCALE, ADDRESS, fill, type Lang } from './i18n.ts';

export type Line = { code: string; name: string; qty: number; price: number; unit: 'piece' | 'kg' };
export type Assets = { regular: Uint8Array; bold: Uint8Array; emblem: Uint8Array };
export type Order = {
  number: number | string; date: Date; lang: Lang;
  email: string; name?: string; parish?: string; phone?: string; address?: string; note?: string;
  lines: Line[]; total: number;
};

const INK = rgb(0.09, 0.09, 0.09);
const INK2 = rgb(0.25, 0.25, 0.25);
const MUTED = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.86, 0.86, 0.85);
const W = 595.28, H = 841.89, M = 48;

export async function orderPdf(o: Order, a: Assets): Promise<Uint8Array> {
  const t = T[o.lang];
  const money = new Intl.NumberFormat(LOCALE[o.lang], { style: 'currency', currency: 'EUR' });
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(a.regular, { subset: true });
  const bold = await doc.embedFont(a.bold, { subset: true });
  const emblem = await doc.embedPng(a.emblem);
  doc.setTitle(fill(t.order, { n: o.number }));
  doc.setAuthor(t.org);
  doc.setCreator(t.sub);
  doc.setLanguage(LOCALE[o.lang]);

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const text = (s: string, x: number, yy: number, size: number, font: PDFFont = reg, color = INK) =>
    page.drawText(s, { x, y: yy, size, font, color });
  const right = (s: string, x: number, yy: number, size: number, font: PDFFont = reg, color = INK) =>
    text(s, x - font.widthOfTextAtSize(s, size), yy, size, font, color);
  const rule = (yy: number, color = RULE, thickness = 0.75) =>
    page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness, color });
  const wrap = (s: string, font: PDFFont, size: number, width: number) => {
    const words = s.split(/\s+/); const out: string[] = []; let cur = '';
    for (const w of words) {
      const next = cur ? cur + ' ' + w : w;
      if (font.widthOfTextAtSize(next, size) <= width || !cur) cur = next; else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out;
  };

  // columns
  const C = { code: M, item: M + 62, qty: 398, unit: 478, line: W - M };
  const itemW = C.qty - 46 - C.item;
  const tableHead = () => {
    text(t.code, C.code, y, 9, reg, MUTED);
    text(t.item, C.item, y, 9, reg, MUTED);
    right(t.qty, C.qty, y, 9, reg, MUTED);
    right(t.unit, C.unit, y, 9, reg, MUTED);
    right(t.line, C.line, y, 9, reg, MUTED);
    y -= 8; rule(y, INK, 0.9); y -= 16;
  };
  const newPage = (first: boolean) => {
    page = doc.addPage([W, H]); pages.push(page);
    y = H - M;
    const eh = first ? 64 : 40, ew = eh * emblem.width / emblem.height;
    page.drawImage(emblem, { x: M, y: y - eh + 6, width: ew, height: eh });
    const tx = M + ew + 14;
    text(t.org, tx, y - 6, first ? 13 : 11, bold);
    text(t.sub, tx, y - 21, 9, reg, MUTED);
    if (first) text(ADDRESS, tx, y - 34, 9, reg, MUTED);
    right(fill(t.order, { n: o.number }), W - M, y - 6, first ? 13 : 11, bold);
    right(new Intl.DateTimeFormat(LOCALE[o.lang], { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(o.date), W - M, y - 21, 9, reg, MUTED);
    y -= eh + 6; rule(y, INK, 0.9); y -= 26;
  };

  newPage(true);

  // who ordered
  const facts: [string, string | undefined][] = [
    [t.from, o.name], [t.parish, o.parish], [t.email, o.email], [t.phone, o.phone], [t.address, o.address],
  ];
  for (const [label, value] of facts) {
    if (!value) continue;
    const lines = wrap(value, reg, 10.5, W - M - (M + 110));
    text(label, M, y, 9, reg, MUTED);
    lines.forEach((l, i) => text(l, M + 110, y - i * 14, 10.5, i === 0 && label === t.from ? bold : reg));
    y -= 14 * lines.length + 4;
  }
  if (o.note) {
    const lines = wrap(o.note.replace(/\s+/g, ' '), reg, 10, W - M - (M + 110));
    text(t.note, M, y, 9, reg, MUTED);
    lines.slice(0, 8).forEach((l, i) => text(l, M + 110, y - i * 13.5, 10, reg, INK2));
    y -= 13.5 * Math.min(lines.length, 8) + 4;
  }
  y -= 18;
  tableHead();

  // lines
  for (const l of o.lines) {
    const names = wrap(l.name, reg, 10.5, itemW).slice(0, 3);
    const h = 14 * names.length + 8;
    if (y - h < M + 60) { newPage(false); tableHead(); }
    const qty = l.unit === 'kg' ? `${l.qty} ${t.kg}` : String(l.qty);
    const unit = money.format(l.price) + (l.unit === 'kg' ? ` ${t.perKg}` : '');
    text(l.code, C.code, y, 10, reg, INK2);
    names.forEach((n, i) => text(n, C.item, y - i * 14, 10.5));
    right(qty, C.qty, y, 10.5);
    right(unit, C.unit, y, 10, reg, INK2);
    right(money.format(l.price * l.qty), C.line, y, 10.5, bold);
    y -= h; rule(y + 10);
    y -= 6;
  }

  // total
  if (y < M + 70) { newPage(false); }
  y -= 10;
  text(t.total, C.item, y, 12, bold);
  right(money.format(o.total), C.line, y, 15, bold);
  y -= 30;
  wrap(t.foot, reg, 9, W - 2 * M).forEach((l, i) => text(l, M, y - i * 12, 9, reg, MUTED));

  pages.forEach((p, i) => {
    page = p;
    right(fill(t.page, { i: i + 1, n: pages.length }), W - M, M - 20, 8.5, reg, MUTED);
  });
  return await doc.save();
}
