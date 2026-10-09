// Recurring tasks (DECISIONS.md, B6). Pure rules plus one function that keeps the
// occurrences of every series in place on a draft document.
//
// A SERIES holds the rule; real tasks are OCCURRENCES (task.seriesId + task.occurrenceDate).
// That pair is unique: occurrences are only ever created when the pair is free
// (deleted occurrences count too), so running anything twice creates nothing twice.
//
// Two modes:
//  - 'completion': the next occurrence is counted from the day the previous one was
//    DONE (planning day). Only one occurrence is open at a time.
//  - 'fixed': dates follow a calendar rhythm from startDate (every N days/weeks/
//    months/years). Occurrences up to the planning day are created when the app is
//    opened; the ones in the past are NOT assumed missed: they wait, unconfirmed,
//    until the person says done, skipped or moved. Nothing is marked skipped or done
//    by the app itself.

import { addDays, addMonths, daysBetween } from './dates.js';
import { newTask } from './schema.js';

export const MAX_CREATED_AT_ONCE = 60;
const LOOP_LIMIT = 20000;

// The k-th date (k = 0 is startDate) of a fixed series. Months and years are
// counted from the START date, so a 31st never drifts to the 28th for good.
export function fixedDate(series, k) {
  const n = series.interval * k;
  switch (series.freq) {
    case 'daily': return addDays(series.startDate, n);
    case 'weekly': return addDays(series.startDate, 7 * n);
    case 'monthly': return addMonths(series.startDate, n);
    default: return addMonths(series.startDate, 12 * n); // yearly: 29 Feb → 28 Feb in common years
  }
}

// The next date counted from a completion day.
export function afterCompletion(series, doneDay) {
  const n = series.interval;
  switch (series.freq) {
    case 'daily': return addDays(doneDay, n);
    case 'weekly': return addDays(doneDay, 7 * n);
    case 'monthly': return addMonths(doneDay, n);
    default: return addMonths(doneDay, 12 * n);
  }
}

// Dates of a fixed series after `after` (exclusive; null = from startDate) up to `upTo` (inclusive).
export function fixedDatesBetween(series, after, upTo, limit = LOOP_LIMIT) {
  const out = [];
  let k = 0;
  if (series.freq === 'daily' || series.freq === 'weekly') {
    // jump close to the first date after `after` instead of counting from the start
    const step = series.interval * (series.freq === 'daily' ? 1 : 7);
    if (after && after >= series.startDate) k = Math.max(0, Math.floor(daysBetween(series.startDate, after) / step) - 1);
  } else if (after && after >= series.startDate) {
    const months = Number(after.slice(0, 4)) * 12 + Number(after.slice(5, 7)) - Number(series.startDate.slice(0, 4)) * 12 - Number(series.startDate.slice(5, 7));
    const step = series.interval * (series.freq === 'monthly' ? 1 : 12);
    k = Math.max(0, Math.floor(months / step) - 1);
  }
  for (let i = 0; i < limit; i++, k++) {
    const d = fixedDate(series, k);
    if (d > upTo) break;
    if (after && d <= after) continue;
    out.push(d);
  }
  return out;
}

export const isOccurrence = t => !!t.seriesId && !!t.occurrenceDate;
export const isOpen = t => !t.deletedAt && !t.done && !t.skipped;

// Does the pair (series, date) exist already (deleted or skipped ones count)?
const hasPair = (tasks, seriesId, date) => tasks.some(t => t.seriesId === seriesId && t.occurrenceDate === date);

function makeOccurrence(series, date, ctx) {
  const t = newTask({ id: ctx.uid(), title: series.title, plan: { kind: 'day', date }, now: ctx.now });
  t.time = series.time || null;
  t.projectId = series.projectId || null;
  t.seriesId = series.id;
  t.occurrenceDate = date;
  return t;
}

// Brings the occurrences of every active series up to date on a draft document.
// ctx = { today (planning day), now, uid }. Returns { created, capped }:
//   created = how many occurrences were added; capped = a fixed series had more than
//   MAX_CREATED_AT_ONCE waiting, so only the newest were added (nothing is skipped silently:
//   the caller shows a notice).
export function ensureOccurrences(doc, ctx) {
  let created = 0, capped = false;
  for (const s of doc.series) {
    if (s.deletedAt || s.paused) continue;
    const mine = doc.tasks.filter(t => t.seriesId === s.id);
    if (s.mode === 'completion') {
      if (mine.some(isOpen)) continue;
      let date;
      const doneDays = mine.filter(t => t.done).map(t => t.doneDay || t.occurrenceDate || '').filter(Boolean).sort();
      if (!mine.length) date = s.startDate; // the first occurrence is on the start date
      else {
        // counted from the last completion; if the latest occurrence was skipped or deleted instead,
        // from today (never from an old completion, which would land in the past)
        const latest = mine.slice().sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate)).pop();
        let base = doneDays.length ? doneDays[doneDays.length - 1] : ctx.today;
        if (!latest.done && ctx.today > base) base = ctx.today;
        date = afterCompletion(s, base);
      }
      // a date already used (e.g. by a deleted occurrence) → the next free one
      for (let i = 0; i < 1000 && hasPair(doc.tasks, s.id, date); i++) date = afterCompletion(s, date);
      doc.tasks.push(makeOccurrence(s, date, ctx));
      created++;
    } else {
      const from = s.generatedThrough || null;
      let dates = fixedDatesBetween(s, from, ctx.today);
      if (dates.length > MAX_CREATED_AT_ONCE) { dates = dates.slice(-MAX_CREATED_AT_ONCE); capped = true; }
      for (const d of dates) {
        if (hasPair(doc.tasks, s.id, d)) continue;
        doc.tasks.push(makeOccurrence(s, d, ctx));
        created++;
      }
      if (!s.generatedThrough || s.generatedThrough < ctx.today) { s.generatedThrough = ctx.today; s.updatedAt = ctx.now; }
    }
  }
  return { created, capped };
}

// Upcoming dates of a series for display/preview: the open occurrence (completion) or the next
// fixed dates after `from`.
export function upcomingDates(series, from, count = 1) {
  if (series.mode === 'completion') return [];
  const out = [];
  const dates = fixedDatesBetween(series, addDays(from, -1), addDays(from, 3660), 4000);
  for (const d of dates) { if (d >= from) out.push(d); if (out.length >= count) break; }
  return out;
}

// Unconfirmed occurrences (never assumed missed): still open and planned on a past day.
export function isUnconfirmed(t, today) {
  return isOccurrence(t) && isOpen(t) && t.plan.kind === 'day' && t.plan.date < today;
}

// History of one series, newest first: one entry per occurrence that was not deleted.
export function seriesHistory(doc, seriesId) {
  return doc.tasks
    .filter(t => t.seriesId === seriesId && !t.deletedAt)
    .map(t => ({ id: t.id, date: t.occurrenceDate, status: t.done ? 'done' : t.skipped ? 'skipped' : 'open', doneDay: t.doneDay || null }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
