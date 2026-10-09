// Small pieces of HTML shared by several screens. Every dynamic value goes
// through esc(). Buttons carry data-action / data-id; app.js handles them.

import { esc } from './util.js';
import { formatDay } from './dates.js';

export const empty = (text = 'Пока пусто') => `<p class="muted">${esc(text)}</p>`;

export function planLabel(t) {
  if (t.plan.kind === 'day') return formatDay(t.plan.date);
  if (t.plan.kind === 'week') return 'Неделя с ' + formatDay(t.plan.date);
  return 'Без даты';
}

export function taskRow(t, { withMove = false } = {}) {
  const meta = [planLabel(t)];
  if (t.time) meta.push(t.time);
  if (t.deadline) meta.push('дедлайн ' + formatDay(t.deadline));
  const id = esc(t.id);
  const move = withMove ? `
      <div class="moves">
        <button type="button" data-action="task.move" data-id="${id}" data-kind="day">Сегодня</button>
        <button type="button" data-action="task.move" data-id="${id}" data-kind="week">На неделю</button>
        <button type="button" data-action="task.move" data-id="${id}" data-kind="none">Без даты</button>
      </div>` : '';
  return `
    <div class="row${t.done ? ' is-done' : ''}">
      <input type="checkbox" data-action="task.toggle" data-id="${id}" ${t.done ? 'checked' : ''} aria-label="Готово">
      <div class="grow"><div class="title">${esc(t.title)}</div><div class="muted small">${esc(meta.join(' · '))}</div>${move}</div>
      <button type="button" class="icon" data-action="task.delete" data-id="${id}" aria-label="Удалить">×</button>
    </div>`;
}

export function taskList(tasks, opts) {
  return tasks.length ? tasks.map(t => taskRow(t, opts)).join('') : empty();
}

// Quick entry: only the text is required. `q` is the remembered draft.
export function quickAdd(q, today) {
  const kind = q.kind || 'none';
  const opt = (v, label) => `<option value="${v}"${kind === v ? ' selected' : ''}>${label}</option>`;
  return `
    <section class="card">
      <h3>Быстро добавить</h3>
      <form data-form="task.quickAdd" autocomplete="off">
        <textarea name="text" rows="3" placeholder="Одно дело на строку">${esc(q.text)}</textarea>
        <div class="line">
          <select name="kind" data-action="quick.kind" aria-label="Когда">
            ${opt('none', 'Без даты')}${opt('day', 'На день')}${opt('week', 'На неделю')}
          </select>
          <input name="date" type="date" value="${esc(q.date || today)}" aria-label="Дата"${kind === 'none' ? ' hidden' : ''}>
          <button type="submit" class="primary">Добавить</button>
        </div>
        <div class="muted small">Можно вставить сразу несколько строк. Дата необязательна.</div>
      </form>
    </section>`;
}

export function bar(percent) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  return `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><div style="width:${p}%"></div></div>`;
}
