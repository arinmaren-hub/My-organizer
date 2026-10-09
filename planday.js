// Personal planning day (DECISIONS.md, section B4).
//
// Calendar date = the real date on the clock. Events, deadlines and timestamps
// always use it.
// Planning day  = the day the user is living in. Planning screens, reviews and
// overdue detection use it.
//
// The CUTOFF is the time the planning day ends (by default the usual bedtime):
//  - cutoff before noon (e.g. 03:00): the day ends after midnight, on the next
//    calendar date. Saturday 02:30 still belongs to Friday.
//  - cutoff from noon on (e.g. 23:00): the day ends before midnight, on the same
//    calendar date. Friday 23:30 already belongs to Saturday.
//  - cutoff 00:00 (the default when onboarding is skipped): planning day =
//    calendar date, exactly the behaviour before 0.3.0.
// Everything is computed from local wall-clock time ("is it before 03:00?"),
// never by subtracting hours, so daylight-saving nights cannot shift a day.

import { dateKey, addDays, timeOf, isTime } from './dates.js';

export const DEFAULT_CUTOFF = '00:00';
const PIVOT = '12:00';

const validCutoff = c => (isTime(c) ? c : DEFAULT_CUTOFF);

// The real moment the cutoff happens on a calendar date: the earliest instant on
// that date whose local time is at or after the cutoff.
//  - Clocks go back (the hour repeats): the FIRST occurrence counts, so the
//    planning day changes once and never flips back during the repeated hour.
//  - Clocks jump forward over the cutoff (e.g. 03:30 does not exist): the day
//    changes at the moment of the jump.
function cutoffInstant(day, c) {
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi] = c.split(':').map(Number);
  let s = new Date(y, mo - 1, d, h, mi, 0, 0);
  for (let i = 0; i < 180; i++) {
    const prev = new Date(s.getTime() - 60000);
    if (dateKey(prev) !== day || timeOf(prev) < c) break;
    s = prev;
  }
  return s.getTime();
}

// The planning day a moment belongs to, by the clock alone.
export function naturalDay(now, cutoff = DEFAULT_CUTOFF) {
  const c = validCutoff(cutoff);
  const cal = dateKey(now);
  const after = now.getTime() >= cutoffInstant(cal, c);
  if (c < PIVOT) return after ? cal : addDays(cal, -1);
  return after ? addDays(cal, 1) : cal;
}

// The planning day shown in the app. `finishedThrough` is the planning day the
// user ended early with «Завершить день»; it only counts while that day is
// still the natural one, so it can move the app at most one day ahead.
export function planningDay(now, cutoff = DEFAULT_CUTOFF, finishedThrough = null) {
  const natural = naturalDay(now, cutoff);
  return finishedThrough === natural ? addDays(natural, 1) : natural;
}

// The wall-clock window of a planning day: [start, end), as 'YYYY-MM-DDTHH:MM'
// strings that compare directly with event start times.
export function dayWindow(day, cutoff = DEFAULT_CUTOFF) {
  const c = validCutoff(cutoff);
  if (c < PIVOT) return { start: `${day}T${c}`, end: `${addDays(day, 1)}T${c}` };
  return { start: `${addDays(day, -1)}T${c}`, end: `${day}T${c}` };
}

// Owner's decision (2026-10-09): suggest the bedtime as the cutoff.
export function suggestCutoff(bed) {
  return isTime(bed) ? bed : DEFAULT_CUTOFF;
}
