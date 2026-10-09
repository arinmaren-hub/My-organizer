// "Календарь" screen (Phase 0: same as the prototype – add an event, list all events).
// Day/week/month views and repeating events come in Phase 2.

import { esc } from './util.js';
import { t, formatDateTime } from './i18n.js';
import { activeEvents } from './selectors.js';
import { empty } from './components.js';

export function renderCalendar(doc) {
  const events = activeEvents(doc);
  return `
    <section class="card">
      <h2>${esc(t('cal.add'))}</h2>
      <form data-form="event.add" autocomplete="off">
        <div class="line">
          <input name="title" required placeholder="${esc(t('cal.titlePh'))}" class="grow">
          <input name="start" type="datetime-local" required aria-label="${esc(t('cal.when'))}">
          <button type="submit" class="primary">${esc(t('btn.add'))}</button>
        </div>
      </form>
    </section>
    <section class="card">
      <h2>${esc(t('cal.events'))}</h2>
      ${events.length ? events.map(e => `
        <div class="row">
          <div class="grow">${esc(formatDateTime(e.start))} — ${esc(e.title)}</div>
          <button type="button" class="icon" data-action="event.delete" data-id="${esc(e.id)}" aria-label="${esc(t('btn.delete'))}">×</button>
        </div>`).join('') : empty(t('today.noEvents'))}
    </section>`;
}
