// Read-only questions about the data ("what is planned today?").
// Pure functions: they never change the document.

import { addDays, weekKey, timeOf, dateKey, isDateKey } from './dates.js';

export const alive = r => !r.deletedAt;

export function activeTasks(doc) {
  return doc.tasks.filter(alive);
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
  return activeTasks(doc).filter(t => !t.done && t.plan.kind === 'day' && t.plan.date < today);
}

// Everything unfinished that was planned before `day`: day tasks before it and
// week tasks from weeks that ended before its week.
export function unfinishedBefore(doc, day) {
  const wk = weekKey(day);
  return activeTasks(doc).filter(t => !t.done && (
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
export const activeLists = doc => doc.lists.filter(alive);

// Every soft-deleted record, newest deletion first, for the restore list.
export function deletedRecords(doc) {
  const out = [];
  for (const t of doc.tasks) if (t.deletedAt) out.push({ collection: 'tasks', id: t.id, label: t.title, deletedAt: t.deletedAt });
  for (const e of doc.events) if (e.deletedAt) out.push({ collection: 'events', id: e.id, label: e.title, deletedAt: e.deletedAt });
  for (const p of doc.projects) if (p.deletedAt) out.push({ collection: 'projects', id: p.id, label: p.name, deletedAt: p.deletedAt });
  for (const l of doc.lists) if (l.deletedAt) out.push({ collection: 'lists', id: l.id, label: l.name, deletedAt: l.deletedAt });
  return out.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

// ---------- Evening preview ("Tomorrow's Summary") – prepared, not shown yet ----------
// Builds the summary for `day` (normally tomorrow) entirely from local data.
// deadlineDays: how far ahead (from `day`) a deadline counts as "approaching".
export function buildDaySummary(doc, day, { deadlineDays = 3 } = {}) {
  const horizon = addDays(day, deadlineDays);
  const tasks = tasksForDay(doc, day).filter(t => !t.done)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  const deadlines = activeTasks(doc)
    .filter(t => !t.done && t.deadline && t.deadline <= horizon)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  return {
    day,
    events: eventsForDay(doc, day),
    tasks,
    weekTasks: tasksForWeek(doc, weekKey(day)).filter(t => !t.done),
    deadlines,
    unfinished: unfinishedBefore(doc, day)
  };
}

// Decides whether the evening preview should open now. Returns the date key of
// the day to summarise (tomorrow) or null. `lastShownFor` is the day it was
// last shown for, so it appears once per evening even if the app is reopened.
export function eveningPreviewDue(settings, now, lastShownFor) {
  const ep = settings && settings.eveningPreview;
  if (!ep || !ep.enabled) return null;
  if (timeOf(now) < ep.time) return null;
  const tomorrow = addDays(dateKey(now), 1);
  if (isDateKey(lastShownFor) && lastShownFor >= tomorrow) return null;
  return tomorrow;
}

// Events inside a planning-day window [start, end) — see planday.js → dayWindow.
// With cutoff 00:00 this is exactly eventsForDay().
export function eventsInWindow(doc, { start, end }) {
  return activeEvents(doc).filter(e => e.start >= start && e.start < end);
}
