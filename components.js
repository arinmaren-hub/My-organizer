// Small pieces of HTML shared by several screens. Every dynamic value goes
// through esc(); every interface text comes from i18n.js. Buttons carry
// data-action / data-id; app.js handles them.
//
// A task is a clean checklist row: checkbox and tappable text. A long press opens actions;
// extra controls are not displayed unless requested. The original stored order is unchanged.

import { esc } from './util.js';
import { t, formatDay } from './i18n.js';
import { ICONS } from './icons.js';
import { weekKey } from './dates.js';

export const empty = (text = t('empty')) => `<p class="muted empty">${esc(text)}</p>`;

// Stable view-only ordering: checked entries go after unchecked ones. Source arrays
// stay intact so unchecking puts an entry back at its original position.
export function unfinishedFirst(items) {
  return [...items.filter(i => !i.done), ...items.filter(i => !!i.done)];
}

// Set by app.js before each draw: { today } (the planning day).
export const uiState = { today: null, fold: {} };

export function planLabel(task) {
  if (task.plan.kind === 'day') return formatDay(task.plan.date);
  if (task.plan.kind === 'week') return t('plan.week', { day: { $day: task.plan.date } });
  return t('plan.none');
}

// An unfinished task whose day (or week) is over is a «tail».
export const isTail = (task, today) => !task.done && ((task.plan.kind === 'day' && task.plan.date < today) || (task.plan.kind === 'week' && task.plan.date < weekKey(today)));

export const moreButton = (action, id, label = t('aria.more'), extra = '') =>
  `<button type="button" class="more" data-action="${action}" data-id="${esc(id)}"${extra} aria-label="${esc(label)}">${ICONS.more}</button>`;

// opts: plan (show the date), note (extra text), swipe (indentation by swipe is allowed)
export function taskRow(task, opts = {}) {
  const id = esc(task.id);
  const meta = [];
  if (opts.plan) meta.push(planLabel(task));
  if (task.time) meta.push(task.time);
  if (task.deadline) meta.push(t('task.deadline', { day: { $day: task.deadline } }));
  if (task.seriesId) meta.push('↻');
  if (opts.note) meta.push(opts.note);
  const indented = task.indent && !isTail(task, uiState.today);
  return `
    <div class="row trow${task.done ? ' is-done' : ''}${indented ? ' indent' : ''}" data-id="${id}"${opts.swipe === false ? '' : ' data-swipe="1"'}>
      <input type="checkbox" data-action="task.toggle" data-id="${id}" ${task.done ? 'checked' : ''} aria-label="${esc(t('aria.done'))}">
      <div class="grow ttext" data-action="task.open" data-id="${id}" role="button" tabindex="0">
        <div class="title">${esc(task.title)}</div>${meta.length ? `<div class="meta">${esc(meta.join(' · '))}</div>` : ''}
      </div>
    </div>`;
}

export function taskList(tasks, opts) {
  return tasks.length ? unfinishedFirst(tasks).map(task => taskRow(task, opts)).join('') : '';
}

// A tail awaiting a decision: explicit review choices; advanced task actions by long press.
// Not touching it leaves it where it is.
export function tailRow(task, { part = 'am', note = '' } = {}) {
  const id = esc(task.id);
  const b = (choice, label, cls = '') => `<button type="button"${cls ? ` class="${cls}"` : ''} data-action="review" data-id="${id}" data-choice="${choice}" data-part="${part}">${esc(label)}</button>`;
  const meta = [planLabel(task)];
  if (task.time) meta.push(task.time);
  if (task.deadline) meta.push(t('task.deadline', { day: { $day: task.deadline } }));
  if (note) meta.push(note);
  return `
    <div class="row tailrow" data-id="${id}">
      <div class="grow">
        <div class="ttext" data-action="task.open" data-id="${id}" role="button" tabindex="0"><div class="title">${esc(task.title)}</div><div class="meta">${esc(meta.join(' · '))}</div></div>
        <div class="moves">${part === 'am' ? b('today', t('move.today')) : ''}${b('tomorrow', t('tail.tomorrow'))}
          <button type="button" data-action="tail.pick" data-id="${id}" data-part="${part}">${esc(t('tail.pick'))}</button>${b('done', t('tail.done'))}</div>
      </div>
    </div>`;
}

// An event line: time (or date and time), title, the count of its preparation list, and «···».
export function eventRow(e, label) {
  const id = esc(e.id);
  const prep = Array.isArray(e.prep) ? e.prep.filter(i => !i.deletedAt) : [];
  const count = prep.length ? ` <span class="meta">${esc(t('prep.count', { done: prep.filter(i => i.done).length, total: prep.length }))}</span>` : '';
  return `
    <div class="row erow" data-id="${id}">
      <div class="grow ttext" data-action="event.open" data-id="${id}" role="button" tabindex="0">
        <span class="etime">${esc(label)}</span> <span class="title">${esc(e.title)}</span>${count}
      </div>
    </div>`;
}

// ---------- forms shown inside sheets ----------

export function editTaskForm(task) {
  const id = esc(task.id);
  const kind = task.plan.kind;
  const opt = (v, key) => `<option value="${v}"${kind === v ? ' selected' : ''}>${esc(t(key))}</option>`;
  return `
    <form class="editform" data-form="task.edit" data-id="${id}" autocomplete="off">
      <label class="field"><span>${esc(t('edit.title'))}</span><input name="title" value="${esc(task.title)}" required class="grow"></label>
      <label class="field"><span>${esc(t('edit.when'))}</span>
        <select name="kind" data-action="edit.kind" aria-label="${esc(t('edit.when'))}">${opt('none', 'quick.kind.none')}${opt('day', 'quick.kind.day')}${opt('week', 'quick.kind.week')}</select></label>
      <label class="field" data-show="day week"${kind === 'none' ? ' hidden' : ''}><span>${esc(t('edit.date'))}</span><input type="date" name="date" value="${esc(task.plan.date || uiState.today || '')}"></label>
      <label class="field" data-show="day"${kind === 'day' ? '' : ' hidden'}><span>${esc(t('edit.time'))}</span><input type="time" name="time" value="${esc(task.time || '')}"></label>
      <label class="field"><span>${esc(t('edit.deadline'))}</span><input type="date" name="deadline" value="${esc(task.deadline || '')}"></label>
      <p class="muted small">${esc(t('edit.deadlineNote'))}</p>
      <div class="line"><button type="submit" class="primary">${esc(t('btn.save'))}</button><button type="button" data-action="sheet.close">${esc(t('btn.cancel'))}</button></div>
    </form>`;
}

export function editEventForm(e) {
  const id = esc(e.id);
  return `
    <form class="editform" data-form="event.edit" data-id="${id}" autocomplete="off">
      <label class="field"><span>${esc(t('edit.title'))}</span><input name="title" value="${esc(e.title)}" required class="grow"></label>
      <label class="field"><span>${esc(t('edit.start'))}</span><input type="datetime-local" name="start" value="${esc(e.start)}" required></label>
      <label class="field"><span>${esc(t('edit.end'))}</span><input type="datetime-local" name="end" value="${esc(e.end || '')}"></label>
      <div class="line"><button type="submit" class="primary">${esc(t('btn.save'))}</button><button type="button" data-action="sheet.close">${esc(t('btn.cancel'))}</button></div>
    </form>`;
}

// A section that can be folded: a header button with a count, and a body that is shown only when open.
// `fold` state lives in uiState.fold (kept while the app is open).
export function foldBlock(key, label, body, { count = null, defaultOpen = false, cls = '' } = {}) {
  const open = key in uiState.fold ? !!uiState.fold[key] : defaultOpen;
  const k = esc(key);
  return `<section class="fold${cls ? ' ' + cls : ''}" data-fold="${k}">
    <button type="button" class="foldhead" data-action="fold" data-key="${k}" aria-expanded="${open}">
      <span class="grow">${esc(label)}${count !== null ? ` <span class="count">${esc(count)}</span>` : ''}</span><span class="chev${open ? ' open' : ''}">${ICONS.chevron}</span></button>
    <div class="foldbody"${open ? '' : ' hidden'}>${body}</div></section>`;
}

export function bar(percent) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  return `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><div style="width:${p}%"></div></div>`;
}
