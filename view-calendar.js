// "Календарь" screen (Phase 0: same as the prototype – add an event, list all events).
// Day/week/month views and repeating events come in Phase 2.

import { esc } from './util.js';
import { formatDateTime } from './dates.js';
import { activeEvents } from './selectors.js';
import { empty } from './components.js';

export function renderCalendar(doc) {
  const events = activeEvents(doc);
  return `
    <section class="card">
      <h2>Добавить событие</h2>
      <form data-form="event.add" autocomplete="off">
        <div class="line">
          <input name="title" required placeholder="Название" class="grow">
          <input name="start" type="datetime-local" required aria-label="Дата и время">
          <button type="submit" class="primary">Добавить</button>
        </div>
      </form>
    </section>
    <section class="card">
      <h2>События</h2>
      ${events.length ? events.map(e => `
        <div class="row">
          <div class="grow">${esc(formatDateTime(e.start))} — ${esc(e.title)}</div>
          <button type="button" class="icon" data-action="event.delete" data-id="${esc(e.id)}" aria-label="Удалить">×</button>
        </div>`).join('') : empty('Нет событий')}
    </section>`;
}
