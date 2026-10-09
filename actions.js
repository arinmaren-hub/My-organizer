// Everything the user can change, as named operations on the store.
// Each one edits a draft copy inside store.update(); throwing an Error cancels it
// and shows the message. Screens call these; they never edit data themselves.

import { newTask, newEvent, newProject, newList, newItem, PLAN_KINDS } from './schema.js';
import { isDateKey, isDateTime, weekKey } from './dates.js';

function findAlive(arr, id, what) {
  const r = arr.find(x => x.id === id && !x.deletedAt);
  if (!r) throw new Error(`${what} не найден(а)`);
  return r;
}

function planFor(kind, dateInput, today) {
  if (!PLAN_KINDS.includes(kind)) throw new Error('неизвестный вариант даты');
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
  return store.update('Добавить задачи', (d, { now, today, uid }) => {
    const plan = planFor(kind, dateInput, today);
    for (const title of lines) d.tasks.push(newTask({ id: uid(), title, plan, now }));
    return lines.length;
  });
}

export function setTaskDone(store, id, done) {
  return store.update('Отметить задачу', (d, { now }) => {
    const t = findAlive(d.tasks, id, 'Задача');
    t.done = !!done;
    t.completedAt = t.done ? now : null;
    t.updatedAt = now;
  });
}

// Reschedule. Changes ONLY the plan; the deadline is never touched (decision 6).
export function moveTask(store, id, kind, dateInput = '') {
  return store.update('Перенести задачу', (d, { now, today }) => {
    const t = findAlive(d.tasks, id, 'Задача');
    t.plan = planFor(kind, dateInput, today);
    if (t.plan.kind !== 'day') { t.time = null; t.reminder = null; } // a time only makes sense on a day
    t.updatedAt = now;
  });
}

// ---------- Soft delete / restore (any top-level collection) ----------

const LABELS = { tasks: 'Задача', events: 'Событие', projects: 'Проект', lists: 'Список' };

export function softDelete(store, collection, id) {
  return store.update('Удалить', (d, { now }) => {
    if (!LABELS[collection]) throw new Error('неизвестный тип записи');
    const r = findAlive(d[collection], id, LABELS[collection]);
    r.deletedAt = now;
    r.updatedAt = now;
  });
}

export function restoreDeleted(store, collection, id) {
  return store.update('Восстановить', (d, { now }) => {
    if (!LABELS[collection]) throw new Error('неизвестный тип записи');
    const r = d[collection].find(x => x.id === id && x.deletedAt);
    if (!r) throw new Error('удалённая запись не найдена');
    r.deletedAt = null;
    r.updatedAt = now;
  });
}

// ---------- Events ----------

export function addEvent(store, { title, start }) {
  const s = String(start || '').slice(0, 16);
  return store.update('Добавить событие', (d, { now, uid }) => {
    if (!String(title || '').trim()) throw new Error('нужно название');
    if (!isDateTime(s)) throw new Error('нужны дата и время');
    d.events.push(newEvent({ id: uid(), title: String(title).trim(), start: s, now }));
  });
}

// ---------- Projects ----------

export function addProject(store, { name, total, unit }) {
  return store.update('Создать проект', (d, { now, uid }) => {
    if (!String(name || '').trim()) throw new Error('нужно название');
    const n = total === '' || total == null ? 0 : Number(total);
    if (!Number.isFinite(n) || n < 0) throw new Error('цель должна быть числом от 0');
    d.projects.push(newProject({ id: uid(), name: String(name).trim(), total: n, unit: String(unit || '').trim() || 'ед.', now }));
  });
}

export function addMilestone(store, projectId, title) {
  return store.update('Добавить этап', (d, { now, uid }) => {
    if (!String(title || '').trim()) throw new Error('нужно название этапа');
    const p = findAlive(d.projects, projectId, 'Проект');
    p.milestones.push(newItem({ id: uid(), title: String(title).trim(), now }));
    p.updatedAt = now;
  });
}

export function setMilestoneDone(store, projectId, id, done) {
  return store.update('Отметить этап', (d, { now }) => {
    const p = findAlive(d.projects, projectId, 'Проект');
    const m = findAlive(p.milestones, id, 'Этап');
    m.done = !!done;
    m.updatedAt = now;
    p.updatedAt = now;
  });
}

export function stepQuantity(store, projectId, delta) {
  return store.update('Изменить прогресс', (d, { now }) => {
    const p = findAlive(d.projects, projectId, 'Проект');
    p.quantity.current = Math.max(0, p.quantity.current + Number(delta));
    p.updatedAt = now;
  });
}

export function setQuantity(store, projectId, value) {
  return store.update('Изменить прогресс', (d, { now }) => {
    const p = findAlive(d.projects, projectId, 'Проект');
    const n = Number(value);
    p.quantity.current = Number.isFinite(n) ? Math.max(0, n) : 0;
    p.updatedAt = now;
  });
}

// ---------- Lists ----------

export function addList(store, name) {
  return store.update('Создать список', (d, { now, uid }) => {
    if (!String(name || '').trim()) throw new Error('нужно название');
    d.lists.push(newList({ id: uid(), name: String(name).trim(), now }));
  });
}

export function addListItem(store, listId, title) {
  return store.update('Добавить пункт', (d, { now, uid }) => {
    if (!String(title || '').trim()) throw new Error('нужно название пункта');
    const l = findAlive(d.lists, listId, 'Список');
    l.items.push(newItem({ id: uid(), title: String(title).trim(), now }));
    l.updatedAt = now;
  });
}

export function setListItemDone(store, listId, id, done) {
  return store.update('Отметить пункт', (d, { now }) => {
    const l = findAlive(d.lists, listId, 'Список');
    const i = findAlive(l.items, id, 'Пункт');
    i.done = !!done;
    i.updatedAt = now;
    l.updatedAt = now;
  });
}
