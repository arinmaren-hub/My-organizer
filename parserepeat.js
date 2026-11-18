// «Повтор словами» (0.9.0): finds a repeat rule in one fast-entry line. Russian only (English is paused).
// Pure function: it never changes data. The words are in i18n-v9.js (REPEAT_WORDS).
//
//   findRepeat('Тренировка в зале каждый вторник, четверг и субботу до 21/12')
//     → { rest: 'Тренировка в зале', rule: { freq: 'weekly', interval: 1, days: [2, 4, 6] }, until: { d: 21, m: 12, y: null } }
//
// Rules:
// - A repeat needs a repeat word: «каждый / каждую / каждое / каждые», «повтор…», «ежедневно / еженедельно /
//   ежемесячно / ежегодно», «по» + weekdays in the plural («по вторникам»), «по будням», «по выходным», «раз в …».
//   A weekday alone («в пятницу») stays a one-time date, read as before.
// - Weekdays → «every week on these days» (with «каждые 2 недели» every second week); «каждый день», «каждые 3 дня»,
//   «каждую неделю», «каждый месяц», «каждый год», «раз в неделю», «по будням» (пн–пт), «по выходным» (сб, вс).
// - The end: «до / по / окончание / заканчивается / конец» + a date (21/12, 21.12, 21.12.2026, 21 декабря [2026]).
//   Without a year the caller takes the nearest such date on or after the start.
// - Words that are not understood stay in the title. When nothing is left for a title, there is no repeat.
// Returns null when there is no repeat (the line is then read exactly as before 0.9.0).

import { REPEAT_WORDS as W } from './i18n-v9.js';

const norm = s => s.toLowerCase().replace(/\u0451/g, '\u0435'); // «ё» is read as «е»
const inList = (list, w) => list.includes(w);
const weekdayOf = w => { for (const k of Object.keys(W.weekdays)) if (W.weekdays[k].includes(w)) return Number(k); return 0; };
const groupOf = w => (W.groups.weekdays.includes(w) ? [1, 2, 3, 4, 5] : W.groups.weekend.includes(w) ? [6, 7] : null);
const unitOf = w => Object.keys(W.units).find(k => W.units[k].includes(w)) || null;
const adverbOf = w => Object.keys(W.adverbs).find(k => W.adverbs[k].includes(w)) || null;
const monthOf = w => { for (const k of Object.keys(W.months)) if (W.months[k].includes(w)) return Number(k); return 0; };
const numberOf = w => (/^\d{1,2}$/.test(w) ? Number(w) : W.numbers[w] || 0);
const GLUE_END = new RegExp(`\\s+(?:${W.glue.join('|')})$`, 'iu'); // a dangling «и / в / по» at the end of the title
const DIM = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // 29 Feb allowed (a leap year is checked later)

function tokens(text) {
  const out = [];
  for (const m of text.matchAll(/[\p{L}\p{N}]+(?:[./:][\p{N}]+)*/gu)) out.push({ w: norm(m[0]), start: m.index, end: m.index + m[0].length });
  return out;
}

// A date after an end word: { d, m, y, used } (used = tokens taken) or null.
function endDate(tk, i) {
  const a = tk[i];
  if (!a) return null;
  const n = a.w.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?$/);
  if (n) {
    const d = Number(n[1]), m = Number(n[2]);
    const y = n[3] ? (n[3].length === 2 ? 2000 + Number(n[3]) : Number(n[3])) : null;
    return m >= 1 && m <= 12 && d >= 1 && d <= DIM[m - 1] ? { d, m, y, used: 1 } : null;
  }
  if (/^\d{1,2}$/.test(a.w) && tk[i + 1] && monthOf(tk[i + 1].w)) {
    const d = Number(a.w), m = monthOf(tk[i + 1].w);
    if (d < 1 || d > DIM[m - 1]) return null;
    const y = tk[i + 2] && /^\d{4}$/.test(tk[i + 2].w) ? Number(tk[i + 2].w) : null;
    return { d, m, y, used: y ? 3 : 2 };
  }
  return null;
}

const startsDays = t => !!t && (weekdayOf(t.w) > 0 || !!groupOf(t.w));

export function findRepeat(input) {
  const text = String(input ?? '');
  const tk = tokens(text);
  if (!tk.length) return null;
  // where the repeat words begin
  let i0 = -1;
  for (let i = 0; i < tk.length; i++) {
    const w = tk[i].w, next = tk[i + 1];
    if (inList(W.triggers, w) || adverbOf(w)) { i0 = i; break; }
    if (inList(W.by, w) && next && (inList(W.plural, next.w) || groupOf(next.w))) { i0 = i; break; }
    if (inList(W.once, w) && next && inList(W.inWords, next.w) && tk[i + 2] && unitOf(tk[i + 2].w)) { i0 = i; break; }
  }
  if (i0 < 0) return null;
  // read the repeat words
  const days = new Set();
  let unit = null, n = 0, adv = null, j = i0;
  for (; j < tk.length; j++) {
    const w = tk[j].w, next = tk[j + 1];
    if (inList(W.triggers, w)) continue;
    const a = adverbOf(w);
    if (a) { adv = a; continue; }
    if (inList(W.once, w) && next && inList(W.inWords, next.w) && tk[j + 2] && unitOf(tk[j + 2].w)) { unit = unitOf(tk[j + 2].w); n = 1; j += 2; continue; }
    const num = numberOf(w);
    if (num && next && unitOf(next.w)) { n = num; unit = unitOf(next.w); j += 1; continue; }
    const u = unitOf(w);
    if (u) { unit = u; continue; }
    const wd = weekdayOf(w);
    if (wd) { days.add(wd); continue; }
    const g = groupOf(w);
    if (g) { g.forEach(x => days.add(x)); continue; }
    if (inList(W.glue, w) && startsDays(next)) continue;
    break;
  }
  const lastUsed = j - 1;
  // what the words mean
  let rule = null;
  if (days.size) rule = { freq: 'weekly', interval: unit === 'week' && n > 1 ? n : 1, days: [...days].sort((a, b) => a - b) };
  else if (unit) rule = { freq: unit === 'day' ? 'daily' : unit === 'week' ? 'weekly' : unit === 'month' ? 'monthly' : 'yearly', interval: n > 1 ? n : 1, days: null };
  else if (adv) rule = { freq: adv === 'day' ? 'daily' : adv === 'week' ? 'weekly' : adv === 'month' ? 'monthly' : 'yearly', interval: 1, days: null };
  if (!rule) return null;
  const cut = [[tk[i0].start, tk[lastUsed].end]];
  // the end date (anywhere outside the repeat words)
  let until = null;
  for (let i = 0; i < tk.length; i++) {
    if (i >= i0 && i <= lastUsed) continue;
    if (!inList(W.end, tk[i].w)) continue;
    const e = endDate(tk, i + 1);
    if (!e) continue;
    until = { d: e.d, m: e.m, y: e.y };
    cut.push([tk[i].start, tk[i + e.used].end]);
    break;
  }
  // the title: the line without those words
  let rest = text;
  for (const [a, b] of cut.sort((x, y) => y[0] - x[0])) rest = rest.slice(0, a) + ' ' + rest.slice(b);
  rest = rest.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .replace(/^[\s,;:\u2013\u2014-]+|[\s,;:\u2013\u2014-]+$/g, '').replace(GLUE_END, '').trim();
  if (!rest) return null;
  return { rest, rule, until };
}

// The end date as a day key: the given year, or the nearest such date on or after `start`.
export function untilKey(u, start) {
  if (!u) return null;
  const pad = x => String(x).padStart(2, '0');
  const ok = (y, m, d) => { const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; };
  if (u.y) return ok(u.y, u.m, u.d) ? `${u.y}-${pad(u.m)}-${pad(u.d)}` : null;
  const y0 = Number(start.slice(0, 4));
  for (let y = y0; y < y0 + 9; y++) {
    if (!ok(y, u.m, u.d)) continue;
    const key = `${y}-${pad(u.m)}-${pad(u.d)}`;
    if (key >= start) return key;
  }
  return null;
}
