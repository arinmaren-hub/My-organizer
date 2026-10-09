// "Сегодня" screen: quick add, backup reminder, morning review, today, this week, schedule.
// "Today" here is the PLANNING day (planday.js): with a late cutoff it stays
// Friday after midnight; event times and deadlines still show real dates.

import { esc } from './util.js';
import { weekKey } from './dates.js';
import { t } from './i18n.js';
import { dayWindow } from './planday.js';
import { overdueForReview, tasksForDay, tasksForWeek, eventsInWindow } from './selectors.js';
import { quickAdd, taskList, empty } from './components.js';

function dayInfo(ctx) {
  const { today, calendarToday, cutoff, finishedEarly, natural } = ctx;
  const lines = [];
  if (cutoff && cutoff !== '00:00') lines.push(t('day.endsAt', { time: cutoff }));
  if (calendarToday && calendarToday !== today) lines.push(t('day.calendarNow', { day: { $day: calendarToday } }));
  let h = lines.length ? `<p class="muted small">${esc(lines.join(' · '))}</p>` : '';
  if (finishedEarly) {
    h += `<div class="line"><span class="muted small grow">${esc(t('day.finishedEarly', { day: { $day: natural } }))}</span>
      <button type="button" data-action="day.undoFinish">${esc(t('day.undoFinish'))}</button></div>`;
  } else {
    h += `<div class="line"><button type="button" class="quiet" data-action="day.finish">${esc(t('day.finish'))}</button></div>`;
  }
  return h;
}

export function renderToday(doc, ctx) {
  const { today, quick, backupNote, cutoff } = ctx;
  const overdue = overdueForReview(doc, today);
  const events = eventsInWindow(doc, dayWindow(today, cutoff));
  let h = quickAdd(quick, today);
  if (backupNote) {
    h += `<div class="card note line"><span class="grow">${esc(backupNote)}</span><button type="button" data-action="backup.export">${esc(t('btn.saveBackup'))}</button></div>`;
  }
  if (overdue.length) {
    h += `<section class="card review"><h2>${esc(t('today.review', { n: overdue.length }))}</h2>
      <p class="muted small">${esc(t('today.reviewHint'))}</p>
      ${taskList(overdue, { withMove: true })}</section>`;
  }
  h += `<section class="card"><h2>${esc(t('today.title', { day: { $day: today } }))}</h2>${taskList(tasksForDay(doc, today))}${dayInfo(ctx)}</section>`;
  h += `<section class="card"><h2>${esc(t('today.week'))}</h2>${taskList(tasksForWeek(doc, weekKey(today)))}</section>`;
  h += `<section class="card"><h2>${esc(t('today.schedule'))}</h2>${events.length ? events.map(e => `
    <div class="row">
      <div class="grow">${esc(e.start.slice(0, 10) === today ? e.start.slice(11) : `${e.start.slice(11)} (${t('day.calendarNow', { day: { $day: e.start.slice(0, 10) } })})`)} · ${esc(e.title)}</div>
      <button type="button" class="icon" data-action="event.delete" data-id="${esc(e.id)}" aria-label="${esc(t('btn.delete'))}">×</button>
    </div>`).join('') : empty(t('today.noEvents'))}</section>`;
  return h;
}

