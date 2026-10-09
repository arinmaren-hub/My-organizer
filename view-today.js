// "Сегодня" screen: quick add, backup reminder, morning review, today, this week, schedule.

import { esc } from './util.js';
import { formatDay, weekKey } from './dates.js';
import { overdueForReview, tasksForDay, tasksForWeek, eventsForDay } from './selectors.js';
import { quickAdd, taskList, empty } from './components.js';

export function renderToday(doc, ctx) {
  const { today, quick, backupNote } = ctx;
  const overdue = overdueForReview(doc, today);
  const events = eventsForDay(doc, today);
  let h = quickAdd(quick, today);
  if (backupNote) {
    h += `<div class="card note line"><span class="grow">${esc(backupNote)}</span><button type="button" data-action="backup.export">Сохранить копию</button></div>`;
  }
  if (overdue.length) {
    h += `<section class="card review"><h2>Утренний разбор · ${overdue.length}</h2>
      <p class="muted small">Ничего не переносится без твоего решения.</p>
      ${taskList(overdue, { withMove: true })}</section>`;
  }
  h += `<section class="card"><h2>Сегодня · ${esc(formatDay(today))}</h2>${taskList(tasksForDay(doc, today))}</section>`;
  h += `<section class="card"><h2>На этой неделе</h2>${taskList(tasksForWeek(doc, weekKey(today)))}</section>`;
  h += `<section class="card"><h2>Расписание</h2>${events.length ? events.map(e => `
    <div class="row">
      <div class="grow">${esc(e.start.slice(11))} · ${esc(e.title)}</div>
      <button type="button" class="icon" data-action="event.delete" data-id="${esc(e.id)}" aria-label="Удалить">×</button>
    </div>`).join('') : empty('Нет событий')}</section>`;
  return h;
}
