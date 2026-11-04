// The history of an order's or an inquiry's status: who changed it, and when (read from the table status_log).
import { $, db, esc, shown, when } from './api.js?v=df6c61df58';

export async function showHistory(entity, id, labels, tagOf) {
  const box = $(`[data-hist="${entity}:${id}"]`);
  if (!box) return;
  try {
    const rows = await db(`status_log?entity=eq.${entity}&entity_id=eq.${id}&order=id`);
    const now = $(`[data-hist="${entity}:${id}"]`);
    if (!now) return;
    now.innerHTML = rows.length ? rows.map((r) => `<li>
      <span class="tag tag--${tagOf(r.to_status)}">${esc(labels[r.to_status] || r.to_status)}</span>
      <span class="hist__who">${r.from_status === null ? 'stiglo sa sajta' : esc(shown(r.changed_by) || 'nepoznato')}</span>
      <time class="hist__at" datetime="${esc(r.changed_at)}">${esc(when.format(new Date(r.changed_at)))}</time>
    </li>`).join('') : '<li class="sub">Nema zabeleženih promena.</li>';
  } catch (e) {
    if (!e.signedOut) box.innerHTML = '<li class="sub">Istorija se nije učitala.</li>';
  }
}
