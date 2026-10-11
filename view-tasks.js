// «Задачи»: all tasks in three groups (by day, by week, no date); each row is a checkbox, the
// title and «···». Recurring tasks are at the very bottom, folded; adding one is folded too.

import { esc } from './util.js';
import { t, formatDay } from './i18n.js';
import { tasksScreen, activeSeries } from './selectors.js';
import { taskRow, empty, foldBlock, moreButton } from './components.js';
import { SERIES_FREQS } from './schema.js';
import { seriesHistory } from './recur.js';
import { ICONS } from './icons.js';

export function ruleText(s) {
  return t(`recur.rule.${s.freq}.${s.interval === 1 ? '1' : 'n'}`, { n: s.interval });
}

export function ruleFields(s, today, { withKind = false } = {}) {
  const sel = (name, list, cur, label) => `<select name="${name}" aria-label="${esc(t(label))}">${list.map(([v, key]) => `<option value="${v}"${cur === v ? ' selected' : ''}>${esc(t(key))}</option>`).join('')}</select>`;
  const isEvent = !!(s && s.kind === 'event');
  // Task or event: chosen when the rule is created and fixed afterwards.
  const kindRow = withKind ? `<div class="line"><span>${esc(t('recur.kind'))}</span>
        <select name="kind" data-action="edit.kind" aria-label="${esc(t('recur.kind'))}"><option value="task">${esc(t('recur.kind.task'))}</option><option value="event">${esc(t('recur.kind.event'))}</option></select></div>` : '';
  return `${kindRow}
      <div class="line"><span>${esc(t('recur.every'))}</span>
        <input type="number" name="interval" min="1" max="999" step="1" value="${esc(s ? s.interval : 1)}" class="num" aria-label="${esc(t('recur.every'))}" required>
        ${sel('freq', SERIES_FREQS.map(f => [f, `recur.freq.${f}`]), s ? s.freq : 'weekly', 'recur.every')}</div>
      <div class="line" data-show="task"${isEvent ? ' hidden' : ''}><span>${esc(t('recur.mode'))}</span>
        ${sel('mode', [['completion', 'recur.mode.completion'], ['fixed', 'recur.mode.fixed']], s ? s.mode : 'completion', 'recur.mode')}</div>
      <p class="muted small" data-show="task"${isEvent ? ' hidden' : ''}>${esc(t('recur.modeHint.completion'))}<br>${esc(t('recur.modeHint.fixed'))}</p>
      <div class="line"><span>${esc(t('recur.monthBy'))}</span>
        ${sel('monthBy', [['', 'recur.monthBy.date'], ['nth', 'recur.monthBy.nth'], ['last', 'recur.monthBy.last']], s && s.monthBy ? s.monthBy : '', 'recur.monthBy')}</div>
      <p class="muted small">${esc(t('recur.monthByHint'))}</p>
      <div class="line"><label class="field grow"><span>${esc(t('recur.start'))}</span><input type="date" name="startDate" value="${esc(s ? s.startDate : today)}" required></label>
        <label class="field"><span>${esc(t('edit.time'))}</span><input type="time" name="time" value="${esc(s && s.time ? s.time : '')}"></label></div>
      <div class="line"><label class="field grow"><span>${esc(t('recur.until'))}</span><input type="date" name="until" value="${esc(s && s.until ? s.until : '')}"></label>
        <label class="field" data-show="event"${isEvent ? '' : ' hidden'}><span>${esc(t('recur.endTime'))}</span><input type="time" name="endTime" value="${esc(s && s.endTime ? s.endTime : '')}"></label></div>
      <p class="muted small">${esc(t('recur.untilHint'))}</p>`;
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

function seriesRow(doc, s, todayKey) {
  const pool = s.kind === 'event' ? doc.events : doc.tasks;
  const mine = pool.filter(x => x.seriesId === s.id && !x.deletedAt && !x.done && !x.skipped);
  const now = s.kind === 'event' ? mine.map(x => x.start.slice(0, 10)).filter(d => d >= todayKey).sort()[0] : mine.map(x => x.occurrenceDate).sort()[0];
  const meta = [t('recur.ruleLine', { rule: ruleText(s), mode: t(`recur.mode.${s.mode}`) })];
  if (s.kind === 'event') meta.unshift(t('recur.kind.event'));
  if (s.until) meta.push(t('recur.untilMeta', { day: { $day: s.until } }));
  if (s.paused) meta.push(t('recur.paused'));
  else if (now) meta.push(t('recur.next', { day: { $day: now } }));
  return `<div class="row srow" data-id="${esc(s.id)}">
      <div class="grow ttext" data-action="edit.open" data-kind="series" data-id="${esc(s.id)}" role="button" tabindex="0"><div class="title">↻ ${esc(s.title)}</div><div class="meta">${esc(meta.join(' · '))}</div></div>
      ${moreButton('menu.series', s.id)}</div>`;
}

function recurring(doc, today) {
  const list = activeSeries(doc);
  const addRow = `<button type="button" class="linkrow" data-action="series.new"><span class="grow">${esc(t('recur.add'))}</span>${ICONS.plus}</button>`;
  return foldBlock('recurring', t('recur.title'), (list.length ? list.map(s => seriesRow(doc, s, today)).join('') : empty(t('recur.empty'))) + addRow,
    { count: list.length ? String(list.length) : null, cls: 'recurring' });
}

function groupRows(g) {
  const head = g.kind === 'week' ? t('plan.week', { day: { $day: g.date } }) : formatDay(g.date);
  return `<h3 class="sub">${esc(head)}</h3>${g.tasks.map(x => taskRow(x)).join('')}`;
}

export function renderTasks(doc, ctx) {
  const scr = tasksScreen(doc, ctx.today);
  const noDate = `<section class="group nodate"><h2>${esc(t('tasks.none'))}${scr.none.length ? ` <span class="count">${scr.none.length}</span>` : ''}
      <button type="button" class="h2-plus" data-action="nodate.open" aria-label="${esc(t('tasks.noDateAdd'))}">${ICONS.plus}</button></h2>
      ${scr.none.length ? scr.none.map(x => taskRow(x)).join('') : empty(t('tasks.noDateEmpty'))}</section>`;
  const weekCount = scr.week.days.reduce((n, g) => n + g.tasks.length, 0) + scr.week.noDay.length;
  const weekBody = scr.week.days.map(groupRows).join('') +
    (scr.week.noDay.length ? `<h3 class="sub">${esc(t('tasks.weekNoDay'))}</h3>${scr.week.noDay.map(x => taskRow(x)).join('')}` : '');
  const week = `<section class="group thisweek"><h2>${esc(t('tasks.thisWeek'))}${weekCount ? ` <span class="count">${weekCount}</span>` : ''}</h2>
      ${weekBody || empty(t('tasks.weekEmpty'))}</section>`;
  const later = foldBlock('later', t('tasks.later'), scr.later.length ? scr.later.map(groupRows).join('') : empty(t('tasks.laterEmpty')),
    { count: scr.laterCount ? String(scr.laterCount) : null, cls: 'later' });
  return noDate + week + later + recurring(doc, ctx.today);
}
