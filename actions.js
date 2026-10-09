// Everything the user can change, as named operations on the store.
// Each one edits a draft copy inside store.update(); throwing an Error cancels it
// and shows the message. Screens call these; they never edit data themselves.

import { newTask, newEvent, newProject, newList, newItem, PLAN_KINDS } from './schema.js';
import { isDateKey, isDateTime, isTime, weekKey } from './dates.js';
import { suggestCutoff } from './planday.js';
import { appError, t } from './i18n.js';

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

export function setTaskDone(store, id, done) {
  return store.update('act.setTaskDone', (d, { now }) => {
    const t = findAlive(d.tasks, id, 'what.task');
    t.done = !!done;
    t.completedAt = t.done ? now : null;
    t.updatedAt = now;
  });
}

// Reschedule. Changes ONLY the plan; the deadline is never touched (decision 6).
export function moveTask(store, id, kind, dateInput = '') {
  return store.update('act.moveTask', (d, { now, today }) => {
    const t = findAlive(d.tasks, id, 'what.task');
    t.plan = planFor(kind, dateInput, today);
    if (t.plan.kind !== 'day') { t.time = null; t.reminder = null; } // a time only makes sense on a day
    t.updatedAt = now;
  });
}

// ---------- Soft delete / restore (any top-level collection) ----------

const LABELS = { tasks: 'what.task', events: 'what.event', projects: 'what.project', lists: 'what.list' };

export function softDelete(store, collection, id) {
  return store.update('act.delete', (d, { now }) => {
    if (!LABELS[collection]) throw appError('err.unknownCollection');
    const r = findAlive(d[collection], id, LABELS[collection]);
    r.deletedAt = now;
    r.updatedAt = now;
  });
}

export function restoreDeleted(store, collection, id) {
  return store.update('act.restore', (d, { now }) => {
    if (!LABELS[collection]) throw appError('err.unknownCollection');
    const r = d[collection].find(x => x.id === id && x.deletedAt);
    if (!r) throw appError('err.deletedNotFound');
    r.deletedAt = null;
    r.updatedAt = now;
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
