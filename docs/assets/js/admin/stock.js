// Stock screen: current figures, receipts, issues, corrections and the ledger.
import { $, db, esc, norm, plural, reason, shown, when } from './api.js?v=7648825353';
import { D, NEEDS, byCode, empty, failed, nameOf, optById, optStock, optionsOf, route, skeleton, stateOf } from './data.js?v=7648825353';
import { PAGE, productKey, stockTag } from './products.js?v=7648825353';
import { busy, closeSheet, field, foot, formError, head, invalid, openSheet, select, sheet } from './sheet.js?v=7648825353';
import { draw } from './shell.js?v=7648825353';
import { notify, syncInput, syncSeg } from './ui.js?v=7648825353';

const KIND = { initial: 'Početno stanje', receipt: 'Prijem', issue: 'Izdavanje', correction: 'Korekcija', order: 'Porudžbina', order_undo: 'Povraćaj' };
const MV = { rows: [], key: null, more: false, busy: false, error: null };
export function drawStock(r) {
  const box = $('[data-region="zalihe"]');
  const sc = $('[data-screen="zalihe"]');
  const view = r.p.get('z') === 'istorija' ? 'istorija' : '';
  syncSeg($('[data-z]', sc), view);
  syncInput($('[data-q]', sc), r.p.get('q') || '');
  const st = stateOf(NEEDS.zalihe);
  if (st === 'loading') { box.innerHTML = skeleton(); return; }
  if (st === 'error') { box.innerHTML = failed('Zalihe', NEEDS.zalihe); return; }
  const q = norm(r.p.get('q') || '');
  if (view === 'istorija') { drawMoves(box, r, q); return; }
  const order = Object.fromEntries(D.cats.map((c, i) => [c.id, i]));
  const all = [...D.products].sort((a, b) => (order[a.category] ?? 99) - (order[b.category] ?? 99) || a.sort - b.sort || a.code.localeCompare(b.code));
  const list = all.filter((p) => !q || productKey(p).includes(q) || optionsOf(p.code).some((o) => norm(`${o.sku || ''} ${o.label_sr || ''}`).includes(q)));
  if (!list.length) { box.innerHTML = empty('Nijedan artikal ne odgovara.', 'Pokušajte sa šifrom ili delom naziva.', '<button class="btn" type="button" data-clear>Prikaži sve</button>'); return; }
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const pg = Math.min(Math.max(1, Number(r.p.get('pg')) || 1), pages);
  const shown = list.slice((pg - 1) * PAGE, pg * PAGE);
  const btns = (p, o) => ['receipt', 'issue', 'correction'].map((k) => `<button class="btn btn--s" type="button" data-move="${k}" data-code="${esc(p.code)}"${o ? ` data-opt="${o.id}"` : ''} aria-label="${esc(KIND[k])}, ${esc(p.code)}${o ? ` ${esc(o.label_sr || o.sku || '')}` : ''}">${esc({ receipt: 'Prijem', issue: 'Izdavanje', correction: 'Korekcija' }[k])}</button>`).join('');
  const fig = (n) => (n === null || n === undefined ? '<span class="sub">ne prati se</span>' : String(n));
  const rows = shown.map((p) => {
    const opts = optionsOf(p.code);
    const main = `<tr data-code="${esc(p.code)}">
        <th scope="row" class="c-code">${esc(p.code)}</th>
        <td class="c-name"><span lang="sr">${esc(nameOf(p))}</span>${p.name_fr && p.name_sr ? `<span class="sub" lang="fr">${esc(p.name_fr)}</span>` : ''}</td>
        <td class="num c-stock" data-label="Stanje">${opts.length ? `${optStock(p.code)} <span class="sub">u ${esc(plural(opts.length, 'opciji', 'opcije', 'opcija'))}</span>` : `${fig(p.stock)}${stockTag(p)}`}</td>
        <td class="c-act c-moves">${opts.length ? '' : btns(p)}</td>
      </tr>`;
    return main + opts.map((o) => `<tr class="is-opt" data-code="${esc(p.code)}">
        <th scope="row" class="c-code"><span class="sub">${esc(o.sku || '')}</span></th>
        <td class="c-name">↳ ${esc(o.label_sr || '')}</td>
        <td class="num c-stock" data-label="Stanje">${fig(o.stock)}</td>
        <td class="c-act c-moves">${btns(p, o)}</td>
      </tr>`).join('');
  }).join('');
  const pager = pages > 1 ? `<nav class="pager" aria-label="Stranice"><button class="btn btn--s" type="button" data-pg="${pg - 1}"${pg === 1 ? ' disabled' : ''}>Prethodna</button><span class="pager__at">${(pg - 1) * PAGE + 1}–${Math.min(pg * PAGE, list.length)} od ${list.length}</span><button class="btn btn--s" type="button" data-pg="${pg + 1}"${pg === pages ? ' disabled' : ''}>Sledeća</button></nav>` : '';
  box.innerHTML = `<p class="region__count">${esc(plural(list.length, 'artikal', 'artikla', 'artikala'))}<span class="region__hint">Svaka promena stanja se upisuje u istoriju.</span></p>
    <table class="tbl tbl--stock"><thead><tr><th scope="col">Šifra</th><th scope="col">Naziv</th><th scope="col" class="num">Stanje</th><th scope="col"><span class="visually-hidden">Radnje</span></th></tr></thead><tbody>${rows}</tbody></table>${pager}`;
}

export async function loadMoves(more = false) {
  const r = route();
  const key = `${r.p.get('mk') || ''}|${r.p.get('q') || ''}`;
  if (!more) { MV.rows = []; MV.more = false; }
  MV.key = key; MV.busy = true; MV.error = null;
  draw();
  const parts = ['stock_moves?select=*&order=id.desc&limit=50'];
  if (r.p.get('mk')) parts.push(`kind=eq.${encodeURIComponent(r.p.get('mk'))}`);
  const q = (r.p.get('q') || '').trim();
  if (q) parts.push(`or=(${encodeURIComponent(`product.ilike.*${q.replace(/[(),*]/g, '')}*,label.ilike.*${q.replace(/[(),*]/g, '')}*`)})`);
  parts.push(`offset=${MV.rows.length}`);
  try {
    const rows = await db(parts.join('&'));
    if (MV.key !== key) return;
    MV.rows = more ? MV.rows.concat(rows) : rows;
    MV.more = rows.length === 50;
  } catch (e) {
    if (e.signedOut) return;
    MV.error = e;
  }
  MV.busy = false;
  draw();
}
function drawMoves(box, r) {
  const key = `${r.p.get('mk') || ''}|${r.p.get('q') || ''}`;
  if (MV.key !== key && !MV.busy) { loadMoves(); return; }
  const kinds = `<div class="field"><label for="mk">Vrsta promene</label><span class="select"><select class="input" id="mk" data-mv-kind><option value="">Sve</option>${Object.entries(KIND).map(([k, t]) => `<option value="${k}"${r.p.get('mk') === k ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></span></div>`;
  let body;
  if (MV.error) body = failed('Istorija', ['moves']);
  else if (MV.busy && !MV.rows.length) body = skeleton();
  else if (!MV.rows.length) body = empty('Nema zapisa.', 'Svaki prijem, izdavanje, korekcija i izvršena porudžbina upisuje se ovde.', '');
  else body = `<table class="tbl tbl--moves"><thead><tr><th scope="col">Kada</th><th scope="col">Artikal</th><th scope="col">Vrsta</th><th scope="col" class="num">Promena</th><th scope="col" class="num">Stanje</th><th scope="col">Razlog</th><th scope="col">Ko</th></tr></thead><tbody>${MV.rows.map((m) => {
      const p = byCode(m.product);
      return `<tr><td class="c-when" data-label="Kada">${esc(when.format(new Date(m.at)))}</td>
        <th scope="row" class="c-name"><span>${esc(m.product)}${m.label ? ` · ${esc(m.label)}` : ''}</span>${p ? `<span class="sub">${esc(nameOf(p))}</span>` : ''}</th>
        <td data-label="Vrsta"><span class="tag tag--${m.kind === 'issue' || m.kind === 'order' ? 'low' : m.kind === 'receipt' || m.kind === 'order_undo' ? 'done' : 'new'}">${esc(KIND[m.kind] || m.kind)}</span></td>
        <td class="num" data-label="Promena">${m.delta > 0 ? '+' : m.delta < 0 ? '−' : ''}${Math.abs(m.delta)}</td>
        <td class="num" data-label="Stanje">${m.before_qty === null ? '—' : m.before_qty} → ${m.after_qty === null ? '—' : m.after_qty}</td>
        <td data-label="Razlog">${esc(m.reason || '')}</td>
        <td data-label="Ko">${esc(shown(m.admin) || '')}</td></tr>`;
    }).join('')}</tbody></table>${MV.more ? `<p class="pager"><button class="btn" type="button" data-moves-more${MV.busy ? ' disabled' : ''}>Prikaži starije</button></p>` : ''}`;
  box.innerHTML = `<div class="toolbar toolbar--inner">${kinds}</div>${body}`;
}

export function moveForm({ kind = 'receipt', code = '', opt = '' }) {
  if (!D.products.length) return;
  const p0 = byCode(code) || D.products[0];
  const KINDS = [['receipt', 'Prijem robe'], ['issue', 'Izdavanje robe'], ['correction', 'Ručna korekcija']];
  openSheet(`<form class="sheet__inner" novalidate data-form="move">
    ${head('Promena stanja', 'Svaka promena se upisuje u istoriju, sa vremenom i imenom administratora.')}
    <div class="sheet__body">
      <div class="field"><span class="field__label" id="mv-kind-l">Vrsta</span>
        <div class="seg" role="radiogroup" aria-labelledby="mv-kind-l">${KINDS.map(([k, t]) => `<label class="seg__opt"><input class="visually-hidden" type="radio" name="kind" value="${k}"${k === kind ? ' checked' : ''}><span>${t}</span></label>`).join('')}</div>
        <p class="field__help" data-mv-help></p></div>
      ${select({ id: 'mv-code', label: 'Artikal', name: 'code', value: p0.code, options: D.products.map((p) => [p.code, `${p.code} · ${nameOf(p)}`]) })}
      <div data-mv-opt-wrap hidden>${select({ id: 'mv-opt', label: 'Opcija', name: 'opt', value: opt, options: [] })}</div>
      <p class="mv-now" data-mv-now aria-live="polite"></p>
      ${field({ id: 'mv-qty', label: 'Količina', name: 'qty', req: true, attrs: 'inputmode="numeric" autocomplete="off" placeholder="0"', help: '' })}
      ${field({ id: 'mv-reason', label: 'Razlog', name: 'reason', help: 'Na primer: isporuka dobavljača, oštećena roba, popis.', attrs: 'autocomplete="off" maxlength="200"' })}
    </div>
    ${foot('Upiši promenu')}
  </form>`);
  const form = $('[data-form="move"]', sheet);
  const sync = () => {
    const p = byCode(form.elements.code.value);
    const opts = p ? optionsOf(p.code) : [];
    $('[data-mv-opt-wrap]', form).hidden = !opts.length;
    const sel = form.elements.opt;
    if (opts.length) {
      const keep = sel.dataset.for === p.code ? sel.value : (opt && optById(opt)?.product === p.code ? String(opt) : '');
      sel.innerHTML = opts.map((o) => `<option value="${o.id}">${esc([o.sku, o.label_sr].filter(Boolean).join(' · '))}</option>`).join('');
      sel.dataset.for = p.code; if (keep) sel.value = keep;
    }
    const cur = opts.length ? optById(sel.value)?.stock : p?.stock;
    $('[data-mv-now]', form).textContent = cur === null || cur === undefined ? 'Stanje se za ovu stavku još ne prati; prvi prijem ili korekcija počinje evidenciju.' : `Trenutno stanje: ${cur}`;
    const k = form.elements.kind.value;
    $('[data-mv-help]', form).textContent = { receipt: 'Količina koja ulazi u magacin.', issue: 'Količina koja izlazi iz magacina.', correction: 'Upišite izbrojano stanje. Razlog je obavezan.' }[k];
    $('label[for="mv-qty"]', form).textContent = k === 'correction' ? 'Novo stanje' : 'Količina';
  };
  form.addEventListener('change', sync);
  sync();
}
export async function submitMove(form) {
  const kind = form.elements.kind.value;
  const code = form.elements.code.value;
  const opts = optionsOf(code);
  const optId = opts.length ? Number(form.elements.opt.value) : null;
  const raw = form.elements.qty.value.trim();
  const reasonText = form.elements.reason.value.trim();
  const errs = [];
  if (!/^\d{1,7}$/.test(raw)) errs.push(invalid(form, 'qty', 'Upišite ceo broj, 0 ili više.'));
  if (kind === 'correction' && !reasonText) errs.push(invalid(form, 'reason', 'Za korekciju upišite razlog.'));
  if (errs.length) { errs[0].focus(); return; }
  busy(form, true, 'Upisujem…');
  formError(form, '');
  try {
    const now = await db('rpc/stock_move', { method: 'POST', body: { p_code: code, p_option: optId, p_kind: kind, p_qty: Number(raw), p_reason: reasonText || null } });
    if (optId) { const o = optById(optId); if (o) o.stock = Number(now); } else { const p = byCode(code); if (p) p.stock = Number(now); }
    MV.key = null;
    closeSheet();
    draw();
    notify(`${code}: stanje je ${now}.`);
  } catch (e) {
    busy(form, false);
    if (e.signedOut) return;
    const m = String(e.message || '');
    formError(form, m.includes('not enough') ? `Nema toliko na stanju. ${m.replace(/.*\(have (\d+)\).*/, 'Na stanju je $1.')}` : m.includes('reason') ? 'Za korekciju upišite razlog.' : `Promena nije upisana. ${reason(e)}`);
  }
}
