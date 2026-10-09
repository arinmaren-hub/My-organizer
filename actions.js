// Everything the user can change, as named operations on the store.
// Each one edits a draft copy inside store.update(); throwing an Error cancels it
// and shows the message. Screens call these; they never edit data themselves.

import { newTask, newEvent, newProject, newList, newItem, newTemplate, newWaiting, newSeries, PLAN_KINDS, SERIES_FREQS, SERIES_MODES } from './schema.js';
import { isDateKey, isDateTime, isTime, weekKey, addDays } from './dates.js';
import { parseQuick } from './parsedate.js';
import { ensureOccurrences, afterCompletion, isOpen } from './recur.js';
import { isBuiltinId, baseOf, builtinTemplate } from './templates.js';
import { clone } from './util.js';
import { suggestCutoff } from './planday.js';
import { appError, t, getLang } from './i18n.js';

// `what` is a message key such as 'what.task'.
function findAlive(arr, id, what) {
  const r = arr.find(x => x.id === id && !x.deletedAt);
  if (!r) throw appError('err.notFound', { what: { $t: what } });
  return r;
}

function planFor(kind, dateInput, today) {
  if (!PLAN_KINDS.includes(kind)) throw appError('err.unknownPlanKind');
  const base = isDateKey(dateInput) ? dateInput : today;
  if (kind === 'day') return { kind: 'day', date: base };
  if (kind === 'week') return { kind: 'week', date: weekKey(base) };
  return { kind: 'none', date: null };
}

// ---------- Tasks ----------

// One task per non-empty line. Only the title is required.
export function addTasksFromText(store, text, kind = 'none', dateInput = '') {
  const lines = String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (!lines.length) return 0;
  return store.update('act.addTasks', (d, { now, today, uid }) => {
    const plan = planFor(kind, dateInput, today);
    for (const title of lines) d.tasks.push(newTask({ id: uid(), title, plan, now }));
    return lines.length;
  });
}

// ---------- Quick entry with date recognition (DECISIONS.md, decision 2) ----------

// Splits what was typed into ready tasks and, if a line has a time, the first such
// line to ask about («Задача или событие?»). Pure: changes nothing.
//   defaults = { kind: 'none'|'day'|'week', date } from the form
//   → { specs: [spec], ask: spec|null, rest: 'text still to be handled' }
// spec = { title, kind, date, time, deadline, raw, recognized }
export function splitQuick(text, defaults, today) {
  const lines = String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
  const specs = [];
  for (let i = 0; i < lines.length; i++) {
    const p = parseQuick(lines[i], today);
    const recognized = p.found.length > 0;
    let kind = p.kind, date = p.date;
    if (!kind) {
      // nothing recognised for the day: the form's choice applies
      kind = defaults.kind === 'day' || defaults.kind === 'week' ? defaults.kind : 'none';
      date = kind === 'none' ? null : (isDateKey(defaults.date) ? defaults.date : today);
      if (kind === 'week') date = weekKey(date);
      if (p.time && kind !== 'day') { // a time needs a day: the form's day if one was chosen, else today
        kind = 'day';
        date = defaults.kind === 'day' && isDateKey(defaults.date) ? defaults.date : today;
      }
    }
    const spec = { title: p.title, kind, date, time: p.time, deadline: p.deadline, raw: lines[i], recognized };
    if (spec.time) return { specs, ask: spec, rest: lines.slice(i).join('\n') };
    specs.push(spec);
  }
  return { specs, ask: null, rest: '' };
}

// Adds ready tasks (from splitQuick) in one step.
export function addTaskSpecs(store, specs) {
  if (!specs.length) return 0;
  return store.update('act.addTasks', (d, { now, uid }) => {
    for (const s of specs) {
      const task = newTask({ id: uid(), title: s.title, plan: { kind: s.kind, date: s.kind === 'none' ? null : s.date }, now });
      if (s.time && s.kind === 'day') task.time = s.time;
      if (s.deadline) task.deadline = s.deadline;
      d.tasks.push(task);
    }
    return specs.length;
  });
}

// The same line as an event at its date and time.
export function addEventFromSpec(store, spec) {
  return addEvent(store, { title: spec.title, start: `${spec.date}T${spec.time}` });
}

// ---------- Editing ----------

const optDate = v => (v === '' || v == null ? null : String(v));

// Edits title, plan, time and deadline. Rescheduling never changes the deadline
// by itself; only this form (or the person) sets or clears it (decision 6).
export function editTask(store, id, f) {
  return store.update('act.editTask', (d, { now, today }) => {
    const t = findAlive(d.tasks, id, 'what.task');
    const title = String(f.title || '').trim();
    if (!title) throw appError('err.needTitle');
    if (!PLAN_KINDS.includes(f.kind)) throw appError('err.unknownPlanKind');
    if (f.kind !== 'none' && !isDateKey(f.date)) throw appError('err.needDate');
    const time = f.kind === 'day' && f.time ? String(f.time).slice(0, 5) : null;
    if (time !== null && !isTime(time)) throw appError('err.badTime');
    const deadline = optDate(f.deadline);
    if (deadline !== null && !isDateKey(deadline)) throw appError('err.badDate');
    t.title = title;
    t.plan = planFor(f.kind, f.date, today);
    t.time = time;
    if (time === null) t.reminder = null;
    t.deadline = deadline;
    t.updatedAt = now;
  });
}

// Edits an event: title, start and optional end ('YYYY-MM-DDTHH:MM').
export function editEvent(store, id, { title, start, end }) {
  return store.update('act.editEvent', (d, { now }) => {
    const e = findAlive(d.events, id, 'what.event');
    const name = String(title || '').trim();
    if (!name) throw appError('err.needTitle');
    const s = String(start || '').slice(0, 16);
    if (!isDateTime(s)) throw appError('err.needDateTime');
    const en = end ? String(end).slice(0, 16) : null;
    if (en !== null && (!isDateTime(en) || en < s)) throw appError('err.badEnd');
    e.title = name; e.start = s; e.end = en;
    e.updatedAt = now;
  });
}

export function setTaskDone(store, id, done) {
  return store.update('act.setTaskDone', (d, ctx) => {
    const { now, today } = ctx;
    const t = findAlive(d.tasks, id, 'what.task');
    t.done = !!done;
    t.completedAt = t.done ? now : null;
    t.doneDay = t.done ? today : null;
    t.updatedAt = now;
    if (t.seriesId) {
      if (!t.done) dropUntouchedSuccessor(d, t); // undo: the successor it created disappears again
      ensureOccurrences(d, ctx);                       // done: the next occurrence appears (idempotent)
    }
  });
}

// A completion-based series made the next occurrence when this one was completed. If the
// completion is undone and that successor is still untouched, it is removed again (soft delete).
const isUntouchedClone = (x, s) => x.plan.kind === 'day' && x.plan.date === x.occurrenceDate && x.title === s.title &&
  (x.time || null) === (s.time || null) && !x.deadline && !x.review && x.projectId === (s.projectId || null);

function dropUntouchedSuccessor(d, undone) {
  const s = d.series.find(x => x.id === undone.seriesId);
  if (!s || s.mode !== 'completion') return;
  const open = d.tasks.filter(x => x.seriesId === s.id && x !== undone && isOpen(x));
  const x = open[0];
  // untouched = still exactly as the series made it
  const untouched = x && isUntouchedClone(x, s);
  // The clone was made by the app, holds nothing the person wrote, and must not keep its date
  // reserved (otherwise completing again would skip an occurrence), so it is removed outright.
  if (open.length === 1 && untouched) d.tasks.splice(d.tasks.indexOf(x), 1);
}

// Reschedule. Changes ONLY the plan; the deadline is never touched (decision 6).
export function moveTask(store, id, kind, dateInput = '') {
  return store.update('act.moveTask', (d, { now, today }) => {
    const t = findAlive(d.tasks, id, 'what.task');
    if (kind === 'tomorrow') { kind = 'day'; dateInput = addDays(today, 1); }
    t.plan = planFor(kind, dateInput, today);
    if (t.plan.kind !== 'day') { t.time = null; t.reminder = null; } // a time only makes sense on a day
    t.updatedAt = now;
  });
}

// ---------- Soft delete / restore (any top-level collection) ----------

const LABELS = { tasks: 'what.task', events: 'what.event', projects: 'what.project', lists: 'what.list', series: 'what.series', waiting: 'what.waiting', templates: 'what.template' };

export function softDelete(store, collection, id) {
  return store.update('act.delete', (d, ctx) => {
    const { now } = ctx;
    if (!LABELS[collection]) throw appError('err.unknownCollection');
    if (collection === 'templates' && isBuiltinId(id)) { // deleting a built-in leaves a marker record
      const rec = newTemplate({ id: ctx.uid(), name: builtinTemplate(baseOf(id), getLang()).name, base: baseOf(id), now });
      rec.deletedAt = now;
      d.templates.push(rec);
      return;
    }
    const r = findAlive(d[collection], id, LABELS[collection]);
    r.deletedAt = now;
    r.updatedAt = now;
    if (collection === 'series') { // the open occurrences go with the series; finished ones stay as history
      for (const t of d.tasks) if (t.seriesId === id && isOpen(t)) { t.deletedAt = now; t.updatedAt = now; }
    }
    // Deleting the open occurrence of a recurring task counts as skipping it: the next one is created.
    if (collection === 'tasks' && r.seriesId) ensureOccurrences(d, ctx);
  });
}

export function restoreDeleted(store, collection, id) {
  return store.update('act.restore', (d, ctx) => {
    const { now } = ctx;
    if (!LABELS[collection]) throw appError('err.unknownCollection');
    const r = d[collection].find(x => x.id === id && x.deletedAt);
    if (!r) throw appError('err.deletedNotFound');
    // A completion-based series has ONE open occurrence. Restoring an open one while another exists:
    // the other is removed if it is an untouched app-made clone, otherwise the restore is refused.
    if (collection === 'tasks' && r.seriesId && isOpen({ ...r, deletedAt: null })) {
      const s = d.series.find(x => x.id === r.seriesId && !x.deletedAt);
      if (s && s.mode === 'completion') {
        const others = d.tasks.filter(x => x.seriesId === s.id && x !== r && isOpen(x));
        if (others.some(x => !isUntouchedClone(x, s))) throw appError('err.restoreOpenExists');
        for (const x of others) d.tasks.splice(d.tasks.indexOf(x), 1);
      }
    }
    r.deletedAt = null;
    r.updatedAt = now;
    if (collection === 'series') { // the time it was deleted is not backfilled
      if (r.mode === 'fixed') r.generatedThrough = addDays(ctx.today, -1);
      ensureOccurrences(d, ctx);
    }
  });
}

// ---------- Events ----------

export function addEvent(store, { title, start }) {
  const s = String(start || '').slice(0, 16);
  return store.update('act.addEvent', (d, { now, uid }) => {
    if (!String(title || '').trim()) throw appError('err.needTitle');
    if (!isDateTime(s)) throw appError('err.needDateTime');
    d.events.push(newEvent({ id: uid(), title: String(title).trim(), start: s, now }));
  });
}

// ---------- Projects ----------

export function addProject(store, { name, total, unit }) {
  return store.update('act.addProject', (d, { now, uid }) => {
    if (!String(name || '').trim()) throw appError('err.needTitle');
    const n = total === '' || total == null ? 0 : Number(total);
    if (!Number.isFinite(n) || n < 0) throw appError('err.badTarget');
    d.projects.push(newProject({ id: uid(), name: String(name).trim(), total: n, unit: String(unit || '').trim() || t('proj.defaultUnit'), now }));
  });
}

export function addMilestone(store, projectId, title) {
  return store.update('act.addMilestone', (d, { now, uid }) => {
    if (!String(title || '').trim()) throw appError('err.needMilestoneTitle');
    const p = findAlive(d.projects, projectId, 'what.project');
    p.milestones.push(newItem({ id: uid(), title: String(title).trim(), now }));
    p.updatedAt = now;
  });
}

export function setMilestoneDone(store, projectId, id, done) {
  return store.update('act.setMilestoneDone', (d, { now }) => {
    const p = findAlive(d.projects, projectId, 'what.project');
    const m = findAlive(p.milestones, id, 'what.milestone');
    m.done = !!done;
    m.updatedAt = now;
    p.updatedAt = now;
  });
}

export function stepQuantity(store, projectId, delta) {
  return store.update('act.quantity', (d, { now }) => {
    const p = findAlive(d.projects, projectId, 'what.project');
    p.quantity.current = Math.max(0, p.quantity.current + Number(delta));
    p.updatedAt = now;
  });
}

export function setQuantity(store, projectId, value) {
  return store.update('act.quantity', (d, { now }) => {
    const p = findAlive(d.projects, projectId, 'what.project');
    const n = Number(value);
    p.quantity.current = Number.isFinite(n) ? Math.max(0, n) : 0;
    p.updatedAt = now;
  });
}

// ---------- Lists ----------

export function addList(store, name) {
  return store.update('act.addList', (d, { now, uid }) => {
    if (!String(name || '').trim()) throw appError('err.needTitle');
    d.lists.push(newList({ id: uid(), name: String(name).trim(), now }));
  });
}

export function addListItem(store, listId, title) {
  return store.update('act.addItem', (d, { now, uid }) => {
    if (!String(title || '').trim()) throw appError('err.needItemTitle');
    const l = findAlive(d.lists, listId, 'what.list');
    l.items.push(newItem({ id: uid(), title: String(title).trim(), now }));
    l.updatedAt = now;
  });
}

export function setListItemDone(store, listId, id, done) {
  return store.update('act.setItemDone', (d, { now }) => {
    const l = findAlive(d.lists, listId, 'what.list');
    const i = findAlive(l.items, id, 'what.item');
    i.done = !!done;
    i.updatedAt = now;
    l.updatedAt = now;
  });
}

// ---------- Personal day (DECISIONS.md, B4) ----------

const optTime = v => (v === '' || v == null ? null : String(v).slice(0, 5));

function cleanDay({ wake, bed, cutoff }) {
  const day = { wake: optTime(wake), bed: optTime(bed), cutoff: optTime(cutoff) };
  for (const v of [day.wake, day.bed, day.cutoff]) {
    if (v !== null && !isTime(v)) throw appError('err.badTime');
  }
  // No cutoff given: use the bedtime (owner's decision), otherwise midnight.
  if (day.cutoff === null) day.cutoff = suggestCutoff(day.bed);
  return day;
}

// Save wake-up time, bedtime and cutoff (from «Настройки» → «Мой день»).
export function setDaySettings(store, values) {
  return store.update('act.setDay', (d, { now }) => {
    d.settings.day = { ...d.settings.day, ...cleanDay(values) };
    d.updatedAt = now;
  });
}

// First-launch questions answered: save them and never ask again.
export function finishOnboarding(store, values) {
  return store.update('act.onboarding', d => {
    d.settings.day = { ...d.settings.day, ...cleanDay(values), setupDone: true };
  });
}

// First-launch questions skipped: the day ends at midnight, as before 0.3.0.
export function skipOnboarding(store) {
  return store.update('act.onboarding', d => {
    d.settings.day = { ...d.settings.day, cutoff: '00:00', setupDone: true };
  });
}

// ---------- Reviews: morning and evening (DECISIONS.md, B5) ----------
// Nothing moves without a tap. Every decision is remembered on the task as
// review = { day, choice, part } (part = 'am' morning / 'pm' evening; day = the planning day it was made for), so the same
// question is not asked twice in one planning day or again the next morning.
// The deadline is never touched.

const REVIEW_CHOICES = ['today', 'tomorrow', 'date', 'week', 'none', 'keep', 'done'];

function applyReview(d, ctx, t, choice, arg, part) {
  const { now, today } = ctx;
  let mark;
  if (choice === 'today') { t.plan = { kind: 'day', date: today }; mark = 'moved'; }
  else if (choice === 'tomorrow') { t.plan = { kind: 'day', date: addDays(today, 1) }; mark = 'moved'; }
  else if (choice === 'date') {
    if (!isDateKey(arg)) throw appError('err.needDate');
    t.plan = { kind: 'day', date: arg }; mark = 'moved';
  } else if (choice === 'week') { t.plan = { kind: 'week', date: weekKey(today) }; mark = 'moved'; }
  else if (choice === 'none') { t.plan = { kind: 'none', date: null }; mark = 'moved'; }
  else if (choice === 'keep') mark = 'kept';
  else if (choice === 'done') {
    t.done = true; t.completedAt = now; t.doneDay = today; mark = 'done';
    if (t.seriesId) ensureOccurrences(d, ctx);
  } else throw appError('err.unknownReview');
  if (t.plan.kind !== 'day') { t.time = null; t.reminder = null; }
  t.review = { day: today, choice: mark, part: part === 'pm' ? 'pm' : 'am' };
  t.updatedAt = now;
}

export function reviewTask(store, id, choice, arg = '', part = 'am') {
  return store.update('act.reviewTask', (d, ctx) => {
    if (!REVIEW_CHOICES.includes(choice)) throw appError('err.unknownReview');
    applyReview(d, ctx, findAlive(d.tasks, id, 'what.task'), choice, arg, part);
  });
}

// «Всё на завтра»: only the tasks the person was shown (the caller confirms the count first).
export function reviewManyToTomorrow(store, ids, part = 'am') {
  return store.update('act.reviewAll', (d, ctx) => {
    for (const id of ids) applyReview(d, ctx, findAlive(d.tasks, id, 'what.task'), 'tomorrow', '', part);
    return ids.length;
  });
}

// ---------- Recurring tasks (B6) ----------

// Creates what is missing for every active series (idempotent). Opening the app, a new
// planning day and any change of a series call this; it does nothing when nothing is due.
export function syncSeries(store) {
  const probe = clone(store.doc);
  const r0 = ensureOccurrences(probe, { today: store.planningToday(), now: '', uid: () => 'probe' });
  if (!r0.created && JSON.stringify(probe.series) === JSON.stringify(store.doc.series)) return { created: 0, capped: false };
  let out = { created: 0, capped: false };
  store.update('act.series', (d, ctx) => { out = ensureOccurrences(d, ctx); });
  return out;
}

function cleanSeries(f, today) {
  const title = String(f.title || '').trim();
  if (!title) throw appError('err.needTitle');
  if (!SERIES_FREQS.includes(f.freq)) throw appError('err.badFreq');
  const interval = Number(f.interval === '' || f.interval == null ? 1 : f.interval);
  if (!Number.isInteger(interval) || interval < 1 || interval > 999) throw appError('err.badInterval');
  const mode = f.mode == null ? 'completion' : f.mode;
  if (!SERIES_MODES.includes(mode)) throw appError('err.badMode');
  const startDate = isDateKey(f.startDate) ? f.startDate : today;
  const time = f.time ? String(f.time).slice(0, 5) : null;
  if (time !== null && !isTime(time)) throw appError('err.badTime');
  return { title, freq: f.freq, interval, mode, startDate, time };
}

export function addSeries(store, f) {
  return store.update('act.series', (d, ctx) => {
    const c = cleanSeries(f, ctx.today);
    const s = newSeries({ id: ctx.uid(), ...c, now: ctx.now });
    d.series.push(s);
    ensureOccurrences(d, ctx);
    return s.id;
  });
}

// Changes the rule for FUTURE occurrences. With applyToOpen the open occurrences take the new
// title and time too. Dates that already exist are never regenerated.
export function editSeries(store, id, f, applyToOpen = false) {
  return store.update('act.series', (d, ctx) => {
    const s = findAlive(d.series, id, 'what.series');
    const c = cleanSeries(f, ctx.today);
    const wasMode = s.mode;
    Object.assign(s, c);
    // switching to the fixed rhythm starts from today: the past is not backfilled
    if (wasMode === 'completion' && s.mode === 'fixed') s.generatedThrough = addDays(ctx.today, -1);
    s.updatedAt = ctx.now;
    if (applyToOpen) {
      for (const t of d.tasks) if (t.seriesId === id && isOpen(t)) {
        t.title = c.title;
        if (t.plan.kind === 'day') t.time = c.time;
        t.updatedAt = ctx.now;
      }
    }
    ensureOccurrences(d, ctx);
  });
}

export function pauseSeries(store, id, paused) {
  return store.update('act.series', (d, ctx) => {
    const s = findAlive(d.series, id, 'what.series');
    s.paused = !!paused;
    s.updatedAt = ctx.now;
    // Resuming a fixed series does not create the occurrences of the paused time.
    if (!paused && s.mode === 'fixed') s.generatedThrough = addDays(ctx.today, -1);
    ensureOccurrences(d, ctx);
  });
}

// An occurrence on a past day, never assumed missed: the person says what happened.
//   done      → done now (counts from today)
//   doneThen  → done on the day it was planned for (counts from that day)
//   skip      → skipped on purpose (kept in the history)
//   today     → still to do: planned for today
export function confirmOccurrence(store, id, how) {
  return store.update('act.confirmOccurrence', (d, ctx) => {
    const { now, today } = ctx;
    const t = findAlive(d.tasks, id, 'what.task');
    if (!t.seriesId) throw appError('err.unknownReview');
    if (how === 'done' || how === 'doneThen') {
      t.done = true; t.completedAt = now;
      t.doneDay = how === 'doneThen' ? t.plan.date : today;
    } else if (how === 'skip') {
      t.skipped = true;
    } else if (how === 'today') {
      t.plan = { kind: 'day', date: today };
    } else throw appError('err.unknownReview');
    t.updatedAt = now;
    ensureOccurrences(d, ctx);
  });
}

// ---------- Waiting for others (B7) ----------

function cleanWaiting(f) {
  const title = String(f.title || '').trim();
  if (!title) throw appError('err.needTitle');
  const from = String(f.from || '').trim() || null;
  const followUp = f.followUp ? String(f.followUp) : null;
  if (followUp !== null && !isDateKey(followUp)) throw appError('err.badDate');
  return { title, from, followUp, note: String(f.note || '').trim() };
}

export function addWaiting(store, f) {
  return store.update('act.addWaiting', (d, { now, uid }) => {
    d.waiting.push(newWaiting({ id: uid(), ...cleanWaiting(f), now }));
  });
}

export function editWaiting(store, id, f) {
  return store.update('act.editWaiting', (d, { now }) => {
    const w = findAlive(d.waiting, id, 'what.waiting');
    Object.assign(w, cleanWaiting(f));
    w.updatedAt = now;
  });
}

// Follow-up handled: «Решено» / reopened / «проверить снова через N дней» / «отложить до даты».
export function resolveWaiting(store, id, resolved = true) {
  return store.update('act.waiting', (d, { now }) => {
    const w = findAlive(d.waiting, id, 'what.waiting');
    w.resolved = !!resolved;
    w.resolvedAt = w.resolved ? now : null;
    w.updatedAt = now;
  });
}

export function setWaitingFollowUp(store, id, { days, date }) {
  return store.update('act.waiting', (d, { now, today }) => {
    const w = findAlive(d.waiting, id, 'what.waiting');
    const next = date ? String(date) : addDays(today, Number(days));
    if (!isDateKey(next)) throw appError('err.badDate');
    w.followUp = next;
    w.updatedAt = now;
  });
}

// «Нужно действие»: the waiting item becomes a task for today; the item is marked resolved and
// keeps the link to the task.
export function waitingToTask(store, id) {
  return store.update('act.waiting', (d, { now, today, uid }) => {
    const w = findAlive(d.waiting, id, 'what.waiting');
    const task = newTask({ id: uid(), title: w.title, plan: { kind: 'day', date: today }, now });
    d.tasks.push(task);
    w.resolved = true; w.resolvedAt = now; w.taskId = task.id; w.updatedAt = now;
    return task.id;
  });
}

// ---------- Lists and templates ----------
// A list and a template have the same shape (items with an optional category). These
// functions work on either: `coll` is 'lists' or 'templates'.

const LIST_COLLS = ['lists', 'templates'];
const cleanName = v => { const s = String(v || '').trim(); if (!s) throw appError('err.needTitle'); return s; };

// Finds the container; a built-in template that is being edited first becomes a normal record.
function container(d, ctx, coll, id) {
  if (!LIST_COLLS.includes(coll)) throw appError('err.unknownCollection');
  if (coll === 'templates' && isBuiltinId(id)) {
    const b = builtinTemplate(baseOf(id), getLang());
    const rec = newTemplate({ id: ctx.uid(), name: b.name, base: b.base, now: ctx.now });
    rec.categories = [...b.categories];
    rec.items = b.items.map(i => newItem({ id: ctx.uid(), title: i.title, category: i.category, now: ctx.now }));
    d.templates.push(rec);
    return rec;
  }
  return findAlive(d[coll], id, coll === 'lists' ? 'what.list' : 'what.template');
}

export function renameContainer(store, coll, id, name) {
  return store.update('act.editList', (d, ctx) => {
    const c = container(d, ctx, coll, id);
    c.name = cleanName(name);
    c.updatedAt = ctx.now;
  });
}

export function addContainerItem(store, coll, id, title, category = null) {
  return store.update('act.addItem', (d, ctx) => {
    const c = container(d, ctx, coll, id);
    const text = String(title || '').trim();
    if (!text) throw appError('err.needItemTitle');
    c.items.push(newItem({ id: ctx.uid(), title: text, category: category || null, now: ctx.now }));
    c.updatedAt = ctx.now;
  });
}

export function editContainerItem(store, coll, id, itemId, { title, category }) {
  return store.update('act.editList', (d, ctx) => {
    const c = container(d, ctx, coll, id);
    const i = findAlive(c.items, itemId, 'what.item');
    const text = String(title || '').trim();
    if (!text) throw appError('err.needItemTitle');
    i.title = text;
    i.category = category ? String(category) : null;
    i.updatedAt = ctx.now;
    c.updatedAt = ctx.now;
  });
}

export function deleteContainerItem(store, coll, id, itemId) {
  return store.update('act.editList', (d, ctx) => {
    const c = container(d, ctx, coll, id);
    const i = findAlive(c.items, itemId, 'what.item');
    i.deletedAt = ctx.now; i.updatedAt = ctx.now;
    c.updatedAt = ctx.now;
  });
}

export function addCategory(store, coll, id, name) {
  return store.update('act.editList', (d, ctx) => {
    const c = container(d, ctx, coll, id);
    const n = cleanName(name);
    c.categories = c.categories || [];
    if (!c.categories.includes(n)) c.categories.push(n);
    c.updatedAt = ctx.now;
  });
}

export function renameCategory(store, coll, id, from, to) {
  return store.update('act.editList', (d, ctx) => {
    const c = container(d, ctx, coll, id);
    const n = cleanName(to);
    c.categories = (c.categories || []).map(x => (x === from ? n : x)).filter((x, i, a) => a.indexOf(x) === i);
    for (const i of c.items) if (i.category === from) { i.category = n; i.updatedAt = ctx.now; }
    c.updatedAt = ctx.now;
  });
}

// Removing a category never removes items: they become uncategorized.
export function removeCategory(store, coll, id, name) {
  return store.update('act.editList', (d, ctx) => {
    const c = container(d, ctx, coll, id);
    c.categories = (c.categories || []).filter(x => x !== name);
    for (const i of c.items) if (i.category === name) { i.category = null; i.updatedAt = ctx.now; }
    c.updatedAt = ctx.now;
  });
}

export function addTemplate(store, name) {
  return store.update('act.template', (d, { now, uid }) => {
    const tpl = newTemplate({ id: uid(), name: cleanName(name), now });
    d.templates.push(tpl);
    return tpl.id;
  });
}

// A new list from a template: categories and items are copied with new ids, nothing ticked.
// The template itself is only read.
export function createListFromTemplate(store, templateId, name = '') {
  return store.update('act.fromTemplate', (d, { now, uid }) => {
    const src = isBuiltinId(templateId) ? builtinTemplate(baseOf(templateId), getLang()) : findAlive(d.templates, templateId, 'what.template');
    const list = newList({ id: uid(), name: String(name || '').trim() || src.name, now });
    list.categories = [...(src.categories || [])];
    list.items = src.items.filter(i => !i.deletedAt).map(i => newItem({ id: uid(), title: i.title, category: i.category || null, now }));
    d.lists.push(list);
    return list.id;
  });
}

// «Сохранить как шаблон»: a list becomes a template, without checkmarks.
export function saveListAsTemplate(store, listId, name = '') {
  return store.update('act.template', (d, { now, uid }) => {
    const src = findAlive(d.lists, listId, 'what.list');
    const tpl = newTemplate({ id: uid(), name: String(name || '').trim() || src.name, now });
    tpl.categories = [...(src.categories || [])];
    tpl.items = src.items.filter(i => !i.deletedAt).map(i => newItem({ id: uid(), title: i.title, category: i.category || null, now }));
    d.templates.push(tpl);
    return tpl.id;
  });
}

// Built-ins that were deleted or replaced are added back as NEW templates; nothing existing is touched.
export function restoreBuiltinTemplates(store, bases) {
  return store.update('act.template', (d, { now, uid }) => {
    for (const base of bases) {
      const b = builtinTemplate(base, getLang());
      const tpl = newTemplate({ id: uid(), name: b.name, now });
      tpl.categories = [...b.categories];
      tpl.items = b.items.map(i => newItem({ id: uid(), title: i.title, category: i.category, now }));
      d.templates.push(tpl);
    }
    return bases.length;
  });
}

// ---------- Evening preview settings ----------

export function setEveningSettings(store, { enabled, time }) {
  return store.update('act.settings', d => {
    const tm = String(time || '').slice(0, 5);
    if (!isTime(tm)) throw appError('err.badTime');
    d.settings.eveningPreview = { ...d.settings.eveningPreview, enabled: !!enabled, time: tm };
  });
}

// ---------- Calendar: add to the chosen date ----------

export function addOnDate(store, { as, title, date, time }) {
  const text = String(title || '').trim();
  if (!text) return store.update('act.addTasks', () => { throw appError('err.needTitle'); });
  if (!isDateKey(date)) return store.update('act.addTasks', () => { throw appError('err.needDate'); });
  if (as === 'event') {
    if (!isTime(String(time || ''))) return store.update('act.addEvent', () => { throw appError('err.needDateTime'); });
    return addEvent(store, { title: text, start: `${date}T${time}` });
  }
  return addTaskSpecs(store, [{ title: text, kind: 'day', date, time: time || null, deadline: null }]);
}

export const addDaysKey = addDays;
