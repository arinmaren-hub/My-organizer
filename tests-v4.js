// Tests added in 0.4.0. They are registered from tests.js (same runner, same page).
// Fixtures here are written out by hand EXACTLY as earlier versions stored them,
// so they keep proving that old data still loads even after the code changes.

import { SCHEMA_VERSION, emptyDoc, normalizeDoc, countActive, newTask, findLostRecords, hasContent } from './schema.js';
import { KEYS } from './storage.js';
import { createStore } from './store.js';
import { buildBackupText } from './backup.js';
import { parseQuick, addMonths } from './parsedate.js';
import * as A from './actions.js';
import { fixedDate, afterCompletion, seriesHistory, isUnconfirmed } from './recur.js';
import { morningReview, eveningReview, unconfirmedOccurrences, overdueForReview, waitingDue, activeTasks, eveningPreviewDue, buildDaySummary } from './selectors.js';
import { dayContents } from './calendar.js';
import { listTemplates, builtinTemplate, groupItems } from './templates.js';
import { setLang } from './i18n.js';

export function registerV4(h) {
  const { test, eq, ok, setup, makeClock, savedDoc, rollbackCopies, dailyCopies } = h;
  const NOW = '2026-10-09T09:00:00.000Z';

  // ---------- frozen data as 0.3.0 stored it (schema 3) ----------
  const V3_RAW = JSON.stringify({
    schemaVersion: 3, dataId: 'org-frozen-3', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-10-08T20:00:00.000Z',
    tasks: [
      { id: 'a1', title: 'Сдать отчёт', plan: { kind: 'day', date: '2026-10-07' }, time: '10:30', reminder: { minutesBefore: 15 }, deadline: '2026-10-12', projectId: 'p1', done: false, completedAt: null, createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', deletedAt: null },
      { id: 'a2', title: 'Неделя', plan: { kind: 'week', date: '2026-10-05' }, time: null, reminder: null, deadline: null, projectId: null, done: true, completedAt: '2026-10-06T10:00:00.000Z', createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-10-06T10:00:00.000Z', deletedAt: null, custom: { keep: 'me' } },
      { id: 'a3', title: 'Без даты', plan: { kind: 'none', date: null }, time: null, reminder: null, deadline: null, projectId: null, done: false, completedAt: null, createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z', deletedAt: '2026-10-05T10:00:00.000Z' }
    ],
    events: [{ id: 'e1', title: 'Лекция', start: '2026-10-09T10:00', end: '2026-10-09T11:30', allDay: false, repeat: null, alerts: [], createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z', deletedAt: null }],
    projects: [{ id: 'p1', name: 'Диплом', milestones: [{ id: 'm1', title: 'План', done: true, createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z', deletedAt: null }], quantity: { current: 7, total: 12, unit: 'глав' }, createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z', deletedAt: null }],
    lists: [{ id: 'l1', name: 'Покупки', items: [{ id: 'i1', title: 'Молоко', done: true, createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z', deletedAt: null }], createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z', deletedAt: null }],
    settings: { eveningPreview: { enabled: true, time: '22:15' }, day: { wake: '08:00', bed: '03:00', cutoff: '04:00', setupDone: true } },
    quarantine: [{ at: NOW, source: 'import', collection: 'events', parentId: null, reason: 'reason.badStart', record: { id: 'x' } }]
  });
  const NEW_FIELDS = { review: null, seriesId: null, occurrenceDate: null, skipped: false, doneDay: null };

  const G = 'Обновление до 0.4.0';
  test(G, 'данные 0.3.0: каждая запись и поле на месте, настройки и dataId сохранены', () => {
    const { store, storage } = setup({ [KEYS.data]: V3_RAW });
    ok(!store.status.readOnly);
    const before = JSON.parse(V3_RAW), after = savedDoc(storage);
    eq(after.schemaVersion, 5);
    eq(after.dataId, 'org-frozen-3');
    eq(after.settings, before.settings, 'настройки дня и вечера');
    eq(after.tasks, before.tasks.map(t => ({ ...t, ...NEW_FIELDS })));
    for (const k of ['events', 'projects', 'lists', 'quarantine']) eq(after[k], before[k], k);
    for (const k of ['series', 'waiting', 'templates']) eq(after[k], [], k);
    eq(after.createdAt, before.createdAt);
  });
  test(G, 'перед обновлением 0.3.0 → 0.4.0 сохраняется точный исходный текст', () => {
    const { storage } = setup({ [KEYS.data]: V3_RAW });
    const rb = JSON.parse(storage.get(KEYS.rollback));
    eq(rb.length, 1);
    eq(rb[0].raw, V3_RAW);
    eq(rb[0].reason, 'before-migration');
    eq(rb[0].schemaVersion, 3);
  });
  test(G, 'обновление не создаёт ежедневных копий сверх правил: не больше одной в день и пяти всего', () => {
    const { store, clock } = setup({ [KEYS.data]: V3_RAW });
    for (let i = 0; i < 8; i++) { clock.addDays(1); h.A.addTasksFromText(store, 'д' + i); h.A.addTasksFromText(store, 'е' + i); }
    eq(dailyCopies(store).length, 5);
  });
  test(G, 'повторный запуск после обновления ничего не меняет и не копирует заново', () => {
    const { storage } = setup({ [KEYS.data]: V3_RAW });
    const text = storage.get(KEYS.data), rb = storage.get(KEYS.rollback);
    const s2 = createStore({ storage, clock: makeClock(2026, 10, 9) });
    s2.load();
    eq(storage.get(KEYS.rollback), rb, 'копия не дублируется');
    eq(JSON.parse(storage.get(KEYS.data)).tasks, JSON.parse(text).tasks);
  });
  test(G, 'разбор 0.3.0: просроченные задачи остаются, дедлайн и время не тронуты', () => {
    const { store } = setup({ [KEYS.data]: V3_RAW });
    const t1 = store.doc.tasks.find(t => t.id === 'a1');
    eq([t1.deadline, t1.time, t1.reminder, t1.projectId], ['2026-10-12', '10:30', { minutesBefore: 15 }, 'p1']);
  });
  test(G, 'новые виды записей: проверка, карантин плохих, резервная копия туда и обратно', () => {
    const base = JSON.parse(V3_RAW);
    const doc = {
      ...base, schemaVersion: 4,
      series: [
        { id: 's1', title: 'Полить цветы', freq: 'weekly', interval: 2, mode: 'completion', startDate: '2026-10-01', time: null, paused: false, generatedThrough: null, projectId: null, createdAt: NOW, updatedAt: NOW, deletedAt: null },
        { id: 's2', title: 'Плохая', freq: 'hourly', interval: 1, mode: 'fixed', startDate: '2026-10-01', createdAt: NOW }
      ],
      waiting: [
        { id: 'w1', title: 'Ответ от декана', from: 'Декан', followUp: '2026-10-15', note: '', resolved: false, resolvedAt: null, taskId: null, createdAt: NOW, updatedAt: NOW, deletedAt: null },
        { id: 'w2', title: 'Плохая дата', followUp: '2026-02-30', createdAt: NOW }
      ],
      templates: [{ id: 'tp1', name: 'Мой шаблон', base: null, items: [{ id: 'ti1', title: 'Хлеб', done: false, category: 'Выпечка', createdAt: NOW, updatedAt: NOW, deletedAt: null }], categories: ['Выпечка', 'Пусто'], createdAt: NOW, updatedAt: NOW, deletedAt: null }]
    };
    const r = normalizeDoc(doc, { now: NOW });
    ok(!r.fatal);
    eq(r.doc.series.map(x => x.id), ['s1']);
    eq(r.doc.waiting.map(x => x.id), ['w1']);
    eq(r.doc.templates.map(x => x.id), ['tp1']);
    eq(r.quarantined.map(q => [q.collection, q.record.id]), [['series', 's2'], ['waiting', 'w2']], 'плохие записи сохранены в карантине целиком');
    eq(findLostRecords(doc, r), null);
    eq(countActive(r.doc), { tasks: 3 - 1, events: 1, projects: 1, lists: 1, series: 1, waiting: 1, templates: 1 });
    // backup → import into an empty organizer → same records
    const text = buildBackupText(r.doc, NOW);
    const { store } = setup();
    const p = store.previewImport(text);
    ok(p.ok);
    eq(p.counts, countActive(r.doc));
    ok(store.applyImport(p).ok);
    eq(store.doc.series, r.doc.series);
    eq(store.doc.waiting, r.doc.waiting);
    eq(store.doc.templates, r.doc.templates);
  });
  test(G, 'документ только с ожиданием или шаблоном считается данными (защищается копиями)', () => {
    const d = emptyDoc(NOW);
    ok(!hasContent(d));
    d.waiting.push({ id: 'w1', title: 'x', from: null, followUp: null, note: '', resolved: false, resolvedAt: null, taskId: null, createdAt: NOW, updatedAt: NOW, deletedAt: null });
    ok(hasContent(d));
  });
  test(G, 'старые удалённые записи новых видов очищаются через 30 дней, свежие — нет', () => {
    const base = JSON.parse(V3_RAW);
    const old = '2026-08-01T10:00:00.000Z', fresh = '2026-10-05T10:00:00.000Z';
    const mk = (id, deletedAt) => ({ id, title: id, from: null, followUp: null, note: '', resolved: false, resolvedAt: null, taskId: null, createdAt: NOW, updatedAt: NOW, deletedAt });
    const { store } = setup({ [KEYS.data]: JSON.stringify({ ...base, schemaVersion: 4, waiting: [mk('wold', old), mk('wnew', fresh)] }) });
    eq(store.doc.waiting.map(w => w.id), ['wnew']);
  });
  test(G, 'версия 5 (будущая) по-прежнему только для чтения и не изменяется', () => {
    const raw = JSON.stringify({ ...JSON.parse(V3_RAW), schemaVersion: SCHEMA_VERSION + 1 });
    const { store, storage } = setup({ [KEYS.data]: raw });
    ok(store.status.readOnly);
    eq(storage.get(KEYS.data), raw);
  });

  // ---------- quick entry: Russian and English date recognition ----------
  const Q = 'Быстрый ввод: даты';
  const P = (text, today = '2026-10-09') => { const r = parseQuick(text, today); return [r.title, r.kind, r.date, r.time, r.deadline]; };
  test(Q, 'количества («1.5 л», «2/3 cup») не принимаются за даты', () => {
    eq(P('купить молоко 1.5 л'), ['купить молоко 1.5 л', null, null, null, null]);
    eq(P('buy milk 1.5 l')[0], 'buy milk 1.5 l');
    eq(P('tea 2/3 cup')[0], 'tea 2/3 cup');
    eq(P('pay 10.5 euro rent')[0], 'pay 10.5 euro rent');
    eq(P('позвонить маме 15.10')[2], '2026-10-15', 'настоящая дата остаётся датой');
  });
  const CASES = [
    ['купить молоко завтра', ['купить молоко', 'day', '2026-10-10', null, null]],
    ['call mom tomorrow at 15:30', ['call mom', 'day', '2026-10-10', '15:30', null]],
    ['завтра в 9:05 зубной', ['зубной', 'day', '2026-10-10', '09:05', null]],
    ['послезавтра сдать форму', ['сдать форму', 'day', '2026-10-11', null, null]],
    ['day after tomorrow pay rent', ['pay rent', 'day', '2026-10-11', null, null]],
    ['сегодня позвонить', ['позвонить', 'day', '2026-10-09', null, null]],
    ['сдать отчёт до пятницы', ['сдать отчёт', null, null, null, '2026-10-16']],
    ['finish essay by friday', ['finish essay', null, null, null, '2026-10-16']],
    ['до 20 октября сдать проект', ['сдать проект', null, null, null, '2026-10-20']],
    ['submit due oct 20', ['submit', null, null, null, '2026-10-20']],
    ['в понедельник встреча в 9 утра', ['встреча', 'day', '2026-10-12', '09:00', null]],
    ['dentist on monday', ['dentist', 'day', '2026-10-12', null, null]],
    ['15 октября оплатить', ['оплатить', 'day', '2026-10-15', null, null]],
    ['pay 15 october', ['pay', 'day', '2026-10-15', null, null]],
    ['oct 15th pay', ['pay', 'day', '2026-10-15', null, null]],
    ['День рождения 5 марта', ['День рождения', 'day', '2027-03-05', null, null]],
    ['открытки 31.12', ['открытки', 'day', '2026-12-31', null, null]],
    ['визит 3/4', ['визит', 'day', '2027-04-03', null, null]],
    ['экзамен 02.11.2026', ['экзамен', 'day', '2026-11-02', null, null]],
    ['2026-12-01 экзамен', ['экзамен', 'day', '2026-12-01', null, null]],
    ['через 3 дня постирать', ['постирать', 'day', '2026-10-12', null, null]],
    ['in 2 weeks renew pass', ['renew pass', 'day', '2026-10-23', null, null]],
    ['через неделю позвонить', ['позвонить', 'day', '2026-10-16', null, null]],
    ['in a month review', ['review', 'day', '2026-11-09', null, null]],
    ['на следующей неделе позвонить', ['позвонить', 'week', '2026-10-12', null, null]],
    ['call this week', ['call', 'week', '2026-10-05', null, null]],
    ['next week plan trip', ['plan trip', 'week', '2026-10-12', null, null]],
    ['meeting at 3pm', ['meeting', null, null, '15:00', null]],
    ['lunch 12:30 pm', ['lunch', null, null, '12:30', null]],
    ['встреча в 7 вечера', ['встреча', null, null, '19:00', null]],
    ['позвонить в 12:00', ['позвонить', null, null, '12:00', null]],
    ['Feb 29 party', ['party', 'day', '2028-02-29', null, null]],
    // things that must NOT be taken for a date or time
    ['купить 2 хлеба', ['купить 2 хлеба', null, null, null, null]],
    ['buy sun cream', ['buy sun cream', null, null, null, null]],
    ['you may call', ['you may call', null, null, null, null]],
    ['task 10.30', ['task 10.30', null, null, null, null]],
    ['31.02 отчёт', ['31.02 отчёт', null, null, null, null]],
    ['завтра', ['завтра', null, null, null, null]],
    ['через 2 часа позвонить', ['через 2 часа позвонить', null, null, null, null]],
    ['', ['', null, null, null, null]]
  ];
  for (const [text, want] of CASES) test(Q, `«${text}»`, () => eq(P(text), want));
  test(Q, '«next friday» — пятница следующей недели, а «friday» — ближайшая', () => {
    eq(P('gym friday', '2026-10-07').slice(1, 3), ['day', '2026-10-09']);
    eq(P('gym next friday', '2026-10-07').slice(1, 3), ['day', '2026-10-16']);
    eq(P('gym friday', '2026-10-09').slice(1, 3), ['day', '2026-10-16'], 'сегодня пятница → следующая');
  });
  test(Q, 'границы: конец месяца, високосный день, смена года', () => {
    eq(P('x in 1 month', '2026-01-31').slice(2, 3), ['2026-02-28']);
    eq(P('x in 1 month', '2028-01-31').slice(2, 3), ['2028-02-29']);
    eq(P('x tomorrow', '2026-12-31').slice(2, 3), ['2027-01-01']);
    eq(P('x 29 feb', '2027-03-01').slice(2, 3), ['2028-02-29']);
    eq(addMonths('2026-08-31', 1), '2026-09-30');
    eq(addMonths('2026-11-30', 3), '2027-02-28');
    eq(addMonths('2026-12-15', 1), '2027-01-15');
  });
  test(Q, 'распознанное показывается списком; на русском и английском одинаково', () => {
    eq(parseQuick('купить молоко завтра в 15:30', '2026-10-09').found, ['завтра', 'в 15:30']);
    eq(P('buy milk tomorrow at 15:30').slice(1), P('купить молоко завтра в 15:30').slice(1));
  });

  // ====================== helpers for the new tests ======================
  const task = (store, id) => store.doc.tasks.find(t => t.id === id);
  const occ = (store, sid) => store.doc.tasks.filter(t => t.seriesId === sid).sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));
  const open = list => list.filter(t => !t.done && !t.skipped && !t.deletedAt);
  const mkTasks = (store, specs) => { for (const sp of specs) A.addTasksFromText(store, sp.title, sp.kind || 'none', sp.date || ''); };
  const idOf = (store, title) => store.doc.tasks.find(t => t.title === title).id;

  // ====================== editing and quick entry ======================
  const E = 'Правка и быстрый ввод';
  test(E, 'правка задачи: название, день, время, дедлайн; без названия — отказ', () => {
    const { store } = setup();
    A.addTasksFromText(store, 'Старое', 'day', '2026-10-12');
    const id = idOf(store, 'Старое');
    ok(A.editTask(store, id, { title: 'Новое', kind: 'day', date: '2026-10-14', time: '09:30', deadline: '2026-10-20' }));
    const t = task(store, id);
    eq([t.title, t.plan, t.time, t.deadline], ['Новое', { kind: 'day', date: '2026-10-14' }, '09:30', '2026-10-20']);
    eq(A.editTask(store, id, { title: '  ', kind: 'day', date: '2026-10-14' }), false);
    eq(A.editTask(store, id, { title: 'x', kind: 'day', date: '' }), false);
    eq(task(store, id).title, 'Новое', 'отказ ничего не меняет');
  });
  test(E, 'перенос задачи не меняет дедлайн; правка меняет его только по явному вводу', () => {
    const { store } = setup();
    A.addTasksFromText(store, 'Д', 'day', '2026-10-09');
    const id = idOf(store, 'Д');
    A.editTask(store, id, { title: 'Д', kind: 'day', date: '2026-10-09', deadline: '2026-10-15' });
    A.moveTask(store, id, 'week');
    A.moveTask(store, id, 'none');
    A.reviewTask(store, id, 'tomorrow');
    A.reviewTask(store, id, 'date', '2026-11-01');
    eq(task(store, id).deadline, '2026-10-15');
    A.editTask(store, id, { title: 'Д', kind: 'none', date: '', deadline: '' });
    eq(task(store, id).deadline, null);
  });
  test(E, 'время сбрасывается, когда задача не на день', () => {
    const { store } = setup();
    A.addTasksFromText(store, 'В', 'day', '2026-10-09');
    const id = idOf(store, 'В');
    A.editTask(store, id, { title: 'В', kind: 'day', date: '2026-10-09', time: '10:00' });
    A.editTask(store, id, { title: 'В', kind: 'week', date: '2026-10-09', time: '10:00' });
    eq([task(store, id).time, task(store, id).plan], [null, { kind: 'week', date: '2026-10-05' }]);
  });
  test(E, 'правка события', () => {
    const { store } = setup();
    A.addEvent(store, { title: 'Лекция', start: '2026-10-12T10:00' });
    const id = store.doc.events[0].id;
    ok(A.editEvent(store, id, { title: 'Семинар', start: '2026-10-13T11:00', end: '2026-10-13T12:30' }));
    eq([store.doc.events[0].title, store.doc.events[0].start, store.doc.events[0].end], ['Семинар', '2026-10-13T11:00', '2026-10-13T12:30']);
    eq(A.editEvent(store, id, { title: 'x', start: '2026-10-13T11:00', end: '2026-10-13T10:00' }), false, 'конец раньше начала');
  });
  test(E, 'быстрый ввод: достаточно названия; даты на русском и английском', () => {
    const { store } = setup();
    const r = A.splitQuick('Молоко\nпозвонить маме завтра\npay rent by friday', { kind: 'none', date: '' }, '2026-10-09');
    eq(r.ask, null);
    eq(r.specs.map(s => [s.title, s.kind, s.date, s.deadline]), [['Молоко', 'none', null, null], ['позвонить маме', 'day', '2026-10-10', null], ['pay rent', 'none', null, '2026-10-16']]);
    eq(A.addTaskSpecs(store, r.specs), 3);
    const t = store.doc.tasks.find(x => x.title === 'pay rent');
    eq([t.plan.kind, t.deadline], ['none', '2026-10-16']);
  });
  test(E, 'быстрый ввод: время → вопрос «задача или событие», остальное ждёт, ничего не теряется', () => {
    const r = A.splitQuick('первая\nвстреча завтра в 15:30\nтретья', { kind: 'none', date: '' }, '2026-10-09');
    eq(r.specs.map(s => s.title), ['первая']);
    eq([r.ask.title, r.ask.date, r.ask.time], ['встреча', '2026-10-10', '15:30']);
    eq(r.rest, 'встреча завтра в 15:30\nтретья', 'остаток текста сохранён целиком');
    const only = A.splitQuick('звонок в 18:00', { kind: 'none', date: '' }, '2026-10-09');
    eq([only.ask.kind, only.ask.date], ['day', '2026-10-09'], 'время без даты — сегодня');
  });
  test(E, 'быстрый ввод: выбор формы действует, если в тексте нет даты; дата из текста главнее', () => {
    const a = A.splitQuick('дело', { kind: 'day', date: '2026-10-20' }, '2026-10-09');
    eq([a.specs[0].kind, a.specs[0].date], ['day', '2026-10-20']);
    const b = A.splitQuick('дело на следующей неделе', { kind: 'day', date: '2026-10-20' }, '2026-10-09');
    eq([b.specs[0].kind, b.specs[0].date], ['week', '2026-10-12']);
    const c = A.splitQuick('дело', { kind: 'week', date: '2026-10-09' }, '2026-10-09');
    eq([c.specs[0].kind, c.specs[0].date], ['week', '2026-10-05']);
  });
  test(E, 'из строки со временем получаются и задача со временем, и событие', () => {
    const { store } = setup();
    const r = A.splitQuick('врач завтра в 08:15', { kind: 'none', date: '' }, '2026-10-09');
    A.addTaskSpecs(store, [r.ask]);
    A.addEventFromSpec(store, r.ask);
    eq([store.doc.tasks[0].time, store.doc.tasks[0].plan.date], ['08:15', '2026-10-10']);
    eq(store.doc.events[0].start, '2026-10-10T08:15');
  });

  // ====================== morning and evening reviews ======================
  const RV = 'Разбор: утро и вечер';
  function reviewSetup() {
    const s = setup({}, [2026, 10, 9]);
    mkTasks(s.store, [{ title: 'вчера', kind: 'day', date: '2026-10-08' }, { title: 'сегодня', kind: 'day', date: '2026-10-09' }, { title: 'прошлая неделя', kind: 'week', date: '2026-10-05' }, { title: 'эта неделя', kind: 'week', date: '2026-10-05' }, { title: 'будущее', kind: 'day', date: '2026-10-15' }]);
    // 'прошлая неделя' must be a past week: move it
    A.editTask(s.store, idOf(s.store, 'прошлая неделя'), { title: 'прошлая неделя', kind: 'week', date: '2026-09-28' });
    return s;
  }
  test(RV, 'утром спрашивают о незавершённых дневных и недельных задачах прошлых дней', () => {
    const { store } = reviewSetup();
    const r = morningReview(store.doc, store.planningToday());
    eq(r.ask.map(t => t.title).sort(), ['вчера', 'прошлая неделя']);
    eq(r.quiet, []);
  });
  test(RV, 'ничего не переносится само: просмотр и перерисовка не меняют данные', () => {
    const { store, storage } = reviewSetup();
    const before = JSON.stringify(store.doc.tasks);
    morningReview(store.doc, '2026-10-09'); eveningReview(store.doc, '2026-10-09'); unconfirmedOccurrences(store.doc, '2026-10-09');
    store.status.notices = [];
    eq(JSON.stringify(store.doc.tasks), before);
  });
  test(RV, 'решения: завтра, другая дата, неделя, без даты, готово, оставить; дедлайн цел', () => {
    const { store } = setup();
    mkTasks(store, ['a', 'b', 'c', 'd', 'e', 'f'].map(title => ({ title, kind: 'day', date: '2026-10-08' })));
    for (const x of ['a', 'b', 'c', 'd', 'e', 'f']) A.editTask(store, idOf(store, x), { title: x, kind: 'day', date: '2026-10-08', deadline: '2026-10-30' });
    A.reviewTask(store, idOf(store, 'a'), 'tomorrow');
    A.reviewTask(store, idOf(store, 'b'), 'date', '2026-10-21');
    A.reviewTask(store, idOf(store, 'c'), 'week');
    A.reviewTask(store, idOf(store, 'd'), 'none');
    A.reviewTask(store, idOf(store, 'e'), 'done');
    A.reviewTask(store, idOf(store, 'f'), 'keep');
    const g = x => task(store, idOf(store, x));
    eq(g('a').plan, { kind: 'day', date: '2026-10-10' });
    eq(g('b').plan, { kind: 'day', date: '2026-10-21' });
    eq(g('c').plan, { kind: 'week', date: '2026-10-05' });
    eq(g('d').plan, { kind: 'none', date: null });
    eq([g('e').done, g('e').doneDay], [true, '2026-10-09']);
    eq(g('f').plan, { kind: 'day', date: '2026-10-08' });
    eq(['a', 'b', 'c', 'd', 'e', 'f'].map(x => g(x).deadline), Array(6).fill('2026-10-30'));
    eq(['a', 'b', 'c', 'd', 'e', 'f'].map(x => g(x).review.choice), ['moved', 'moved', 'moved', 'moved', 'done', 'kept']);
    eq(g('a').review.day, '2026-10-09');
  });
  test(RV, 'вечер: оставленное вечером утром не спрашивают, но остаётся видимым', () => {
    const { store, clock } = setup({}, [2026, 10, 9, 21, 45]);
    mkTasks(store, [{ title: 'k', kind: 'day', date: '2026-10-09' }, { title: 'm', kind: 'day', date: '2026-10-09' }]);
    const ev = eveningReview(store.doc, store.planningToday());
    eq(ev.ask.map(t => t.title).sort(), ['k', 'm']);
    A.reviewTask(store, idOf(store, 'k'), 'keep', '', 'pm');
    A.reviewTask(store, idOf(store, 'm'), 'tomorrow', '', 'pm');
    const ev2 = eveningReview(store.doc, store.planningToday());
    eq(ev2.ask, [], 'повторно в тот же вечер не спрашивают');
    eq(ev2.quiet.map(t => t.title), ['k'], 'но оставленная видна');
    clock.set(2026, 10, 10, 8, 0);
    const morning = morningReview(store.doc, store.planningToday());
    eq(morning.ask, [], 'утром не спрашивают о том, что решено вечером');
    eq(morning.quiet.map(t => t.title), ['k'], 'оставленная видна тихо');
    eq(overdueForReview(store.doc, store.planningToday()).map(t => t.title), ['k']);
    clock.set(2026, 10, 10, 21, 45);
    eq(eveningReview(store.doc, store.planningToday()).ask.map(t => t.title).sort(), ['k', 'm'], 'на следующий вечер возвращаются');
  });
  test(RV, 'решение утром не заглушает вечерний вопрос, а оставленное утром спросят снова завтра утром', () => {
    const { store, clock } = setup({}, [2026, 10, 9, 9, 0]);
    mkTasks(store, [{ title: 'u', kind: 'day', date: '2026-10-08' }]);
    A.reviewTask(store, idOf(store, 'u'), 'today');
    eq(eveningReview(store.doc, '2026-10-09').ask.map(t => t.title), ['u'], 'вечером снова спрашивают');
    A.reviewTask(store, idOf(store, 'u'), 'keep', '', 'am');
    clock.set(2026, 10, 10, 8, 0);
    eq(morningReview(store.doc, '2026-10-10').ask.map(t => t.title), ['u'], 'оставленное утром — снова в вопросах');
  });
  test(RV, 'решение утром тоже запоминается и не повторяется в тот же день', () => {
    const { store } = reviewSetup();
    A.reviewTask(store, idOf(store, 'вчера'), 'keep');
    const r = morningReview(store.doc, '2026-10-09');
    eq(r.ask.map(t => t.title), ['прошлая неделя']);
    eq(r.quiet.map(t => t.title), ['вчера']);
  });
  test(RV, 'вечером в последний день недели спрашивают и о недельных задачах этой недели', () => {
    const { store } = setup({}, [2026, 10, 11, 21, 0]); // Sunday
    mkTasks(store, [{ title: 'w', kind: 'week', date: '2026-10-11' }]);
    eq(eveningReview(store.doc, '2026-10-11').ask.map(t => t.title), ['w']);
    eq(eveningReview(store.doc, '2026-10-10').ask.map(t => t.title), [], 'в субботу — ещё нет');
  });
  test(RV, '«всё на завтра» переносит только показанные задачи', () => {
    const { store } = reviewSetup();
    const ids = morningReview(store.doc, '2026-10-09').ask.map(t => t.id);
    eq(A.reviewManyToTomorrow(store, ids), 2);
    eq(task(store, idOf(store, 'сегодня')).plan.date, '2026-10-09');
    eq(task(store, idOf(store, 'будущее')).plan.date, '2026-10-15');
    eq(task(store, idOf(store, 'вчера')).plan.date, '2026-10-10');
  });
  test(RV, 'граница личного дня: в 01:30 при отбое 04:00 всё ещё «вечер пятницы»', () => {
    const { store } = setup({}, [2026, 10, 10, 1, 30]);
    A.setDaySettings(store, { wake: '', bed: '', cutoff: '04:00' });
    eq(store.planningToday(), '2026-10-09');
    mkTasks(store, [{ title: 'пт', kind: 'day', date: '2026-10-09' }]);
    eq(eveningReview(store.doc, store.planningToday()).ask.map(t => t.title), ['пт']);
    eq(morningReview(store.doc, store.planningToday()).ask, [], 'сегодня (пт) задача не просрочена');
    A.reviewTask(store, idOf(store, 'пт'), 'tomorrow');
    eq(task(store, idOf(store, 'пт')).plan.date, '2026-10-10', '«завтра» = суббота');
  });
  test(RV, 'вечерняя сводка: время по личному дню, раз за вечер, без фоновых уведомлений', () => {
    const settings = { eveningPreview: { enabled: true, time: '21:30' } };
    const at = (d, h, m) => new Date(2026, 9, d, h, m);
    // cutoff 04:00: 01:30 on the 10th is still the evening of the 9th
    eq(eveningPreviewDue(settings, at(10, 1, 30), null, '04:00'), '2026-10-10');
    eq(eveningPreviewDue(settings, at(10, 1, 30), '2026-10-10', '04:00'), null, 'уже показана');
    eq(eveningPreviewDue(settings, at(10, 4, 30), null, '04:00'), null, 'новый день, вечер ещё не наступил');
    eq(eveningPreviewDue(settings, at(10, 21, 29), null, '04:00'), null);
    eq(eveningPreviewDue(settings, at(10, 21, 30), null, '04:00'), '2026-10-11');
    // evening time after midnight (00:30) with cutoff 04:00 belongs to the NEXT calendar date
    const late = { eveningPreview: { enabled: true, time: '00:30' } };
    eq(eveningPreviewDue(late, at(9, 23, 0), null, '04:00'), null);
    eq(eveningPreviewDue(late, at(10, 0, 30), null, '04:00'), '2026-10-10');
    // cutoff 23:00 (before midnight): 23:30 already belongs to the next planning day
    eq(eveningPreviewDue(settings, at(9, 22, 0), null, '23:00'), '2026-10-10');
    eq(eveningPreviewDue(settings, at(9, 23, 30), null, '23:00'), null);
    // finished the day early: the evening of the new planning day is not due yet
    eq(eveningPreviewDue(settings, at(9, 22, 0), null, '00:00', '2026-10-09'), null);
  });
  test(RV, 'сводка на завтра: события, задачи, дедлайны, незавершённое, ожидания и повторы', () => {
    const { store } = setup({}, [2026, 10, 9, 21, 45]);
    A.addEvent(store, { title: 'Лекция', start: '2026-10-10T10:00' });
    mkTasks(store, [{ title: 'завтра', kind: 'day', date: '2026-10-10' }, { title: 'старое', kind: 'day', date: '2026-10-08' }]);
    A.editTask(store, idOf(store, 'старое'), { title: 'старое', kind: 'day', date: '2026-10-08', deadline: '2026-10-11' });
    A.addWaiting(store, { title: 'ответ', from: 'Иван', followUp: '2026-10-10' });
    A.addSeries(store, { title: 'зал', freq: 'weekly', interval: 1, mode: 'fixed', startDate: '2026-10-03' });
    A.syncSeries(store);
    const s = buildDaySummary(store.doc, '2026-10-10');
    eq(s.events.map(e => e.title), ['Лекция']);
    eq(s.tasks.map(x => x.title), ['завтра']);
    eq(s.deadlines.map(x => x.title), ['старое']);
    eq(s.unfinished.map(x => x.title), ['старое']);
    eq(s.waiting.map(w => w.title), ['ответ']);
    eq(s.repeats.map(x => x.title), ['зал'], 'повтор завтра (10 окт — суббота)');
  });


  // ====================== recurring tasks ======================
  const RC = 'Повторяющиеся задачи';
  const series = (store, f) => { const id = A.addSeries(store, f); return id; };
  test(RC, 'по выполнению: одна открытая задача; следующая считается от дня выполнения', () => {
    const { store, clock } = setup({}, [2026, 10, 9]);
    const sid = series(store, { title: 'Полить цветы', freq: 'daily', interval: 3, mode: 'completion', startDate: '2026-10-09' });
    let o = occ(store, sid);
    eq(o.map(t => t.occurrenceDate), ['2026-10-09']);
    A.setTaskDone(store, o[0].id, true);
    o = occ(store, sid);
    eq(o.map(t => [t.occurrenceDate, t.done]), [['2026-10-09', true], ['2026-10-12', false]]);
    clock.set(2026, 10, 20); // completed 8 days late
    A.setTaskDone(store, o[1].id, true);
    eq(open(occ(store, sid)).map(t => t.occurrenceDate), ['2026-10-23'], 'от дня выполнения, не от плана');
    eq(task(store, o[1].id).doneDay, '2026-10-20');
  });
  test(RC, 'недели, месяцы, годы по выполнению; конец месяца и високосный день', () => {
    const mk = (freq, interval) => ({ id: 's', freq, interval });
    eq(afterCompletion(mk('weekly', 2), '2026-12-28'), '2027-01-11', 'через Новый год');
    eq(afterCompletion(mk('monthly', 1), '2026-01-31'), '2026-02-28');
    eq(afterCompletion(mk('monthly', 1), '2028-01-31'), '2028-02-29');
    eq(afterCompletion(mk('monthly', 12), '2028-02-29'), '2029-02-28');
    eq(afterCompletion(mk('yearly', 1), '2028-02-29'), '2029-02-28');
    eq(afterCompletion(mk('yearly', 4), '2028-02-29'), '2032-02-29');
    eq(afterCompletion(mk('daily', 1), '2026-10-24'), '2026-10-25');
    eq(afterCompletion(mk('daily', 2), '2026-10-24'), '2026-10-26', 'смена времени 25.10 не сдвигает день');
    eq(afterCompletion(mk('daily', 1), '2026-03-28'), '2026-03-29');
    eq(afterCompletion(mk('daily', 2), '2026-03-28'), '2026-03-30');
  });
  test(RC, 'по расписанию: даты считаются от начала, без «дрейфа» (31-е)', () => {
    const s = { freq: 'monthly', interval: 1, startDate: '2026-01-31' };
    eq([0, 1, 2, 3, 4].map(k => fixedDate(s, k)), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
    const y = { freq: 'yearly', interval: 1, startDate: '2028-02-29' };
    eq([0, 1, 2, 3, 4].map(k => fixedDate(y, k)), ['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
    const w = { freq: 'weekly', interval: 2, startDate: '2026-12-21' };
    eq([0, 1, 2].map(k => fixedDate(w, k)), ['2026-12-21', '2027-01-04', '2027-01-18']);
  });
  test(RC, 'по расписанию: пропущенные дни НЕ считаются пропущенными — ждут подтверждения', () => {
    const { store, clock } = setup({}, [2026, 9, 25]);
    const sid = series(store, { title: 'Зал', freq: 'weekly', interval: 1, mode: 'fixed', startDate: '2026-09-25' });
    eq(occ(store, sid).map(t => t.occurrenceDate), ['2026-09-25']);
    clock.set(2026, 10, 9); // app not opened for two weeks
    const r = A.syncSeries(store);
    eq(r.created, 2);
    const o = occ(store, sid);
    eq(o.map(t => t.occurrenceDate), ['2026-09-25', '2026-10-02', '2026-10-09']);
    ok(o.every(t => !t.done && !t.skipped), 'приложение ничего не отметило само');
    eq(unconfirmedOccurrences(store.doc, '2026-10-09').map(t => t.occurrenceDate), ['2026-09-25', '2026-10-02']);
    eq(overdueForReview(store.doc, '2026-10-09').length, 0, 'это не обычные просроченные');
    eq(morningReview(store.doc, '2026-10-09').ask, []);
    eq(A.syncSeries(store).created, 0, 'повторный запуск ничего не создаёт');
    eq(A.syncSeries(store).created, 0);
    eq(occ(store, sid).length, 3, 'без дублей');
  });
  test(RC, 'подтверждение: сделано / сделано в тот день / пропустить / на сегодня', () => {
    const { store, clock } = setup({}, [2026, 9, 25]);
    const sid = series(store, { title: 'Зал', freq: 'weekly', interval: 1, mode: 'fixed', startDate: '2026-09-25' });
    clock.set(2026, 10, 16); A.syncSeries(store);
    const [a, b, c, d] = occ(store, sid);
    A.confirmOccurrence(store, a.id, 'doneThen');
    A.confirmOccurrence(store, b.id, 'skip');
    A.confirmOccurrence(store, c.id, 'today');
    eq([task(store, a.id).done, task(store, a.id).doneDay], [true, '2026-09-25']);
    eq([task(store, b.id).skipped, task(store, b.id).done], [true, false]);
    eq(task(store, c.id).plan.date, '2026-10-16');
    eq(unconfirmedOccurrences(store.doc, '2026-10-16'), []);
    eq(seriesHistory(store.doc, sid).map(h => [h.date, h.status]), [['2026-10-16', 'open'], ['2026-10-09', 'open'], ['2026-10-02', 'skipped'], ['2026-09-25', 'done']]);
    ok(!activeTasks(store.doc).some(t => t.id === b.id), 'пропущенная не мешает в списках');
    eq(store.doc.tasks.some(t => t.id === b.id), true, 'но сохранена в истории');
  });
  test(RC, 'удаление открытой задачи по выполнению = пропуск: следующая появляется, цепочка не обрывается', () => {
    const { store } = setup({}, [2026, 10, 9]);
    const sid = series(store, { title: 'Бельё', freq: 'weekly', interval: 1, mode: 'completion', startDate: '2026-10-09' });
    A.softDelete(store, 'tasks', occ(store, sid)[0].id);
    eq(open(occ(store, sid)).map(t => t.occurrenceDate), ['2026-10-16']);
  });
  test(RC, 'отмена выполнения убирает нетронутую следующую; тронутую — оставляет', () => {
    const { store } = setup({}, [2026, 10, 9]);
    const sid = series(store, { title: 'Бельё', freq: 'daily', interval: 2, mode: 'completion', startDate: '2026-10-09' });
    const first = occ(store, sid)[0].id;
    A.setTaskDone(store, first, true);
    A.setTaskDone(store, first, false);
    eq(open(occ(store, sid)).map(t => t.id), [first]);
    A.setTaskDone(store, first, true);
    const next = open(occ(store, sid))[0];
    A.editTask(store, next.id, { title: 'Бельё!', kind: 'day', date: '2026-10-12' });
    A.setTaskDone(store, first, false);
    eq(open(occ(store, sid)).length, 2, 'ничего не стёрто');
  });
  test(RC, 'повторное выполнение после отмены не пропускает дату', () => {
    const { store } = setup({}, [2026, 10, 9]);
    const sid = series(store, { title: 'Бельё', freq: 'daily', interval: 2, mode: 'completion', startDate: '2026-10-09' });
    const first = occ(store, sid)[0].id;
    A.setTaskDone(store, first, true);
    A.setTaskDone(store, first, false);
    A.setTaskDone(store, first, true);
    eq(occ(store, sid).map(t => [t.occurrenceDate, t.done, !!t.deletedAt]), [['2026-10-09', true, false], ['2026-10-11', false, false]]);
  });
  test(RC, 'пропуск: следующий отсчитывается от сегодня, а не от давнего выполнения', () => {
    const { store, clock } = setup({}, [2026, 10, 1]);
    const sid = series(store, { title: 'Цветы', freq: 'daily', interval: 1, mode: 'completion', startDate: '2026-10-01' });
    A.setTaskDone(store, occ(store, sid)[0].id, true);   // done 10-01, next 10-02
    clock.set(2026, 10, 10);
    A.confirmOccurrence(store, open(occ(store, sid))[0].id, 'skip');
    eq(open(occ(store, sid)).map(t => t.occurrenceDate), ['2026-10-11']);
  });
  test(RC, 'переход «по выполнению» → «по расписанию» не создаёт прошлого; восстановление серии тоже', () => {
    const { store, clock } = setup({}, [2026, 10, 10]);
    const sid = series(store, { title: 'Ежедневно', freq: 'daily', interval: 1, mode: 'completion', startDate: '2026-01-01' });
    A.editSeries(store, sid, { title: 'Ежедневно', freq: 'daily', interval: 1, mode: 'fixed', startDate: '2026-01-01' });
    eq(occ(store, sid).filter(t => !t.deletedAt && t.occurrenceDate > '2026-10-10').length, 0);
    eq(occ(store, sid).length <= 2, true, 'нет лавины: ' + occ(store, sid).length);
    clock.set(2026, 10, 10);
    A.softDelete(store, 'series', sid);
    clock.set(2026, 10, 20);
    A.restoreDeleted(store, 'series', sid);
    const n = open(occ(store, sid)).filter(t => t.occurrenceDate > '2026-10-10' && t.occurrenceDate < '2026-10-20').length;
    eq(n, 0, 'время удаления не восполняется');
  });
  test(RC, 'confirmOccurrence не применяется к обычной задаче', () => {
    const { store } = setup({}, [2026, 10, 9]);
    mkTasks(store, [{ title: 'обычная', kind: 'day', date: '2026-10-09' }]);
    let err = null;
    try { A.confirmOccurrence(store, idOf(store, 'обычная'), 'skip'); } catch (e) { err = e; }
    eq(task(store, idOf(store, 'обычная')).skipped, false);
  });
  test(RC, 'восстановление удалённого повтора не оставляет двух открытых', () => {
    const { store } = setup({}, [2026, 10, 9]);
    const sid = series(store, { title: 'Цветы', freq: 'daily', interval: 3, mode: 'completion', startDate: '2026-10-09' });
    const first = occ(store, sid)[0].id;
    A.softDelete(store, 'tasks', first);                  // = skip: a fresh occurrence appears
    eq(open(occ(store, sid)).length, 1);
    A.restoreDeleted(store, 'tasks', first);              // the untouched app-made one gives way
    eq(open(occ(store, sid)).map(t => t.id), [first], 'ровно одна открытая — восстановленная');
    A.softDelete(store, 'tasks', first);
    const successor = open(occ(store, sid))[0];
    A.editTask(store, successor.id, { title: 'Цветы (мои правки)', kind: 'day', date: successor.plan.date });
    A.restoreDeleted(store, 'tasks', first);              // refused with a message (store.update reports, does not throw)
    eq(store.status.notices.length > 0, true, 'сообщение об отказе показано');
    eq(open(occ(store, sid)).map(t => t.title), ['Цветы (мои правки)']);
    eq(task(store, first).deletedAt !== null, true, 'удалённая осталась удалённой, ничего не потеряно');
  });
  test(RC, 'календарь: прошедшие дни не показывают несозданных повторов; будущие показывают', () => {
    const { store } = setup({}, [2026, 10, 9]);
    series(store, { title: 'Зал', freq: 'weekly', interval: 1, mode: 'fixed', startDate: '2026-10-09' });
    const past = dayContents(store.doc, '2026-10-02', '2026-10-09');
    eq(past.repeats, [], 'до начала серии');
    store.doc.series[0].generatedThrough = '2026-10-20';
    eq(dayContents(store.doc, '2026-10-16', '2026-10-09').repeats.length, 1, 'будущий повтор виден');
    eq(dayContents(store.doc, '2026-10-16', '2026-10-30').repeats, [], 'если этот день уже прошёл — не показывается');
  });
  test(RC, 'много накопившихся повторов: создаются только последние 60, с пометкой', () => {
    const { store } = setup({}, [2026, 10, 9]);
    const sid = series(store, { title: 'Ежедневно', freq: 'daily', interval: 1, mode: 'fixed', startDate: '2024-01-01' });
    eq(occ(store, sid).length, 60);
    eq(occ(store, sid)[59].occurrenceDate, '2026-10-09');
    eq(store.doc.series[0].generatedThrough, '2026-10-09');
    eq(A.syncSeries(store).created, 0);
  });
  test(RC, 'пауза: повторы не создаются; после паузы прошлое не восстанавливается', () => {
    const { store, clock } = setup({}, [2026, 10, 9]);
    const sid = series(store, { title: 'Зал', freq: 'weekly', interval: 1, mode: 'fixed', startDate: '2026-10-09' });
    A.pauseSeries(store, sid, true);
    clock.set(2026, 11, 20); A.syncSeries(store);
    eq(occ(store, sid).length, 1);
    A.pauseSeries(store, sid, false);
    eq(occ(store, sid).map(t => t.occurrenceDate), ['2026-10-09', '2026-11-20'], 'время паузы не заполняется задним числом; повтор «сегодня» появляется');
    clock.set(2026, 11, 27); A.syncSeries(store);
    eq(occ(store, sid).map(t => t.occurrenceDate), ['2026-10-09', '2026-11-20', '2026-11-27']);
  });
  test(RC, 'удаление серии убирает открытые повторы, сделанные остаются; восстановление возвращает серию', () => {
    const { store } = setup({}, [2026, 10, 9]);
    const sid = series(store, { title: 'Бельё', freq: 'daily', interval: 1, mode: 'completion', startDate: '2026-10-09' });
    A.setTaskDone(store, occ(store, sid)[0].id, true);
    A.softDelete(store, 'series', sid);
    eq(open(occ(store, sid)), []);
    eq(occ(store, sid).filter(t => t.done).length, 1);
    A.restoreDeleted(store, 'series', sid);
    eq(open(occ(store, sid)).length, 1, 'после восстановления задача есть, одна');
  });
  test(RC, 'правка серии: меняет будущее; открытые задачи — только по выбору; даты не пересоздаются', () => {
    const { store } = setup({}, [2026, 10, 9]);
    const sid = series(store, { title: 'Старое', freq: 'daily', interval: 1, mode: 'completion', startDate: '2026-10-09' });
    A.editSeries(store, sid, { title: 'Новое', freq: 'weekly', interval: 2, mode: 'completion', startDate: '2026-10-09' }, false);
    eq(open(occ(store, sid))[0].title, 'Старое');
    A.editSeries(store, sid, { title: 'Новое', freq: 'weekly', interval: 2, mode: 'completion', startDate: '2026-10-09' }, true);
    eq(open(occ(store, sid))[0].title, 'Новое');
    eq(occ(store, sid).length, 1);
    eq(A.editSeries(store, sid, { title: 'x', freq: 'daily', interval: 0, mode: 'completion' }), false);
    eq(A.editSeries(store, sid, { title: 'x', freq: 'hourly', interval: 1, mode: 'completion' }), false);
  });
  test(RC, 'перенос повтора не создаёт его заново; дата повтора и дедлайн сохраняются', () => {
    const { store } = setup({}, [2026, 10, 9]);
    const sid = series(store, { title: 'Зал', freq: 'weekly', interval: 1, mode: 'fixed', startDate: '2026-10-09' });
    const id = occ(store, sid)[0].id;
    A.moveTask(store, id, 'none');
    clock_sync(store);
    eq(occ(store, sid).length, 1);
    eq(task(store, id).occurrenceDate, '2026-10-09');
    function clock_sync(st) { A.syncSeries(st); A.syncSeries(st); }
  });
  test(RC, 'через конец года и смену времени (25.10): последовательные даты без пропусков', () => {
    const s = { freq: 'daily', interval: 1, startDate: '2026-10-23' };
    eq([0, 1, 2, 3].map(k => fixedDate(s, k)), ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26']);
    const y = { freq: 'daily', interval: 1, startDate: '2026-12-30' };
    eq([0, 1, 2, 3].map(k => fixedDate(y, k)), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });

  // ====================== waiting for others ======================
  const WT = 'Ожидаю от других';
  test(WT, 'добавление: достаточно названия; «от кого» и дата напоминания — по желанию', () => {
    const { store } = setup();
    ok(A.addWaiting(store, { title: 'Ответ из банка' }));
    ok(A.addWaiting(store, { title: 'Посылка', from: 'Почта', followUp: '2026-10-20' }));
    eq(A.addWaiting(store, { title: '' }), false);
    eq(A.addWaiting(store, { title: 'x', followUp: '2026-02-30' }), false);
    eq(store.doc.waiting.map(w => [w.title, w.from, w.followUp]), [['Ответ из банка', null, null], ['Посылка', 'Почта', '2026-10-20']]);
  });
  test(WT, 'ожидание не задача: не просрочивается и не попадает в разбор', () => {
    const { store } = setup({}, [2026, 10, 30]);
    A.addWaiting(store, { title: 'Ответ', followUp: '2026-10-01' });
    eq(store.doc.tasks.length, 0);
    eq(overdueForReview(store.doc, '2026-10-30'), []);
    eq(morningReview(store.doc, '2026-10-30').ask, []);
    eq(eveningReview(store.doc, '2026-10-30').ask, []);
    eq(waitingDue(store.doc, '2026-10-30').map(w => w.title), ['Ответ'], 'только напоминание в приложении');
  });
  test(WT, 'напоминание: срок наступил → видно; отложено → скрыто; решено → не напоминает, но хранится', () => {
    const { store } = setup({}, [2026, 10, 9]);
    A.addWaiting(store, { title: 'W', followUp: '2026-10-09' });
    const id = store.doc.waiting[0].id;
    eq(waitingDue(store.doc, '2026-10-09').length, 1);
    eq(waitingDue(store.doc, '2026-10-08').length, 0, 'до срока не напоминает');
    A.setWaitingFollowUp(store, id, { days: 3 });
    eq(store.doc.waiting[0].followUp, '2026-10-12');
    eq(waitingDue(store.doc, '2026-10-09').length, 0);
    A.setWaitingFollowUp(store, id, { date: '2026-10-09' });
    A.resolveWaiting(store, id, true);
    eq(waitingDue(store.doc, '2026-10-09').length, 0);
    eq([store.doc.waiting[0].resolved, store.doc.waiting[0].deletedAt], [true, null], 'решённое не удаляется');
    A.resolveWaiting(store, id, false);
    eq(store.doc.waiting[0].resolved, false);
  });
  test(WT, 'превращение в задачу: задача на сегодня, ожидание помечено решённым и связано', () => {
    const { store } = setup({}, [2026, 10, 9]);
    A.addWaiting(store, { title: 'Справка', from: 'Деканат' });
    const tid = A.waitingToTask(store, store.doc.waiting[0].id);
    eq([task(store, tid).title, task(store, tid).plan], ['Справка', { kind: 'day', date: '2026-10-09' }]);
    eq([store.doc.waiting[0].resolved, store.doc.waiting[0].taskId], [true, tid]);
  });
  test(WT, 'удаление ожидания обратимо', () => {
    const { store } = setup();
    A.addWaiting(store, { title: 'W' });
    const id = store.doc.waiting[0].id;
    A.softDelete(store, 'waiting', id);
    eq(store.doc.waiting[0].deletedAt !== null, true);
    A.restoreDeleted(store, 'waiting', id);
    eq(store.doc.waiting[0].deletedAt, null);
  });

  // ====================== list templates ======================
  const TP = 'Шаблоны списков';
  test(TP, 'встроенные «Супермаркет» и «Чемодан» есть на обоих языках, а в данных ничего не хранят', () => {
    const { store } = setup();
    eq(listTemplates(store.doc, 'ru').map(x => x.name), ['Супермаркет', 'Чемодан']);
    eq(listTemplates(store.doc, 'en').map(x => x.name), ['Supermarket', 'Suitcase Packing']);
    eq(store.doc.templates, []);
    ok(!hasContent(store.doc), 'пустой органайзер остаётся пустым');
    ok(builtinTemplate('suitcase', 'ru').items.length > 15);
  });
  test(TP, 'новый список из шаблона: пункты без отметок, шаблон не меняется', () => {
    const { store } = setup();
    setLang('ru');
    const lid = A.createListFromTemplate(store, 'builtin:supermarket');
    const list = store.doc.lists.find(l => l.id === lid);
    eq(list.name, 'Супермаркет');
    ok(list.items.length > 10 && list.items.every(i => i.done === false));
    ok(list.items.every(i => i.id.startsWith('supermarket-') === false), 'у пунктов новые id');
    A.setListItemDone(store, lid, list.items[0].id, true);
    A.addListItem(store, lid, 'Лишнее');
    eq(store.doc.templates, [], 'шаблон остался в коде, данные шаблонов не появились');
  });
  test(TP, 'свой шаблон: создание, правка, список из него сбрасывает отметки и не меняет шаблон', () => {
    const { store } = setup();
    const tid = A.addTemplate(store, 'Дача');
    A.addContainerItem(store, 'templates', tid, 'Лопата', 'Инструменты');
    A.addContainerItem(store, 'templates', tid, 'Хлеб');
    A.addCategory(store, 'templates', tid, 'Пустая');
    const before = JSON.stringify(store.doc.templates);
    const lid = A.createListFromTemplate(store, tid, 'Дача в выходные');
    const l = store.doc.lists.find(x => x.id === lid);
    A.setListItemDone(store, lid, l.items[0].id, true);
    A.editContainerItem(store, 'lists', lid, l.items[1].id, { title: 'Батон', category: null });
    eq(JSON.stringify(store.doc.templates), before, 'шаблон не изменился ни на байт');
    // a second list from the same template starts unticked again
    const lid2 = A.createListFromTemplate(store, tid);
    const l2 = store.doc.lists.find(x => x.id === lid2);
    ok(l2.items.every(i => !i.done));
    eq(l2.items.map(i => i.title), ['Лопата', 'Хлеб']);
    eq(l2.categories, ['Пустая']);
    eq(groupItems(l2).map(g => g.category), [null, 'Пустая', 'Инструменты']);
  });
  test(TP, 'правка встроенного шаблона создаёт обычную запись; оригинал больше не показывается', () => {
    const { store } = setup();
    A.addContainerItem(store, 'templates', 'builtin:suitcase', 'Зонт', 'Другое');
    eq(store.doc.templates.length, 1);
    eq(store.doc.templates[0].base, 'suitcase');
    ok(store.doc.templates[0].items.some(i => i.title === 'Зонт'));
    eq(listTemplates(store.doc, 'ru').filter(x => x.name === 'Чемодан').length, 1, 'не дублируется');
    eq(listTemplates(store.doc, 'ru').find(x => x.name === 'Чемодан').builtin, undefined);
  });
  test(TP, 'удалённый встроенный шаблон не возвращается сам, даже через 60 дней; возвращается кнопкой как новый', () => {
    const { store, clock } = setup();
    A.softDelete(store, 'templates', 'builtin:supermarket');
    eq(listTemplates(store.doc, 'ru').map(x => x.name), ['Чемодан']);
    clock.addDays(60); A.addTasksFromText(store, 'сдвиг времени');
    eq(listTemplates(store.doc, 'ru').map(x => x.name), ['Чемодан'], 'маркер удаления не очищается');
    A.restoreBuiltinTemplates(store, ['supermarket']);
    eq(listTemplates(store.doc, 'ru').map(x => x.name).sort(), ['Супермаркет', 'Чемодан']);
  });
  test(TP, 'сохранить список как шаблон: без отметок; категории: переименование и удаление не теряют пункты', () => {
    const { store } = setup();
    A.addList(store, 'Покупки');
    const lid = store.doc.lists[0].id;
    A.addContainerItem(store, 'lists', lid, 'Яблоки', 'Фрукты');
    A.addContainerItem(store, 'lists', lid, 'Груши', 'Фрукты');
    A.setListItemDone(store, lid, store.doc.lists[0].items[0].id, true);
    const tid = A.saveListAsTemplate(store, lid);
    ok(store.doc.templates.find(x => x.id === tid).items.every(i => !i.done));
    A.renameCategory(store, 'lists', lid, 'Фрукты', 'Плоды');
    eq(store.doc.lists[0].items.map(i => i.category), ['Плоды', 'Плоды']);
    A.removeCategory(store, 'lists', lid, 'Плоды');
    eq(store.doc.lists[0].items.map(i => [i.title, i.category]), [['Яблоки', null], ['Груши', null]]);
    eq(store.doc.templates.find(x => x.id === tid).items.map(i => i.category), ['Фрукты', 'Фрукты'], 'шаблон не затронут');
  });
  test(TP, 'пункты списка можно править и удалять (обратимо)', () => {
    const { store } = setup();
    A.addList(store, 'L'); const lid = store.doc.lists[0].id;
    A.addListItem(store, lid, 'a');
    const iid = store.doc.lists[0].items[0].id;
    A.editContainerItem(store, 'lists', lid, iid, { title: 'b', category: 'X' });
    eq([store.doc.lists[0].items[0].title, store.doc.lists[0].items[0].category], ['b', 'X']);
    A.deleteContainerItem(store, 'lists', lid, iid);
    eq(groupItems(store.doc.lists[0]), []);
    eq(store.doc.lists[0].items.length, 1, 'запись пока хранится');
  });
  test(TP, 'группы пунктов: без категории — сначала, потом по категориям', () => {
    const c = { categories: ['B'], items: [{ id: 'a', title: 'a', category: 'A', deletedAt: null }, { id: 'b', title: 'b', category: null, deletedAt: null }, { id: 'c', title: 'c', category: 'B', deletedAt: null }] };
    eq(groupItems(c).map(g => [g.category, g.items.map(i => i.title)]), [[null, ['b']], ['B', ['c']], ['A', ['a']]]);
  });

}
