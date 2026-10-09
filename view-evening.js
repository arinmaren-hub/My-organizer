// «Вечер»: 1) review of the unfinished tasks of the day, 2) tomorrow's overview.
// Built only from the data on this device; no AI, no network. It opens by itself only
// while the app is open (never as a background notification) and can be opened by hand.

import { esc } from './util.js';
import { addDays } from './dates.js';
import { t, formatDay } from './i18n.js';
import { dayWindow } from './planday.js';
import { eveningReview, buildDaySummary } from './selectors.js';
import { taskRow, eventRow, empty } from './components.js';
import { renderReview } from './view-today.js';

export function renderEvening(doc, ctx) {
  const { today, cutoff } = ctx;
  const tomorrow = addDays(today, 1);
  const review = eveningReview(doc, today);
  const s = buildDaySummary(doc, tomorrow, { window: dayWindow(tomorrow, cutoff) });
  let h = `<section class="card"><div class="line"><h2 class="grow">${esc(t('evening.title', { day: { $day: today } }))}</h2>
    <button type="button" data-action="evening.close">${esc(t('btn.close'))}</button></div>
    <p class="muted small">${esc(t('evening.note'))}</p></section>`;
  h += renderReview(doc, today, { titleKey: 'evening.reviewTitle', review, morning: false }) ||
    `<section class="card"><h2>${esc(t('evening.reviewTitle', { n: 0 }))}</h2>${empty(t('review.nothing'))}</section>`;

  const section = (key, body) => `<h3>${esc(t(key))}</h3>${body}`;
  let tomorrowHtml = '';
  if (s.events.length) tomorrowHtml += section('evening.events', s.events.map(e => eventRow(e, e.start.slice(11))).join(''));
  if (s.tasks.length) tomorrowHtml += section('evening.tasks', s.tasks.map(x => taskRow(x, { withMove: true, moveTomorrow: false })).join(''));
  if (s.repeats.length) tomorrowHtml += section('evening.repeats', s.repeats.map(r => `<div class="row"><div class="grow">↻ ${esc(r.title)}</div></div>`).join(''));
  if (s.weekTasks.length) tomorrowHtml += section('evening.week', s.weekTasks.map(x => taskRow(x, { withMove: true })).join(''));
  if (s.deadlines.length) tomorrowHtml += section('evening.deadlines', s.deadlines.map(x => taskRow(x, { withMove: true })).join(''));
  if (s.waiting.length) tomorrowHtml += section('evening.waiting', s.waiting.map(w => `<div class="row"><div class="grow">${esc(w.title)}${w.from ? ` · ${esc(w.from)}` : ''}</div></div>`).join(''));
  h += `<section class="card"><h2>${esc(t('evening.tomorrowTitle', { day: { $day: tomorrow } }))}</h2>
    ${tomorrowHtml || empty(t('evening.nothing'))}
    <h3>${esc(t('evening.addTomorrow'))}</h3>
    <form class="line" data-form="evening.add" autocomplete="off">
      <input name="title" required placeholder="${esc(t('evening.addPh'))}" class="grow"><button type="submit" class="primary">${esc(t('btn.add'))}</button>
    </form></section>`;
  return h;
}
