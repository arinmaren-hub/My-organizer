// «Очистка старых записей» (0.6.0): optional, never automatic. A calm screen with the totals, an explanation, and
// two ways to remove: choose records one by one, or remove every eligible one. Both need a saved backup first.

import { esc } from './util.js';
import { t, formatDay, getLang } from './i18n.js';
import { findCleanup, counts, estimateSizes, formatBytes, TYPES } from './cleanup.js';
import { foldBlock } from './components.js';

const TYPE_KEY = { tasks: 'cleanup.type.tasks', events: 'cleanup.type.events', lists: 'cleanup.type.lists', trash: 'cleanup.type.trash' };

export function backupSaved(ctx) {
  const cu = ctx.ui.cleanup;
  const at = ctx.store.lastBackupAt();
  return !!(cu && at && at >= cu.openedAt);
}

export function sizeLine(doc, f) {
  const s = estimateSizes(doc, f);
  const fmt = n => { const b = formatBytes(n, getLang()); return t(`cleanup.size.${b.unit}`, { n: b.v }); };
  return t('cleanup.sizeLine', { total: fmt(s.total), free: fmt(s.removable) });
}

export function totalsHtml(f, only = null) {
  const c = counts(f);
  const rows = TYPES.filter(k => c[k] && (!only || only[k])).map(k => `<li><span class="grow">${esc(t(TYPE_KEY[k]))}</span><b>${only ? only[k] : c[k]}</b></li>`).join('');
  return `<ul class="totals">${rows}</ul>`;
}

function reviewList(f, sel) {
  return TYPES.map(k => {
    const list = f[k];
    if (!list.length) return '';
    const picked = list.filter(e => sel.has(e.key)).length;
    const rows = list.map(e => `<div class="row crow">
        <input type="checkbox" data-action="cleanup.pick" data-key="${esc(e.key)}" ${sel.has(e.key) ? 'checked' : ''} aria-label="${esc(e.title)}">
        <div class="grow ttext"><div class="title">${esc(e.title)}</div><div class="meta">${esc(e.date ? formatDay(e.date) : '')}${e.count ? ` · ${esc(t('lists.itemsCount', { n: e.count }))}` : ''}</div></div>
        ${e.type === 'trash' ? '' : `<button type="button" class="quiet keep" data-action="cleanup.keep" data-type="${e.type}" data-id="${esc(e.id)}">${esc(t('cleanup.keepForever'))}</button>`}</div>`).join('');
    return `<section class="group"><h2>${esc(t(TYPE_KEY[k]))} <span class="count">${list.length}</span></h2>
      <div class="line"><button type="button" class="quiet" data-action="cleanup.pickAll" data-type="${k}" data-on="${picked === list.length ? '' : '1'}">${esc(t(picked === list.length ? 'cleanup.pickNone' : 'cleanup.pickAll'))}</button></div>${rows}</section>`;
  }).join('');
}

export function renderCleanup(doc, ctx) {
  const cu = ctx.ui.cleanup;
  if (!cu) return '';
  const f = findCleanup(doc, ctx.natural, ctx.nowIso);
  const saved = backupSaved(ctx);
  const ro = ctx.store.status.readOnly;
  const intro = `<p>${esc(t('cleanup.intro'))}</p>
      <p class="muted small">${esc(t('cleanup.keepHistory'))}</p>
      <p class="muted small">${esc(t('cleanup.cutoffLine', { day: { $full: f.cutoff } }))}</p>
      <p class="muted small">${esc(sizeLine(doc, f))} ${esc(t('cleanup.notRequired'))}</p>`;
  const backup = `<div class="card"><p>${esc(t(saved ? 'cleanup.backupDone' : 'cleanup.backupNeeded'))}</p>
      <div class="line"><button type="button" ${saved ? '' : 'class="primary" '}data-action="backup.export">${esc(t('btn.saveBackup'))}</button></div></div>`;
  const later = `<div class="line"><button type="button" class="quiet" data-action="cleanup.postpone">${esc(t('cleanup.remind'))}</button>
      <button type="button" class="quiet" data-action="cleanup.keepAll">${esc(t('cleanup.keepAll'))}</button></div>`;
  if (!f.total) return `<section class="card">${intro}<p>${esc(t('cleanup.nothing'))}</p></section>${later}`;
  if (cu.mode === 'review') {
    const n = [...cu.sel].filter(k => [...f.tasks, ...f.events, ...f.lists, ...f.trash].some(e => e.key === k)).length;
    return `<section class="card">${intro}</section>${backup}
      <div class="line"><button type="button" data-action="cleanup.home">${esc(t('cleanup.backToTotals'))}</button>
        ${n && !ro ? `<button type="button" class="danger" data-action="cleanup.confirm" data-scope="sel">${esc(t('cleanup.deleteSelected', { n }))}</button>` : `<span class="muted small grow">${esc(t('cleanup.pickHint'))}</span>`}</div>
      ${reviewList(f, cu.sel)}${later}`;
  }
  return `<section class="card">${intro}${totalsHtml(f)}</section>${backup}
    <div class="line"><button type="button" data-action="cleanup.review">${esc(t('cleanup.review'))}</button>
      <button type="button" class="danger" data-action="cleanup.confirm" data-scope="all"${ro ? ' disabled' : ''}>${esc(t('cleanup.deleteAll'))}</button></div>${later}`;
}

// The reminder card on «Сегодня».
export function cleanupCard() {
  return `<section class="card cleanup-card" role="region" aria-label="${esc(t('cleanup.cardTitle'))}">
    <h2>${esc(t('cleanup.cardTitle'))}</h2>
    <p>${esc(t('cleanup.cardText'))}</p>
    <div class="line"><button type="button" data-action="backup.export">${esc(t('btn.saveBackup'))}</button>
      <button type="button" data-action="cleanup.start" data-mode="review">${esc(t('cleanup.review'))}</button></div>
    <div class="line"><button type="button" data-action="cleanup.start" data-mode="all">${esc(t('cleanup.deleteAll'))}</button>
      <button type="button" class="quiet" data-action="cleanup.postpone">${esc(t('cleanup.remind'))}</button></div></section>`;
}

// The final question (a sheet).
export function confirmBody(doc, ctx, s) {
  const cu = ctx.ui.cleanup;
  const f = findCleanup(doc, ctx.natural, ctx.nowIso);
  let only = null;
  if (s.scope === 'sel') {
    only = { tasks: 0, events: 0, lists: 0, trash: 0 };
    for (const k of TYPES) only[k] = f[k].filter(e => cu.sel.has(e.key)).length;
  }
  const total = only ? TYPES.reduce((n, k) => n + only[k], 0) : f.total;
  if (!total) return null;
  const saved = backupSaved(ctx);
  const head = `<p>${esc(t(only ? 'cleanup.confirmSel' : 'cleanup.confirmAll', { day: { $full: f.cutoff } }))}</p>${totalsHtml(f, only)}
      <p class="muted small">${esc(t('cleanup.confirmGone'))}</p>
      <p class="muted small">${esc(t('cleanup.confirmProtected'))}</p>`;
  if (!saved) return `${head}<p class="bad">${esc(t('cleanup.backupFirst'))}</p>
      <div class="line"><button type="button" class="primary" data-action="backup.export">${esc(t('btn.saveBackup'))}</button><button type="button" data-action="sheet.close">${esc(t('btn.cancel'))}</button></div>`;
  return `${head}<form data-form="cleanup.run" data-scope="${esc(s.scope)}" autocomplete="off">
      <label class="line"><input type="checkbox" name="sure" required> <span>${esc(t('cleanup.sure'))}</span></label>
      <div class="line"><button type="submit" class="danger">${esc(t('cleanup.runBtn', { n: total }))}</button><button type="button" data-action="sheet.close">${esc(t('btn.cancel'))}</button></div></form>`;
}
