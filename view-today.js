// "Сегодня" screen: quick add, backup reminder, follow-up reminders, repeats to confirm,
// morning review, today, this week, schedule, and «Ожидаю от других» at the very bottom.
// "Today" here is the PLANNING day (planday.js): with a late cutoff it stays
// Friday after midnight; event times and deadlines still show real dates.

import { esc } from './util.js';
import { weekKey } from './dates.js';
import { t } from './i18n.js';
import { dayWindow } from './planday.js';
import { morningReview, unconfirmedOccurrences, tasksForDay, tasksForWeek, eventsInWindow } from './selectors.js';
import { quickAdd, taskList, taskRow, eventRow, empty } from './components.js';
import { renderWaitingDue, renderWaitingSection } from './view-waiting.js';

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

// Repeats waiting for the person to say what happened (never assumed missed).
export function renderUnconfirmed(doc, today) {
  const list = unconfirmedOccurrences(doc, today);
  if (!list.length) return '';
  return `<section class="card review"><h2>${esc(t('unconf.title', { n: list.length }))}</h2>
    <p class="muted small">${esc(t('unconf.hint'))}</p>
    ${list.map(task => {
      const id = esc(task.id);
      const b = (how, key) => `<button type="button" data-action="occ.confirm" data-id="${id}" data-how="${how}">${esc(t(key))}</button>`;
      return `<div class="row"><div class="grow"><div class="title">↻ ${esc(task.title)}</div>
        <div class="muted small">${esc(t('unconf.planned', { day: { $day: task.plan.date } }))}</div>
        <div class="moves">${b('done', 'unconf.done')}${b('doneThen', 'unconf.doneThen')}${b('skip', 'unconf.skip')}${b('today', 'unconf.today')}</div></div></div>`;
    }).join('')}</section>`;
}

// Morning review: tasks still to decide on top; the ones already decided stay listed below.
export function renderReview(doc, today, { titleKey = 'review.morningTitle', review = morningReview(doc, today), allButton = true, morning = true } = {}) {
  const { ask, quiet } = review;
  if (!ask.length && !quiet.length) return '';
  let h = '';
  if (ask.length) {
    h += `<section class="card review"><h2>${esc(t(titleKey, { n: ask.length }))}</h2>
      <p class="muted small">${esc(t('review.morningHint'))}</p>
      ${ask.map(task => taskRow(task, { review: true, morning })).join('')}
      ${allButton ? `<div class="line"><button type="button" data-action="review.all" data-part="${morning ? 'am' : 'pm'}" data-ids="${esc(ask.map(x => x.id).join(','))}">${esc(t('review.allToTomorrow'))}</button></div>` : ''}</section>`;
  }
  if (quiet.length) {
    h += `<section class="card"><h3>${esc(t('review.quietTitle', { n: quiet.length }))}</h3>
      <p class="muted small">${esc(t('review.quietHint'))}</p>
      ${quiet.map(task => taskRow(task, { review: true, morning, note: task.review && task.review.choice === 'kept' ? t(task.review.day === today ? 'review.decidedKept' : 'review.decidedKeptEvening') : '' })).join('')}</section>`;
  }
  return h;
}

export function renderToday(doc, ctx) {
  const { today, quick, backupNote, cutoff } = ctx;
  const events = eventsInWindow(doc, dayWindow(today, cutoff));
  let h = quickAdd(quick, today);
  if (backupNote) {
    h += `<div class="card note line"><span class="grow">${esc(backupNote)}</span><button type="button" data-action="backup.export">${esc(t('btn.saveBackup'))}</button></div>`;
  }
  h += `<div class="line"><button type="button" data-action="evening.open">${esc(t('evening.open'))}</button></div>`;
  h += renderWaitingDue(doc, today);
  h += renderUnconfirmed(doc, today);
  h += renderReview(doc, today);
  h += `<section class="card"><h2>${esc(t('today.title', { day: { $day: today } }))}</h2>${taskList(tasksForDay(doc, today))}${dayInfo(ctx)}</section>`;
  h += `<section class="card"><h2>${esc(t('today.week'))}</h2>${taskList(tasksForWeek(doc, weekKey(today)))}</section>`;
  h += `<section class="card"><h2>${esc(t('today.schedule'))}</h2>${events.length ? events.map(e =>
    eventRow(e, e.start.slice(0, 10) === today ? e.start.slice(11) : `${e.start.slice(11)} (${t('day.calendarNow', { day: { $day: e.start.slice(0, 10) } })})`)).join('') : empty(t('today.noEvents'))}</section>`;
  h += renderWaitingSection(doc, today);
  return h;
}
