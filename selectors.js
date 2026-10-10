// Read-only questions about the data ("what is planned today?").
// Pure functions: they never change the document.

import { addDays, weekKey, timeOf, dateKey, isDateKey, isoWeekday } from './dates.js';
import { planningDay, dayWindow } from './planday.js';
import { isUnconfirmed, isOccurrence, upcomingDates } from './recur.js';

export const alive = r => !r.deletedAt;

// Tasks that are not deleted and not explicitly skipped occurrences.
export function activeTasks(doc) {
  return doc.tasks.filter(t => alive(t) && !t.skipped);
}

export function tasksForDay(doc, day) {
  return activeTasks(doc).filter(t => t.plan.kind === 'day' && t.plan.date === day);
}

export function tasksForWeek(doc, monday) {
  return activeTasks(doc).filter(t => t.plan.kind === 'week' && t.plan.date === monday);
}

export function tasksByKind(doc, kind) {
  return activeTasks(doc).filter(t => t.plan.kind === kind);
}

// Morning review, Phase 0 behaviour (same as the prototype): unfinished DAY
// tasks planned before today. Phase 1 will add unfinished WEEK tasks from past
// weeks (see unfinishedBefore below, already used by the evening summary).
export function overdueForReview(doc, today) {
  return activeTasks(doc).filter(t => !t.done && t.plan.kind === 'day' && t.plan.date < today && !isUnconfirmed(t, today));
}

// ---------- Reviews (DECISIONS.md, B5) ----------
// A decision is remembered on the task: review = { day, choice, part }, where `day` is the
// planning day it was made for and `part` is 'am' (morning review) or 'pm' (evening). A morning
// decision does not silence the evening question. A task decided today is not asked again today; a task
// KEPT yesterday evening is listed quietly in the morning. Nothing is ever hidden:
// every unfinished task stays in `quiet` or `ask`.

const decidedOn = (t, day) => !!t.review && t.review.day === day;

// Unfinished older than today (day tasks before it, week tasks of past weeks).
export function olderUnfinished(doc, today) {
  const wk = weekKey(today);
  return activeTasks(doc).filter(t => !t.done && !isUnconfirmed(t, today) && (
    (t.plan.kind === 'day' && t.plan.date < today) || (t.plan.kind === 'week' && t.plan.date < wk)));
}

export function morningReview(doc, today) {
  const yesterday = addDays(today, -1);
  const ask = [], quiet = [];
  for (const t of olderUnfinished(doc, today)) {
    const keptLastEvening = !!t.review && t.review.day === yesterday && t.review.choice === 'kept' && t.review.part === 'pm';
    (decidedOn(t, today) || keptLastEvening ? quiet : ask).push(t);
  }
  return { ask, quiet };
}

// Evening: everything unfinished planned for today or earlier, plus this week's week tasks on the
// last day of the week.
export function eveningReview(doc, today) {
  const lastDay = isoWeekday(today) === 7;
  const wk = weekKey(today);
  const list = activeTasks(doc).filter(t => !t.done && !isUnconfirmed(t, today) && (
    (t.plan.kind === 'day' && t.plan.date <= today) ||
    (t.plan.kind === 'week' && (t.plan.date < wk || (lastDay && t.plan.date === wk)))));
  const ask = [], quiet = [];
  for (const t of list) (decidedOn(t, today) && t.review.part === 'pm' ? quiet : ask).push(t);
  return { ask, quiet };
}

export function unconfirmedOccurrences(doc, today) {
  return activeTasks(doc).filter(t => isUnconfirmed(t, today))
    .sort((a, b) => a.plan.date.localeCompare(b.plan.date));
}

// ---------- Waiting for others (B7) ----------
export const activeWaiting = doc => doc.waiting.filter(alive);
export const openWaiting = doc => activeWaiting(doc).filter(w => !w.resolved);
export const resolvedWaiting = doc => activeWaiting(doc).filter(w => w.resolved);
// In-app reminders: follow-up date reached (planning day). They are not tasks and never overdue tasks.
export const waitingDue = (doc, today) => openWaiting(doc).filter(w => w.followUp && w.followUp <= today)
  .sort((a, b) => a.followUp.localeCompare(b.followUp));

export const activeSeries = doc => doc.series.filter(alive);
export const activeTemplates = doc => doc.templates.filter(alive);

// Everything unfinished that was planned before `day`: day tasks before it and
// week tasks from weeks that ended before its week.
export function unfinishedBefore(doc, day) {
  const wk = weekKey(day);
  return activeTasks(doc).filter(t => !t.done && !isUnconfirmed(t, day) && (
    (t.plan.kind === 'day' && t.plan.date < day) ||
    (t.plan.kind === 'week' && t.plan.date < wk)
  ));
}

export function activeEvents(doc) {
  return doc.events.filter(alive).slice().sort((a, b) => a.start.localeCompare(b.start));
}

// Single (non-repeating) events on a day. Repeating events arrive in Phase 2.
export function eventsForDay(doc, day) {
  return activeEvents(doc).filter(e => e.start.slice(0, 10) === day);
}

export const activeProjects = doc => doc.projects.filter(alive);
// Ordinary lists (the «Дом» inventory list is not one of them; see home.js).
export const activeLists = doc => doc.lists.filter(l => alive(l) && l.kind !== 'home');

// Every soft-deleted record, newest deletion first, for the restore list.
export function deletedRecords(doc) {
  const out = [];
  for (const t of doc.tasks) if (t.deletedAt) out.push({ collection: 'tasks', id: t.id, label: t.title, deletedAt: t.deletedAt });
  for (const e of doc.events) if (e.deletedAt) out.push({ collection: 'events', id: e.id, label: e.title, deletedAt: e.deletedAt });
  for (const p of doc.projects) if (p.deletedAt) out.push({ collection: 'projects', id: p.id, label: p.name, deletedAt: p.deletedAt });
  for (const l of doc.lists) if (l.deletedAt && l.kind !== 'home') out.push({ collection: 'lists', id: l.id, label: l.name, deletedAt: l.deletedAt });
  for (const x of doc.series) if (x.deletedAt) out.push({ collection: 'series', id: x.id, label: x.title, deletedAt: x.deletedAt });
  for (const w of doc.waiting) if (w.deletedAt) out.push({ collection: 'waiting', id: w.id, label: w.title, deletedAt: w.deletedAt });
  for (const x of doc.templates) if (x.deletedAt) out.push({ collection: 'templates', id: x.id, label: x.name, deletedAt: x.deletedAt });
  return out.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

// ---------- Evening preview ("Tomorrow's Summary") – prepared, not shown yet ----------
// Builds the summary for `day` (normally tomorrow) entirely from local data.
// deadlineDays: how far ahead (from `day`) a deadline counts as "approaching".
export function buildDaySummary(doc, day, { deadlineDays = 3, window = null } = {}) {
  const horizon = addDays(day, deadlineDays);
  const tasks = tasksForDay(doc, day).filter(t => !t.done)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  const deadlines = activeTasks(doc)
    .filter(t => !t.done && t.deadline && t.deadline <= horizon)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  // Repeats of fixed series that fall on `day` and are not tasks yet (they are created when the day comes).
  const repeats = activeSeries(doc).filter(s => s.mode === 'fixed' && !s.paused)
    .filter(s => upcomingDates(s, day, 1)[0] === day && !doc.tasks.some(t => t.seriesId === s.id && t.occurrenceDate === day));
  return {
    day,
    events: window ? eventsInWindow(doc, window) : eventsForDay(doc, day),
    tasks,
    weekTasks: tasksForWeek(doc, weekKey(day)).filter(t => !t.done),
    deadlines,
    repeats,
    unfinished: unfinishedBefore(doc, day),
    waiting: waitingDue(doc, day)
  };
}

// Decides whether the evening preview should open now. Returns the date key of the day to
// summarise (the day after the current planning day) or null. The evening time belongs to the
// PLANNING day: with cutoff 04:00, 01:30 is still "Friday evening". `lastShownFor` is the day it
// was last shown for, so it appears once per evening however often the app is opened.
// It is only ever evaluated while the app is open: nothing runs in the background.
export function eveningPreviewDue(settings, now, lastShownFor, cutoff = '00:00', finishedThrough = null) {
  const ep = settings && settings.eveningPreview;
  if (!ep || !ep.enabled) return null;
  const pd = planningDay(now, cutoff, finishedThrough);
  const win = dayWindow(pd, cutoff);
  const nextCal = addDays;
  // the wall-clock moment of the evening time inside this planning day's window
  const startDate = win.start.slice(0, 10), startTime = win.start.slice(11);
  const at = ep.time >= startTime ? `${startDate}T${ep.time}` : `${nextCal(startDate, 1)}T${ep.time}`;
  const nowStamp = `${dateKey(now)}T${timeOf(now)}`;
  if (nowStamp < at) return null;
  const tomorrow = addDays(pd, 1);
  if (isDateKey(lastShownFor) && lastShownFor >= tomorrow) return null;
  return tomorrow;
}

// Events inside a planning-day window [start, end) — see planday.js → dayWindow.
// With cutoff 00:00 this is exactly eventsForDay().
export function eventsInWindow(doc, { start, end }) {
  return activeEvents(doc).filter(e => e.start >= start && e.start < end);
}
