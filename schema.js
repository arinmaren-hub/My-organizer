// Data format: version number, record shapes, validation, and upgrades from
// older formats. Pure functions only (no storage, no DOM), so it is easy to test.
//
// The whole app state is ONE document:
// {
//   schemaVersion: 2, createdAt, updatedAt,
//   tasks: [Task], events: [Event], projects: [Project], lists: [List],
//   settings: { eveningPreview: { enabled, time } },
//   quarantine: [ { at, source, collection, parentId, reason, record } ]
// }
// See DECISIONS.md for the meaning of every field.

import { isDateKey, isTime, isDateTime, weekKey } from './dates.js';
import { isPlainObject } from './util.js';

export const SCHEMA_VERSION = 2;
export const COLLECTIONS = ['tasks', 'events', 'projects', 'lists'];
export const PLAN_KINDS = ['day', 'week', 'none'];

const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
export const isId = v => typeof v === 'string' && ID_RE.test(v);
export const isIso = v => typeof v === 'string' && v.length >= 10 && !Number.isNaN(Date.parse(v));
const isStr = v => typeof v === 'string';
const isBool = v => typeof v === 'boolean';
const isNonNegNumber = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isNonNegInt = v => Number.isInteger(v) && v >= 0;

export function defaultSettings() {
  return { eveningPreview: { enabled: false, time: '21:30' } };
}

export function emptyDoc(now) {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    tasks: [], events: [], projects: [], lists: [],
    settings: defaultSettings(),
    quarantine: []
  };
}

// ---------- Record factories (used by the app when creating new things) ----------

export function newTask({ id, title, plan, now }) {
  return {
    id, title,
    plan: { kind: plan.kind, date: plan.kind === 'none' ? null : plan.date },
    time: null,         // optional 'HH:MM' (only for day tasks)
    reminder: null,     // optional { minutesBefore } relative to time
    deadline: null,     // optional 'YYYY-MM-DD'; never changed by rescheduling
    projectId: null,    // optional link to a project
    done: false, completedAt: null,
    createdAt: now, updatedAt: now, deletedAt: null
  };
}

export function newEvent({ id, title, start, end = null, now }) {
  return {
    id, title, start, end, allDay: false,
    repeat: null,       // reserved: { freq: 'weekly', days: [1..7], until, skip: [] }
    alerts: [],         // reserved: [{ minutesBefore }]
    createdAt: now, updatedAt: now, deletedAt: null
  };
}

export function newProject({ id, name, total, unit, now }) {
  return {
    id, name, milestones: [],
    quantity: { current: 0, total, unit },
    createdAt: now, updatedAt: now, deletedAt: null
  };
}

export function newList({ id, name, now }) {
  return { id, name, items: [], createdAt: now, updatedAt: now, deletedAt: null };
}

export function newItem({ id, title, now }) {
  return { id, title, done: false, createdAt: now, updatedAt: now, deletedAt: null };
}

// ---------- Validation ----------
// Each checker returns { value } (a cleaned copy with optional fields filled in)
// or { error } with a short human-readable reason. Unknown extra fields are kept.

const fail = error => ({ error });

function stamps(o, now) {
  if (o.createdAt === undefined) o.createdAt = now;
  else if (!isIso(o.createdAt)) return 'неверная дата создания';
  if (o.updatedAt === undefined) o.updatedAt = o.createdAt;
  else if (!isIso(o.updatedAt)) return 'неверная дата изменения';
  if (o.deletedAt === undefined) o.deletedAt = null;
  else if (o.deletedAt !== null && !isIso(o.deletedAt)) return 'неверная дата удаления';
  return null;
}

function checkTask(r, now) {
  if (!isPlainObject(r)) return fail('запись не является объектом');
  const t = { ...r };
  if (!isId(t.id)) return fail('неверный id');
  if (!isStr(t.title)) return fail('нет названия');
  if (!isPlainObject(t.plan) || !PLAN_KINDS.includes(t.plan.kind)) return fail('неверный план (день/неделя/без даты)');
  t.plan = { ...t.plan };
  if (t.plan.kind === 'none') t.plan.date = null;
  else if (!isDateKey(t.plan.date)) return fail('неверная дата плана');
  else if (t.plan.kind === 'week' && weekKey(t.plan.date) !== t.plan.date) return fail('неделя должна начинаться с понедельника');
  if (!isBool(t.done)) return fail('неверное поле «готово»');
  t.time = t.time ?? null;
  if (t.time !== null && (!isTime(t.time) || t.plan.kind !== 'day')) return fail('неверное время задачи');
  t.reminder = t.reminder ?? null;
  if (t.reminder !== null && (!isPlainObject(t.reminder) || !isNonNegInt(t.reminder.minutesBefore) || t.time === null)) return fail('неверное напоминание');
  t.deadline = t.deadline ?? null;
  if (t.deadline !== null && !isDateKey(t.deadline)) return fail('неверный дедлайн');
  t.projectId = t.projectId ?? null;
  if (t.projectId !== null && !isId(t.projectId)) return fail('неверная ссылка на проект');
  t.completedAt = t.done ? (t.completedAt ?? null) : null;
  if (t.completedAt !== null && !isIso(t.completedAt)) return fail('неверная дата выполнения');
  const s = stamps(t, now);
  return s ? fail(s) : { value: t };
}

function checkRepeat(rep) {
  if (rep === null) return true;
  return isPlainObject(rep) && rep.freq === 'weekly' &&
    Array.isArray(rep.days) && rep.days.length > 0 && rep.days.every(d => Number.isInteger(d) && d >= 1 && d <= 7) &&
    (rep.until === undefined || rep.until === null || isDateKey(rep.until)) &&
    (rep.skip === undefined || (Array.isArray(rep.skip) && rep.skip.every(isDateKey)));
}

function checkEvent(r, now) {
  if (!isPlainObject(r)) return fail('запись не является объектом');
  const e = { ...r };
  if (!isId(e.id)) return fail('неверный id');
  if (!isStr(e.title)) return fail('нет названия');
  if (!isDateTime(e.start)) return fail('нет или неверное время начала');
  e.end = e.end ?? null;
  if (e.end !== null && (!isDateTime(e.end) || e.end < e.start)) return fail('неверное время окончания');
  e.allDay = e.allDay ?? false;
  if (!isBool(e.allDay)) return fail('неверное поле «весь день»');
  e.repeat = e.repeat ?? null;
  if (!checkRepeat(e.repeat)) return fail('неверное правило повтора');
  e.alerts = e.alerts ?? [];
  if (!Array.isArray(e.alerts) || !e.alerts.every(a => isPlainObject(a) && isNonNegInt(a.minutesBefore))) return fail('неверные оповещения');
  const s = stamps(e, now);
  return s ? fail(s) : { value: e };
}

// Nested items (milestones, list items). Bad ones are quarantined on their own,
// so one broken item never takes its whole project or list with it.
function checkItem(r, now) {
  if (!isPlainObject(r)) return fail('пункт не является объектом');
  const i = { ...r };
  if (!isId(i.id)) return fail('неверный id пункта');
  if (!isStr(i.title)) return fail('нет названия пункта');
  if (!isBool(i.done)) return fail('неверное поле «готово»');
  const s = stamps(i, now);
  return s ? fail(s) : { value: i };
}

function checkNested(list, field, now) {
  const kept = [], bad = [], seen = new Set();
  for (const item of list) {
    const res = checkItem(item, now);
    if (res.error) bad.push({ field, record: item, reason: res.error });
    else if (seen.has(res.value.id)) bad.push({ field, record: item, reason: 'повторяющийся id пункта' });
    else { seen.add(res.value.id); kept.push(res.value); }
  }
  return { kept, bad };
}

function checkProject(r, now) {
  if (!isPlainObject(r)) return fail('запись не является объектом');
  const p = { ...r };
  if (!isId(p.id)) return fail('неверный id');
  if (!isStr(p.name)) return fail('нет названия');
  if (!Array.isArray(p.milestones)) return fail('этапы не являются списком');
  const q = p.quantity;
  if (!isPlainObject(q) || !isNonNegNumber(q.current) || !isNonNegNumber(q.total) || !isStr(q.unit)) return fail('неверный счётчик прогресса');
  p.quantity = { ...q };
  const s = stamps(p, now);
  if (s) return fail(s);
  const { kept, bad } = checkNested(p.milestones, 'milestones', now);
  p.milestones = kept;
  return { value: p, nested: bad };
}

function checkList(r, now) {
  if (!isPlainObject(r)) return fail('запись не является объектом');
  const l = { ...r };
  if (!isId(l.id)) return fail('неверный id');
  if (!isStr(l.name)) return fail('нет названия');
  if (!Array.isArray(l.items)) return fail('пункты не являются списком');
  const s = stamps(l, now);
  if (s) return fail(s);
  const { kept, bad } = checkNested(l.items, 'items', now);
  l.items = kept;
  return { value: l, nested: bad };
}

const CHECK = { tasks: checkTask, events: checkEvent, projects: checkProject, lists: checkList };

function normalizeSettings(input) {
  const def = defaultSettings();
  if (!isPlainObject(input)) return def;
  const out = { ...input };
  const ep = input.eveningPreview;
  out.eveningPreview = (isPlainObject(ep) && isBool(ep.enabled) && isTime(ep.time)) ? { ...ep } : def.eveningPreview;
  return out;
}

// ---------- Upgrade from the first prototype (no schemaVersion = version 1) ----------
// Prototype shapes:
//   task   { id, name, scope: 'day'|'week'|'none', date, done, created }
//   event  { id, name, at }
//   project{ id, name, steps: [{ id, name, done }], current, total, unit }
//   list   { id, name, items: [{ id, name, done }] }

const v1Created = (created, now) => (isDateKey(created) ? `${created}T12:00:00.000Z` : now);

const CONVERT_V1 = {
  tasks(r, now) {
    if (!isPlainObject(r)) return r;
    const kind = PLAN_KINDS.includes(r.scope) ? r.scope : 'none';
    let date = null;
    if (kind === 'day') date = r.date;
    if (kind === 'week') date = isDateKey(r.date) ? weekKey(r.date) : r.date;
    const createdAt = v1Created(r.created, now);
    return {
      id: r.id, title: r.name, plan: { kind, date },
      time: null, reminder: null, deadline: null, projectId: null,
      done: !!r.done, completedAt: r.done ? now : null,
      createdAt, updatedAt: now, deletedAt: null
    };
  },
  events(r, now) {
    if (!isPlainObject(r)) return r;
    const start = typeof r.at === 'string' ? r.at.slice(0, 16) : r.at;
    return { id: r.id, title: r.name, start, end: null, allDay: false, repeat: null, alerts: [], createdAt: now, updatedAt: now, deletedAt: null };
  },
  projects(r, now) {
    if (!isPlainObject(r)) return r;
    const milestones = Array.isArray(r.steps)
      ? r.steps.map(s => (isPlainObject(s) ? { id: s.id, title: s.name, done: !!s.done, createdAt: now, updatedAt: now, deletedAt: null } : s))
      : r.steps;
    return {
      id: r.id, name: r.name, milestones,
      quantity: { current: r.current ?? 0, total: r.total ?? 0, unit: r.unit ?? 'ед.' },
      createdAt: now, updatedAt: now, deletedAt: null
    };
  },
  lists(r, now) {
    if (!isPlainObject(r)) return r;
    const items = Array.isArray(r.items)
      ? r.items.map(i => (isPlainObject(i) ? { id: i.id, title: i.name, done: !!i.done, createdAt: now, updatedAt: now, deletedAt: null } : i))
      : r.items;
    return { id: r.id, name: r.name, items, createdAt: now, updatedAt: now, deletedAt: null };
  }
};

// ---------- The one entry point ----------
// Takes anything parsed from JSON and returns either
//   { fatal: 'reason' }                       – cannot be used at all
//   { fatal: 'newer', newerVersion }          – written by a newer app version
//   { doc, quarantined, migratedFrom }        – usable document
// Records that fail validation are NOT dropped: their original form goes into
// doc.quarantine with the reason, and everything else loads normally.
export function normalizeDoc(input, { now, source = 'load' }) {
  if (!isPlainObject(input)) return { fatal: 'данные не являются объектом' };
  let version = input.schemaVersion;
  if (version === undefined) {
    if (!COLLECTIONS.some(k => Array.isArray(input[k]))) return { fatal: 'не похоже на данные органайзера' };
    version = 1;
  }
  if (!Number.isInteger(version) || version < 1) return { fatal: 'неизвестная версия данных' };
  if (version > SCHEMA_VERSION) return { fatal: 'newer', newerVersion: version };

  const doc = emptyDoc(now);
  if (isIso(input.createdAt)) doc.createdAt = input.createdAt;
  if (isIso(input.updatedAt)) doc.updatedAt = input.updatedAt;

  const quarantined = [];
  const put = (collection, record, reason, parentId = null) =>
    quarantined.push({ at: now, source, collection, parentId, reason, record });

  for (const key of COLLECTIONS) {
    const list = input[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) { put(key, list, 'коллекция не является списком'); continue; }
    const seen = new Set();
    for (const original of list) {
      let rec = original;
      if (version === 1) {
        try { rec = CONVERT_V1[key](original, now); } catch { rec = null; }
      }
      const res = CHECK[key](rec, now);
      if (res.error) { put(key, original, res.error); continue; }
      if (seen.has(res.value.id)) { put(key, original, 'повторяющийся id'); continue; }
      seen.add(res.value.id);
      for (const n of res.nested || []) put(`${key}.${n.field}`, n.record, n.reason, res.value.id);
      doc[key].push(res.value);
    }
  }

  doc.settings = normalizeSettings(input.settings);

  if (Array.isArray(input.quarantine)) {
    doc.quarantine = input.quarantine.map(q => (isPlainObject(q) ? q : { at: now, source, collection: 'quarantine', parentId: null, reason: 'неверная запись карантина', record: q }));
  } else if (input.quarantine !== undefined) {
    doc.quarantine = [{ at: now, source, collection: 'quarantine', parentId: null, reason: 'неверный формат карантина', record: input.quarantine }];
  }
  doc.quarantine.push(...quarantined);

  return { doc, quarantined, migratedFrom: version < SCHEMA_VERSION ? version : null };
}

// Counts of records that are not deleted, for previews and the Data tab.
export function countActive(doc) {
  const alive = r => !r.deletedAt;
  return {
    tasks: doc.tasks.filter(alive).length,
    events: doc.events.filter(alive).length,
    projects: doc.projects.filter(alive).length,
    lists: doc.lists.filter(alive).length
  };
}

export function hasContent(doc) {
  return !!doc && COLLECTIONS.some(k => doc[k].length > 0);
}
