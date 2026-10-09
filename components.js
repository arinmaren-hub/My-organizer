// Small pieces of HTML shared by several screens. Every dynamic value goes
// through esc(); every interface text comes from i18n.js. Buttons carry
// data-action / data-id; app.js handles them.

import { esc } from './util.js';
import { t, formatDay } from './i18n.js';

export const empty = (text = t('empty')) => `<p class="muted">${esc(text)}</p>`;

export function planLabel(task) {
  if (task.plan.kind === 'day') return formatDay(task.plan.date);
  if (task.plan.kind === 'week') return t('plan.week', { day: { $day: task.plan.date } });
  return t('plan.none');
}

export function taskRow(task, { withMove = false } = {}) {
  const meta = [planLabel(task)];
  if (task.time) meta.push(task.time);
  if (task.deadline) meta.push(t('task.deadline', { day: { $day: task.deadline } }));
  const id = esc(task.id);
  const move = withMove ? `
      <div class="moves">
        <button type="button" data-action="task.move" data-id="${id}" data-kind="day">${esc(t('move.today'))}</button>
        <button type="button" data-action="task.move" data-id="${id}" data-kind="week">${esc(t('move.week'))}</button>
        <button type="button" data-action="task.move" data-id="${id}" data-kind="none">${esc(t('move.none'))}</button>
      </div>` : '';
  return `
    <div class="row${task.done ? ' is-done' : ''}">
      <input type="checkbox" data-action="task.toggle" data-id="${id}" ${task.done ? 'checked' : ''} aria-label="${esc(t('aria.done'))}">
      <div class="grow"><div class="title">${esc(task.title)}</div><div class="muted small">${esc(meta.join(' · '))}</div>${move}</div>
      <button type="button" class="icon" data-action="task.delete" data-id="${id}" aria-label="${esc(t('btn.delete'))}">×</button>
    </div>`;
}

export function taskList(tasks, opts) {
  return tasks.length ? tasks.map(task => taskRow(task, opts)).join('') : empty();
}

// Quick entry: only the text is required. `q` is the remembered draft.
export function quickAdd(q, today) {
  const kind = q.kind || 'none';
  const opt = (v, key) => `<option value="${v}"${kind === v ? ' selected' : ''}>${esc(t(key))}</option>`;
  return `
    <section class="card">
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
        <div class="muted small">${esc(t('quick.hint'))}</div>
      </form>
    </section>`;
}

export function bar(percent) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  return `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><div style="width:${p}%"></div></div>`;
}
