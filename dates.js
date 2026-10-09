// All date maths lives here. Dates are stored as plain local "date keys"
// ('YYYY-MM-DD'), times as 'HH:MM', event moments as 'YYYY-MM-DDTHH:MM'
// (local wall-clock time). Record timestamps (createdAt etc.) are ISO UTC.
// Weeks start on Monday; a week is identified by the date key of its Monday.
// Nothing here depends on the browser's locale settings or the interface language.

export const pad = n => String(n).padStart(2, '0');

// Local calendar date of a Date object, e.g. '2026-10-09'.
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Date key -> Date at local noon (noon keeps us clear of DST switch hours).
export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function isDateKey(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return dateKey(parseDateKey(s)) === s; // rejects 2026-02-30 etc.
}

export function isTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

// 'YYYY-MM-DDTHH:MM' local wall-clock moment.
export function isDateTime(s) {
  return typeof s === 'string' && s.length === 16 && s[10] === 'T' &&
    isDateKey(s.slice(0, 10)) && isTime(s.slice(11));
}

export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

// Monday of the week containing the given date key.
export function weekKey(key) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateKey(d);
}

// Whole days from a to b (b - a), using noon dates so DST cannot skew it.
export function daysBetween(a, b) {
  return Math.round((parseDateKey(b) - parseDateKey(a)) / 864e5);
}

// Local 'HH:MM' of a Date.
export function timeOf(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Day and month names, and formatted dates, live in i18n.js (they depend on the language).
