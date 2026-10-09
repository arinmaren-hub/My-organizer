// "Задачи" screen: quick add, recurring tasks, and all tasks grouped by plan kind.

import { esc } from './util.js';
import { t, formatDay } from './i18n.js';
import { tasksByKind, activeSeries } from './selectors.js';
import { quickAdd, taskList, empty, uiState } from './components.js';
import { seriesHistory } from './recur.js';
import { SERIES_FREQS } from './schema.js';

const GROUPS = [['day', 'tasks.byDay'], ['week', 'tasks.byWeek'], ['none', 'tasks.none']];

export function ruleText(s) {
  return t(`recur.rule.${s.freq}.${s.interval === 1 ? '1' : 'n'}`, { n: s.interval });
}

function ruleFields(s, today) {
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

function seriesRow(doc, s, today) {
  const id = esc(s.id);
  const editing = uiState.editing && uiState.editing.kind === 'series' && uiState.editing.id === s.id;
  if (editing) {
    return `<div class="row"><div class="grow"><form class="editform" data-form="series.edit" data-id="${id}" autocomplete="off">
      <label class="field"><span>${esc(t('recur.name'))}</span><input name="title" value="${esc(s.title)}" required class="grow"></label>
      ${ruleFields(s, today)}
      <label class="line"><input type="checkbox" name="applyOpen" checked> <span>${esc(t('recur.applyOpen'))}</span></label>
      <div class="line"><button type="submit" class="primary">${esc(t('btn.save'))}</button><button type="button" data-action="edit.cancel">${esc(t('btn.cancel'))}</button></div>
    </form></div></div>`;
  }
  const mine = doc.tasks.filter(x => x.seriesId === s.id && !x.deletedAt && !x.done && !x.skipped);
  const now = mine.map(x => x.occurrenceDate).sort()[0];
  const meta = [t('recur.ruleLine', { rule: ruleText(s), mode: t(`recur.mode.${s.mode}`) })];
  if (s.paused) meta.push(t('recur.paused'));
  else if (now) meta.push(t('recur.next', { day: { $day: now } }));
  const hist = seriesHistory(doc, s.id).slice(0, 15);
  return `<div class="row"><div class="grow"><div class="title">↻ ${esc(s.title)}</div>
      <div class="muted small">${esc(meta.join(' · '))}</div>
      <div class="moves"><button type="button" data-action="series.pause" data-id="${id}" data-paused="${s.paused ? '' : '1'}">${esc(t(s.paused ? 'recur.resume' : 'recur.pause'))}</button></div>
      <details><summary>${esc(t('recur.history'))}</summary>${hist.length ? hist.map(h =>
        `<div class="small">${esc(formatDay(h.date))} ${esc(t(`recur.h.${h.status}`))}${h.doneDay ? ` · ${esc(t('wait.since', { day: { $day: h.doneDay } }))}` : ''}</div>`).join('') : empty(t('recur.historyEmpty'))}</details>
    </div>
    <button type="button" class="icon" data-action="edit.open" data-kind="series" data-id="${id}" aria-label="${esc(t('aria.edit'))}">✎</button>
    <button type="button" class="icon" data-action="series.delete" data-id="${id}" aria-label="${esc(t('btn.delete'))}">×</button></div>`;
}

function renderRecurring(doc, today) {
  const list = activeSeries(doc);
  return `<section class="card"><h2>${esc(t('recur.title'))}</h2>
    <p class="muted small">${esc(t('recur.hint'))}</p>
    ${list.length ? list.map(s => seriesRow(doc, s, today)).join('') : empty(t('recur.empty'))}
    <details><summary>${esc(t('recur.add'))}</summary>
      <form data-form="series.add" autocomplete="off">
        <div class="line"><input name="title" required placeholder="${esc(t('recur.name'))}" class="grow"></div>
        ${ruleFields(null, today)}
        <div class="line"><button type="submit" class="primary">${esc(t('recur.add'))}</button></div>
      </form></details></section>`;
}

export function renderTasks(doc, ctx) {
  return quickAdd(ctx.quick, ctx.today) + renderRecurring(doc, ctx.today) + GROUPS.map(([kind, key]) => `
    <section class="card"><h2>${esc(t(key))}</h2>${taskList(tasksByKind(doc, kind), { withMove: true })}</section>`).join('');
}
