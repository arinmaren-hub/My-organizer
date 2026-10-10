// «Сегодня»: the day's checklist first. Below it, only when there is something to see:
// follow-up reminders, repeats to confirm, «Хвосты» (folded), this week (folded), a quiet link to
// «Вечер», and «Ожидаю от других» at the very bottom. Nothing to type is shown here: «＋» adds.
// "Today" is the PLANNING day (planday.js); event times and deadlines keep their real dates.

import { esc } from './util.js';
import { weekKey } from './dates.js';
import { t } from './i18n.js';
import { dayWindow } from './planday.js';
import { morningReview, unconfirmedOccurrences, tasksForDay, tasksForWeek, eventsInWindow } from './selectors.js';
import { taskList, tailRow, eventRow, empty, foldBlock } from './components.js';
import { renderWaitingDue, renderWaitingSection } from './view-waiting.js';
import { ICONS } from './icons.js';

// Repeats waiting for the person to say what happened (never assumed missed).
export function renderUnconfirmed(doc, today) {
  const list = unconfirmedOccurrences(doc, today);
  if (!list.length) return '';
  return `<section class="card review"><h2>${esc(t('unconf.title', { n: list.length }))}</h2>
    ${list.map(task => {
      const id = esc(task.id);
      const b = (how, key) => `<button type="button" data-action="occ.confirm" data-id="${id}" data-how="${how}">${esc(t(key))}</button>`;
      return `<div class="row"><div class="grow"><div class="title">↻ ${esc(task.title)}</div>
        <div class="meta">${esc(t('unconf.planned', { day: { $day: task.plan.date } }))}</div>
        <div class="moves">${b('done', 'unconf.done')}${b('doneThen', 'unconf.doneThen')}${b('skip', 'unconf.skip')}${b('today', 'unconf.today')}</div></div></div>`;
    }).join('')}</section>`;
}

// The tails: everything unfinished that is older than today, each with the four decisions.
// `review` = { ask, quiet } (selectors.js); decided ones stay listed so nothing is hidden.
export function tailsBody(doc, today, { review = morningReview(doc, today), part = 'am' } = {}) {
  const { ask, quiet } = review;
  let h = '';
  if (ask.length) {
    h += ask.map(task => tailRow(task, { part })).join('');
    if (ask.length > 1) h += `<div class="line"><button type="button" class="quiet" data-action="review.all" data-part="${part}" data-ids="${esc(ask.map(x => x.id).join(','))}">${esc(t('review.allToTomorrow'))}</button></div>`;
  }
  if (quiet.length) {
    h += `<h3 class="sub">${esc(t('review.quietTitle', { n: quiet.length }))}</h3>`;
    h += quiet.map(task => tailRow(task, { part, note: task.review && task.review.choice === 'kept' ? t(task.review.day === today ? 'review.decidedKept' : 'review.decidedKeptEvening') : '' })).join('');
  }
  return h;
}

export function renderToday(doc, ctx) {
  const { today, backupNote, cutoff } = ctx;
  const events = eventsInWindow(doc, dayWindow(today, cutoff));
  const tasks = tasksForDay(doc, today);
  const review = morningReview(doc, today);
  const tails = review.ask.length + review.quiet.length;
  const week = tasksForWeek(doc, weekKey(today));
  let h = '';
  if (backupNote) {
    h += `<div class="chip line"><span class="grow">${esc(backupNote)}</span><button type="button" class="quiet" data-action="backup.export">${esc(t('btn.saveBackup'))}</button></div>`;
  }
  const evRows = events.map(e => eventRow(e, e.start.slice(0, 10) === today ? e.start.slice(11) : `${e.start.slice(11)} · ${t('day.calendarNow', { day: { $day: e.start.slice(0, 10) } })}`)).join('');
  h += `<section class="list" id="today-list">${evRows}${taskList(tasks)}${!events.length && !tasks.length ? empty(t('today.empty')) : ''}</section>`;
  h += renderWaitingDue(doc, today);
  h += renderUnconfirmed(doc, today);
  if (tails) h += foldBlock('tails', t('today.tails'), tailsBody(doc, today, { review }), { count: String(tails), defaultOpen: false });
  if (week.length) h += foldBlock('week', t('today.week'), taskList(week, { plan: false }), { count: String(week.length) });
  h += `<button type="button" class="linkrow" data-action="evening.open"><span class="grow">${esc(t('evening.open'))}</span>${ICONS.chevron}</button>`;
  h += renderWaitingSection(doc, today);
  return h;
}

function taskList(tasks, opts) {
  return taskList(tasks, opts);
}
