// Automated tests. Open tests.html in a browser (served over http/https):
// every line should be green. Uses an in-memory storage, so it never touches
// your real data.

import { dateKey, parseDateKey, isDateKey, isTime, isDateTime, addDays, weekKey, daysBetween, timeOf as timeOfDay } from './dates.js';
import { SCHEMA_VERSION, emptyDoc, normalizeDoc, countActive, newTask, findLostRecords } from './schema.js';
import { createMemoryAdapter, KEYS } from './storage.js';
import { createStore, MAX_DAILY, MAX_ROLLBACK, KEEP_DAILY_WHEN_FULL } from './store.js';
import { buildBackupText, backupFileName, parseBackupText } from './backup.js';
import * as A from './actions.js';
import { overdueForReview, eventsForDay, buildDaySummary, eveningPreviewDue, unfinishedBefore, deletedRecords, tasksForDay } from './selectors.js';
import { APP_VERSION } from './version.js';
import { esc } from './util.js';
import { MODES, readAppearance, saveAppearance, applyAppearance } from './appearance.js';
import { naturalDay, planningDay, dayWindow, suggestCutoff } from './planday.js';
import { t, msg, m, setLang, getLang, readLanguage, saveLanguage, formatDay, formatDateTime, formatStamp, DICTS, addTexts, has, missing, LANGS } from './i18n.js';

setLang('ru'); // texts below are checked in Russian unless a test says otherwise

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
const dailyCopies = store => store.listSnapshots().filter(s => s.kind === 'daily');
const rollbackCopies = store => store.listSnapshots().filter(s => s.kind === 'rollback');
// One change on each of n following days → one daily copy per day.
function changeOnDays(store, clock, n) {
  for (let i = 0; i < n; i++) { clock.addDays(1); A.addTasksFromText(store, 'день ' + i); }
}

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
  eq(r.quarantined[0].reason, 'reason.dupId');
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
  ok(store.status.notices.some(n => msg(n).includes('Перенесены')));
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
  ok(msg(store.status.saveError).includes('память'), 'сообщение об ошибке');
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
  ok(store.status.notices.some(n => msg(n).includes('отменено')));
});
test('Хранилище', 'ошибка внутри действия отменяет его', () => {
  const { store } = setup();
  eq(A.setTaskDone(store, 'нет-такой', true), false);
  ok(store.status.notices.some(n => msg(n).includes('не найден')));
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
test('Хранилище', `ежедневных копий не больше ${MAX_DAILY}: по одной в день, самые новые`, () => {
  const { store, clock } = setup();
  A.addTasksFromText(store, 'A');
  changeOnDays(store, clock, MAX_DAILY + 3);
  const daily = dailyCopies(store);
  eq(daily.length, MAX_DAILY);
  eq(new Set(daily.map(s => s.at.slice(0, 10))).size, MAX_DAILY, 'разные дни');
  eq(daily[0].counts.tasks, MAX_DAILY + 3, 'самая новая — состояние до сегодняшнего изменения');
});
test('Хранилище', `копий для отката не больше ${MAX_ROLLBACK}; ежедневные они не вытесняют`, () => {
  const { store, clock } = setup();
  A.addTasksFromText(store, 'A');
  changeOnDays(store, clock, 2);
  for (let i = 0; i < MAX_ROLLBACK + 4; i++) { clock.addMinutes(1); A.addTasksFromText(store, 'r' + i); store.takeRollback('manual'); }
  eq(rollbackCopies(store).length, MAX_ROLLBACK);
  eq(dailyCopies(store).length, 2, 'ежедневные копии на месте');
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
test('Хранилище', 'при нехватке места старые ежедневные копии уступают место данным; копии для отката не трогаются', () => {
  const { store, storage, clock } = setup();
  A.addTasksFromText(store, 'A');
  changeOnDays(store, clock, MAX_DAILY);
  store.takeRollback('manual');
  failWrites(storage, KEYS.data, 'quota', 1);
  A.addTasksFromText(store, 'B');
  eq(store.status.saveError, '');
  eq(dailyCopies(store).length, KEEP_DAILY_WHEN_FULL);
  eq(rollbackCopies(store).length, 1, 'копия для отката на месте');
  eq(savedDoc(storage).tasks.length, MAX_DAILY + 2);
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
  ok(res.error && msg(res.error).includes('не изменены'), 'понятная причина');
  eq(titles(store), ['текущая'], 'в памяти прежние данные');
  eq(storage.get(KEYS.data), before, 'в хранилище прежние данные');
  eq(store.status.saveError, '', 'нет ложного «изменения только в памяти»');
  ok(!store.status.notices.some(n => msg(n).startsWith('Импорт выполнен')), 'нет сообщения об успехе');
  ok(store.status.notices.some(n => msg(n).startsWith('Импорт не выполнен')));
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
  ok(!store.status.notices.some(n => msg(n).startsWith('Данные восстановлены')));
  healWrites(storage);
  eq(store.restoreSnapshot(target).ok, true);
  eq(titles(store), ['A']);
});
test(G, 'восстановление самой старой копии при полном списке: копия не вытесняется', () => {
  const { store, storage, clock } = setup();
  A.addTasksFromText(store, 'A');
  for (let i = 0; i < MAX_ROLLBACK; i++) { clock.addMinutes(1); A.addTasksFromText(store, 'r' + i); store.takeRollback('manual'); }
  const oldest = store.listSnapshots().at(-1).id;
  clock.addMinutes(1);
  A.addTasksFromText(store, 'B');
  failWrites(storage, KEYS.data, 'quota');
  eq(store.restoreSnapshot(oldest, { dropConfirmed: true }).ok, false);
  ok(store.listSnapshots().some(s => s.id === oldest), 'самая старая копия на месте');
  eq(rollbackCopies(store).length, MAX_ROLLBACK);
});
test(G, 'две автокопии в одну и ту же миллисекунду различаются: восстанавливается выбранная', () => {
  const { store } = setup();
  A.addTasksFromText(store, 'первая');
  store.takeRollback('manual');
  A.addTasksFromText(store, 'вторая');
  store.takeRollback('manual');
  const [newer, older] = store.listSnapshots();
  eq(newer.at, older.at, 'одинаковое время (часы стоят)');
  ok(newer.id !== older.id);
  eq(store.restoreSnapshot(older.id).ok, true);
  eq(titles(store), ['первая']);
});
test(G, 'нехватка места: если и после удаления старых автокопий не сохранилось — копии возвращены', () => {
  const { store, storage, clock } = setup();
  A.addTasksFromText(store, 'A');
  changeOnDays(store, clock, MAX_DAILY);
  failWrites(storage, KEYS.data, 'quota');
  A.addTasksFromText(store, 'B');
  ok(store.status.saveError, 'ошибка показана');
  eq(dailyCopies(store).length, MAX_DAILY, 'автокопии не потеряны');
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
test(G, 'нечитаемые копии для отката не перезаписываются, если их не удалось спасти', () => {
  const { store, storage } = setup();
  A.addTasksFromText(store, 'A');
  storage.set(KEYS.rollback, '{испорчено');
  failWrites(storage, KEYS.rescue, 'quota');
  eq(store.takeRollback('manual'), false);
  eq(storage.get(KEYS.rollback), '{испорчено');
  healWrites(storage);
  eq(store.takeRollback('manual'), true, 'после спасения запись разрешена');
  eq(store.rescueList()[0].raw, '{испорчено');
  eq(store.listSnapshots().length, 1);
});
test(G, 'нечитаемые ежедневные копии не перезаписываются, если их не удалось спасти', () => {
  const { store, storage, clock } = setup();
  A.addTasksFromText(store, 'A');
  storage.set(KEYS.snapshots, '{испорчено');
  failWrites(storage, KEYS.rescue, 'quota');
  clock.addDays(1);
  A.addTasksFromText(store, 'B');
  eq(storage.get(KEYS.snapshots), '{испорчено');
  eq(savedDoc(storage).tasks.length, 2, 'сами данные сохранены');
  healWrites(storage);
  clock.addDays(1);
  A.addTasksFromText(store, 'C');
  eq(store.rescueList()[0].raw, '{испорчено');
  eq(dailyCopies(store).length, 1);
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
  ok(!s.status.notices.some(n => msg(n).startsWith('Перенесены')), 'нет ложного «перенесены»');
  ok(s.status.notices.some(n => msg(n).includes('не удалось')));
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

// ================= interface language (0.3.0, step A) =================
const L = 'Язык интерфейса';
const placeholders = str => [...new Set([...String(str).matchAll(/\{(\w+)/g)].map(x => x[1]))].sort().join(',');
test(L, 'русский и английский словари содержат одинаковые ключи', () => {
  const ru = Object.keys(DICTS.ru).sort(), en = Object.keys(DICTS.en).sort();
  eq(ru.filter(k => !DICTS.en[k]), [], 'нет в английском');
  eq(en.filter(k => !DICTS.ru[k]), [], 'нет в русском');
});
test(L, 'подстановки {…} совпадают в обоих языках', () => {
  const bad = Object.keys(DICTS.ru).filter(k => placeholders(DICTS.ru[k]) !== placeholders(DICTS.en[k]));
  eq(bad, []);
});
test(L, 'по умолчанию русский; определения языка по устройству нет', () => {
  eq(readLanguage(createMemoryAdapter()), 'ru');
  eq(readLanguage(createMemoryAdapter({ [KEYS.language]: 'de' })), 'ru', 'неизвестный язык → русский');
  const broken = createMemoryAdapter(); broken.failReads = true;
  eq(readLanguage(broken), 'ru');
});
test(L, 'выбор языка сохраняется; сбой записи сообщается', () => {
  const s = createMemoryAdapter();
  ok(saveLanguage(s, 'en')); eq(readLanguage(s), 'en');
  ok(saveLanguage(s, 'ru')); eq(readLanguage(s), 'ru');
  s.failWrites = true;
  eq(saveLanguage(s, 'en'), false);
});
test(L, 'смена языка не трогает данные, автокопии и сведения устройства', () => {
  const { store, storage } = setup();
  A.addTasksFromText(store, 'A');
  const before = [KEYS.data, KEYS.snapshots, KEYS.device, KEYS.appearance].map(k => storage.get(k));
  saveLanguage(storage, 'en'); saveLanguage(storage, 'ru');
  eq([KEYS.data, KEYS.snapshots, KEYS.device, KEYS.appearance].map(k => storage.get(k)), before);
  ok(!buildBackupText(store.doc, NOW).includes(KEYS.language), 'не входит в резервную копию');
});
test(L, 'русские формы множественного числа (1, 2, 5, 11, 21, 22, 25, 111, 1.5)', () => {
  addTexts({ 'test.plural': '{n} {n|задача|задачи|задач}' }, { 'test.plural': '{n} {n|task|tasks}' });
  const ru = [1, 2, 5, 11, 21, 22, 25, 111, 1.5].map(n => t('test.plural', { n }));
  eq(ru, ['1 задача', '2 задачи', '5 задач', '11 задач', '21 задача', '22 задачи', '25 задач', '111 задач', '1.5 задачи']);
  setLang('en');
  const en = [0, 1, 2].map(n => t('test.plural', { n }));
  setLang('ru');
  eq(en, ['0 tasks', '1 task', '2 tasks']);
});
test(L, 'даты словами на обоих языках', () => {
  eq([formatDay('2026-10-09'), formatDateTime('2026-10-09T10:00')], ['пт, 9 окт', 'пт, 9 окт, 10:00']);
  setLang('en');
  const en = [formatDay('2026-10-09'), formatDateTime('2026-10-09T10:00'), t('today.title', { day: { $day: '2026-10-11' } })];
  setLang('ru');
  eq(en, ['Fri, 9 Oct', 'Fri, 9 Oct, 10:00', 'Today · Sun, 11 Oct']);
});
test(L, 'старые русские причины из сохранённых данных показываются как есть', () => {
  missing.clear();
  eq(msg('нет или неверное время начала'), 'нет или неверное время начала');
  setLang('en');
  const shown = msg('нет или неверное время начала');
  setLang('ru');
  eq(shown, 'нет или неверное время начала');
  eq(missing.size, 0, 'старый текст не считается пропущенным ключом');
});
test(L, 'сообщения хранилища — ключи и переводятся на оба языка', () => {
  const { store, storage, clock } = setup();
  A.addTasksFromText(store, 'старая');
  clock.addDays(1);
  A.addTasksFromText(store, 'новая');
  storage.set(KEYS.data, '{damaged');
  const s2 = createStore({ storage, clock }); s2.load();
  const n = s2.status.notices.find(x => x.level === 'error');
  eq(n.key, 'notice.recoveredFromCopy');
  ok(msg(n).startsWith('Основные данные не читаются (текст повреждён)'));
  setLang('en');
  const en = msg(n);
  setLang('ru');
  ok(en.startsWith('The main data cannot be read (text is damaged)'), en);
  ok(!/[Ѐ-ӿ]/.test(en), 'в английском нет кириллицы');
});
test(L, 'каждая причина проверки данных переведена', () => {
  const bad = [null, 5, { title: 'x' }, { id: 'a' }, { id: 'a', title: 'x', plan: 1 }, { id: 'a', title: 'x', plan: { kind: 'day', date: 'x' } }];
  const reasons = new Set();
  for (const r of bad) {
    for (const c of ['tasks', 'events', 'projects', 'lists']) {
      const res = normalizeDoc({ ...emptyDoc(NOW), [c]: [r] }, { now: NOW });
      res.quarantined.forEach(q => reasons.add(q.reason));
    }
  }
  ok(reasons.size >= 5, 'проверено разных причин: ' + reasons.size);
  eq([...reasons].filter(r => !DICTS.ru[r] || !DICTS.en[r]), []);
  for (const f of [null, { a: 1 }, { schemaVersion: 'x', tasks: [] }]) ok(has(normalizeDoc(f, { now: NOW }).fatal), 'fatal переведён');
});
test(L, 'ошибки импорта — ключи на обоих языках', () => {
  const { store } = setup();
  const p = store.previewImport('not json');
  eq(msg(p.error), 'Это не корректный JSON-файл.');
  setLang('en');
  const en = msg(p.error);
  setLang('ru');
  eq(en, 'This is not a valid JSON file.');
});
test(L, 'в коде нет русского текста интерфейса вне i18n.js (кроме boot.js)', async () => {
  const sw = await (await fetch('sw.js', { cache: 'no-store' })).text();
  const files = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"')).filter(f => f.endsWith('.js') && !/i18n\.js|boot\.js/.test(f));
  const found = [];
  for (const f of files) {
    const code = (await (await fetch(f, { cache: 'no-store' })).text())
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
    const lines = code.split('\n').filter(l => /[Ѐ-ӿ]/.test(l));
    if (lines.length) found.push(`${f}: ${lines[0].trim().slice(0, 60)}`);
  }
  eq(found, []);
});
test(L, 'boot.js читает тот же ключ языка, что и приложение', async () => {
  const text = await (await fetch('boot.js', { cache: 'no-store' })).text();
  ok(text.includes(`getItem('${KEYS.language}')`));
});

// ================= personal planning day (0.3.0, step B) =================
const P = 'Плановый день';
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi, 0, 0);
test(P, 'пример владельца: отбой в 03:00 — суббота 02:30 ещё пятница', () => {
  eq(naturalDay(at(2026, 10, 10, 2, 30), '03:00'), '2026-10-09');
  eq(naturalDay(at(2026, 10, 10, 2, 59), '03:00'), '2026-10-09');
  eq(naturalDay(at(2026, 10, 10, 3, 0), '03:00'), '2026-10-10');
  eq(naturalDay(at(2026, 10, 9, 23, 59), '03:00'), '2026-10-09');
  eq(naturalDay(at(2026, 10, 10, 0, 0), '03:00'), '2026-10-09', 'полночь ничего не меняет');
});
test(P, 'конец месяца, конец года, 29 февраля', () => {
  eq(naturalDay(at(2026, 11, 1, 2, 0), '03:00'), '2026-10-31');
  eq(naturalDay(at(2027, 1, 1, 1, 0), '03:00'), '2026-12-31');
  eq(naturalDay(at(2028, 3, 1, 1, 0), '03:00'), '2028-02-29');
  eq(naturalDay(at(2028, 2, 29, 2, 59), '03:00'), '2028-02-28');
  eq(naturalDay(at(2028, 2, 29, 3, 0), '03:00'), '2028-02-29');
});
test(P, 'вечерний отбой (23:00): день заканчивается до полуночи', () => {
  eq(naturalDay(at(2026, 10, 9, 22, 59), '23:00'), '2026-10-09');
  eq(naturalDay(at(2026, 10, 9, 23, 0), '23:00'), '2026-10-10');
  eq(naturalDay(at(2026, 10, 10, 0, 30), '23:00'), '2026-10-10');
  eq(naturalDay(at(2026, 12, 31, 23, 30), '23:00'), '2027-01-01', 'через Новый год');
  eq(naturalDay(at(2028, 2, 28, 23, 30), '23:00'), '2028-02-29');
});
test(P, 'отбой 00:00 (если онбординг пропущен) = календарная дата, как до 0.3.0', () => {
  for (let m = 0; m < 3 * 1440; m += 7) {
    const d = new Date(at(2026, 10, 24, 0, 0).getTime() + m * 60000);
    if (naturalDay(d, '00:00') !== dateKey(d)) throw new Error('расхождение в ' + d.toString());
  }
});
test(P, 'рядом с полднем: 11:59 — утренний отбой, 12:00 — вечерний', () => {
  eq(naturalDay(at(2026, 10, 10, 11, 0), '11:59'), '2026-10-09');
  eq(naturalDay(at(2026, 10, 10, 11, 59), '11:59'), '2026-10-10');
  eq(naturalDay(at(2026, 10, 10, 11, 59), '12:00'), '2026-10-10');
  eq(naturalDay(at(2026, 10, 10, 12, 0), '12:00'), '2026-10-11');
});
test(P, 'переходы на летнее и зимнее время: день меняется ровно раз и никогда не идёт назад', () => {
  // Sweeps every real minute around EU and US clock changes in whatever time zone the test runs in.
  const nights = [[2026, 10, 25], [2027, 3, 28], [2026, 11, 1], [2027, 3, 14]];
  const cutoffs = ['00:00', '01:30', '02:30', '03:00', '03:30', '04:00', '23:00'];
  for (const [y, mo, d] of nights) {
    const start = at(y, mo, d - 2, 12, 0).getTime();
    for (const c of cutoffs) {
      let prev = naturalDay(new Date(start), c), changes = 0;
      for (let ms = start; ms <= start + 4 * 864e5; ms += 60000) {
        const now = new Date(ms);
        const day = naturalDay(now, c);
        if (day < prev) throw new Error(`день пошёл назад: ${c}, ${now.toString()}`);
        if (day !== prev) {
          changes++;
          if (day !== addDays(prev, 1)) throw new Error(`пропущен день: ${c}, ${now.toString()}`);
          const before = new Date(ms - 60000);
          if (c < '12:00' && c !== '00:00' && timeOfDay(now) < c && dateKey(now) === dateKey(before)) throw new Error(`смена раньше отбоя: ${c}, ${now.toString()}`);
        }
        prev = day;
      }
      if (changes !== 4) throw new Error(`за 4 суток день сменился ${changes} раз (отбой ${c}, ночь ${y}-${mo}-${d})`);
    }
  }
});
test(P, 'окно дня совпадает с правилом дня (события по ту сторону полуночи)', () => {
  for (const c of ['00:00', '03:00', '23:00']) {
    const w = dayWindow('2026-10-09', c);
    for (let m = -1440; m < 2 * 1440; m += 13) {
      const d = new Date(at(2026, 10, 9, 0, 0).getTime() + m * 60000);
      const s = `${dateKey(d)}T${timeOfDay(d)}`;
      const inWindow = s >= w.start && s < w.end;
      if (inWindow !== (naturalDay(d, c) === '2026-10-09')) throw new Error(`окно и правило расходятся: ${c} ${s}`);
    }
  }
  eq(dayWindow('2026-10-09', '03:00'), { start: '2026-10-09T03:00', end: '2026-10-10T03:00' });
  eq(dayWindow('2026-10-09', '23:00'), { start: '2026-10-08T23:00', end: '2026-10-09T23:00' });
});
test(P, 'предложенный отбой = время отхода ко сну; без него — 00:00', () => {
  eq(suggestCutoff('01:30'), '01:30');
  eq(suggestCutoff('22:45'), '22:45');
  eq(suggestCutoff(null), '00:00');
  eq(suggestCutoff('25:00'), '00:00');
});
test(P, '«Завершить день»: на день вперёд, не больше; устаревшая отметка не действует', () => {
  const night = at(2026, 10, 9, 22, 0);
  eq(planningDay(night, '03:00', '2026-10-09'), '2026-10-10');
  eq(planningDay(night, '03:00', '2026-10-08'), '2026-10-09', 'старая отметка');
  eq(planningDay(at(2026, 10, 10, 3, 0), '03:00', '2026-10-09'), '2026-10-10', 'после отбоя — обычный день');
});
function dayStore(y, mo, d, h, mi, cutoff) {
  const r = setup({}, [y, mo, d]);
  r.clock.set(y, mo, d, h, mi);
  A.finishOnboarding(r.store, { wake: '', bed: '', cutoff });
  return r;
}
test(P, 'просрочка следует плановому дню: в 01:30 пятничная задача ещё не просрочена', () => {
  const { store, clock } = dayStore(2026, 10, 9, 20, 0, '03:00');
  A.addTasksFromText(store, 'пятничная', 'day');
  eq(store.doc.tasks[0].plan.date, '2026-10-09');
  clock.set(2026, 10, 10, 1, 30);
  eq(store.planningToday(), '2026-10-09');
  eq(overdueForReview(store.doc, store.planningToday()).length, 0, 'после полуночи не просрочена');
  clock.set(2026, 10, 10, 3, 1);
  eq(store.planningToday(), '2026-10-10');
  eq(overdueForReview(store.doc, store.planningToday()).length, 1, 'после отбоя — в утреннем разборе');
});
test(P, 'в 01:30 «на сегодня» и «Сегодня» в разборе означают плановый день (пятницу)', () => {
  const { store, clock } = dayStore(2026, 10, 9, 20, 0, '03:00');
  clock.set(2026, 10, 10, 1, 30);
  A.addTasksFromText(store, 'ночная', 'day');
  eq(store.doc.tasks[0].plan.date, '2026-10-09');
  A.moveTask(store, store.doc.tasks[0].id, 'week');
  eq(store.doc.tasks[0].plan.date, '2026-10-05');
});
test(P, 'реальные даты не меняются: событие, дедлайн и метки времени', () => {
  const { store, clock } = dayStore(2026, 10, 9, 20, 0, '03:00');
  clock.set(2026, 10, 10, 1, 30);
  A.addEvent(store, { title: 'ночью', start: '2026-10-10T01:00' });
  A.addTasksFromText(store, 'с дедлайном', 'day');
  store.update('дедлайн', d => { d.tasks[0].deadline = '2026-10-10'; });
  eq(store.doc.events[0].start, '2026-10-10T01:00');
  eq(store.doc.tasks[0].deadline, '2026-10-10');
  eq(store.doc.tasks[0].createdAt, new Date(2026, 9, 10, 1, 30).toISOString(), 'метка времени — настоящее время');
  const w = dayWindow(store.planningToday(), '03:00');
  ok(store.doc.events[0].start >= w.start && store.doc.events[0].start < w.end, 'ночное событие — в расписании пятницы');
});
test(P, '«Завершить день» и «Вернуть» в хранилище', () => {
  const { store, clock } = dayStore(2026, 10, 9, 22, 0, '03:00');
  A.addTasksFromText(store, 'не успела', 'day');
  ok(store.finishDay().ok);
  eq(store.planningToday(), '2026-10-10');
  eq(overdueForReview(store.doc, store.planningToday()).length, 1);
  eq(store.finishDay().already, true, 'нельзя завершить ещё один день вперёд');
  ok(store.undoFinishDay().ok);
  eq(store.planningToday(), '2026-10-09');
  store.finishDay();
  clock.set(2026, 10, 10, 3, 0);
  eq(store.planningToday(), '2026-10-10', 'после отбоя отметка больше не действует');
  ok(!store.dayFinishedEarly());
});
test(P, 'онбординг: отбой по умолчанию = время сна; пропуск = 00:00', () => {
  const a = setup();
  eq(a.store.doc.settings.day.setupDone, false);
  A.finishOnboarding(a.store, { wake: '09:00', bed: '01:30', cutoff: '' });
  eq(a.store.doc.settings.day, { wake: '09:00', bed: '01:30', cutoff: '01:30', setupDone: true });
  const b = setup();
  A.skipOnboarding(b.store);
  eq(b.store.doc.settings.day, { wake: null, bed: null, cutoff: '00:00', setupDone: true });
  const c = setup();
  eq(A.finishOnboarding(c.store, { wake: '9', bed: '', cutoff: '' }), false, 'неверное время отклонено');
  eq(c.store.doc.settings.day.setupDone, false);
});
test(P, 'изменение отбоя вручную меняет только показ, не данные', () => {
  const { store } = dayStore(2026, 10, 9, 20, 0, '00:00');
  A.addTasksFromText(store, 'A', 'day');
  const before = JSON.stringify(store.doc.tasks);
  A.setDaySettings(store, { wake: '08:00', bed: '02:00', cutoff: '04:00' });
  eq(store.doc.settings.day.cutoff, '04:00');
  eq(JSON.stringify(store.doc.tasks), before);
});

// ================= data migration (0.3.0) =================
const MG = 'Перенос данных';
const V2_DOC = {
  schemaVersion: 2, createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-09T09:00:00.000Z',
  tasks: [
    { ...newTask({ id: 't1', title: 'Задача с дедлайном', plan: { kind: 'day', date: '2026-10-06' }, now: NOW }), deadline: '2026-10-20' },
    { ...newTask({ id: 't2', title: 'Сделана', plan: { kind: 'week', date: '2026-10-05' }, now: NOW }), done: true, completedAt: NOW },
    { ...newTask({ id: 't3', title: 'Удалена', plan: { kind: 'none' }, now: NOW }), deletedAt: NOW, extra: 'сохранить' }
  ],
  events: [{ id: 'e1', title: 'Лекция', start: '2026-10-09T10:00', end: null, allDay: false, repeat: null, alerts: [], createdAt: NOW, updatedAt: NOW, deletedAt: null }],
  projects: [{ id: 'p1', name: 'Диплом', milestones: [{ id: 'm1', title: 'План', done: true, createdAt: NOW, updatedAt: NOW, deletedAt: null }], quantity: { current: 7, total: 12, unit: 'глав' }, createdAt: NOW, updatedAt: NOW, deletedAt: null }],
  lists: [{ id: 'l1', name: 'Покупки', items: [{ id: 'i1', title: 'Молоко', done: false, createdAt: NOW, updatedAt: NOW, deletedAt: null }], createdAt: NOW, updatedAt: NOW, deletedAt: null }],
  settings: { eveningPreview: { enabled: true, time: '22:00' } },
  quarantine: [{ at: NOW, source: 'import', collection: 'events', parentId: null, reason: 'нет или неверное время начала', record: { id: 'x' } }]
};
test(MG, 'v2 → v3: все записи и поля без изменений, добавлены настройки дня', () => {
  const r = normalizeDoc(V2_DOC, { now: NOW });
  eq(r.migratedFrom, 2);
  eq(r.doc.schemaVersion, 3);
  for (const k of ['tasks', 'events', 'projects', 'lists', 'quarantine']) eq(r.doc[k], V2_DOC[k], k);
  eq(r.doc.settings.eveningPreview, { enabled: true, time: '22:00' });
  eq(r.doc.settings.day, { wake: null, bed: null, cutoff: '00:00', setupDone: false });
  eq([r.doc.createdAt, r.doc.updatedAt], [V2_DOC.createdAt, V2_DOC.updatedAt]);
});
test(MG, 'v1 (прототип) → v3 одной цепочкой', () => {
  const r = normalizeDoc(PROTOTYPE, { now: NOW });
  eq(r.migratedFrom, 1);
  eq(r.doc.schemaVersion, 3);
  eq(countActive(r.doc), { tasks: 3, events: 1, projects: 1, lists: 1 });
  eq(r.doc.settings.day.cutoff, '00:00');
});
test(MG, 'v2 в хранилище: при запуске сохраняется как v3, ничего не теряется, поведение то же', () => {
  const { store, storage } = setup({ [KEYS.data]: JSON.stringify(V2_DOC) });
  const saved = JSON.parse(storage.get(KEYS.data));
  eq(saved.schemaVersion, 3);
  eq(saved.tasks, V2_DOC.tasks);
  eq(store.planningToday(), '2026-10-09', 'отбой 00:00 = календарная дата');
  eq(overdueForReview(store.doc, store.planningToday()).map(x => x.id), ['t1']);
});
test(MG, 'резервная копия 0.2.x импортируется в 0.3.0', () => {
  const { store } = setup();
  const p = store.previewImport(JSON.stringify({ app: 'organizer', kind: 'backup', appVersion: '0.2.2', schemaVersion: 2, exportedAt: NOW, data: V2_DOC }));
  ok(p.ok);
  eq(p.doc.schemaVersion, 3);
  eq(p.counts, { tasks: 2, events: 1, projects: 1, lists: 1 });
});
test(MG, 'автокопия формата v2 восстанавливается', () => {
  const snap = [{ id: 'old', at: '2026-10-08T09:00:00.000Z', reason: 'daily', schemaVersion: 2, data: V2_DOC }];
  const { store } = setup({ [KEYS.snapshots]: JSON.stringify(snap) });
  A.addTasksFromText(store, 'текущая');
  eq(store.restoreSnapshot('old').ok, true);
  eq(store.doc.tasks.length, 3);
  eq(store.doc.schemaVersion, 3);
});
test(MG, 'данные v4 (будущая версия) не трогаются: только чтение', () => {
  const raw = JSON.stringify({ ...V2_DOC, schemaVersion: 4 });
  const { store, storage } = setup({ [KEYS.data]: raw });
  ok(store.status.readOnly);
  eq(storage.get(KEYS.data), raw);
});
test(MG, 'неверное поле настроек дня сбрасывается только оно само', () => {
  const r = normalizeDoc({ ...V2_DOC, schemaVersion: 3, settings: { day: { wake: '07:00', bed: 'поздно', cutoff: '25:00', setupDone: true } } }, { now: NOW });
  eq(r.doc.settings.day, { wake: '07:00', bed: null, cutoff: '00:00', setupDone: true });
});

// ================= data preservation on upgrade (release rules R1–R12) =================
const R = 'Сохранность данных при обновлении';
const V2_RAW = JSON.stringify(V2_DOC);

// Realistic 0.2.2 data: many records of every kind, done/deleted/week/someday
// tasks, deadlines, an event with a repeat rule, nested items, a quarantine.
function realisticV2() {
  const d = { schemaVersion: 2, createdAt: '2026-03-01T08:00:00.000Z', updatedAt: '2026-10-09T08:30:00.000Z', tasks: [], events: [], projects: [], lists: [], settings: { eveningPreview: { enabled: true, time: '21:00' } }, quarantine: [] };
  const kinds = ['day', 'week', 'none'];
  for (let i = 0; i < 60; i++) {
    const kind = kinds[i % 3];
    const date = kind === 'day' ? addDays('2026-10-01', i % 14) : kind === 'week' ? weekKey(addDays('2026-09-28', (i % 3) * 7)) : null;
    const t = newTask({ id: 'task-' + i, title: `Задача ${i} «кавычки» & <теги>`, plan: { kind, date }, now: '2026-09-' + String(10 + (i % 15)).padStart(2, '0') + 'T10:00:00.000Z' });
    if (i % 4 === 0) { t.done = true; t.completedAt = '2026-10-0' + (1 + (i % 8)) + 'T18:00:00.000Z'; }
    if (i % 5 === 0) t.deadline = addDays('2026-10-15', i % 20);
    if (kind === 'day' && i % 6 === 0) { t.time = '09:30'; t.reminder = { minutesBefore: 10 }; }
    if (i % 11 === 0) t.deletedAt = '2026-10-05T12:00:00.000Z';
    if (i % 13 === 0) t.projectId = 'proj-1';
    d.tasks.push(t);
  }
  for (let i = 0; i < 12; i++) {
    d.events.push({ id: 'ev-' + i, title: 'Событие ' + i, start: addDays('2026-10-01', i) + 'T' + String(8 + i).padStart(2, '0') + ':15', end: null, allDay: false,
      repeat: i === 0 ? { freq: 'weekly', days: [1, 3], until: '2026-12-31', skip: ['2026-10-14'] } : null, alerts: i === 1 ? [{ minutesBefore: 30 }] : [],
      createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z', deletedAt: null });
  }
  for (let p = 1; p <= 3; p++) {
    d.projects.push({ id: 'proj-' + p, name: 'Проект ' + p, milestones: Array.from({ length: 4 }, (_, j) => ({ id: `ms-${p}-${j}`, title: `Этап ${j}`, done: j < p, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-03T10:00:00.000Z', deletedAt: j === 3 && p === 2 ? '2026-10-06T10:00:00.000Z' : null })),
      quantity: { current: p * 3, total: 20, unit: 'страниц' }, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', deletedAt: null });
  }
  for (let l = 1; l <= 4; l++) {
    d.lists.push({ id: 'list-' + l, name: 'Список ' + l, items: Array.from({ length: 6 }, (_, j) => ({ id: `it-${l}-${j}`, title: `Пункт ${j}`, done: j % 2 === 0, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z', deletedAt: null })),
      createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z', deletedAt: null });
  }
  d.quarantine.push({ at: '2026-09-20T10:00:00.000Z', source: 'import', collection: 'tasks', parentId: null, reason: 'reason.badPlanDate', record: { id: 'old-bad', title: 'плохая дата' } });
  return d;
}

test(R, 'реалистичные данные 0.2.2: после обновления каждая запись и каждое поле на месте', () => {
  const v2 = realisticV2();
  const raw = JSON.stringify(v2);
  const device = JSON.stringify({ lastBackupAt: '2026-10-08T20:00:00.000Z', lastDailySnapshot: '2026-10-08' });
  const { store, storage } = setup({ [KEYS.data]: raw, [KEYS.appearance]: 'dark', [KEYS.language]: 'en', [KEYS.device]: device });
  ok(!store.status.readOnly);
  const saved = savedDoc(storage);
  eq(saved.schemaVersion, SCHEMA_VERSION);
  for (const k of ['tasks', 'events', 'projects', 'lists', 'quarantine']) eq(saved[k], v2[k], k);
  eq(saved.settings.eveningPreview, v2.settings.eveningPreview);
  eq([saved.createdAt, saved.updatedAt], [v2.createdAt, v2.updatedAt]);
  ok(saved.dataId, 'органайзер получил свой dataId');
  eq(storage.get(KEYS.appearance), 'dark', 'оформление не тронуто');
  eq(storage.get(KEYS.language), 'en', 'язык не тронут');
  eq(JSON.parse(storage.get(KEYS.device)).lastBackupAt, '2026-10-08T20:00:00.000Z', 'дата последнего экспорта не тронута');
  eq(store.doc.tasks.filter(t => t.done).length, 15, 'выполненные задачи');
  eq(store.doc.tasks.filter(t => t.deadline).length, 12, 'дедлайны');
  eq(store.doc.events[0].repeat, v2.events[0].repeat, 'правило повтора');
});
test(R, 'перед обновлением исходный текст сохраняется как копия для отката — точно как был', () => {
  const { store, storage } = setup({ [KEYS.data]: V2_RAW });
  const rb = JSON.parse(storage.get(KEYS.rollback));
  eq(rb.length, 1);
  eq(rb[0].reason, 'before-migration');
  eq(rb[0].schemaVersion, 2);
  eq(rb[0].raw, V2_RAW, 'текст копии совпадает с исходным побайтно');
  const shown = store.listSnapshots().find(c => c.reason === 'before-migration');
  eq([shown.kind, shown.ok, shown.counts.tasks], ['rollback', true, 2]);
  eq(store.snapshotText(shown.id), V2_RAW, 'скачивается исходный текст');
  ok(store.status.notices.some(n => n.key === 'notice.upgraded'), 'пользователь видит сообщение об обновлении');
});
test(R, 'откат к копии перед обновлением возвращает все прежние записи', () => {
  const { store } = setup({ [KEYS.data]: V2_RAW });
  A.addTasksFromText(store, 'после обновления');
  const id = store.listSnapshots().find(c => c.reason === 'before-migration').id;
  eq(store.restoreSnapshot(id).ok, true);
  eq(store.doc.tasks, normalizeDoc(V2_DOC, { now: NOW }).doc.tasks);
});
test(R, 'копия перед обновлением не вытесняется импортами и восстановлениями', () => {
  const { store, clock } = setup({ [KEYS.data]: V2_RAW });
  for (let i = 0; i < MAX_ROLLBACK + 3; i++) {
    clock.addMinutes(1);
    const file = { ...PROTOTYPE, tasks: [...PROTOTYPE.tasks, { id: 'x' + i, name: 'импорт ' + i, scope: 'none', done: false }] };
    eq(store.applyImport(store.previewImport(JSON.stringify(file)), { dropConfirmed: true }).ok, true);
  }
  eq(rollbackCopies(store).length, MAX_ROLLBACK);
  ok(rollbackCopies(store).some(c => c.reason === 'before-migration'), 'копия перед обновлением на месте');
});
test(R, 'если сохранить обновлённые данные не удалось — копия не дублируется, обновление повторится', () => {
  const storage = createMemoryAdapter({ [KEYS.data]: V2_RAW });
  const clock = makeClock(2026, 10, 9);
  failWrites(storage, KEYS.data, 'quota');
  const s1 = createStore({ storage, clock }); s1.load();
  ok(s1.status.saveError, 'ошибка видна');
  eq(storage.get(KEYS.data), V2_RAW, 'исходные данные не тронуты');
  healWrites(storage);
  const s2 = createStore({ storage, clock }); s2.load();
  eq(savedDoc(storage).schemaVersion, SCHEMA_VERSION);
  eq(JSON.parse(storage.get(KEYS.rollback)).filter(c => c.reason === 'before-migration').length, 1, 'одна копия');
});
test(R, 'нет места для копии — обновление остановлено: только чтение, ничего не изменено, есть выход', () => {
  const storage = createMemoryAdapter({ [KEYS.data]: V2_RAW });
  failWrites(storage, KEYS.rollback, 'quota');
  const clock = makeClock(2026, 10, 9);
  const store = createStore({ storage, clock });
  store.load();
  ok(store.status.readOnly);
  eq(store.status.stopped, 'ro.upgradeNoCopy');
  eq(store.status.blockedRaw, V2_RAW, 'исходный текст можно скачать');
  eq(storage.get(KEYS.data), V2_RAW, 'данные не тронуты');
  eq(store.doc.tasks.length, 3, 'данные видны (только чтение) и экспортируются');
  eq(A.addTasksFromText(store, 'x'), false, 'изменения запрещены');
  ok(!store.listSnapshots().length && !storage.get(KEYS.rollback));
  // Recovery option: the user downloaded the original and continues without the copy.
  eq(store.continueUpgradeWithoutCopy().ok, true);
  ok(!store.status.readOnly);
  eq(savedDoc(storage).schemaVersion, SCHEMA_VERSION);
  eq(savedDoc(storage).tasks, V2_DOC.tasks);
});
test(R, 'продолжить без копии можно только в этой ситуации', () => {
  const { store } = setup({ [KEYS.data]: V2_RAW });
  eq(store.continueUpgradeWithoutCopy().ok, false);
  const future = setup({ [KEYS.data]: JSON.stringify({ ...V2_DOC, schemaVersion: SCHEMA_VERSION + 1 }) });
  eq(future.store.continueUpgradeWithoutCopy().ok, false);
  ok(future.store.status.readOnly);
});
test(R, 'для копии перед обновлением освобождается место за счёт старых ежедневных копий', () => {
  const daily = Array.from({ length: 5 }, (_, i) => ({ id: 'd' + i, at: `2026-10-0${8 - i}T09:00:00.000Z`, reason: 'daily', schemaVersion: 2, data: V2_DOC }));
  const legacy = { id: 'imp', at: '2026-10-02T09:00:00.000Z', reason: 'before-import', schemaVersion: 2, data: V2_DOC };
  const storage = createMemoryAdapter({ [KEYS.data]: V2_RAW, [KEYS.snapshots]: JSON.stringify([...daily, legacy]) });
  storage.failKey = k => (k === KEYS.rollback && JSON.parse(storage.get(KEYS.snapshots)).filter(c => c.reason === 'daily').length > KEEP_DAILY_WHEN_FULL ? 'quota' : null);
  const store = createStore({ storage, clock: makeClock(2026, 10, 9) });
  store.load();
  ok(!store.status.readOnly);
  eq(JSON.parse(storage.get(KEYS.rollback))[0].raw, V2_RAW);
  eq(dailyCopies(store).map(c => c.id), ['d0', 'd1'], 'остались самые новые ежедневные');
  ok(rollbackCopies(store).some(c => c.id === 'imp'), 'копия 0.2.x «перед импортом» не удалена');
  ok(store.status.notices.some(n => n.key === 'notice.trimmedCopies'), 'об этом сказано');
});
test(R, 'ошибка в коде обновления — ничего не записывается, только чтение', () => {
  const storage = createMemoryAdapter({ [KEYS.data]: V2_RAW });
  const store = createStore({ storage, clock: makeClock(2026, 10, 9), normalize: () => { throw new Error('ошибка в миграции'); } });
  store.load();
  ok(store.status.readOnly);
  eq(store.status.stopped, 'ro.upgradeFailed');
  eq(store.status.blockedRaw, V2_RAW);
  eq(storage.dump(), { [KEYS.data]: V2_RAW }, 'в хранилище ничего не записано');
  ok(!needsEmptyOrganizer(store), 'пустой органайзер не подсовывается молча');
});
// After a failed upgrade the app must not look like a fresh empty organizer without explanation.
function needsEmptyOrganizer(store) { return !store.status.readOnly && store.doc.tasks.length === 0; }
for (const [what, damage] of [
  ['пропала задача', r => r.doc.tasks.pop()],
  ['изменилось название', r => { r.doc.tasks[0].title = ''; }],
  ['снялась отметка «готово»', r => { r.doc.tasks[1].done = false; }],
  ['пропал пункт списка', r => r.doc.lists[0].items.pop()],
  ['пропал этап проекта', r => r.doc.projects[0].milestones.pop()],
  ['пропал карантин', r => { r.doc.quarantine = []; }]
]) {
  test(R, `обновление, при котором ${what}, останавливается до записи`, () => {
    const storage = createMemoryAdapter({ [KEYS.data]: V2_RAW });
    const normalize = (input, opts) => { const r = normalizeDoc(input, opts); damage(r); return r; };
    const store = createStore({ storage, clock: makeClock(2026, 10, 9), normalize });
    store.load();
    ok(store.status.readOnly);
    eq(store.status.stopped, 'ro.upgradeFailed');
    eq(storage.dump(), { [KEYS.data]: V2_RAW }, 'ничего не записано');
  });
}
test(R, 'проверка «ничего не потеряно» пропускает правильные загрузки (с карантином и прототипом)', () => {
  eq(findLostRecords(V2_DOC, normalizeDoc(V2_DOC, { now: NOW })), null);
  eq(findLostRecords(PROTOTYPE, normalizeDoc(PROTOTYPE, { now: NOW })), null);
  const bad = { ...V2_DOC, events: [...V2_DOC.events, { id: 'bad', title: 'нет времени' }, V2_DOC.events[0]], lists: [{ ...V2_DOC.lists[0], items: [...V2_DOC.lists[0].items, { id: 'x' }] }] };
  eq(findLostRecords(bad, normalizeDoc(bad, { now: NOW })), null, 'плохие и повторные записи ушли в карантин');
  eq(findLostRecords(realisticV2(), normalizeDoc(realisticV2(), { now: NOW })), null);
  const notList = { ...V2_DOC, tasks: 'сломано' };
  eq(findLostRecords(notList, normalizeDoc(notList, { now: NOW })), null);
});
test(R, 'копии 0.2.x: ежедневные остаются, копии импорта и восстановления переходят в копии для отката', () => {
  const old = [
    { id: 'd1', at: '2026-10-08T09:00:00.000Z', reason: 'daily', data: V2_DOC },
    { id: 'i1', at: '2026-10-07T09:00:00.000Z', reason: 'before-import', data: V2_DOC },
    { id: 'r1', at: '2026-10-06T09:00:00.000Z', reason: 'before-restore', data: V2_DOC },
    { at: '2026-10-05T09:00:00.000Z', reason: 'daily', data: V2_DOC }
  ];
  const { store, storage } = setup({ [KEYS.data]: V2_RAW, [KEYS.snapshots]: JSON.stringify(old) });
  eq(JSON.parse(storage.get(KEYS.snapshots)).map(c => c.id || c.at), ['d1', '2026-10-05T09:00:00.000Z']);
  eq(JSON.parse(storage.get(KEYS.rollback)).map(c => c.reason), ['before-migration', 'before-import', 'before-restore']);
  eq(store.listSnapshots().length, 5, 'ни одна копия не потеряна');
});
test(R, 'старая копия без отметки о версии и повреждённая копия не мешают', () => {
  const copies = [{ at: '2026-10-08T09:00:00.000Z', reason: 'daily', data: V2_DOC }, { at: '2026-10-07T09:00:00.000Z', reason: 'daily', data: 'мусор' }];
  const { store } = setup({ [KEYS.data]: V2_RAW, [KEYS.snapshots]: JSON.stringify(copies) });
  const list = store.listSnapshots();
  eq(list.map(c => c.ok), [true, true, false]);
});
test(R, 'обновление сервис-воркера не трогает данные: в sw.js нет обращений к хранилищу данных', async () => {
  if (!canFetch) throw new Error('откройте tests.html через http(s)');
  const code = (await (await fetch('sw.js', { cache: 'no-store' })).text()).replace(/\/\/.*$/gm, '');
  ok(!/localStorage|indexedDB|organizer:|clear\(\)|clients\.matchAll|postMessage/.test(code), 'sw.js не обращается к данным');
  ok(/k\.startsWith\('organizer-'\) && k !== CACHE/.test(code), 'удаляются только старые кэши файлов приложения');
});

// ================= privacy (SECURITY.md) =================
const PR = 'Приватность';
test(R, 'старая копия без настроек дня не стирает ответы на первые вопросы', () => {
  const { store } = setup();
  A.finishOnboarding(store, { wake: '07:00', bed: '01:00', cutoff: '' });
  A.addTasksFromText(store, 'текущая');
  eq(store.applyImport(store.previewImport(JSON.stringify({ app: 'organizer', kind: 'backup', schemaVersion: 2, data: V2_DOC }))).ok, true);
  eq(store.doc.settings.day, { wake: '07:00', bed: '01:00', cutoff: '01:00', setupDone: true });
  eq(store.doc.settings.eveningPreview, V2_DOC.settings.eveningPreview, 'остальные настройки — из копии');
  const own = { ...savedDoc(createMemoryAdapter({ [KEYS.data]: JSON.stringify(store.doc) })), settings: { ...store.doc.settings, day: { wake: null, bed: '23:00', cutoff: '23:00', setupDone: true } } };
  eq(store.applyImport(store.previewImport(JSON.stringify(own))).ok, true);
  eq(store.doc.settings.day.cutoff, '23:00', 'копия 0.3.0 приносит свои настройки дня');
});
test(R, 'импорт спрашивает, прежде чем вытеснить копию для отката, данных которой больше нигде нет', () => {
  const { store, storage, clock } = setup();
  A.addTasksFromText(store, 'исходная');
  const imp = i => store.previewImport(JSON.stringify({ ...PROTOTYPE, tasks: [{ id: 'k' + i, name: 'файл ' + i, scope: 'none', done: false }] }));
  for (let i = 0; i < MAX_ROLLBACK; i++) { clock.addMinutes(1); eq(store.applyImport(imp(i)).ok, true, 'пока есть место — без вопросов'); }
  const before = storage.get(KEYS.data);
  const res = store.applyImport(imp(99));
  eq([res.ok, res.needDropConfirm], [false, true]);
  ok(res.dropAt, 'названа дата копии');
  eq(storage.get(KEYS.data), before, 'без согласия ничего не изменено');
  ok(rollbackCopies(store).some(c => c.counts && c.counts.tasks === 1 && c.at === res.dropAt), 'копия с «исходной» на месте');
  eq(store.applyImport(imp(99), { dropConfirmed: true }).ok, true);
  eq(rollbackCopies(store).length, MAX_ROLLBACK);
});
test(R, 'одинаковое состояние не копируется для отката дважды (повторные восстановления ничего не вытесняют)', () => {
  const { store, clock } = setup();
  A.addTasksFromText(store, 'A');
  changeOnDays(store, clock, 2);
  const unique = rollbackCopies(store).length;
  const [d1, d2] = dailyCopies(store);
  for (let i = 0; i < 8; i++) { clock.addMinutes(1); eq(store.restoreSnapshot((i % 2 ? d1 : d2).id).ok, true); }
  ok(rollbackCopies(store).length <= unique + 3, 'нет копий-дубликатов: ' + rollbackCopies(store).length);
  ok(store.listSnapshots().some(c => c.reason === 'before-restore' && c.counts.tasks === 3), 'состояние до первого восстановления сохранено');
});
test(R, 'нет места для копии для отката — импорт спрашивает, старые копии не удаляются', () => {
  const { store, storage, clock } = setup();
  A.addTasksFromText(store, 'A');
  store.takeRollback('manual');
  clock.addMinutes(1);
  A.addTasksFromText(store, 'B');
  store.takeRollback('manual');
  A.addTasksFromText(store, 'C'); // the current state is not in any copy yet
  const copies = storage.get(KEYS.rollback);
  failWrites(storage, KEYS.rollback, 'quota');
  const res = store.applyImport(store.previewImport(JSON.stringify(PROTOTYPE)));
  eq([res.ok, res.needForce], [false, true]);
  eq(storage.get(KEYS.rollback), copies, 'копии для отката не тронуты');
  eq(titles(store), ['A', 'B', 'C']);
});
test(R, 'запись списка копий «наполовину» не портит его', () => {
  const { store, storage } = setup();
  A.addTasksFromText(store, 'A');
  store.takeRollback('manual');
  const copies = storage.get(KEYS.rollback);
  A.addTasksFromText(store, 'B');
  failWrites(storage, KEYS.rollback, 'verify', 1);
  eq(store.takeRollback('manual'), false);
  eq(storage.get(KEYS.rollback), copies, 'прежний список возвращён');
});
test(R, 'копии 0.2.x в ежедневном списке не вытесняются, пока их не удалось перенести', () => {
  const legacy = { id: 'imp', at: '2026-10-01T09:00:00.000Z', reason: 'before-import', data: V2_DOC };
  const storage = createMemoryAdapter({ [KEYS.data]: JSON.stringify({ ...V2_DOC, schemaVersion: 3 }), [KEYS.snapshots]: JSON.stringify([legacy]) });
  failWrites(storage, KEYS.rollback, 'quota');
  const clock = makeClock(2026, 10, 9);
  const store = createStore({ storage, clock });
  store.load();
  changeOnDays(store, clock, MAX_DAILY + 2);
  eq(dailyCopies(store).length, MAX_DAILY);
  ok(store.listSnapshots().some(c => c.id === 'imp'), 'копия «перед импортом» на месте');
  failWrites(storage, KEYS.data, 'quota', 1);
  A.addTasksFromText(store, 'места мало');
  ok(store.listSnapshots().some(c => c.id === 'imp'), 'и после нехватки места');
  healWrites(storage);
  const again = createStore({ storage, clock }); again.load();
  ok(JSON.parse(storage.get(KEYS.rollback)).some(c => c.id === 'imp'), 'при следующем запуске перенесена');
});
test(R, 'органайзер, где есть только карантин, защищён как обычный', () => {
  const onlyQ = { ...V2_DOC, schemaVersion: 3, tasks: [], events: [], projects: [], lists: [] };
  const { store, storage } = setup({ [KEYS.data]: JSON.stringify(onlyQ) });
  const p = store.previewImport(buildBackupText({ ...emptyDoc(NOW), dataId: 'other-id', tasks: [newTask({ id: 'n', title: 'чужая', plan: { kind: 'none' }, now: NOW })] }, NOW));
  eq(store.applyImport(p).needForeignConfirm, true, 'нужно отдельное подтверждение');
  eq(store.applyImport(p, { foreignConfirmed: true }).ok, true);
  ok(JSON.parse(storage.get(KEYS.rollback)).some(c => c.reason === 'before-import' && c.data.quarantine.length === 1), 'карантин сохранён в копии');
});
test(R, 'данные прототипа: нечитаемые сохраняются в «Повреждённых данных», прочитанные — в копии для отката', () => {
  const bad = setup({ [KEYS.legacy]: '{сломано' });
  eq(bad.store.rescueList()[0].raw, '{сломано');
  eq(bad.storage.get(KEYS.legacy), '{сломано', 'ключ прототипа не тронут');
  const raw = JSON.stringify(PROTOTYPE);
  const good = setup({ [KEYS.legacy]: raw });
  const copy = JSON.parse(good.storage.get(KEYS.rollback))[0];
  eq([copy.reason, copy.raw, copy.schemaVersion], ['before-migration', raw, 1]);
});
test(R, 'проверка «ничего не потеряно» не мешает, если повторная запись идёт первой и не прошла проверку', () => {
  const d = { ...V2_DOC, tasks: [{ id: 't1', title: 5, plan: { kind: 'none' }, done: false }, ...V2_DOC.tasks] };
  eq(findLostRecords(d, normalizeDoc(d, { now: NOW })), null);
  const { store } = setup({ [KEYS.data]: JSON.stringify(d) });
  ok(!store.status.readOnly);
  eq(store.doc.tasks.length, 3);
  eq(store.doc.quarantine.length, 2);
});
test(R, 'после восстановления из копии без id органайзер сразу получает и сохраняет свой id', () => {
  const copies = [{ id: 'c', at: '2026-10-08T09:00:00.000Z', reason: 'daily', data: V2_DOC }];
  const { store, storage } = setup({ [KEYS.data]: '{сломано', [KEYS.snapshots]: JSON.stringify(copies) });
  ok(store.doc.dataId);
  eq(savedDoc(storage).dataId, store.doc.dataId);
});
test(PR, 'у каждого органайзера свой случайный dataId; он не меняется при перезапуске', () => {
  const a = setup(), b = setup();
  A.addTasksFromText(a.store, 'A');
  A.addTasksFromText(b.store, 'B');
  ok(a.store.doc.dataId && b.store.doc.dataId && a.store.doc.dataId !== b.store.doc.dataId);
  const again = createStore({ storage: a.storage, clock: a.clock }); again.load();
  eq(again.doc.dataId, a.store.doc.dataId);
});
test(PR, 'два хранилища (два человека) не видят данных друг друга', () => {
  const a = setup(), b = setup();
  A.addTasksFromText(a.store, 'личное A');
  A.addTasksFromText(b.store, 'личное B');
  ok(!JSON.stringify(b.storage.dump()).includes('личное A'));
  ok(!JSON.stringify(a.storage.dump()).includes('личное B'));
});
test(PR, 'копия из другого органайзера: предупреждение и отдельное подтверждение, иначе ничего не меняется', () => {
  const a = setup(), b = setup();
  A.addTasksFromText(a.store, 'моё');
  A.addTasksFromText(b.store, 'чужое');
  const before = a.storage.get(KEYS.data);
  const p = a.store.previewImport(buildBackupText(b.store.doc, NOW));
  eq([p.origin, p.replacesData], ['other', true]);
  const res = a.store.applyImport(p);
  eq([res.ok, res.needForeignConfirm], [false, true]);
  eq(a.storage.get(KEYS.data), before, 'без подтверждения ничего не записано');
  eq(a.storage.get(KEYS.rollback), null, 'и копия не делалась');
  eq(a.store.applyImport(p, { foreignConfirmed: true }).ok, true);
  eq(titles(a.store), ['чужое']);
  ok(rollbackCopies(a.store).some(c => c.reason === 'before-import'), 'свои данные остались в копии для отката');
});
test(PR, 'своя копия — без лишнего вопроса; старая копия без id — «неизвестно»; в пустой — без замены', () => {
  const a = setup();
  A.addTasksFromText(a.store, 'моё');
  const own = a.store.previewImport(buildBackupText(a.store.doc, NOW));
  eq(own.origin, 'same');
  const old = a.store.previewImport(JSON.stringify({ app: 'organizer', kind: 'backup', appVersion: '0.2.2', schemaVersion: 2, exportedAt: NOW, data: V2_DOC }));
  eq(old.origin, 'unknown');
  eq(a.store.applyImport(old).ok, true, 'обычное подтверждение (в интерфейсе) достаточно');
  ok(a.store.doc.dataId, 'старая копия продолжает этот органайзер');
  const empty = setup();
  const p = empty.store.previewImport(buildBackupText(a.store.doc, NOW));
  eq([p.origin, p.replacesData], ['other', false]);
  eq(empty.store.applyImport(p).ok, true);
  eq(empty.store.doc.dataId, a.store.doc.dataId, 'перенос на новое устройство сохраняет id органайзера');
});
test(PR, 'файл со словами constructor/__proto__ и странными полями не ломает приложение', () => {
  const evil = '{"app":"organizer","kind":"backup","exportedAt":{"toString":1},"appVersion":{"x":1},"data":{"schemaVersion":3,"__proto__":{"polluted":1},'
    + '"tasks":[{"id":"t1","title":"constructor","plan":{"kind":"none"},"done":false,"__proto__":{"polluted":1}}],'
    + '"quarantine":[{"reason":"constructor","collection":{"toString":1},"at":{"toString":1}},{"reason":{"key":"__proto__"}},"строка"]}}';
  const p = parseBackupText(evil, NOW);
  ok(p.ok);
  eq(p.meta.exportedAt, null);
  eq(p.meta.appVersion, null);
  eq(({}).polluted, undefined, 'прототип объектов не изменён');
  eq(p.doc.tasks[0].title, 'constructor');
  eq(t('constructor'), 'constructor');
  eq(t('__proto__'), '__proto__');
  eq(t('hasOwnProperty'), 'hasOwnProperty');
  eq(msg({ key: 'toString' }), 'toString');
  eq(esc({ toString: 1 }), '');
  eq(formatDay({ toString: 1 }), '');
});
test(PR, 'приложение пишет только в свои ключи organizer:*', () => {
  const { store, storage, clock } = setup({ [KEYS.legacy]: JSON.stringify(PROTOTYPE) });
  A.addTasksFromText(store, 'A');
  changeOnDays(store, clock, 2);
  store.takeRollback('manual');
  store.applyImport(store.previewImport(JSON.stringify(PROTOTYPE)));
  store.finishDay();
  for (const k of Object.keys(storage.dump())) ok(k.startsWith('organizer:') || k === KEYS.legacy, k);
  eq(storage.get(KEYS.legacy), JSON.stringify(PROTOTYPE), 'данные прототипа только читаются');
});
test(PR, 'резервная копия содержит только данные органайзера, без сведений об устройстве', () => {
  const { store } = setup();
  A.addTasksFromText(store, 'A');
  store.markBackupDone();
  const b = JSON.parse(buildBackupText(store.doc, NOW));
  eq(Object.keys(b).sort(), ['app', 'appVersion', 'data', 'exportedAt', 'kind', 'schemaVersion']);
  ok(!JSON.stringify(b).includes('lastBackupAt'));
});
test(PR, 'в коде приложения нет сетевых запросов, сторонних адресов и других хранилищ', async () => {
  if (!canFetch) throw new Error('откройте tests.html через http(s)');
  const text = await (await fetch('sw.js', { cache: 'no-store' })).text();
  const list = JSON.parse(text.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  const forbidden = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|document\.cookie|indexedDB|sessionStorage|window\.open|RTCPeerConnection|https?:\/\/(?!…)/;
  for (const f of list.filter(p => /\.(js|html)$/.test(p) && p !== './sw.js')) {
    const code = await (await fetch(f, { cache: 'no-store' })).text();
    const hit = code.match(forbidden);
    ok(!hit, `${f}: ${hit && hit[0]}`);
  }
  ok(/if \(url\.origin !== self\.location\.origin\) return;/.test(text), 'sw.js не обрабатывает чужие адреса');
  ok(!/https?:\/\//.test(text), 'sw.js не обращается к сторонним адресам');
  const html = await (await fetch('index.html', { cache: 'no-store' })).text();
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  ok(/default-src 'self'/.test(csp) && /connect-src 'self'/.test(csp) && /script-src 'self';/.test(csp), csp);
  ok(!/https?:/.test(csp), 'в CSP нет сторонних адресов');
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
