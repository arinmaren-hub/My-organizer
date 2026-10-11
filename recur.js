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

import { addDays, addMonths, daysBetween, isoWeekday } from './dates.js';
import { newTask, newEvent } from './schema.js';

export const MAX_CREATED_AT_ONCE = 60;
export const EVENT_HORIZON_DAYS = 400; // recurring events are created this far ahead (and never in the past)
const MAX_EVENTS_AT_ONCE = 400;
const LOOP_LIMIT = 20000;

// The k-th date (k = 0 is startDate) of a fixed series. Months and years are
// counted from the START date, so a 31st never drifts to the 28th for good.
// The n-th (1..4) or the last (n = -1) given weekday (1 = Monday … 7) of the month that contains `anyDay`.
export function nthWeekdayOfMonth(anyDay, weekday, n) {
  const first = `${anyDay.slice(0, 7)}-01`;
  if (n > 0) {
    const shift = (weekday - isoWeekday(first) + 7) % 7;
    return addDays(first, shift + 7 * (n - 1));
  }
  const nextFirst = addMonths(first, 1);
  const last = addDays(nextFirst, -1);
  return addDays(last, -((isoWeekday(last) - weekday + 7) % 7));
}

// «Monthly by weekday»: the start date decides which one («second Tuesday» when the start is a second Tuesday).
// A start on the 29th–31st (a 5th weekday) means «the last one».
const monthlyByWeekday = series => series.freq === 'monthly' && (series.monthBy === 'nth' || series.monthBy === 'last');
function weekdayRule(series) {
  const ordinal = Math.ceil(Number(series.startDate.slice(8)) / 7);
  return { weekday: isoWeekday(series.startDate), n: series.monthBy === 'last' || ordinal >= 5 ? -1 : ordinal };
}

export function fixedDate(series, k) {
  const n = series.interval * k;
  if (monthlyByWeekday(series)) {
    const { weekday, n: nth } = weekdayRule(series);
    return nthWeekdayOfMonth(addMonths(`${series.startDate.slice(0, 7)}-01`, n), weekday, nth);
  }
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
  if (series.until && series.until < upTo) upTo = series.until; // the end date is inclusive
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
    if (d < series.startDate) continue; // «last Friday» of the first month can fall before the start
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
    if (s.kind === 'event') { created += ensureEventOccurrences(doc, s, ctx); continue; }
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
      if (s.until && date > s.until) continue; // the series has ended: no further occurrence
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

// ---------- Recurring EVENTS (0.6.0) ----------
// A series with kind 'event' makes real event records (seriesId + occurrenceDate), like task occurrences, but ahead of
// time: from today up to EVENT_HORIZON_DAYS ahead, never in the past (no retroactive history is invented).
// An occurrence is an ordinary event: it can be edited, moved, given a preparation list or deleted on its own.
// Deleting one adds its date to series.skip, so it is never made again even after the deleted record is purged.

export const isEventOccurrence = e => !!e.seriesId && !!e.occurrenceDate;
const hasEventPair = (events, seriesId, date) => events.some(e => e.seriesId === seriesId && e.occurrenceDate === date);

export function eventTimes(series, date) {
  return { start: `${date}T${series.time}`, end: series.endTime && series.endTime > series.time ? `${date}T${series.endTime}` : null };
}

export function ensureEventOccurrences(doc, s, ctx) {
  const horizon = addDays(ctx.today, EVENT_HORIZON_DAYS);
  const from = s.startDate > ctx.today ? s.startDate : ctx.today;
  let after = s.generatedThrough && s.generatedThrough >= addDays(from, -1) ? s.generatedThrough : addDays(from, -1);
  if (after >= horizon) return 0;
  const skip = new Set(s.skip || []);
  let dates = fixedDatesBetween(s, after, horizon);
  if (dates.length > MAX_EVENTS_AT_ONCE) dates = dates.slice(0, MAX_EVENTS_AT_ONCE);
  let created = 0;
  for (const d of dates) {
    if (skip.has(d) || hasEventPair(doc.events, s.id, d)) continue;
    const { start, end } = eventTimes(s, d);
    const e = newEvent({ id: ctx.uid(), title: s.title, start, now: ctx.now });
    e.end = end;
    e.seriesId = s.id;
    e.occurrenceDate = d;
    doc.events.push(e);
    created++;
  }
  const through = dates.length >= MAX_EVENTS_AT_ONCE ? dates[dates.length - 1] : horizon;
  if (s.generatedThrough !== through) { s.generatedThrough = through; s.updatedAt = ctx.now; }
  return created;
}

// An occurrence the series made and nobody has touched (title, time and end as the series gave them; no preparation list).
export function isUntouchedEventOccurrence(e, s) {
  if (!isEventOccurrence(e) || e.deletedAt) return false;
  const { start, end } = eventTimes(s, e.occurrenceDate);
  return e.title === s.title && e.start === start && (e.end || null) === end && !(Array.isArray(e.prep) && e.prep.some(i => !i.deletedAt)) && !e.keep;
}
