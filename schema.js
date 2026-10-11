// Data format: version number, record shapes, validation, and upgrades from
// older formats. Pure functions only (no storage, no DOM), so it is easy to test.
//
// The whole app state is ONE document:
// {
//   schemaVersion: 4, dataId, createdAt, updatedAt,
//   tasks: [Task], events: [Event], projects: [Project], lists: [List],
//   series: [Series], waiting: [Waiting], templates: [Template],
//   settings: { eveningPreview: { enabled, time }, day: { wake, bed, cutoff, setupDone } },
//   quarantine: [ { at, source, collection, parentId, reason, record } ]
// }
// See DECISIONS.md for the meaning of every field.
// dataId (since 0.3.0): a random id of THIS organizer, made on first start. It is
// not personal data; it only lets an import notice that a backup comes from a
// different organizer (another device or another person).

import { isDateKey, isTime, isDateTime, weekKey } from './dates.js';
import { isPlainObject } from './util.js';

// Version history: 1 = prototype (no number), 2 = 0.2.x, 3 = 0.3.0 (adds settings.day),
// 4 = 0.4.0 (adds series, waiting, templates; task review/series fields; list categories),
// 5 = 0.6.0 (recurring EVENTS are series with kind 'event'; series end date, monthly weekday rule, skip list;
//     optional `keep` («Хранить всегда») on tasks, events and lists; events may carry seriesId/occurrenceDate).
// 5 is a version bump only: nothing is converted. It exists so that an older app can never read 0.6.0 data
// (it would mistake an event series for a task series) — it goes read-only instead.
// Every step only ADDS fields and collections with defaults, so upgrading never removes data.
export const SCHEMA_VERSION = 5;
export const STOCK_STATES = ['have', 'low', 'out'];
export const COLLECTIONS = ['tasks', 'events', 'projects', 'lists', 'series', 'waiting', 'templates'];
export const PLAN_KINDS = ['day', 'week', 'none'];
export const REVIEW_CHOICES = ['moved', 'kept', 'done'];
export const SERIES_FREQS = ['daily', 'weekly', 'monthly', 'yearly'];
export const SERIES_MODES = ['completion', 'fixed'];
export const SERIES_MONTHLY_RULES = ['nth', 'last']; // monthly «by weekday»: the n-th such weekday, or the last one (default = same day number)
export const BUILTIN_TEMPLATES = ['supermarket', 'suitcase'];

const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
export const isId = v => typeof v === 'string' && ID_RE.test(v);
export const isIso = v => typeof v === 'string' && v.length >= 10 && !Number.isNaN(Date.parse(v));
const isStr = v => typeof v === 'string';
const isBool = v => typeof v === 'boolean';
const isNonNegNumber = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isNonNegInt = v => Number.isInteger(v) && v >= 0;

// settings.day: the personal planning day (DECISIONS.md, B4). wake and bed are
// optional 'HH:MM'; cutoff is when the planning day ends; setupDone = the first-
// launch questions were answered or skipped. Defaults give the pre-0.3.0 behaviour.
export function defaultDay() {
  return { wake: null, bed: null, cutoff: '00:00', setupDone: false };
}

export function defaultSettings() {
  return { eveningPreview: { enabled: false, time: '21:30' }, day: defaultDay() };
}

export function emptyDoc(now) {
  return {
    schemaVersion: SCHEMA_VERSION,
    dataId: null,
    createdAt: now,
    updatedAt: now,
    tasks: [], events: [], projects: [], lists: [], series: [], waiting: [], templates: [],
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
    review: null,       // { day, choice, part: 'am'|'pm' }: the planning day it was reviewed for, and what was decided
    seriesId: null,     // set on occurrences of a recurring task
    occurrenceDate: null, // the date the rule produced (with seriesId: unique)
    skipped: false,     // an occurrence the user explicitly skipped
    doneDay: null,      // planning day it was completed (recurrence counts from it)
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
  return { id, name, items: [], categories: [], createdAt: now, updatedAt: now, deletedAt: null };
}

export function newTemplate({ id, name, base = null, now }) {
  return { id, name, base, items: [], categories: [], createdAt: now, updatedAt: now, deletedAt: null };
}

export function newWaiting({ id, title, from = null, followUp = null, now }) {
  return {
    id, title, from, followUp, note: '',
    resolved: false, resolvedAt: null,
    taskId: null,       // set when it was turned into a task
    createdAt: now, updatedAt: now, deletedAt: null
  };
}

// freq daily|weekly|monthly|yearly, every `interval` units; mode 'completion' = counted from the day
// the previous occurrence was completed, 'fixed' = on a fixed calendar rhythm from startDate.
export function newSeries({ id, title, freq, interval = 1, mode = 'completion', startDate, time = null, now }) {
  return {
    id, title, freq, interval, mode, startDate, time,
    paused: false,
    generatedThrough: null, // fixed mode: occurrences up to this date have been created (never again)
    projectId: null,
    createdAt: now, updatedAt: now, deletedAt: null
  };
}

export function newItem({ id, title, category = null, now }) {
  return { id, title, done: false, category, createdAt: now, updatedAt: now, deletedAt: null };
}

// ---------- Validation ----------
// Each checker returns { value } (a cleaned copy with optional fields filled in)
// or { error } with a reason key (translated by i18n.js). Unknown extra fields are kept.

const fail = error => ({ error });

function stamps(o, now) {
  if (o.createdAt === undefined) o.createdAt = now;
  else if (!isIso(o.createdAt)) return 'reason.badCreatedAt';
  if (o.updatedAt === undefined) o.updatedAt = o.createdAt;
  else if (!isIso(o.updatedAt)) return 'reason.badUpdatedAt';
  if (o.deletedAt === undefined) o.deletedAt = null;
  else if (o.deletedAt !== null && !isIso(o.deletedAt)) return 'reason.badDeletedAt';
  return null;
}

function checkTask(r, now) {
  if (!isPlainObject(r)) return fail('reason.notObject');
  const t = { ...r };
  if (!isId(t.id)) return fail('reason.badId');
  if (!isStr(t.title)) return fail('reason.noTitle');
  if (!isPlainObject(t.plan) || !PLAN_KINDS.includes(t.plan.kind)) return fail('reason.badPlan');
  t.plan = { ...t.plan };
  if (t.plan.kind === 'none') t.plan.date = null;
  else if (!isDateKey(t.plan.date)) return fail('reason.badPlanDate');
  else if (t.plan.kind === 'week' && weekKey(t.plan.date) !== t.plan.date) return fail('reason.weekNotMonday');
  if (!isBool(t.done)) return fail('reason.badDone');
  t.time = t.time ?? null;
  if (t.time !== null && (!isTime(t.time) || t.plan.kind !== 'day')) return fail('reason.badTaskTime');
  t.reminder = t.reminder ?? null;
  if (t.reminder !== null && (!isPlainObject(t.reminder) || !isNonNegInt(t.reminder.minutesBefore) || t.time === null)) return fail('reason.badReminder');
  t.deadline = t.deadline ?? null;
  if (t.deadline !== null && !isDateKey(t.deadline)) return fail('reason.badDeadline');
  t.projectId = t.projectId ?? null;
  if (t.projectId !== null && !isId(t.projectId)) return fail('reason.badProjectLink');
  t.completedAt = t.done ? (t.completedAt ?? null) : null;
  if (t.completedAt !== null && !isIso(t.completedAt)) return fail('reason.badCompletedAt');
  t.review = t.review ?? null;
  if (t.review !== null && (!isPlainObject(t.review) || !isDateKey(t.review.day) || !REVIEW_CHOICES.includes(t.review.choice))) return fail('reason.badReview');
  if (t.review !== null) t.review = { day: t.review.day, choice: t.review.choice, part: t.review.part === 'pm' ? 'pm' : 'am' };
  t.seriesId = t.seriesId ?? null;
  if (t.seriesId !== null && !isId(t.seriesId)) return fail('reason.badSeriesLink');
  t.occurrenceDate = t.occurrenceDate ?? null;
  if (t.occurrenceDate !== null && !isDateKey(t.occurrenceDate)) return fail('reason.badOccurrence');
  t.skipped = t.skipped ?? false;
  if (!isBool(t.skipped)) return fail('reason.badSkipped');
  t.doneDay = t.done ? (t.doneDay ?? null) : null;
  if (t.doneDay !== null && !isDateKey(t.doneDay)) return fail('reason.badDoneDay');
  // `indent` (0.5.0): the task is shown shifted one step to the right. Optional; only `true` is kept.
  if (t.indent !== true) delete t.indent;
  if (t.keep !== true) delete t.keep; // 0.6.0: «Хранить всегда» — never offered for cleanup
  // `convertedFrom` / `convertedTo` (0.5.0): ids of the event this task was made from / turned into
  // (task ↔ event conversion). Optional; anything that is not an id is dropped. Used only to keep
  // a restored original from duplicating its converted copy.
  for (const k of ['convertedFrom', 'convertedTo']) if (t[k] !== undefined && !isId(t[k])) delete t[k];
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
  if (!isPlainObject(r)) return fail('reason.notObject');
  const e = { ...r };
  if (!isId(e.id)) return fail('reason.badId');
  if (!isStr(e.title)) return fail('reason.noTitle');
  if (!isDateTime(e.start)) return fail('reason.badStart');
  e.end = e.end ?? null;
  if (e.end !== null && (!isDateTime(e.end) || e.end < e.start)) return fail('reason.badEnd');
  e.allDay = e.allDay ?? false;
  if (!isBool(e.allDay)) return fail('reason.badAllDay');
  e.repeat = e.repeat ?? null;
  if (!checkRepeat(e.repeat)) return fail('reason.badRepeat');
  e.alerts = e.alerts ?? [];
  if (!Array.isArray(e.alerts) || !e.alerts.every(a => isPlainObject(a) && isNonNegInt(a.minutesBefore))) return fail('reason.badAlerts');
  // `prep` (0.5.0): the event's own preparation checklist. Optional; absent for older events.
  let nested;
  if (e.prep !== undefined) {
    if (!Array.isArray(e.prep)) return fail('reason.itemsNotList');
    const res = checkNested(e.prep, 'prep', now);
    e.prep = res.kept;
    nested = res.bad;
  }
  for (const k of ['convertedFrom', 'convertedTo']) if (e[k] !== undefined && !isId(e[k])) delete e[k]; // see checkTask
  // 0.6.0: an occurrence of a recurring event carries its series and the date the rule produced; both or neither.
  if (e.seriesId !== undefined || e.occurrenceDate !== undefined) {
    if (!isId(e.seriesId) || !isDateKey(e.occurrenceDate)) { delete e.seriesId; delete e.occurrenceDate; }
  }
  if (e.keep !== true) delete e.keep;
  const s = stamps(e, now);
  return s ? fail(s) : { value: e, nested };
}

// Nested items (milestones, list items). Bad ones are quarantined on their own,
// so one broken item never takes its whole project or list with it.
function checkItem(r, now) {
  if (!isPlainObject(r)) return fail('reason.itemNotObject');
  const i = { ...r };
  if (!isId(i.id)) return fail('reason.badItemId');
  if (!isStr(i.title)) return fail('reason.noItemTitle');
  if (!isBool(i.done)) return fail('reason.badDone');
  if (i.category !== undefined && i.category !== null && !isStr(i.category)) return fail('reason.badCategory');
  // `stock` (0.5.0, items of the «Дом» list): 'have' | 'low' | 'out'. Anything else is dropped (=have).
  if (i.stock !== undefined && !STOCK_STATES.includes(i.stock)) delete i.stock;
  const s = stamps(i, now);
  return s ? fail(s) : { value: i };
}

function checkNested(list, field, now) {
  const kept = [], bad = [], seen = new Set();
  for (const item of list) {
    const res = checkItem(item, now);
    if (res.error) bad.push({ field, record: item, reason: res.error });
    else if (seen.has(res.value.id)) bad.push({ field, record: item, reason: 'reason.dupItemId' });
    else { seen.add(res.value.id); kept.push(res.value); }
  }
  return { kept, bad };
}

function checkProject(r, now) {
  if (!isPlainObject(r)) return fail('reason.notObject');
  const p = { ...r };
  if (!isId(p.id)) return fail('reason.badId');
  if (!isStr(p.name)) return fail('reason.noTitle');
  if (!Array.isArray(p.milestones)) return fail('reason.milestonesNotList');
  const q = p.quantity;
  if (!isPlainObject(q) || !isNonNegNumber(q.current) || !isNonNegNumber(q.total) || !isStr(q.unit)) return fail('reason.badQuantity');
  p.quantity = { ...q };
  const s = stamps(p, now);
  if (s) return fail(s);
  const { kept, bad } = checkNested(p.milestones, 'milestones', now);
  p.milestones = kept;
  return { value: p, nested: bad };
}

function checkList(r, now) {
  if (!isPlainObject(r)) return fail('reason.notObject');
  const l = { ...r };
  if (!isId(l.id)) return fail('reason.badId');
  if (!isStr(l.name)) return fail('reason.noTitle');
  if (!Array.isArray(l.items)) return fail('reason.itemsNotList');
  // `categories` (names of categories that may hold no items yet) is optional: lists made before 0.4.0 have none.
  if (l.categories !== undefined && (!Array.isArray(l.categories) || !l.categories.every(isStr))) return fail('reason.badCategories');
  // `kind: 'home'` (0.5.0) marks the permanent household inventory; any other value is dropped.
  if (l.kind !== undefined && l.kind !== 'home') delete l.kind;
  if (l.keep !== true) delete l.keep; // 0.6.0
  const s = stamps(l, now);
  if (s) return fail(s);
  const { kept, bad } = checkNested(l.items, 'items', now);
  l.items = kept;
  return { value: l, nested: bad };
}

// A template is a list without checkmarks. `base` names the built-in template it replaces
// (the built-ins themselves live in the code, so a fresh organizer stores nothing for them).
function checkTemplate(r, now) {
  const res = checkList(r, now);
  if (res.error) return res;
  const tpl = res.value;
  tpl.base = tpl.base ?? null;
  if (tpl.base !== null && !BUILTIN_TEMPLATES.includes(tpl.base)) return fail('reason.badTemplateBase');
  return res;
}

function checkWaiting(r, now) {
  if (!isPlainObject(r)) return fail('reason.notObject');
  const w = { ...r };
  if (!isId(w.id)) return fail('reason.badId');
  if (!isStr(w.title)) return fail('reason.noTitle');
  w.from = w.from ?? null;
  if (w.from !== null && !isStr(w.from)) return fail('reason.badFrom');
  w.followUp = w.followUp ?? null;
  if (w.followUp !== null && !isDateKey(w.followUp)) return fail('reason.badFollowUp');
  w.note = w.note ?? '';
  if (!isStr(w.note)) return fail('reason.badNote');
  w.resolved = w.resolved ?? false;
  if (!isBool(w.resolved)) return fail('reason.badResolved');
  w.resolvedAt = w.resolved ? (w.resolvedAt ?? null) : null;
  if (w.resolvedAt !== null && !isIso(w.resolvedAt)) return fail('reason.badCompletedAt');
  w.taskId = w.taskId ?? null;
  if (w.taskId !== null && !isId(w.taskId)) return fail('reason.badProjectLink');
  const s = stamps(w, now);
  return s ? fail(s) : { value: w };
}

function checkSeries(r, now) {
  if (!isPlainObject(r)) return fail('reason.notObject');
  const x = { ...r };
  if (!isId(x.id)) return fail('reason.badId');
  if (!isStr(x.title)) return fail('reason.noTitle');
  if (!SERIES_FREQS.includes(x.freq)) return fail('reason.badFreq');
  x.interval = x.interval ?? 1;
  if (!Number.isInteger(x.interval) || x.interval < 1 || x.interval > 999) return fail('reason.badInterval');
  x.mode = x.mode ?? 'completion';
  if (!SERIES_MODES.includes(x.mode)) return fail('reason.badMode');
  if (!isDateKey(x.startDate)) return fail('reason.badStartDate');
  x.time = x.time ?? null;
  if (x.time !== null && !isTime(x.time)) return fail('reason.badTaskTime');
  x.paused = x.paused ?? false;
  if (!isBool(x.paused)) return fail('reason.badPaused');
  x.generatedThrough = x.generatedThrough ?? null;
  if (x.generatedThrough !== null && !isDateKey(x.generatedThrough)) return fail('reason.badGenerated');
  x.projectId = x.projectId ?? null;
  if (x.projectId !== null && !isId(x.projectId)) return fail('reason.badProjectLink');
  // 0.6.0 (all optional; a bad value is dropped, never a reason to quarantine an old series):
  if (x.kind !== 'event') delete x.kind;                                   // recurring EVENT; absent = recurring task
  if (x.until !== undefined && x.until !== null && !isDateKey(x.until)) delete x.until; // last date (inclusive)
  if (x.until === null) delete x.until;
  if (!SERIES_MONTHLY_RULES.includes(x.monthBy)) delete x.monthBy;
  if (x.endTime !== undefined && (x.kind !== 'event' || !isTime(x.endTime) || (x.time && x.endTime <= x.time))) delete x.endTime;
  if (x.skip !== undefined) { x.skip = Array.isArray(x.skip) ? [...new Set(x.skip.filter(isDateKey))].sort() : []; if (!x.skip.length) delete x.skip; }
  if (x.kind === 'event') { x.mode = 'fixed'; if (x.time === null) return fail('reason.badTaskTime'); } // an event needs a start time
  const s = stamps(x, now);
  return s ? fail(s) : { value: x };
}

const CHECK = { tasks: checkTask, events: checkEvent, projects: checkProject, lists: checkList, series: checkSeries, waiting: checkWaiting, templates: checkTemplate };

function normalizeSettings(input) {
  const def = defaultSettings();
  if (!isPlainObject(input)) return def;
  const out = { ...input };
  const ep = input.eveningPreview;
  out.eveningPreview = (isPlainObject(ep) && isBool(ep.enabled) && isTime(ep.time)) ? { ...ep } : def.eveningPreview;
  // Upgrade 2 → 3 happens here: data without settings.day gets the defaults.
  // Each field is checked on its own, so one bad value never resets the others.
  const d = isPlainObject(input.day) ? input.day : {};
  const optTime = v => (isTime(v) ? v : null);
  out.day = {
    ...d,
    wake: optTime(d.wake),
    bed: optTime(d.bed),
    cutoff: isTime(d.cutoff) ? d.cutoff : def.day.cutoff,
    setupDone: isBool(d.setupDone) ? d.setupDone : false
  };
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
      quantity: { current: r.current ?? 0, total: r.total ?? 0, unit: r.unit ?? '' },
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
  if (!isPlainObject(input)) return { fatal: 'fatal.notObject' };
  let version = input.schemaVersion;
  if (version === undefined) {
    if (!COLLECTIONS.some(k => Array.isArray(input[k]))) return { fatal: 'fatal.notOrganizer' };
    version = 1;
  }
  if (!Number.isInteger(version) || version < 1) return { fatal: 'fatal.badVersion' };
  if (version > SCHEMA_VERSION) return { fatal: 'newer', newerVersion: version };

  const doc = emptyDoc(now);
  if (isId(input.dataId)) doc.dataId = input.dataId;
  if (isIso(input.createdAt)) doc.createdAt = input.createdAt;
  if (isIso(input.updatedAt)) doc.updatedAt = input.updatedAt;

  const quarantined = [];
  const put = (collection, record, reason, parentId = null) =>
    quarantined.push({ at: now, source, collection, parentId, reason, record });

  for (const key of COLLECTIONS) {
    const list = input[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) { put(key, list, 'reason.notList'); continue; }
    const seen = new Set();
    for (const original of list) {
      let rec = original;
      if (version === 1) {
        try { rec = CONVERT_V1[key](original, now); } catch { rec = null; }
      }
      const res = CHECK[key](rec, now);
      if (res.error) { put(key, original, res.error); continue; }
      if (seen.has(res.value.id)) { put(key, original, 'reason.dupId'); continue; }
      seen.add(res.value.id);
      for (const n of res.nested || []) put(`${key}.${n.field}`, n.record, n.reason, res.value.id);
      doc[key].push(res.value);
    }
  }

  doc.settings = normalizeSettings(input.settings);

  if (Array.isArray(input.quarantine)) {
    doc.quarantine = input.quarantine.map(q => (isPlainObject(q) ? q : { at: now, source, collection: 'quarantine', parentId: null, reason: 'reason.badQuarantineEntry', record: q }));
  } else if (input.quarantine !== undefined) {
    doc.quarantine = [{ at: now, source, collection: 'quarantine', parentId: null, reason: 'reason.badQuarantine', record: input.quarantine }];
  }
  doc.quarantine.push(...quarantined);

  return { doc, quarantined, migratedFrom: version < SCHEMA_VERSION ? version : null };
}

// Release rule R12: before anything is written after loading or upgrading,
// check that every record of the input is either loaded or in quarantine, that
// loaded records keep their id, title and done state, and that the old
// quarantine is kept. Returns null when nothing is missing, otherwise the name
// of the first collection where something went missing.
const titleOf = r => (isPlainObject(r) ? (r.title ?? r.name) : undefined);

export function findLostRecords(input, res) {
  if (!isPlainObject(input) || !res || !isPlainObject(res.doc)) return 'document';
  const v1 = input.schemaVersion === undefined;
  const q = Array.isArray(res.quarantined) ? res.quarantined : [];
  // id → every original with that id (a duplicate or invalid one may come first).
  const byId = list => {
    const map = new Map();
    for (const r of list) if (isPlainObject(r)) map.set(r.id, [...(map.get(r.id) || []), r]);
    return map;
  };
  const sameRecord = (before, after) => v1 || (titleOf(before) === titleOf(after) && (before.done === undefined || before.done === after.done));
  const hasOriginal = (map, r) => (map.get(r.id) || []).some(o => sameRecord(o, r));

  for (const key of COLLECTIONS) {
    const list = input[key];
    const loaded = res.doc[key];
    if (!Array.isArray(loaded)) return key;
    if (list === undefined) { if (loaded.length) return key; continue; }
    if (!Array.isArray(list)) {
      if (loaded.length || !q.some(x => x.collection === key && x.record === list)) return key;
      continue;
    }
    const top = q.filter(x => x.collection === key && x.parentId === null).length;
    if (loaded.length + top !== list.length) return key;
    const originals = byId(list);
    if (loaded.some(r => !hasOriginal(originals, r))) return key;
  }
  // [collection, field, field name in the input, optional]; an event's `prep` (0.5.0) is optional.
  const NESTED = [['projects', 'milestones', v1 ? 'steps' : 'milestones'], ['lists', 'items', 'items'], ['templates', 'items', 'items'], ['events', 'prep', 'prep', true]];
  for (const [key, field, inputField, optional] of NESTED) {
    if (!Array.isArray(input[key])) continue;
    const originals = byId(input[key]);
    for (const r of res.doc[key]) {
      if (optional && r[field] === undefined) continue;
      if (!Array.isArray(r[field])) return `${key}.${field}`;
      const nestedQ = q.filter(x => x.collection === `${key}.${field}` && x.parentId === r.id).length;
      // The original this record was loaded from: same id and title, and its items all accounted for.
      const fits = o => {
        if (!sameRecord(o, r) || !Array.isArray(o[inputField]) || r[field].length + nestedQ !== o[inputField].length) return false;
        const items = byId(o[inputField]);
        return r[field].every(i => hasOriginal(items, i));
      };
      if (!(originals.get(r.id) || []).some(fits)) return `${key}.${field}`;
    }
  }
  const oldQ = Array.isArray(input.quarantine) ? input.quarantine.length : input.quarantine === undefined ? 0 : 1;
  if (!Array.isArray(res.doc.quarantine) || res.doc.quarantine.length !== oldQ + q.length) return 'quarantine';
  return null;
}

// Counts of records that are not deleted, for previews and the Data tab.
export function countActive(doc) {
  const alive = r => !r.deletedAt;
  return {
    tasks: doc.tasks.filter(alive).length,
    events: doc.events.filter(alive).length,
    projects: doc.projects.filter(alive).length,
    lists: doc.lists.filter(alive).length,
    // Newer kinds of records appear in the counts only when there are some.
    ...Object.fromEntries(['series', 'waiting', 'templates'].map(k => [k, doc[k].filter(alive).length]).filter(([, n]) => n > 0))
  };
}

// True when there is anything worth protecting, including quarantined records.
export function hasContent(doc) {
  return !!doc && (COLLECTIONS.some(k => doc[k].length > 0) || (Array.isArray(doc.quarantine) && doc.quarantine.length > 0));
}
