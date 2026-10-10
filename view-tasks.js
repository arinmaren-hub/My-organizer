// «Задачи»: all tasks in three groups (by day, by week, no date); each row is a checkbox, the
// title and «···». Recurring tasks are at the very bottom, folded; adding one is folded too.

import { esc } from './util.js';
import { t, formatDay } from './i18n.js';
import { tasksByKind, activeSeries } from './selectors.js';
import { taskRow, empty, foldBlock, moreButton } from './components.js';
import { SERIES_FREQS } from './schema.js';
import { seriesHistory } from './recur.js';
import { ICONS } from './icons.js';

export function ruleText(s) {
  return t(`recur.rule.${s.freq}.${s.interval === 1 ? '1' : 'n'}`, { n: s.interval });
}

export function ruleFields(s, today) {
  const sel = (name, list, cur, label) => `<select name="${name}" aria-label="${esc(t(label))}">${list.map(([v, key]) => `<option value="${v}"${cur === v ? ' selected' : ''}>${esc(t(key))}</option>`).join('')}</select>`;
  return `
      <div class="line"><span>${esc(t('recur.every'))}</span>
        <input type="number" name="interval" min="1" max="999" step="1" value="${esc(s ? s.interval : 1)}" class="num" aria-label="${esc(t('recur.every'))}" required>
        ${sel('freq', SERIES_FREQS.map(f => [f, `recur.freq.${f}`]), s ? s.freq : 'weekly', 'recur.every')}</div>
      <div class="line"><span>${esc(t('recur.mode'))}</span>
        ${sel('mode', [['completion', 'recur.mode.completion'], ['fixed', 'recur.mode.fixed']], s ? s.mode : 'completion', 'recur.mode')}</div>
      <p class="muted small">${esc(t('recur.modeHint.completion'))}<br>${esc(t('recur.modeHint.fixed'))}</p>
      <div class="line"><label class="field grow"><span>${esc(t('recur.start'))}</span><input type="date" name="startDate" value="${esc(s ? s.startDate : today)}" required></label>
        <label class="field"><span>${esc(t('edit.time'))}</span><input type="time" name="time" value="${esc(s && s.time ? s.time : '')}"></label></div>`;
}

export function seriesEditForm(doc, s, today) {
  const hist = seriesHistory(doc, s.id).slice(0, 15);
  return `<form class="editform" data-form="series.edit" data-id="${esc(s.id)}" autocomplete="off">
      <label class="field"><span>${esc(t('recur.name'))}</span><input name="title" value="${esc(s.title)}" required class="grow"></label>
      ${ruleFields(s, today)}
      <label class="line"><input type="checkbox" name="applyOpen" checked> <span>${esc(t('recur.applyOpen'))}</span></label>
      <div class="line"><button type="submit" class="primary">${esc(t('btn.save'))}</button><button type="button" data-action="sheet.close">${esc(t('btn.cancel'))}</button></div>
    </form>
    <h3 class="sub">${esc(t('recur.history'))}</h3>
    ${hist.length ? hist.map(h => `<div class="small">${esc(formatDay(h.date))} ${esc(t(`recur.h.${h.status}`))}${h.doneDay ? ` · ${esc(t('wait.since', { day: { $day: h.doneDay } }))}` : ''}</div>`).join('') : empty(t('recur.historyEmpty'))}`;
}

function seriesRow(doc, s) {
  const mine = doc.tasks.filter(x => x.seriesId === s.id && !x.deletedAt && !x.done && !x.skipped);
  const now = mine.map(x => x.occurrenceDate).sort()[0];
  const meta = [t('recur.ruleLine', { rule: ruleText(s), mode: t(`recur.mode.${s.mode}`) })];
  if (s.paused) meta.push(t('recur.paused'));
  else if (now) meta.push(t('recur.next', { day: { $day: now } }));
  return `<div class="row srow" data-id="${esc(s.id)}">
      <div class="grow ttext" data-action="edit.open" data-kind="series" data-id="${esc(s.id)}" role="button" tabindex="0"><div class="title">↻ ${esc(s.title)}</div><div class="meta">${esc(meta.join(' · '))}</div></div>
      ${moreButton('menu.series', s.id)}</div>`;
}

function recurring(doc, today) {
  const list = activeSeries(doc);
  const addRow = `<button type="button" class="linkrow" data-action="series.new"><span class="grow">${esc(t('recur.add'))}</span>${ICONS.plus}</button>`;
  return foldBlock('recurring', t('recur.title'), (list.length ? list.map(s => seriesRow(doc, s)).join('') : empty(t('recur.empty'))) + addRow,
    { count: list.length ? String(list.length) : null, cls: 'recurring' });
}

// Day groups get a small date heading; the rows then need no date of their own.
function dayGroups(tasks) {
  const byDay = new Map();
  for (const x of tasks) byDay.set(x.plan.date, [...(byDay.get(x.plan.date) || []), x]);
  return [...byDay.entries()].map(([day, list]) => `<h3 class="sub">${esc(formatDay(day))}</h3>${list.map(x => taskRow(x)).join('')}`).join('');
}

export function renderTasks(doc, ctx) {
  const day = tasksByKind(doc, 'day'), week = tasksByKind(doc, 'week'), none = tasksByKind(doc, 'none');
  const group = (key, count, body) => `<section class="group"><h2>${esc(t(key))}${count ? ` <span class="count">${count}</span>` : ''}</h2>${body || empty(t('tasks.groupEmpty'))}</section>`;
  return group('tasks.byDay', day.length, dayGroups(day)) +
    group('tasks.byWeek', week.length, week.map(x => taskRow(x, { plan: true })).join('')) +
    group('tasks.none', none.length, none.map(x => taskRow(x)).join('')) +
    recurring(doc, ctx.today);
}
