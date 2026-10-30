// Order lines from what the page sends: [{ code, qty, option }]. Pure, so the order function and the local
// test server price lines the same way. An article with options (the saint of an icon) needs one; the line
// then carries the option's id and code, and its label after the article's name.
import type { Lang } from './i18n.ts';

export type Item = { code: string; qty: number; option: number | null; price?: number };
export type Line = { code: string; option?: number; sku?: string; name: string; qty: number; price: number; unit: 'piece' | 'kg' };
export type ProductRow = { code: string; name_fr?: string | null; name_en?: string | null; name_sr?: string | null; price?: number | string | null; unit: string; sort?: number; available?: boolean };
export type OptionRow = { id: number; product: string; sku?: string | null; label_fr?: string | null; label_en?: string | null; label_sr: string; available?: boolean; active?: boolean };
export type Problem = { error: 'invalid' | 'unknown_item' | 'unavailable' | 'choose'; codes?: string[] };

const text = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
const pick = (o: Record<string, unknown>, k: string, lang: Lang) =>
  String(o[`${k}_${lang}`] || o[`${k}_fr`] || o[`${k}_sr`] || o[`${k}_en`] || '');

export const productName = (p: ProductRow, lang: Lang) => pick(p as Record<string, unknown>, 'name', lang) || p.code;
export const optionLabel = (o: OptionRow, lang: Lang) => pick(o as Record<string, unknown>, 'label', lang);

// the page's list, checked and merged: the same article and option twice is one line
export function readItems(raw: unknown, withPrice = false): Item[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const merged = new Map<string, Item>();
  for (const it of raw.slice(0, 300) as Record<string, unknown>[]) {
    const code = text(it?.code, 40);
    const qty = Math.round(Number(it?.qty));
    const option = it?.option === undefined || it?.option === null || it?.option === '' ? null : Number(it.option);
    if (!code || !Number.isFinite(qty) || qty < 1 || qty > 999) return null;
    if (option !== null && !(Number.isInteger(option) && option > 0)) return null;
    let price: number | undefined;
    if (withPrice) {
      price = Math.round(Number(it?.price) * 100) / 100;
      if (!Number.isFinite(price) || price < 0) return null;
    }
    const key = `${code}#${option ?? ''}`;
    const had = merged.get(key);
    if (had) had.qty = Math.min(999, had.qty + qty);
    else merged.set(key, { code, qty, option, ...(withPrice ? { price } : {}) });
  }
  return [...merged.values()];
}

// lines in the order's language. checkStock: refuse what is out of stock (orders); quotes leave it to the admin.
export function buildLines(items: Item[], products: ProductRow[], options: OptionRow[], lang: Lang, { checkStock = true } = {}): { lines: Line[] } | Problem {
  const byCode = new Map(products.map((p) => [p.code, p]));
  const active = options.filter((o) => o.active !== false);
  const byId = new Map(active.map((o) => [o.id, o]));
  const hasOptions = new Set(active.map((o) => o.product));
  const unknown: string[] = [], choose: string[] = [], gone: string[] = [];
  const lines: Line[] = [];
  for (const it of items) {
    const p = byCode.get(it.code);
    if (!p) { unknown.push(it.code); continue; }
    const o = it.option === null ? null : byId.get(it.option);
    if (it.option !== null && (!o || o.product !== p.code)) { unknown.push(it.code); continue; }
    if (!o && hasOptions.has(p.code)) { choose.push(p.code); continue; }
    if (checkStock && (o ? o.available === false : p.available === false)) { gone.push(o?.sku || p.code); continue; }
    const name = o ? `${productName(p, lang)}, ${optionLabel(o, lang)}` : productName(p, lang);
    lines.push({
      code: p.code, ...(o ? { option: o.id, sku: o.sku || p.code } : {}), name,
      qty: it.qty, price: it.price ?? Number(p.price), unit: p.unit === 'kg' ? 'kg' : 'piece',
    });
  }
  if (unknown.length) return { error: 'unknown_item', codes: unknown };
  if (choose.length) return { error: 'choose', codes: choose };
  if (gone.length) return { error: 'unavailable', codes: gone };
  const order = new Map(products.map((p) => [p.code, p.sort ?? 0]));
  lines.sort((a, b) => (order.get(a.code)! - order.get(b.code)!) || a.name.localeCompare(b.name));
  return { lines };
}

export const total = (lines: Line[]) => Math.round(lines.reduce((a, l) => a + l.price * l.qty, 0) * 100) / 100;
