// Quarterly cleanup (0.6.0). Pure functions: they look at the data and describe what MAY be removed;
// nothing here changes anything except removeCleanup(), which acts on a draft copy inside store.update().
//
// The age limit (90 days) only decides what is ELIGIBLE. Nothing is ever removed because time has passed.
// When a record's age or kind of record is unclear, it is left out.

import { addDays, isDateKey } from './dates.js';

export const CLEANUP_DAYS = 90;          // eligibility and reminder interval
export const POSTPONE_DAYS = 30;         // «Напомнить через месяц»
export const TRASH_DAYS = 30;            // same as the existing retention of «Удалённые» (store.js)
export const TYPES = ['tasks', 'events', 'lists', 'trash'];

export const cutoffFor = today => addDays(today, -CLEANUP_DAYS);

const dayOf = iso => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null);
const alive = r => !r.deletedAt;

// Date a finished task counts from: the day it was completed; failing that the day it was planned for.
export function taskAge(t) {
  const c = dayOf(t.doneDay) || dayOf(t.completedAt);
  if (c && isDateKey(c)) return c;
  if ((t.plan.kind === 'day' || t.plan.kind === 'week') && isDateKey(t.plan.date)) return t.plan.date;
  return null;
}

// The last day an event touches (its end if it has one on a later day).
export function eventLastDay(e) {
  const s = dayOf(e.start);
  if (!s || !isDateKey(s)) return null;
  const en = dayOf(e.end);
  return en && isDateKey(en) && en > s ? en : s;
}

// The last time anything in a list was touched.
export function listLastTouched(l) {
  const stamps = [l.updatedAt, l.createdAt, ...(l.items || []).map(i => i.updatedAt)].map(dayOf).filter(d => d && isDateKey(d));
  return stamps.length ? stamps.sort().pop() : null;
}

const trashCutoff = (nowIso) => Date.parse(nowIso) - TRASH_DAYS * 864e5;

// → { cutoff, tasks:[], events:[], lists:[], trash:[], total } ; each entry { key, type, id, title, date }
export function findCleanup(doc, today, nowIso) {
  const cutoff = cutoffFor(today);
  const tasks = [], events = [], lists = [], trash = [];
  for (const t of doc.tasks) {
    if (!alive(t) || !t.done || t.keep === true || t.seriesId) continue;
    const d = taskAge(t);
    if (d && d < cutoff) tasks.push({ key: `tasks:${t.id}`, type: 'tasks', id: t.id, title: t.title, date: d });
  }
  for (const e of doc.events) {
    if (!alive(e) || e.keep === true || e.seriesId) continue;
    const d = eventLastDay(e);
    if (d && d < cutoff) events.push({ key: `events:${e.id}`, type: 'events', id: e.id, title: e.title, date: dayOf(e.start) });
  }
  for (const l of doc.lists) {
    if (!alive(l) || l.kind === 'home' || l.keep === true) continue;
    const live = (l.items || []).filter(alive);
    if (!live.length || !live.every(i => i.done)) continue; // empty or unfinished: not clearly finished
    const d = listLastTouched(l);
    if (d && d < cutoff) lists.push({ key: `lists:${l.id}`, type: 'lists', id: l.id, title: l.name, date: d, count: live.length });
  }
  // «Удалённые» past the existing retention. Normally the app has removed these already; this only catches stragglers.
  if (Number.isFinite(trashCutoff(nowIso))) {
    const old = r => r.deletedAt && !r.base && Date.parse(r.deletedAt) < trashCutoff(nowIso);
    for (const c of ['tasks', 'events', 'lists', 'waiting']) for (const r of doc[c]) {
      if (!old(r) || r.keep === true || r.kind === 'home') continue;
      trash.push({ key: `trash:${c}:${r.id}`, type: 'trash', coll: c, id: r.id, title: r.title || r.name || '', date: dayOf(r.deletedAt) });
    }
  }
  const byDate = (a, b) => (b.date || '').localeCompare(a.date || '');
  tasks.sort(byDate); events.sort(byDate); lists.sort(byDate); trash.sort(byDate);
  return { cutoff, tasks, events, lists, trash, total: tasks.length + events.length + lists.length + trash.length };
}

export const counts = f => ({ tasks: f.tasks.length, events: f.events.length, lists: f.lists.length, trash: f.trash.length, total: f.total });

// Approximate size in storage characters of the whole data and of what could be removed.
const sizeOf = x => { try { return JSON.stringify(x).length; } catch { return 0; } };
export function estimateSizes(doc, f) {
  const ids = new Set([...f.tasks, ...f.events, ...f.lists].map(x => x.key));
  let removable = 0;
  for (const t of doc.tasks) if (ids.has(`tasks:${t.id}`)) removable += sizeOf(t);
  for (const e of doc.events) if (ids.has(`events:${e.id}`)) removable += sizeOf(e);
  for (const l of doc.lists) if (ids.has(`lists:${l.id}`)) removable += sizeOf(l);
  for (const x of f.trash) removable += sizeOf((doc[x.coll] || []).find(r => r.id === x.id) || {});
  return { total: sizeOf(doc), removable };
}

// Removes the chosen entries from a DRAFT document. `keys` = Set of entry keys, or null for everything eligible.
// Eligibility is worked out again here on the draft, so nothing that has become protected or unfinished since
// the list was shown can be removed. Returns the counts that were actually removed.
export function removeCleanup(draft, today, nowIso, keys = null) {
  const f = findCleanup(draft, today, nowIso);
  const chosen = e => keys === null || keys.has(e.key);
  const removed = { tasks: 0, events: 0, lists: 0, trash: 0 };
  const drop = (coll, id) => { const i = draft[coll].findIndex(r => r.id === id); if (i >= 0) { draft[coll].splice(i, 1); return true; } return false; };
  for (const e of f.tasks) if (chosen(e) && drop('tasks', e.id)) removed.tasks++;
  for (const e of f.events) if (chosen(e) && drop('events', e.id)) removed.events++;
  for (const e of f.lists) if (chosen(e) && drop('lists', e.id)) removed.lists++;
  for (const e of f.trash) if (chosen(e) && drop(e.coll, e.id)) removed.trash++;
  return removed;
}

// ---------- the reminder (per device) ----------
// state = { baseline, lastReview, remindAt } (date keys). `baseline` is the first day this version ran on the device,
// so nobody is asked on the day they update.
export function readState(dev) {
  const c = dev && typeof dev.cleanup === 'object' && dev.cleanup ? dev.cleanup : {};
  const ok = k => (isDateKey(c[k]) ? c[k] : null);
  return { baseline: ok('baseline'), lastReview: ok('lastReview'), remindAt: ok('remindAt') };
}

export function reminderDue(state, today) {
  const ref = state.lastReview || state.baseline;
  if (!ref) return false;
  if (today < addDays(ref, CLEANUP_DAYS)) return false;
  if (state.remindAt && today < state.remindAt) return false;
  return true;
}

export function formatBytes(n, loc = 'en') {
  const kb = n / 1024;
  const f = new Intl.NumberFormat(loc, { maximumFractionDigits: kb < 10 ? 1 : 0 });
  return kb < 1024 ? { v: f.format(Math.max(kb, 0.1)), unit: 'kb' } : { v: new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }).format(kb / 1024), unit: 'mb' };
}
