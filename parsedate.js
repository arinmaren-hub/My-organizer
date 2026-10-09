// Quick entry: finds a date, a time and a deadline in a line of text, in Russian
// or English (either works in either interface language). Pure function: it
// never changes data. The words it knows are in i18n-v4.js (PARSE_WORDS).
//
//   parseQuick('купить молоко завтра в 15:30', '2026-10-09')
//     → { title: 'купить молоко', kind: 'day', date: '2026-10-10', time: '15:30', deadline: null, found: [...] }
//
// Rules (also in DECISIONS.md): a weekday name means the NEXT such day after today;
// "next <weekday>" means that weekday in the next calendar week (Monday-based);
// a day and month without a year means the nearest such date, today included;
// 3/4 or 3.4 is day/month (not month/day); a date after "до / by / due" is a
// deadline, not the planned day; a bare number is never taken for a time.

import { addDays, weekKey, isDateKey, parseDateKey, pad, isTime, addMonths } from './dates.js';

export { addMonths };
import { PARSE_WORDS as W } from './i18n-v4.js';

const L = '\\p{L}\\p{N}';
const BEFORE = `(?<![${L}])`;
const AFTER = `(?![${L}])`;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = list => [...list].sort((a, b) => b.length - a.length).map(esc).join('|');
const allOf = obj => Object.values(obj).flat();

const R = {
  iso: new RegExp(`${BEFORE}(\\d{4})-(\\d{2})-(\\d{2})${AFTER}`, 'iu'),
  dayAfter: new RegExp(`${BEFORE}(?:${alt(W.dayAfter)})${AFTER}`, 'iu'),
  tomorrow: new RegExp(`${BEFORE}(?:${alt(W.tomorrow)})${AFTER}`, 'iu'),
  today: new RegExp(`${BEFORE}(?:${alt(W.today)})${AFTER}`, 'iu'),
  nextWeek: new RegExp(`${BEFORE}(?:${alt(W.nextWeek)})${AFTER}`, 'iu'),
  thisWeek: new RegExp(`${BEFORE}(?:${alt(W.thisWeek)})${AFTER}`, 'iu'),
  inN: new RegExp(`${BEFORE}(?:${alt(W.inWord)})\\s+(?:(\\d{1,3}|${alt(W.oneWords)})\\s+)?(${alt(allOf(W.units))})${AFTER}`, 'iu'),
  dayMonth: new RegExp(`${BEFORE}(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${alt(allOf(W.months))})\\.?(?:\\s+(\\d{4}))?${AFTER}`, 'iu'),
  monthDay: new RegExp(`${BEFORE}(${alt(allOf(W.months))})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${AFTER}`, 'iu'),
  numeric: new RegExp(`${BEFORE}(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{4}|\\d{2}))?(?!\\s*(?:${alt(W.notDateUnits)})(?![\\p{L}\\d]))${AFTER}`, 'iu'),
  weekday: new RegExp(`${BEFORE}(?:(${alt(W.next)})\\s+)?(${alt(allOf(W.weekdays))})${AFTER}`, 'iu'),
  clock: new RegExp(`${BEFORE}(\\d{1,2}):(\\d{2})(?:\\s*(am|pm|a\\.m\\.|p\\.m\\.))?${AFTER}`, 'iu'),
  ampm: new RegExp(`${BEFORE}(\\d{1,2})\\s*(am|pm|a\\.m\\.|p\\.m\\.)${AFTER}`, 'iu'),
  part: new RegExp(`${BEFORE}(?:(?:${alt(W.timeWords.filter(x => x !== '@'))})\\s+)?(\\d{1,2})\\s+(${alt([...W.dayParts.morning, ...W.dayParts.afternoon, ...W.dayParts.evening, ...W.dayParts.night, ...W.dayParts.oclock].filter(x => !/^(am|pm|a\\.m\\.|p\\.m\\.)$/.test(x)))})${AFTER}`, 'iu')
};

const lc = s => s.toLowerCase();
const weekdayNumber = word => Number(Object.keys(W.weekdays).find(k => W.weekdays[k].some(x => lc(x) === lc(word))));
const monthNumber = word => Number(Object.keys(W.months).find(k => W.months[k].some(x => lc(x) === lc(word))));
const unitOf = word => Object.keys(W.units).find(k => W.units[k].some(x => lc(x) === lc(word)));

function validDate(y, mo, d) {
  const key = `${String(y).padStart(4, '0')}-${pad(mo)}-${pad(d)}`;
  return isDateKey(key) ? key : null;
}

// Nearest date with this month and day, today included.
function nearest(mo, d, today) {
  const y = Number(today.slice(0, 4));
  for (let k = 0; k < 9; k++) { // 29 Feb: up to 8 years ahead
    const key = validDate(y + k, mo, d);
    if (key && key >= today) return key;
  }
  return null;
}

// A date phrase turned into { date } or { week } (a Monday), or null if not a real date.
const DATE_RULES = [
  ['iso', (m, today) => { const k = validDate(+m[1], +m[2], +m[3]); return k && { date: k }; }],
  ['dayAfter', (m, today) => ({ date: addDays(today, 2) })],
  ['tomorrow', (m, today) => ({ date: addDays(today, 1) })],
  ['today', (m, today) => ({ date: today })],
  ['nextWeek', (m, today) => ({ week: addDays(weekKey(today), 7) })],
  ['thisWeek', (m, today) => ({ week: weekKey(today) })],
  ['inN', (m, today) => {
    const unit = unitOf(m[2]);
    if (!unit) return null;
    const raw = m[1];
    const n = raw === undefined ? 1 : /^\d+$/.test(raw) ? Number(raw) : 1;
    if (n < 1) return null;
    if (unit === 'day') return { date: addDays(today, n) };
    if (unit === 'week') return { date: addDays(today, 7 * n) };
    return { date: addMonths(today, n) };
  }],
  ['dayMonth', (m, today) => {
    const mo = monthNumber(m[2]), d = +m[1];
    if (!mo) return null;
    const k = m[3] ? validDate(+m[3], mo, d) : nearest(mo, d, today);
    return k && { date: k };
  }],
  ['monthDay', (m, today) => {
    const mo = monthNumber(m[1]), d = +m[2];
    if (!mo) return null;
    const k = m[3] ? validDate(+m[3], mo, d) : nearest(mo, d, today);
    return k && { date: k };
  }],
  ['numeric', (m, today) => {
    const d = +m[1], mo = +m[2];
    if (mo < 1 || mo > 12) return null;
    let y = m[3] ? +m[3] : null;
    if (y !== null && y < 100) y += 2000;
    const k = y === null ? nearest(mo, d, today) : validDate(y, mo, d);
    return k && { date: k };
  }],
  ['weekday', (m, today) => {
    const wd = weekdayNumber(m[2]);
    if (!wd) return null;
    const cur = (parseDateKey(today).getDay() + 6) % 7 + 1; // Monday = 1
    if (m[1]) return { date: addDays(addDays(weekKey(today), 7), wd - 1) }; // that weekday of next week
    let diff = wd - cur;
    if (diff <= 0) diff += 7;
    return { date: addDays(today, diff) };
  }]
];

function hour12(h, part) {
  if (h < 1 || h > 12) return null;
  if (part === 'am') return h === 12 ? 0 : h;
  return h === 12 ? 12 : h + 12;
}

function findTime(text) {
  let m = text.match(R.clock);
  if (m) {
    let h = +m[1];
    const mi = +m[2];
    if (m[3]) {
      const part = lc(m[3]).startsWith('a') ? 'am' : 'pm';
      h = hour12(h, part);
      if (h === null) return null;
    }
    const time = `${pad(h)}:${pad(mi)}`;
    return isTime(time) ? { time, index: m.index, length: m[0].length } : null;
  }
  m = text.match(R.ampm);
  if (m) {
    const h = hour12(+m[1], lc(m[2]).startsWith('a') ? 'am' : 'pm');
    return h === null ? null : { time: `${pad(h)}:00`, index: m.index, length: m[0].length };
  }
  m = text.match(R.part);
  if (m) {
    const word = lc(m[2]);
    const h = +m[1];
    const inList = list => list.some(x => lc(x) === word);
    let hh = null;
    if (inList(W.dayParts.oclock)) hh = h >= 0 && h <= 23 ? h : null;
    else if (h >= 1 && h <= 12) {
      if (inList(W.dayParts.morning)) hh = h === 12 ? 0 : h;
      else if (inList(W.dayParts.afternoon)) hh = h === 12 ? 12 : h + 12;
      else if (inList(W.dayParts.evening)) hh = h === 12 ? 12 : h + 12;
      else if (inList(W.dayParts.night)) hh = h === 12 ? 0 : (h < 6 ? h : h + 12);
    }
    return hh === null ? null : { time: `${pad(hh)}:00`, index: m.index, length: m[0].length };
  }
  return null;
}

const blank = (text, index, length) => text.slice(0, index) + ' '.repeat(length) + text.slice(index + length);

// The first date phrase in the text, whichever rule finds it earliest.
function findDate(text, today) {
  let best = null;
  for (const [name, resolve] of DATE_RULES) {
    const re = new RegExp(R[name].source, R[name].flags.replace('g', ''));
    let from = 0;
    while (from <= text.length) {
      const m = re.exec(text.slice(from));
      if (!m) break;
      const index = from + m.index;
      const value = resolve(m, today);
      if (value) {
        if (!best || index < best.index || (index === best.index && m[0].length > best.length)) best = { ...value, index, length: m[0].length };
        break;
      }
      from = index + Math.max(1, m[0].length); // not a real date (e.g. 31 Feb): look further on
    }
  }
  return best;
}

const PREP_EDGE = new RegExp(`^(?:(?:${alt(W.preps)})(?![${L}]))[\\s:,;.-]*|[\\s:,;.-]*(?<![${L}])(?:${alt(W.preps)})$`, 'iu');

function tidy(s) {
  let out = s.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    const next = out.replace(PREP_EDGE, '').replace(/^[\s,;:.-]+|[\s,;:-]+$/g, '').trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

// Returns the cleaned title and what was recognised. If nothing is left as a
// title, the whole text is the title and nothing else is recognised.
export function parseQuick(input, today) {
  const original = String(input ?? '').trim();
  const none = { title: original, kind: null, date: null, time: null, deadline: null, found: [] };
  if (!original || !isDateKey(today)) return none;
  let rest = original;
  const found = [];
  let plan = null, deadline = null, time = null;

  for (let guard = 0; guard < 3; guard++) {
    const hit = findDate(rest, today);
    if (!hit) break;
    const before = rest.slice(0, hit.index);
    const kw = before.match(new RegExp(`(?<![${L}])(${alt(W.deadlineWords)})[\\s:]*$`, 'iu'));
    const isDeadline = !!kw && hit.date !== undefined;
    let start = hit.index, len = hit.length;
    if (isDeadline) { start = hit.index - (before.length - kw.index); len = hit.length + (before.length - kw.index); }
    const phrase = rest.slice(start, start + len).trim();
    if (isDeadline) {
      if (deadline) { rest = blank(rest, start, len); continue; }
      deadline = hit.date;
    } else {
      if (plan) { rest = blank(rest, hit.index, hit.length); continue; }
      plan = hit;
    }
    found.push(phrase);
    rest = blank(rest, start, len);
  }
  const tm = findTime(rest);
  if (tm) {
    time = tm.time;
    // a leading "в / at" belongs to the time
    const before = rest.slice(0, tm.index);
    const prep = before.match(new RegExp(`(?<![${L}@])(${alt(W.timeWords)})[\\s]*$`, 'iu'));
    const start = prep ? tm.index - (before.length - prep.index) : tm.index;
    const len = tm.length + (tm.index - start);
    found.push(rest.slice(start, start + len).trim());
    rest = blank(rest, start, len);
  }
  if (!plan && !deadline && !time) return none;
  const title = tidy(rest);
  if (!title) return none;
  // A time with no day means "today" for the caller; a week phrase has no time.
  const res = { title, kind: null, date: null, time, deadline, found };
  if (plan && plan.week) { res.kind = 'week'; res.date = plan.week; res.time = null; }
  else if (plan) { res.kind = 'day'; res.date = plan.date; }
  return res;
}
