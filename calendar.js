// Calendar maths and day contents. Pure functions.
// The calendar shows REAL calendar dates (Monday first). A task appears on the date
// of its plan; an event on the date it starts; a deadline on its date. The personal
// planning day (planday.js) is only used to mark which date it is.

import { addDays, dateKey, weekKey, parseDateKey, isDateKey } from './dates.js';
import { alive, eventsForDay, tasksForDay, tasksForWeek, activeTasks, activeSeries } from './selectors.js';
import { upcomingDates } from './recur.js';

export const pad2 = n => String(n).padStart(2, '0');
export const firstOfMonth = (y, m) => `${String(y).padStart(4, '0')}-${pad2(m)}-01`;

// Weeks (arrays of 7 date keys, Monday first) covering the month; always whole weeks,
// 5 or 6 of them.
export function monthGrid(y, m) {
  const first = firstOfMonth(y, m);
  let day = weekKey(first);
  const last = dateKey(new Date(y, m, 0, 12)); // last day of the month
  const weeks = [];
  while (day <= last) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
    day = addDays(day, 7);
  }
  return weeks;
}

export function shiftMonth(y, m, delta) {
  const total = y * 12 + (m - 1) + delta;
  return { y: Math.floor(total / 12), m: total % 12 + 1 };
}

// Counts per date between `from` and `to` (inclusive): open tasks, done tasks, events, deadlines.
export function summarizeRange(doc, from, to) {
  const map = new Map();
  const slot = d => { let s = map.get(d); if (!s) { s = { tasks: 0, done: 0, events: 0, deadlines: 0 }; map.set(d, s); } return s; };
  const inRange = d => d >= from && d <= to;
  for (const t of activeTasks(doc)) {
    if (t.plan.kind === 'day' && inRange(t.plan.date)) slot(t.plan.date)[t.done ? 'done' : 'tasks']++;
    if (!t.done && t.deadline && inRange(t.deadline)) slot(t.deadline).deadlines++;
  }
  for (const e of doc.events.filter(alive)) {
    const d = e.start.slice(0, 10);
    if (inRange(d)) slot(d).events++;
  }
  return map;
}

// Everything on one date.
export function dayContents(doc, date, today = null) {
  const tasks = tasksForDay(doc, date);
  const planned = new Set(tasks.map(t => t.id));
  return {
    date,
    events: eventsForDay(doc, date),
    tasks,
    deadlines: activeTasks(doc).filter(t => !t.done && t.deadline === date && !planned.has(t.id)),
    weekTasks: tasksForWeek(doc, weekKey(date)),
    // only dates from the planning day on: earlier days show what was really created
    repeats: (today && date < today) ? [] : activeSeries(doc).filter(s => s.mode === 'fixed' && !s.paused &&
      upcomingDates(s, date, 1)[0] === date && !(s.kind === 'event' ? doc.events : doc.tasks).some(t => t.seriesId === s.id && t.occurrenceDate === date))
  };
}

export const validMonth = (y, m) => Number.isInteger(y) && y >= 1900 && y <= 2200 && Number.isInteger(m) && m >= 1 && m <= 12;
export const monthOf = key => (isDateKey(key) ? { y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)) } : null);
export const weekdayIndex = key => (parseDateKey(key).getDay() + 6) % 7; // Monday = 0
