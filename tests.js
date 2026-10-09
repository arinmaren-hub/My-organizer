// Automated tests. Open tests.html in a browser (served over http/https):
// every line should be green. Uses an in-memory storage, so it never touches
// your real data.

import { dateKey, parseDateKey, isDateKey, isTime, isDateTime, addDays, weekKey, daysBetween } from './dates.js';
import { SCHEMA_VERSION, emptyDoc, normalizeDoc, countActive, newTask } from './schema.js';
import { createMemoryAdapter, KEYS } from './storage.js';
import { createStore, MAX_SNAPSHOTS } from './store.js';
import { buildBackupText, backupFileName, parseBackupText } from './backup.js';
import * as A from './actions.js';
import { overdueForReview, eventsForDay, buildDaySummary, eveningPreviewDue, unfinishedBefore, deletedRecords, tasksForDay } from './selectors.js';
import { APP_VERSION } from './version.js';
import { esc } from './util.js';
import { MODES, readAppearance, saveAppearance, applyAppearance } from './appearance.js';

const tests = [];
const test = (group, name, fn) => tests.push({ group, name, fn });
const eq = (a, b, msg = 'значения различаются') => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${msg}: ${x} ≠ ${y}`);
};
const ok = (v, msg = 'ожидалось true') => { if (!v) throw new Error(msg); };

// A controllable clock at LOCAL noon, so results do not depend on the time zone.
function makeClock(y, m, d, h = 12, min = 0) {
  let t = new Date(y, m - 1, d, h, min, 0, 0);
  const clock = () => new Date(t.getTime());
  clock.set = (yy, mm, dd, hh = 12, mi = 0) => { t = new Date(yy, mm - 1, dd, hh, mi, 0, 0); };
  clock.addDays = n => { t = new Date(t.getTime()); t.setDate(t.getDate() + n); };
  clock.addMinutes = n => { t = new Date(t.getTime() + n * 60000); };
  return clock;
}

// Make writes to one key fail: 'quota' (nothing written) or 'verify' (a damaged
// value is written, then an error is thrown). times = how many writes fail.
function failWrites(storage, key, mode = 'quota', times = Infinity) {
  let left = times;
  storage.failKey = k => (k === key && left-- > 0 ? mode : null);
}
const healWrites = storage => { storage.failKey = null; storage.failWrites = false; };
const titles = store => store.doc.tasks.filter(t => !t.deletedAt).map(t => t.title);

function setup(initial = {}, date = [2026, 10, 9]) {
  const storage = createMemoryAdapter(initial);
  const clock = makeClock(...date);
  const store = createStore({ storage, clock });
  store.load();
  return { storage, clock, store };
}

const savedDoc = storage => JSON.parse(storage.get(KEYS.data));

// The first prototype's data shape (key 'arina-organizer-v1').
const PROTOTYPE = {
  tasks: [
    { id: 'a1', name: 'Купить хлеб', scope: 'none', date: '', done: false, created: '2026-10-01' },
    { id: 'a2', name: 'Отчёт', scope: 'day', date: '2026-10-05', done: false, created: '2026-10-04' },
    { id: 'a3', name: 'Недельная', scope: 'week', date: '2026-10-08', done: true, created: '2026-10-06' }
  ],
  events: [{ id: 'e1', name: 'Лекция', at: '2026-10-09T10:00' }],
  lists: [{ id: 'l1', name: 'Покупки', items: [{ id: 'i1', name: 'Молоко', done: true }] }],
  projects: [{ id: 'p1', name: 'Диплом', steps: [{ id: 's1', name: 'План', done: true }, { id: 's2', name: 'Глава 1', done: false }], current: 7, total: 12, unit: 'глав' }]
};

// ================= dates =================
test('Даты', 'dateKey: локальная дата с нулями', () => eq(dateKey(new Date(2026, 0, 5, 12)), '2026-01-05'));
test('Даты', 'isDateKey отклоняет несуществующие даты и неверный формат', () => {
  ok(isDateKey('2026-10-09'));
  ok(isDateKey('2028-02-29'));
  ok(!isDateKey('2026-02-30'), '30 февраля');
  ok(!isDateKey('2026-2-3'), 'без нулей');
  ok(!isDateKey(''), 'пустая строка');
  ok(!isDateKey(null), 'null');
});
test('Даты', 'isTime / isDateTime', () => {
  ok(isTime('00:00') && isTime('23:59') && !isTime('24:00') && !isTime('9:00'));
  ok(isDateTime('2026-10-09T10:00') && !isDateTime('2026-10-09 10:00') && !isDateTime('2026-10-09T10:00:00'));
});
test('Даты', 'addDays через конец месяца и года', () => {
  eq(addDays('2026-10-31', 1), '2026-11-01');
  eq(addDays('2026-12-31', 1), '2027-01-01');
  eq(addDays('2026-03-01', -1), '2026-02-28');
});
test('Даты', 'addDays через переход на летнее/зимнее время', () => {
  eq(addDays('2026-03-28', 1), '2026-03-29');
  eq(addDays('2026-03-29', 1), '2026-03-30');
  eq(addDays('2026-10-24', 2), '2026-10-26');
  eq(daysBetween('2026-03-28', '2026-03-31'), 3);
  eq(daysBetween('2026-10-24', '2026-10-27'), 3);
});
test('Даты', 'weekKey: неделя начинается в понедельник', () => {
  eq(weekKey('2026-10-05'), '2026-10-05', 'пн');
  eq(weekKey('2026-10-09'), '2026-10-05', 'пт');
  eq(weekKey('2026-10-11'), '2026-10-05', 'вс → предыдущий пн');
  eq(weekKey('2026-10-12'), '2026-10-12', 'следующий пн');
  eq(weekKey('2026-01-01'), '2025-12-29', 'через Новый год');
});
test('Даты', 'parseDateKey даёт локальный полдень', () => {
  const d = parseDateKey('2026-10-25');
  eq([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 9, 25, 12]);
});

// ================= schema =================
const NOW = '2026-10-09T09:00:00.000Z';
test('Схема', 'пустой документ проходит проверку без потерь', () => {
  const r = normalizeDoc(emptyDoc(NOW), { now: NOW });
  ok(!r.fatal);
  eq(r.quarantined.length, 0);
  eq(r.doc.schemaVersion, SCHEMA_VERSION);
});
test('Схема', 'миграция прототипа v1 → v2: все записи и поля', () => {
  const r = normalizeDoc(PROTOTYPE, { now: NOW });
  ok(!r.fatal);
  eq(r.migratedFrom, 1);
  eq(r.quarantined.length, 0, 'ничего не в карантине');
  eq(countActive(r.doc), { tasks: 3, events: 1, projects: 1, lists: 1 });
  const [t1, t2, t3] = r.doc.tasks;
  eq([t1.title, t1.plan], ['Купить хлеб', { kind: 'none', date: null }]);
  eq(t2.plan, { kind: 'day', date: '2026-10-05' });
  eq(t3.plan, { kind: 'week', date: '2026-10-05' }, 'неделя приведена к понедельнику');
  eq([t3.done, t2.deadline, t2.time], [true, null, null]);
  eq(t1.createdAt, '2026-10-01T12:00:00.000Z', 'дата создания сохранена');
  eq(r.doc.events[0].start, '2026-10-09T10:00');
  eq(r.doc.projects[0].quantity, { current: 7, total: 12, unit: 'глав' });
  eq(r.doc.projects[0].milestones.map(m => [m.title, m.done]), [['План', true], ['Глава 1', false]]);
  eq(r.doc.lists[0].items[0].title, 'Молоко');
});
test('Схема', 'событие без времени (ошибка 2) уходит в карантин, остальное загружается', () => {
  const bad = { ...PROTOTYPE, events: [{ id: 'x', name: 'без времени' }, { id: 'e2', name: 'ок', at: '2026-10-10T09:00' }] };
  const r = normalizeDoc(bad, { now: NOW });
  eq(r.doc.events.length, 1);
  eq(r.quarantined.length, 1);
  eq(r.quarantined[0].record, { id: 'x', name: 'без времени' }, 'исходная запись сохранена в карантине');
  eq(r.doc.quarantine.length, 1, 'карантин хранится в документе');
});
test('Схема', 'неверная дата задачи в v2 → карантин с исходной записью', () => {
  const d = emptyDoc(NOW);
  d.tasks.push({ ...newTask({ id: 't1', title: 'A', plan: { kind: 'day', date: '2026-10-09' }, now: NOW }) });
  d.tasks.push({ ...newTask({ id: 't2', title: 'B', plan: { kind: 'day', date: '2026-13-01' }, now: NOW }) });
  const r = normalizeDoc(d, { now: NOW });
  eq(r.doc.tasks.map(t => t.id), ['t1']);
  eq(r.quarantined[0].record.id, 't2');
});
test('Схема', 'повторяющийся id → второй экземпляр в карантин', () => {
  const d = emptyDoc(NOW);
  const t = newTask({ id: 'same', title: 'A', plan: { kind: 'none' }, now: NOW });
  d.tasks.push(t, { ...t, title: 'B' });
  const r = normalizeDoc(d, { now: NOW });
  eq(r.doc.tasks.length, 1);
  eq(r.quarantined[0].reason, 'повторяющийся id');
});
test('Схема', 'id с кавычками или скобками отклоняется (защита от внедрения, ошибка 12)', () => {
  const d = emptyDoc(NOW);
  d.tasks.push(newTask({ id: "x');alert(1);('", title: 'A', plan: { kind: 'none' }, now: NOW }));
  const r = normalizeDoc(d, { now: NOW });
  eq(r.doc.tasks.length, 0);
  eq(r.quarantined.length, 1);
});
test('Схема', 'плохой пункт списка в карантин, сам список остаётся', () => {
  const r = normalizeDoc({ ...PROTOTYPE, lists: [{ id: 'l1', name: 'L', items: [{ id: 'i1', name: 'ok', done: false }, { name: 'без id' }] }] }, { now: NOW });
  eq(r.doc.lists[0].items.length, 1);
  eq(r.quarantined[0].collection, 'lists.items');
  eq(r.quarantined[0].parentId, 'l1');
});
test('Схема', 'данные более новой версии не трогаются', () => {
  const r = normalizeDoc({ ...emptyDoc(NOW), schemaVersion: SCHEMA_VERSION + 1 }, { now: NOW });
  eq(r.fatal, 'newer');
});
test('Схема', 'не объект / чужие данные → fatal', () => {
  ok(normalizeDoc(null, { now: NOW }).fatal);
  ok(normalizeDoc([1, 2], { now: NOW }).fatal);
  ok(normalizeDoc({ hello: 1 }, { now: NOW }).fatal);
});
test('Схема', 'неизвестные поля записей сохраняются', () => {
  const d = emptyDoc(NOW);
  d.tasks.push({ ...newTask({ id: 't1', title: 'A', plan: { kind: 'none' }, now: NOW }), futureField: 42 });
  eq(normalizeDoc(d, { now: NOW }).doc.tasks[0].futureField, 42);
});
test('Схема', 'время и напоминание задачи проверяются', () => {
  const d = emptyDoc(NOW);
  d.tasks.push({ ...newTask({ id: 't1', title: 'ок', plan: { kind: 'day', date: '2026-10-09' }, now: NOW }), time: '14:00', reminder: { minutesBefore: 15 } });
  d.tasks.push({ ...newTask({ id: 't2', title: 'время без дня', plan: { kind: 'none' }, now: NOW }), time: '14:00' });
  d.tasks.push({ ...newTask({ id: 't3', title: 'напоминание без времени', plan: { kind: 'day', date: '2026-10-09' }, now: NOW }), reminder: { minutesBefore: 5 } });
  const r = normalizeDoc(d, { now: NOW });
  eq(r.doc.tasks.map(t => t.id), ['t1']);
  eq(r.quarantined.length, 2);
});

// ================= store =================
test('Хранилище', 'новое хранилище: пустой органайзер, запись разрешена', () => {
  const { store } = setup();
  ok(!store.status.readOnly);
  eq(countActive(store.doc), { tasks: 0, events: 0, projects: 0, lists: 0 });
});
test('Хранилище', 'добавленная задача сохраняется и читается после перезапуска', () => {
  const { store, storage, clock } = setup();
  eq(A.addTasksFromText(store, 'Первая\n\n  Вторая  \n', 'none'), 2);
  const again = createStore({ storage, clock });
  again.load();
  eq(again.doc.tasks.map(t => t.title), ['Первая', 'Вторая']);
  ok(again.doc.tasks.every(t => t.createdAt && t.updatedAt && t.deletedAt === null), 'метки времени');
});
test('Хранилище', 'данные прототипа переносятся, старый ключ не меняется', () => {
  const raw = JSON.stringify(PROTOTYPE);
  const { store, storage } = setup({ [KEYS.legacy]: raw });
  eq(countActive(store.doc).tasks, 3);
  eq(storage.get(KEYS.legacy), raw, 'старые данные не тронуты');
  eq(savedDoc(storage).schemaVersion, SCHEMA_VERSION, 'новый формат записан');
  ok(store.status.notices.some(n => n.text.includes('Перенесены')));
});
test('Хранилище', 'повреждённый текст (ошибка 3): сохраняется в rescue, загружается автокопия', () => {
  const { store, storage, clock } = setup();
  A.addTasksFromText(store, 'старая задача');
  clock.addDays(1);
  A.addTasksFromText(store, 'новая задача'); // first change of a new day → daily copy of the old state
  storage.set(KEYS.data, '{сломано');
  const s2 = createStore({ storage, clock });
  s2.load();
  eq(s2.doc.tasks.map(t => t.title), ['старая задача'], 'восстановлено из автокопии');
  eq(s2.rescueList()[0].raw, '{сломано', 'повреждённый текст сохранён как есть');
  ok(!s2.status.readOnly);
  ok(s2.status.notices.some(n => n.level === 'error'));
});
test('Хранилище', 'повреждённый текст без автокопий: пусто, но текст спасён', () => {
  const { store, storage } = setup({ [KEYS.data]: 'not json at all' });
  eq(store.doc.tasks.length, 0);
  eq(store.rescueList()[0].raw, 'not json at all');
  ok(!store.status.readOnly);
  ok(storage.get(KEYS.data) !== null);
});
test('Хранилище', 'если спасти повреждённый текст не удалось — только чтение, ничего не перезаписано', () => {
  const storage = createMemoryAdapter({ [KEYS.data]: '{broken' });
  storage.failWrites = true;
  const store = createStore({ storage, clock: makeClock(2026, 10, 9) });
  store.load();
  ok(store.status.readOnly);
  storage.failWrites = false;
  eq(A.addTasksFromText(store, 'x'), false, 'изменение отклонено');
  eq(storage.get(KEYS.data), '{broken', 'исходный текст на месте');
  eq(store.status.blockedRaw, '{broken');
});
test('Хранилище', 'данные новой версии: только чтение, не перезаписываются', () => {
  const raw = JSON.stringify({ ...emptyDoc(NOW), schemaVersion: SCHEMA_VERSION + 1 });
  const { store, storage } = setup({ [KEYS.data]: raw });
  ok(store.status.readOnly);
  eq(A.addTasksFromText(store, 'x'), false);
  eq(storage.get(KEYS.data), raw);
});
test('Хранилище', 'ошибка сохранения (ошибка 5): видна, данные в памяти, повтор сохраняет', () => {
  const { store, storage, clock } = setup();
  A.addTasksFromText(store, 'A');
  storage.failWrites = true;
  A.addTasksFromText(store, 'B');
  ok(store.status.saveError.includes('память'), 'сообщение об ошибке');
  eq(store.doc.tasks.length, 2, 'изменение в памяти');
  eq(savedDoc(storage).tasks.length, 1, 'на диске старая версия');
  storage.failWrites = false;
  ok(store.retrySave(), 'повтор успешен');
  eq(store.status.saveError, '');
  const again = createStore({ storage, clock });
  again.load();
  eq(again.doc.tasks.length, 2);
});
test('Хранилище', 'некорректное изменение отклоняется целиком, ничего не сохраняется', () => {
  const { store, storage } = setup();
  A.addTasksFromText(store, 'A');
  const before = storage.get(KEYS.data);
  const res = store.update('сломать', d => { d.tasks[0].plan.date = 'вчера'; d.tasks.push({ id: 'ok2', title: 'B' }); });
  eq(res, false);
  eq(store.doc.tasks.length, 1);
  eq(store.doc.tasks[0].plan.kind, 'none');
  eq(storage.get(KEYS.data), before);
  ok(store.status.notices.some(n => n.text.includes('отменено')));
});
test('Хранилище', 'ошибка внутри действия отменяет его', () => {
  const { store } = setup();
  eq(A.setTaskDone(store, 'нет-такой', true), false);
  ok(store.status.notices.some(n => n.text.includes('не найден')));
});
test('Хранилище', 'отметка «готово» ставит и снимает completedAt', () => {
  const { store } = setup();
  A.addTasksFromText(store, 'A');
  const id = store.doc.tasks[0].id;
  A.setTaskDone(store, id, true);
  ok(store.doc.tasks[0].done && store.doc.tasks[0].completedAt);
  A.setTaskDone(store, id, false);
  eq([store.doc.tasks[0].done, store.doc.tasks[0].completedAt], [false, null]);
});
test('Хранилище', 'перенос задачи не меняет дедлайн (решение 6)', () => {
  const { store } = setup();
  A.addTasksFromText(store, 'A', 'day', '2026-10-05');
  const id = store.doc.tasks[0].id;
  store.update('дедлайн', d => { d.tasks[0].deadline = '2026-10-20'; });
  A.moveTask(store, id, 'week');
  eq(store.doc.tasks[0].plan, { kind: 'week', date: '2026-10-05' });
  A.moveTask(store, id, 'none');
  A.moveTask(store, id, 'day');
  eq(store.doc.tasks[0].plan, { kind: 'day', date: '2026-10-09' });
  eq(store.doc.tasks[0].deadline, '2026-10-20');
});
test('Хранилище', 'updatedAt меняется при изменении, createdAt — нет', () => {
  const { store, clock } = setup();
  A.addTasksFromText(store, 'A');
  const { createdAt, updatedAt, id } = store.doc.tasks[0];
  clock.set(2026, 10, 9, 15);
  A.setTaskDone(store, id, true);
  eq(store.doc.tasks[0].createdAt, createdAt);
  ok(store.doc.tasks[0].updatedAt > updatedAt);
});
test('Хранилище', 'мягкое удаление: скрыто, восстанавливается, через 30 дней удаляется навсегда', () => {
  const { store, storage, clock } = setup();
  A.addTasksFromText(store, 'A', 'day');
  const id = store.doc.tasks[0].id;
  A.softDelete(store, 'tasks', id);
  eq(tasksForDay(store.doc, '2026-10-09').length, 0, 'скрыта');
  eq(deletedRecords(store.doc).length, 1, 'видна в «Удалённых»');
  A.restoreDeleted(store, 'tasks', id);
  eq(tasksForDay(store.doc, '2026-10-09').length, 1, 'восстановлена');
  A.softDelete(store, 'tasks', id);
  clock.addDays(29);
  let s = createStore({ storage, clock }); s.load();
  eq(s.doc.tasks.length, 1, 'через 29 дней ещё есть');
  clock.addDays(2);
  s = createStore({ storage, clock }); s.load();
  eq(s.doc.tasks.length, 0, 'через 31 день удалена');
});
test('Хранилище', 'ежедневная автокопия: одна в день', () => {
  const { store, clock } = setup();
  A.addTasksFromText(store, 'A');
  A.addTasksFromText(store, 'B');
  eq(store.listSnapshots().length, 0, 'пустое состояние не копируется');
  clock.addDays(1);
  A.addTasksFromText(store, 'C');
  A.addTasksFromText(store, 'D');
  eq(store.listSnapshots().length, 1);
  eq(store.listSnapshots()[0].counts.tasks, 2, 'копия состояния до первого изменения дня');
  clock.addDays(1);
  A.addTasksFromText(store, 'E');
  eq(store.listSnapshots().length, 2);
});
test('Хранилище', `не больше ${MAX_SNAPSHOTS} автокопий`, () => {
  const { store } = setup();
  A.addTasksFromText(store, 'A');
  for (let i = 0; i < MAX_SNAPSHOTS + 4; i++) store.takeSnapshot('test');
  eq(store.listSnapshots().length, MAX_SNAPSHOTS);
});
test('Хранилище', 'восстановление из автокопии сохраняет текущее состояние', () => {
  const { store, clock } = setup();
  A.addTasksFromText(store, 'A');
  clock.addDays(1);
  A.addTasksFromText(store, 'B');
  const daily = store.listSnapshots()[0];
  eq(store.restoreSnapshot(daily.id).ok, true);
  eq(store.doc.tasks.map(t => t.title), ['A']);
  ok(store.listSnapshots().some(s => s.reason === 'before-restore' && s.counts.tasks === 2));
});
test('Хранилище', 'при нехватке места старые автокопии уступают место основным данным', () => {
  const storage = createMemoryAdapter();
  const clock = makeClock(2026, 10, 9);
  const store = createStore({ storage, clock });
  store.load();
  A.addTasksFromText(store, 'A');
  for (let i = 0; i < 6; i++) store.takeSnapshot('t');
  const realSet = storage.set;
  let failedOnce = false;
  storage.set = (k, v) => { if (k === KEYS.data && !failedOnce) { failedOnce = true; const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; } return realSet.call(storage, k, v); };
  A.addTasksFromText(store, 'B');
  eq(store.status.saveError, '');
  eq(store.listSnapshots().length, 2);
  eq(savedDoc(storage).tasks.length, 2);
});

// ================= backup / import =================
test('Резервные копии', 'экспорт → импорт возвращает те же данные', () => {
  const { store } = setup({ [KEYS.legacy]: JSON.stringify(PROTOTYPE) });
  const text = buildBackupText(store.doc, NOW);
  const p = parseBackupText(text, NOW);
  ok(p.ok);
  eq(p.meta.format, 'backup');
  eq(p.doc.tasks, store.doc.tasks);
  eq(p.doc.projects, store.doc.projects);
});
test('Резервные копии', 'имя файла с датой и временем', () => {
  eq(backupFileName(new Date(2026, 9, 9, 7, 5)), 'organizer-backup-2026-10-09-0705.json');
});
test('Резервные копии', 'импорт: предпросмотр, автокопия перед заменой, замена', () => {
  const { store } = setup();
  A.addTasksFromText(store, 'текущая');
  const preview = store.previewImport(JSON.stringify(PROTOTYPE));
  ok(preview.ok);
  eq(preview.counts, { tasks: 3, events: 1, projects: 1, lists: 1 });
  eq(preview.meta.format, 'prototype');
  eq(store.doc.tasks.length, 1, 'предпросмотр ничего не меняет');
  eq(store.applyImport(preview).ok, true);
  eq(store.doc.tasks.length, 3);
  const snap = store.listSnapshots().find(s => s.reason === 'before-import');
  ok(snap, 'автокопия перед импортом');
  eq(snap.counts.tasks, 1);
});
test('Резервные копии', 'неверный файл отклоняется, данные не меняются', () => {
  const { store } = setup();
  A.addTasksFromText(store, 'A');
  ok(!store.previewImport('это не json').ok);
  ok(!store.previewImport('{"foo":1}').ok);
  ok(!store.previewImport(JSON.stringify({ app: 'organizer', kind: 'backup', data: { ...emptyDoc(NOW), schemaVersion: 99 } })).ok, 'новая версия');
  eq(store.doc.tasks.length, 1);
});
test('Резервные копии', 'файл с плохими записями: импортируется остальное, плохие — в карантин', () => {
  const { store } = setup();
  const bad = { ...PROTOTYPE, events: [{ id: 'x', name: 'нет времени' }] };
  const p = store.previewImport(JSON.stringify(bad));
  ok(p.ok);
  eq(p.quarantined, 1);
  store.applyImport(p);
  eq(store.doc.quarantine.length, 1);
  eq(store.doc.tasks.length, 3);
});
test('Резервные копии', 'импорт запрещён в режиме только чтения', () => {
  const { store } = setup({ [KEYS.data]: JSON.stringify({ ...emptyDoc(NOW), schemaVersion: 99 }) });
  const p = store.previewImport(JSON.stringify(PROTOTYPE));
  eq(store.applyImport(p).ok, false);
});

// ================= failed writes (0.2.1 regression tests) =================
const G = 'Сбои записи';
test(G, 'импорт: если новые данные не сохранились — не успех, прежние данные в памяти и в хранилище', () => {
  const { store, storage } = setup();
  A.addTasksFromText(store, 'текущая');
  const before = storage.get(KEYS.data);
  const preview = store.previewImport(JSON.stringify(PROTOTYPE));
  failWrites(storage, KEYS.data, 'quota');
  const res = store.applyImport(preview);
  eq(res.ok, false, 'импорт не должен сообщать об успехе');
  ok(res.error && res.error.includes('не изменены'), 'понятная причина');
  eq(titles(store), ['текущая'], 'в памяти прежние данные');
  eq(storage.get(KEYS.data), before, 'в хранилище прежние данные');
  eq(store.status.saveError, '', 'нет ложного «изменения только в памяти»');
  ok(!store.status.notices.some(n => n.text.startsWith('Импорт выполнен')), 'нет сообщения об успехе');
  ok(store.status.notices.some(n => n.text.startsWith('Импорт не выполнен')));
  healWrites(storage);
  eq(store.applyImport(preview).ok, true, 'после освобождения места импорт проходит');
  eq(JSON.parse(storage.get(KEYS.data)).tasks.length, 3);
});
test(G, 'импорт: запись «наполовину» (сбой проверки) — прежний текст возвращён в хранилище', () => {
  const { store, storage } = setup();
  A.addTasksFromText(store, 'текущая');
  const before = storage.get(KEYS.data);
  const preview = store.previewImport(JSON.stringify(PROTOTYPE));
  failWrites(storage, KEYS.data, 'verify', 1);
  eq(store.applyImport(preview).ok, false);
  eq(storage.get(KEYS.data), before, 'повреждённая запись заменена прежней версией');
  eq(titles(store), ['текущая']);
});
test(G, 'импорт при несохранённых изменениях: они остаются в памяти, предупреждение остаётся', () => {
  const { store, storage } = setup();
  A.addTasksFromText(store, 'сохранена');
  failWrites(storage, KEYS.data, 'quota');
  A.addTasksFromText(store, 'только в памяти');
  const pendingError = store.status.saveError;
  ok(pendingError);
  eq(store.applyImport(store.previewImport(JSON.stringify(PROTOTYPE))).ok, false);
  eq(titles(store), ['сохранена', 'только в памяти']);
  eq(store.status.saveError, pendingError);
});
test(G, 'восстановление: если не сохранилось — не успех, данные прежние, автокопия на месте', () => {
  const { store, storage, clock } = setup();
  A.addTasksFromText(store, 'A');
  clock.addDays(1);
  A.addTasksFromText(store, 'B');
  const before = storage.get(KEYS.data);
  const target = store.listSnapshots()[0].id;
  failWrites(storage, KEYS.data, 'quota');
  const res = store.restoreSnapshot(target);
  eq(res.ok, false);
  eq(titles(store), ['A', 'B']);
  eq(storage.get(KEYS.data), before);
  eq(store.status.saveError, '');
  ok(store.listSnapshots().some(s => s.id === target), 'восстанавливаемая копия не потеряна');
  ok(!store.status.notices.some(n => n.text.startsWith('Данные восстановлены')));
  healWrites(storage);
  eq(store.restoreSnapshot(target).ok, true);
  eq(titles(store), ['A']);
});
test(G, 'восстановление самой старой копии при полном списке: копия не вытесняется', () => {
  const { store, storage, clock } = setup();
  A.addTasksFromText(store, 'A');
  for (let i = 0; i < MAX_SNAPSHOTS; i++) { clock.addMinutes(1); store.takeSnapshot('test'); }
  const oldest = store.listSnapshots().at(-1).id;
  clock.addMinutes(1);
  A.addTasksFromText(store, 'B');
  failWrites(storage, KEYS.data, 'quota');
  eq(store.restoreSnapshot(oldest).ok, false);
  ok(store.listSnapshots().some(s => s.id === oldest), 'самая старая копия на месте');
  eq(store.listSnapshots().length, MAX_SNAPSHOTS);
});
test(G, 'две автокопии в одну и ту же миллисекунду различаются: восстанавливается выбранная', () => {
  const { store } = setup();
  A.addTasksFromText(store, 'первая');
  store.takeSnapshot('test');
  A.addTasksFromText(store, 'вторая');
  store.takeSnapshot('test');
  const [newer, older] = store.listSnapshots();
  eq(newer.at, older.at, 'одинаковое время (часы стоят)');
  ok(newer.id !== older.id);
  eq(store.restoreSnapshot(older.id).ok, true);
  eq(titles(store), ['первая']);
});
test(G, 'нехватка места: если и после удаления старых автокопий не сохранилось — копии возвращены', () => {
  const { store, storage, clock } = setup();
  A.addTasksFromText(store, 'A');
  for (let i = 0; i < 6; i++) { clock.addMinutes(1); store.takeSnapshot('test'); }
  failWrites(storage, KEYS.data, 'quota');
  A.addTasksFromText(store, 'B');
  ok(store.status.saveError, 'ошибка показана');
  eq(store.listSnapshots().length, 6, 'автокопии не потеряны');
});
test(G, 'обычное изменение при сбое проверки: в хранилище возвращается прежняя версия', () => {
  const { store, storage } = setup();
  A.addTasksFromText(store, 'A');
  const before = storage.get(KEYS.data);
  failWrites(storage, KEYS.data, 'verify', 1);
  A.addTasksFromText(store, 'B');
  eq(storage.get(KEYS.data), before);
  ok(store.status.saveError, 'изменение помечено как несохранённое');
  ok(store.retrySave(), 'повтор сохраняет');
  eq(JSON.parse(storage.get(KEYS.data)).tasks.length, 2);
});
test(G, 'нечитаемые автокопии не перезаписываются, если их не удалось спасти', () => {
  const { store, storage } = setup();
  A.addTasksFromText(store, 'A');
  storage.set(KEYS.snapshots, '{испорчено');
  failWrites(storage, KEYS.rescue, 'quota');
  eq(store.takeSnapshot('test'), false);
  eq(storage.get(KEYS.snapshots), '{испорчено');
  healWrites(storage);
  eq(store.takeSnapshot('test'), true, 'после спасения запись разрешена');
  eq(store.rescueList()[0].raw, '{испорчено');
  eq(store.listSnapshots().length, 1);
});
test(G, 'повреждённые тексты не вытесняются (больше 5 записей) и нечитаемый архив сохраняется', () => {
  const storage = createMemoryAdapter();
  const clock = makeClock(2026, 10, 9);
  for (let i = 0; i < 7; i++) {
    storage.set(KEYS.data, 'damaged #' + i);
    clock.addMinutes(1);
    createStore({ storage, clock }).load();
  }
  const s = createStore({ storage, clock });
  s.load();
  eq(s.rescueList().length, 7, 'все 7 повреждённых текстов на месте');
  storage.set(KEYS.rescue, 'архив испорчен');
  storage.set(KEYS.data, 'damaged again');
  const s2 = createStore({ storage, clock });
  s2.load();
  const raws = s2.rescueList().map(r => r.raw);
  ok(raws.includes('архив испорчен') && raws.includes('damaged again'));
});
test(G, 'перенос прототипа при сбое записи: честное сообщение, старые данные целы, перенос повторится', () => {
  const raw = JSON.stringify(PROTOTYPE);
  const storage = createMemoryAdapter({ [KEYS.legacy]: raw });
  failWrites(storage, KEYS.data, 'quota');
  const clock = makeClock(2026, 10, 9);
  const s = createStore({ storage, clock });
  s.load();
  ok(!s.status.notices.some(n => n.text.startsWith('Перенесены')), 'нет ложного «перенесены»');
  ok(s.status.notices.some(n => n.text.includes('не удалось')));
  eq(storage.get(KEYS.legacy), raw);
  eq(storage.get(KEYS.data), null);
  healWrites(storage);
  const s2 = createStore({ storage, clock });
  s2.load();
  eq(countActive(s2.doc).tasks, 3);
  ok(storage.get(KEYS.data));
});
test(G, 'данные из другого окна не стирают несохранённые изменения этого окна', () => {
  const { store, storage } = setup();
  A.addTasksFromText(store, 'A');
  failWrites(storage, KEYS.data, 'quota');
  A.addTasksFromText(store, 'несохранённая');
  eq(store.reload(), false);
  eq(titles(store), ['A', 'несохранённая']);
  healWrites(storage);
  ok(store.retrySave());
  eq(store.reload(), true, 'после сохранения обновление разрешено');
  eq(titles(store), ['A', 'несохранённая']);
});

// ================= selectors (incl. prepared evening preview) =================
function docWith(tasks = [], events = []) {
  const d = emptyDoc(NOW);
  d.tasks = tasks.map((t, i) => ({ ...newTask({ id: 't' + i, title: t.title || 't' + i, plan: t.plan, now: NOW }), ...t }));
  d.events = events.map((e, i) => ({ id: 'e' + i, title: e.title || 'e' + i, start: e.start, end: null, allDay: false, repeat: null, alerts: [], createdAt: NOW, updatedAt: NOW, deletedAt: null }));
  return d;
}
test('Выборки', 'утренний разбор (как в прототипе): невыполненные дневные задачи до сегодня', () => {
  const d = docWith([
    { plan: { kind: 'day', date: '2026-10-08' } },
    { plan: { kind: 'day', date: '2026-10-08' }, done: true },
    { plan: { kind: 'day', date: '2026-10-09' } },
    { plan: { kind: 'week', date: '2026-09-28' } },
    { plan: { kind: 'day', date: '2026-10-07' }, deletedAt: NOW }
  ]);
  eq(overdueForReview(d, '2026-10-09').map(t => t.id), ['t0']);
});
test('Выборки', 'unfinishedBefore включает недельные задачи прошлых недель', () => {
  const d = docWith([{ plan: { kind: 'week', date: '2026-09-28' } }, { plan: { kind: 'week', date: '2026-10-05' } }, { plan: { kind: 'day', date: '2026-10-08' } }]);
  eq(unfinishedBefore(d, '2026-10-09').map(t => t.id), ['t0', 't2']);
});
test('Выборки', 'события дня по времени', () => {
  const d = docWith([], [{ start: '2026-10-09T14:00' }, { start: '2026-10-09T09:00' }, { start: '2026-10-10T09:00' }]);
  eq(eventsForDay(d, '2026-10-09').map(e => e.start), ['2026-10-09T09:00', '2026-10-09T14:00']);
});
test('Вечерняя сводка (подготовка)', 'сводка на завтра: события, задачи, дедлайны, невыполненное', () => {
  const d = docWith([
    { title: 'завтра 15:00', plan: { kind: 'day', date: '2026-10-10' }, time: '15:00' },
    { title: 'завтра', plan: { kind: 'day', date: '2026-10-10' } },
    { title: 'дедлайн скоро', plan: { kind: 'none' }, deadline: '2026-10-12' },
    { title: 'дедлайн далеко', plan: { kind: 'none' }, deadline: '2026-10-30' },
    { title: 'сегодня не сделано', plan: { kind: 'day', date: '2026-10-09' } }
  ], [{ title: 'Лекция', start: '2026-10-10T10:00' }]);
  const s = buildDaySummary(d, '2026-10-10');
  eq(s.events.map(e => e.title), ['Лекция']);
  eq(s.tasks.map(t => t.title), ['завтра 15:00', 'завтра']);
  eq(s.deadlines.map(t => t.title), ['дедлайн скоро']);
  eq(s.unfinished.map(t => t.title), ['сегодня не сделано']);
});
test('Вечерняя сводка (подготовка)', 'когда показывать: после выбранного времени, один раз за вечер', () => {
  const settings = { eveningPreview: { enabled: true, time: '21:30' } };
  eq(eveningPreviewDue(settings, new Date(2026, 9, 9, 21, 0), null), null, 'рано');
  eq(eveningPreviewDue(settings, new Date(2026, 9, 9, 21, 30), null), '2026-10-10');
  eq(eveningPreviewDue(settings, new Date(2026, 9, 9, 23, 0), '2026-10-10'), null, 'уже показано');
  eq(eveningPreviewDue({ eveningPreview: { enabled: false, time: '21:30' } }, new Date(2026, 9, 9, 22, 0), null), null, 'выключено');
});

// ================= safety of the HTML =================
test('Безопасность', 'esc экранирует все опасные символы', () => {
  eq(esc(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
});

// ================= appearance (0.2.2) =================
const T = 'Оформление';
test(T, 'по умолчанию — «Как в системе»; неизвестное значение тоже', () => {
  eq(readAppearance(createMemoryAdapter()), 'system');
  eq(readAppearance(createMemoryAdapter({ [KEYS.appearance]: 'purple' })), 'system');
  const broken = createMemoryAdapter(); broken.failReads = true;
  eq(readAppearance(broken), 'system');
});
test(T, 'выбор сохраняется и читается снова', () => {
  const s = createMemoryAdapter();
  for (const m of MODES) { ok(saveAppearance(s, m)); eq(readAppearance(s), m); }
});
test(T, 'неизвестный режим не сохраняется', () => {
  const s = createMemoryAdapter();
  let threw = false;
  try { saveAppearance(s, 'purple'); } catch { threw = true; }
  ok(threw);
  eq(s.get(KEYS.appearance), null);
});
test(T, 'если сохранить не удалось — сообщается false', () => {
  const s = createMemoryAdapter(); s.failWrites = true;
  eq(saveAppearance(s, 'dark'), false);
});
test(T, 'смена оформления не трогает данные и автокопии', () => {
  const { store, storage } = setup();
  A.addTasksFromText(store, 'A');
  const data = storage.get(KEYS.data), snaps = storage.get(KEYS.snapshots), dev = storage.get(KEYS.device);
  saveAppearance(storage, 'dark');
  saveAppearance(storage, 'light');
  eq([storage.get(KEYS.data), storage.get(KEYS.snapshots), storage.get(KEYS.device)], [data, snaps, dev]);
  ok(!buildBackupText(store.doc, NOW).includes('organizer:appearance'), 'не входит в резервную копию');
});
test(T, 'применение: атрибут data-theme и цвет строки состояния', () => {
  const d = document.implementation.createHTMLDocument('t');
  d.head.innerHTML = '<meta name="theme-color" data-scheme="light" content=""><meta name="theme-color" data-scheme="dark" content="">';
  const metas = () => [...d.querySelectorAll('meta')].map(m => m.getAttribute('content'));
  applyAppearance('dark', d);
  eq(d.documentElement.getAttribute('data-theme'), 'dark');
  eq(metas(), ['#1b1a18', '#1b1a18']);
  applyAppearance('light', d);
  eq(d.documentElement.getAttribute('data-theme'), 'light');
  eq(metas(), ['#f2eee6', '#f2eee6']);
  applyAppearance('system', d);
  eq(d.documentElement.hasAttribute('data-theme'), false);
  eq(metas(), ['#f2eee6', '#1b1a18']);
});
test(T, 'boot.js читает тот же ключ, что и приложение (без мигания при запуске)', async () => {
  const text = await (await fetch('boot.js', { cache: 'no-store' })).text();
  ok(text.includes(`getItem('${KEYS.appearance}')`), 'ключ в boot.js должен совпадать с KEYS.appearance');
});
test(T, 'цвета строки состояния совпадают с фоном страницы в app.css', async () => {
  const css = await (await fetch('app.css', { cache: 'no-store' })).text();
  const lightBg = css.match(/--bg: (#[0-9a-f]{6})/i)[1];
  const darkBg = css.match(/data-theme="dark"\] \{[\s\S]*?--bg: (#[0-9a-f]{6})/i)[1];
  const d = document.implementation.createHTMLDocument('t');
  d.head.innerHTML = '<meta name="theme-color" data-scheme="light" content=""><meta name="theme-color" data-scheme="dark" content="">';
  applyAppearance('system', d);
  eq([...d.querySelectorAll('meta')].map(m => m.getAttribute('content')), [lightBg, darkBg]);
});

// ================= installed-app files (need http/https) =================
const canFetch = location.protocol.startsWith('http');
test('PWA', 'версия в sw.js совпадает с version.js', async () => {
  if (!canFetch) throw new Error('откройте tests.html через http(s), не как файл');
  const text = await (await fetch('sw.js', { cache: 'no-store' })).text();
  const m = text.match(/const VERSION = '([^']+)'/);
  eq(m && m[1], APP_VERSION);
});
test('PWA', 'все файлы из списка офлайн-кэша существуют', async () => {
  const text = await (await fetch('sw.js', { cache: 'no-store' })).text();
  const list = JSON.parse(text.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  ok(list.length > 10, 'список не пуст');
  for (const path of list) {
    const r = await fetch(path, { cache: 'no-store' });
    ok(r.ok, `${path} → ${r.status}`);
  }
});
test('PWA', 'все модули приложения есть в офлайн-кэше', async () => {
  const text = await (await fetch('sw.js', { cache: 'no-store' })).text();
  const list = JSON.parse(text.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  const app = await (await fetch('app.js', { cache: 'no-store' })).text();
  const seen = new Set(['./app.js']);
  const queue = ['app.js'];
  const src = { 'app.js': app };
  while (queue.length) {
    const f = queue.shift();
    const code = src[f] ?? (src[f] = await (await fetch(f, { cache: 'no-store' })).text());
    for (const m of code.matchAll(/from '\.\/([\w-]+\.js)'/g)) {
      if (!seen.has('./' + m[1])) { seen.add('./' + m[1]); queue.push(m[1]); }
    }
  }
  for (const f of seen) ok(list.includes(f), `${f} нет в ASSETS`);
});
test('PWA', 'manifest: standalone, start_url, иконки существуют', async () => {
  const m = await (await fetch('manifest.webmanifest', { cache: 'no-store' })).json();
  eq(m.display, 'standalone');
  ok(m.start_url && m.scope);
  ok(m.icons.some(i => i.sizes === '192x192') && m.icons.some(i => i.sizes === '512x512'));
  for (const i of m.icons) ok((await fetch(i.src, { cache: 'no-store' })).ok, i.src);
});
test('PWA', 'в коде нет встроенных обработчиков onclick= (причина ошибки 1)', async () => {
  const text = await (await fetch('sw.js', { cache: 'no-store' })).text();
  const list = JSON.parse(text.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  for (const f of list.filter(p => /\.(js|html)$/.test(p))) {
    const code = await (await fetch(f, { cache: 'no-store' })).text();
    ok(!/\son[a-z]+\s*=\s*["'`]/i.test(code), `${f} содержит встроенный обработчик`);
  }
});

// ================= runner =================
async function run() {
  const out = document.getElementById('results');
  const results = [];
  for (const t of tests) {
    try { await t.fn(); results.push({ ...t, pass: true }); } catch (e) { results.push({ ...t, pass: false, error: e.message }); }
  }
  const failed = results.filter(r => !r.pass);
  let html = `<p class="${failed.length ? 'bad' : 'good'}"><b>${results.length - failed.length} из ${results.length} тестов пройдено</b> · версия ${esc(APP_VERSION)} · часовой пояс ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}</p>`;
  let group = '';
  for (const r of results) {
    if (r.group !== group) { group = r.group; html += `<h2>${esc(group)}</h2>`; }
    html += `<div class="${r.pass ? 'good' : 'bad'}">${r.pass ? '✓' : '✗'} ${esc(r.name)}${r.pass ? '' : `<br><small>${esc(r.error)}</small>`}</div>`;
  }
  out.innerHTML = html;
  window.__testResults = { done: true, total: results.length, passed: results.length - failed.length, failures: failed.map(f => ({ group: f.group, name: f.name, error: f.error })), names: results.map(r => `${r.group}: ${r.name}`) };
}
run();
