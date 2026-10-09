// Small pieces of HTML shared by several screens. Every dynamic value goes
// through esc(); every interface text comes from i18n.js. Buttons carry
// data-action / data-id; app.js handles them.

import { esc } from './util.js';
import { t, formatDay } from './i18n.js';

export const empty = (text = t('empty')) => `<p class="muted">${esc(text)}</p>`;

// Which record is being edited right now (set by app.js before each draw):
// { kind: 'task' | 'event' | 'waiting' | 'series' | 'item', id, … } or null.
export const uiState = { editing: null, today: null };
const isEditing = (kind, id) => !!uiState.editing && uiState.editing.kind === kind && uiState.editing.id === id;

export function planLabel(task) {
  if (task.plan.kind === 'day') return formatDay(task.plan.date);
  if (task.plan.kind === 'week') return t('plan.week', { day: { $day: task.plan.date } });
  return t('plan.none');
}

const btn = (action, id, label, extra = '') =>
  `<button type="button" data-action="${action}" data-id="${esc(id)}"${extra}>${esc(label)}</button>`;

// The move buttons under a task (Today / this week / no date / tomorrow, and a date picker).
export function moveButtons(task, { tomorrow = false } = {}) {
  const id = esc(task.id);
  return `
      <div class="moves">
        ${tomorrow ? btn('task.move', task.id, t('move.tomorrow'), ' data-kind="tomorrow"') : btn('task.move', task.id, t('move.today'), ' data-kind="day"')}
        ${btn('task.move', task.id, t('move.week'), ' data-kind="week"')}
        ${btn('task.move', task.id, t('move.none'), ' data-kind="none"')}
      </div>
      <details class="datepick"><summary>${esc(t('move.date'))}</summary>
        <form class="line" data-form="task.moveDate" data-id="${id}" autocomplete="off">
          <input type="date" name="date" required aria-label="${esc(t('quick.date'))}"><button type="submit">${esc(t('review.moveToDate'))}</button>
        </form></details>`;
}

// Decision buttons of the morning and evening reviews.
export function reviewButtons(task, { morning = false } = {}) {
  const id = esc(task.id);
  const b = (choice, label) => `<button type="button" data-action="review" data-id="${id}" data-choice="${choice}" data-part="${morning ? 'am' : 'pm'}">${esc(label)}</button>`;
  return `
      <div class="moves">${morning ? b('today', t('move.today')) : ''}${b('tomorrow', t('review.tomorrow'))}${b('week', t('review.week'))}${b('none', t('review.none'))}${b('keep', t('review.keep'))}${b('done', t('review.done'))}</div>
      <details class="datepick"><summary>${esc(t('review.otherDate'))}</summary>
        <form class="line" data-form="review.date" data-id="${id}" data-part="${morning ? 'am' : 'pm'}" autocomplete="off">
          <input type="date" name="date" required aria-label="${esc(t('quick.date'))}"><button type="submit">${esc(t('review.moveToDate'))}</button>
        </form></details>`;
}

function editTaskForm(task) {
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
      <div class="line"><button type="submit" class="primary">${esc(t('btn.save'))}</button><button type="button" data-action="edit.cancel">${esc(t('btn.cancel'))}</button></div>
    </form>`;
}

// opts: withMove (Today / this week / no date), moveTomorrow, review (decision buttons), quiet (note under the title)
export function taskRow(task, opts = {}) {
  const id = esc(task.id);
  if (isEditing('task', task.id)) return `<div class="row"><div class="grow">${editTaskForm(task)}</div></div>`;
  const meta = [planLabel(task)];
  if (task.time) meta.push(task.time);
  if (task.deadline) meta.push(t('task.deadline', { day: { $day: task.deadline } }));
  if (task.seriesId) meta.push('↻ ' + t('recur.badge'));
  if (opts.note) meta.push(opts.note);
  let extra = '';
  if (opts.review) extra = reviewButtons(task, { morning: !!opts.morning });
  else if (opts.withMove) extra = moveButtons(task, { tomorrow: !!opts.moveTomorrow });
  return `
    <div class="row${task.done ? ' is-done' : ''}">
      <input type="checkbox" data-action="task.toggle" data-id="${id}" ${task.done ? 'checked' : ''} aria-label="${esc(t('aria.done'))}">
      <div class="grow"><div class="title">${esc(task.title)}</div><div class="muted small">${esc(meta.join(' · '))}</div>${extra}</div>
      <button type="button" class="icon" data-action="edit.open" data-kind="task" data-id="${id}" aria-label="${esc(t('aria.edit'))}">✎</button>
      <button type="button" class="icon" data-action="task.delete" data-id="${id}" aria-label="${esc(t('btn.delete'))}">×</button>
    </div>`;
}

export function taskList(tasks, opts) {
  return tasks.length ? tasks.map(task => taskRow(task, opts)).join('') : empty();
}

function editEventForm(e) {
  const id = esc(e.id);
  return `
    <form class="editform" data-form="event.edit" data-id="${id}" autocomplete="off">
      <label class="field"><span>${esc(t('edit.title'))}</span><input name="title" value="${esc(e.title)}" required class="grow"></label>
      <label class="field"><span>${esc(t('edit.start'))}</span><input type="datetime-local" name="start" value="${esc(e.start)}" required></label>
      <label class="field"><span>${esc(t('edit.end'))}</span><input type="datetime-local" name="end" value="${esc(e.end || '')}"></label>
      <div class="line"><button type="submit" class="primary">${esc(t('btn.save'))}</button><button type="button" data-action="edit.cancel">${esc(t('btn.cancel'))}</button></div>
    </form>`;
}

// An event line. `label` is the text before the title (a time, or a full date and time).
export function eventRow(e, label) {
  const id = esc(e.id);
  if (isEditing('event', e.id)) return `<div class="row"><div class="grow">${editEventForm(e)}</div></div>`;
  return `
    <div class="row">
      <div class="grow">${esc(label)} · ${esc(e.title)}</div>
      <button type="button" class="icon" data-action="edit.open" data-kind="event" data-id="${id}" aria-label="${esc(t('aria.edit'))}">✎</button>
      <button type="button" class="icon" data-action="event.delete" data-id="${id}" aria-label="${esc(t('btn.delete'))}">×</button>
    </div>`;
}

// Quick entry: only the text is required. `q` is the remembered draft; q.ask is the
// line waiting for «задача или событие?».
export function quickAdd(q, today, { extraClass = '' } = {}) {
  const kind = q.kind || 'none';
  const opt = (v, key) => `<option value="${v}"${kind === v ? ' selected' : ''}>${esc(t(key))}</option>`;
  let ask = '';
  if (q.ask) {
    const when = q.ask.date ? `${formatDay(q.ask.date)}, ${q.ask.time}` : q.ask.time;
    ask = `
      <div class="banner info" role="group" aria-label="${esc(t('quick.askHint'))}">
        <div><b>${esc(t('quick.askTitle', { title: q.ask.title, when }))}</b></div>
        <div class="muted small">${esc(t('quick.askHint'))}</div>
        <div class="moves">
          <button type="button" class="primary" data-action="quick.asTask">${esc(t('quick.asTask'))}</button>
          <button type="button" data-action="quick.asEvent">${esc(t('quick.asEvent'))}</button>
          <button type="button" data-action="quick.asText">${esc(t('quick.asText'))}</button>
          <button type="button" data-action="quick.askCancel">${esc(t('quick.askCancel'))}</button>
        </div>
      </div>`;
  }
  return `
    <section class="card${extraClass}">
      <h3>${esc(t('quick.title'))}</h3>
      <form data-form="task.quickAdd" autocomplete="off">
        <textarea name="text" rows="3" placeholder="${esc(t('quick.placeholder'))}">${esc(q.text)}</textarea>
        <div class="line">
          <select name="kind" data-action="quick.kind" aria-label="${esc(t('quick.when'))}">
            ${opt('none', 'quick.kind.none')}${opt('day', 'quick.kind.day')}${opt('week', 'quick.kind.week')}
          </select>
          <input name="date" type="date" value="${esc(q.date || today)}" aria-label="${esc(t('quick.date'))}"${kind === 'none' ? ' hidden' : ''}>
          <button type="submit" class="primary">${esc(t('btn.add'))}</button>
        </div>
        <div class="muted small">${esc(t('quick.hint2'))}</div>
      </form>
      ${ask}
    </section>`;
}

export function bar(percent) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  return `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><div style="width:${p}%"></div></div>`;
}
