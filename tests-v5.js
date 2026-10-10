// Tests added in 0.5.0 (the calm redesign). Registered from tests.js (same runner, same page).
// The frozen document below is written out by hand EXACTLY as 0.4.0 stored it, so it keeps proving
// that data made by 0.4.0 loads unchanged in later versions.

import { SCHEMA_VERSION, normalizeDoc, newTask, newEvent } from './schema.js';
import { KEYS } from './storage.js';
import { createStore } from './store.js';
import * as A from './actions.js';
import { homeList, buyItems, homeItems, stockOf, isHomeList, ordinaryLists } from './home.js';
import { activeLists, deletedRecords, tasksForDay, doneLast } from './selectors.js';
import { RU5, EN5 } from './i18n-v5.js';
import { setLang, t, dayLong } from './i18n.js';
import { listTemplates, missingBuiltins } from './templates.js';
import { dayContents } from './calendar.js';

export function registerV5(h) {
  const { test, eq, ok, setup, makeClock, savedDoc, rollbackCopies, dailyCopies } = h;
  const NOW = '2026-10-09T09:00:00.000Z';

  // ---------- frozen data as 0.4.0 stored it (schema 4) ----------
  const T = (id, title, plan, extra = {}) => ({ id, title, plan, time: null, reminder: null, deadline: null, projectId: null, done: false, completedAt: null, review: null, seriesId: null, occurrenceDate: null, skipped: false, doneDay: null, createdAt: NOW, updatedAt: NOW, deletedAt: null, ...extra });
  const V4_RAW = JSON.stringify({
    schemaVersion: 4, dataId: 'org-frozen-4', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-10-08T20:00:00.000Z',
    tasks: [
      T('a1', 'Сдать отчёт', { kind: 'day', date: '2026-10-07' }, { time: '10:30', deadline: '2026-10-12', review: { day: '2026-10-08', choice: 'kept', part: 'pm' } }),
      T('a2', 'Неделя', { kind: 'week', date: '2026-10-05' }, { done: true, completedAt: NOW }),
      T('a3', 'Без даты', { kind: 'none', date: null }),
      T('a4', 'Полив', { kind: 'day', date: '2026-10-09' }, { seriesId: 's1', occurrenceDate: '2026-10-09' }),
      T('a5', 'Старое', { kind: 'day', date: '2026-10-01' }, { deletedAt: '2026-10-05T10:00:00.000Z' })
    ],
    events: [{ id: 'e1', title: 'Лекция', start: '2026-10-09T10:00', end: '2026-10-09T11:30', allDay: false, repeat: null, alerts: [], createdAt: NOW, updatedAt: NOW, deletedAt: null }],
    projects: [{ id: 'p1', name: 'Диплом', milestones: [{ id: 'm1', title: 'План', done: true, createdAt: NOW, updatedAt: NOW, deletedAt: null }], quantity: { current: 7, total: 12, unit: 'глав' }, createdAt: NOW, updatedAt: NOW, deletedAt: null }],
    lists: [
      { id: 'l1', name: 'Покупки', items: [{ id: 'i1', title: 'Молоко', done: true, category: 'Молочное', createdAt: NOW, updatedAt: NOW, deletedAt: null }, { id: 'i2', title: 'Хлеб', done: false, category: null, createdAt: NOW, updatedAt: NOW, deletedAt: null }], categories: ['Молочное'], createdAt: NOW, updatedAt: NOW, deletedAt: null },
      { id: 'l2', name: 'Купить', items: [{ id: 'i3', title: 'Лампочка', done: false, category: null, createdAt: NOW, updatedAt: NOW, deletedAt: null }], categories: [], createdAt: NOW, updatedAt: NOW, deletedAt: null },
      { id: 'l3', name: 'Дом', items: [], categories: [], createdAt: NOW, updatedAt: NOW, deletedAt: null }
    ],
    series: [{ id: 's1', title: 'Полив', freq: 'daily', interval: 2, mode: 'fixed', startDate: '2026-10-01', time: null, paused: false, generatedThrough: '2026-10-09', projectId: null, createdAt: NOW, updatedAt: NOW, deletedAt: null }],
    waiting: [{ id: 'w1', title: 'Ответ от банка', from: 'банк', followUp: '2026-10-12', note: '', resolved: false, resolvedAt: null, taskId: null, createdAt: NOW, updatedAt: NOW, deletedAt: null }],
    templates: [{ id: 'tp1', name: 'Мой шаблон', base: null, items: [{ id: 'ti1', title: 'Хлеб', done: false, category: 'Выпечка', createdAt: NOW, updatedAt: NOW, deletedAt: null }], categories: ['Выпечка'], createdAt: NOW, updatedAt: NOW, deletedAt: null }],
    settings: { eveningPreview: { enabled: true, time: '22:15' }, day: { wake: '08:00', bed: '03:00', cutoff: '04:00', setupDone: true } },
    quarantine: [{ at: NOW, source: 'import', collection: 'events', parentId: null, reason: 'reason.badStart', record: { id: 'x' } }]
  });

  const G = 'Обновление до 0.5.0';
  test(G, 'данные 0.4.0 загружаются без изменений: схема та же, ничего не переписано, не потеряно', () => {
    const { store, storage } = setup({ [KEYS.data]: V4_RAW });
    ok(!store.status.readOnly);
    const before = JSON.parse(V4_RAW), after = JSON.parse(JSON.stringify(store.doc));
    eq(SCHEMA_VERSION, 4, 'схема не менялась');
    for (const k of Object.keys(before)) if (k !== 'updatedAt') eq(after[k], before[k], k);
    eq(rollbackCopies(store).length, 0, 'миграции нет — страховочная копия не нужна');
    ok(storage.get(KEYS.data) === V4_RAW || savedDoc(storage).dataId === 'org-frozen-4');
  });
  test(G, 'после обновления данные 0.4.0 работают с новыми функциями, не теряя старых полей', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    ok(A.setIndent(store, 'a3', true));
    ok(A.createPrep(store, 'e1'));
    ok(A.addPrepItems(store, 'e1', 'Конспект\nРучка'));
    ok(A.addHomeItems(store, 'Соль'));
    const d = JSON.parse(JSON.stringify(store.doc));
    const b = JSON.parse(V4_RAW);
    eq(d.tasks.find(x => x.id === 'a1'), b.tasks[0], 'задача с дедлайном и запомненным решением');
    eq(d.lists.find(l => l.id === 'l1'), b.lists[0], 'обычный список с категорией и отметками');
    eq(d.lists.find(l => l.id === 'l2'), b.lists[1], 'личный список «Купить» не тронут');
    eq(d.lists.find(l => l.id === 'l3'), b.lists[2], 'личный список «Дом» не тронут');
    eq(d.templates, b.templates);
    eq(d.series, b.series);
    eq(d.waiting, b.waiting);
    eq(d.quarantine, b.quarantine);
    eq(d.lists.filter(isHomeList).length, 1);
  });
  test(G, 'повторный запуск после новых функций читает те же данные', () => {
    const { store, storage } = setup({ [KEYS.data]: V4_RAW });
    A.setIndent(store, 'a3', true); A.createPrep(store, 'e1'); A.addPrepItems(store, 'e1', 'Паспорт'); A.addHomeItems(store, 'Соль');
    const s2 = createStore({ storage, clock: makeClock(2026, 10, 9) });
    s2.load();
    ok(!s2.status.readOnly);
    ok(s2.doc.tasks.find(x => x.id === 'a3').indent === true);
    eq(s2.doc.events[0].prep.map(i => i.title), ['Паспорт']);
    eq(homeItems(s2.doc).map(i => i.title), ['Соль']);
    eq(s2.doc.quarantine.length, 1);
  });

  // ---------- schema: the new optional fields ----------
  const S = 'Схема 0.5.0';
  const base = () => JSON.parse(V4_RAW);
  test(S, 'indent: только true сохраняется, всё остальное тихо отбрасывается без потери задачи', () => {
    const d = base();
    d.tasks[0].indent = true; d.tasks[1].indent = false; d.tasks[2].indent = 'да';
    const r = normalizeDoc(d, { now: NOW });
    eq(r.quarantined.length, 0);
    eq(r.doc.tasks.map(x => x.indent), [true, undefined, undefined, undefined, undefined]);
  });
  test(S, 'stock и kind: допустимые значения сохраняются, чужие отбрасываются, записи остаются', () => {
    const d = base();
    d.lists[0].items[0].stock = 'low'; d.lists[0].items[1].stock = 'мало'; d.lists[1].kind = 'home'; d.lists[2].kind = 'other';
    const r = normalizeDoc(d, { now: NOW });
    eq(r.quarantined.length, 0);
    eq(r.doc.lists[0].items.map(i => i.stock), ['low', undefined]);
    eq(r.doc.lists.map(l => l.kind), [undefined, 'home', undefined]);
    eq(r.doc.lists[1].items.length, 1);
  });
  test(S, 'prep: список подготовки сохраняется; плохой пункт попадает в карантин, а не пропадает; событие остаётся', () => {
    const d = base();
    const it = (id, title) => ({ id, title, done: false, category: null, createdAt: NOW, updatedAt: NOW, deletedAt: null });
    d.events[0].prep = [it('p1', 'Конспект'), { id: 'p2' }, it('p3', 'Ручка')];
    const r = normalizeDoc(d, { now: NOW });
    eq(r.doc.events[0].prep.map(i => i.id), ['p1', 'p3']);
    eq(r.quarantined.filter(q => q.collection === 'events.prep').length, 1);
    ok(r.doc.events.length === 1);
  });
  test(S, 'prep: при загрузке сломанный пункт сохраняется в карантине вместе с исходной записью, хороший остаётся', () => {
    const d = base();
    d.events[0].prep = [{ id: 'p1', title: 'Конспект', done: false, category: null, createdAt: NOW, updatedAt: NOW, deletedAt: null }, { id: 'p2' }];
    const { store } = setup({ [KEYS.data]: JSON.stringify(d) });
    ok(!store.status.readOnly);
    ok(store.doc.quarantine.some(q => q.collection === 'events.prep' && q.record && q.record.id === 'p2' && q.parentId === 'e1'), 'сломанный пункт в карантине');
    eq(store.doc.events[0].prep.map(i => i.id), ['p1']);
    eq(store.doc.quarantine.length, 2);
  });

  // ---------- indentation ----------
  const I = 'Отступ задачи';
  test(I, 'setIndent сохраняется в данных и переживает перезапуск; другие поля не меняются', () => {
    const { store, storage } = setup({ [KEYS.data]: V4_RAW });
    const before = JSON.parse(JSON.stringify(store.doc.tasks.find(x => x.id === 'a3')));
    ok(A.setIndent(store, 'a3', true));
    const s2 = createStore({ storage, clock: makeClock(2026, 10, 9) }); s2.load();
    const t = s2.doc.tasks.find(x => x.id === 'a3');
    eq(t.indent, true);
    eq({ ...t, indent: undefined, updatedAt: 0 }, { ...before, indent: undefined, updatedAt: 0 });
    ok(A.setIndent(s2, 'a3', false));
    ok(!('indent' in s2.doc.tasks.find(x => x.id === 'a3')));
  });
  test(I, 'можно сдвинуть сразу несколько задач; отметка «готово» отступ не убирает', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    A.setIndent(store, 'a3', true); A.setIndent(store, 'a4', true);
    A.setTaskDone(store, 'a3', true);
    eq(store.doc.tasks.filter(x => x.indent).map(x => x.id).sort(), ['a3', 'a4']);
  });
  test(I, 'перенос на другую дату и правка даты сбрасывают отступ; правка названия — нет', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    for (const id of ['a3', 'a4', 'a1']) A.setIndent(store, id, true);
    A.moveTask(store, 'a3', 'day', '2026-10-20');
    ok(!store.doc.tasks.find(x => x.id === 'a3').indent, 'moveTask');
    const a1 = store.doc.tasks.find(x => x.id === 'a1');
    A.editTask(store, 'a1', { title: 'Сдать отчёт!', kind: 'day', date: a1.plan.date, time: a1.time, deadline: a1.deadline });
    ok(store.doc.tasks.find(x => x.id === 'a1').indent === true, 'то же место — отступ остаётся');
    A.editTask(store, 'a1', { title: 'Сдать отчёт!', kind: 'day', date: '2026-10-10', time: '', deadline: a1.deadline });
    ok(!store.doc.tasks.find(x => x.id === 'a1').indent, 'editTask с новой датой');
    eq(store.doc.tasks.find(x => x.id === 'a1').deadline, '2026-10-12', 'дедлайн не изменился');
  });
  test(I, 'решение по хвосту (на завтра / на дату) сбрасывает отступ', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    const d = JSON.parse(V4_RAW);
    d.tasks.push(T('b1', 'Хвост', { kind: 'day', date: '2026-10-06' }, { indent: true }), T('b2', 'Хвост 2', { kind: 'day', date: '2026-10-06' }, { indent: true }));
    const s = setup({ [KEYS.data]: JSON.stringify(d) }).store;
    A.reviewTask(s, 'b1', 'tomorrow', '', 'am');
    ok(!s.doc.tasks.find(x => x.id === 'b1').indent);
    A.reviewTask(s, 'b2', 'date', '2026-10-15', 'am');
    ok(!s.doc.tasks.find(x => x.id === 'b2').indent);
    ok(store);
  });
  test(I, 'clearTailIndents: сбрасывает только у хвостов, не пишет, когда нечего сбрасывать', () => {
    const d = JSON.parse(V4_RAW);
    d.tasks.push(T('b1', 'Вчера', { kind: 'day', date: '2026-10-08' }, { indent: true }), T('b2', 'Сегодня', { kind: 'day', date: '2026-10-09' }, { indent: true }),
      T('b3', 'Старая неделя', { kind: 'week', date: '2026-09-28' }, { indent: true }), T('b4', 'Эта неделя', { kind: 'week', date: '2026-10-05' }, { indent: true }),
      T('b5', 'Вчера, готово', { kind: 'day', date: '2026-10-08' }, { indent: true, done: true }));
    const { store } = setup({ [KEYS.data]: JSON.stringify(d) });
    eq(A.clearTailIndents(store), 2);
    eq(store.doc.tasks.filter(x => x.indent).map(x => x.id).sort(), ['b2', 'b4', 'b5']);
    const stamp = store.doc.updatedAt;
    ok(!A.clearTailIndents(store), 'второй вызов ничего не пишет');
    eq(store.doc.updatedAt, stamp);
  });
  test(I, 'граница планового дня: в 02:30 при отсечке 03:00 вчерашняя задача ещё не хвост; в 03:00 — хвост', () => {
    const d = JSON.parse(V4_RAW);
    d.settings.day.cutoff = '03:00';
    d.tasks.push(T('b1', 'Пятница', { kind: 'day', date: '2026-10-09' }, { indent: true }));
    const { store, clock } = setup({ [KEYS.data]: JSON.stringify(d) }, [2026, 10, 10, 2, 30]);
    A.clearTailIndents(store);
    ok(store.doc.tasks.find(x => x.id === 'b1').indent === true, '02:30 — ещё пятница');
    clock.set(2026, 10, 10, 3, 0);
    A.clearTailIndents(store);
    ok(!store.doc.tasks.find(x => x.id === 'b1').indent, '03:00 — уже суббота, пятничная задача стала хвостом');
  });
  test(I, 'копия задачи не наследует отступ и отметку «готово»', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    A.setIndent(store, 'a3', true); A.setTaskDone(store, 'a3', true);
    const id = A.duplicateTask(store, 'a3');
    const c = store.doc.tasks.find(x => x.id === id);
    ok(!c.indent && !c.done && c.title === 'Без даты');
  });

  // ---------- Home and Buy ----------
  const H = 'Дом и «Купить»';
  test(H, 'первое добавление создаёт единственный список «Дом» с состоянием «Есть»; повторы по названию не добавляются', () => {
    const { store } = setup();
    eq(A.addHomeItems(store, 'Соль\n\n  Сахар  \nсоль'), 2);
    const home = homeList(store.doc);
    ok(home && home.kind === 'home');
    eq(home.items.map(i => i.title), ['Соль', 'Сахар']);
    eq(home.items.map(i => stockOf(i)), ['have', 'have']);
    eq(A.addHomeItems(store, 'СОЛЬ'), true, 'ничего нового');
    eq(store.doc.lists.filter(isHomeList).length, 1);
  });
  test(H, 'ровно три состояния; в «Купить» попадает только «Закончилось»', () => {
    const { store } = setup();
    A.addHomeItems(store, 'Соль\nСахар\nЧай');
    const [a, b, c] = homeList(store.doc).items.map(i => i.id);
    ok(A.setStock(store, a, 'low')); ok(A.setStock(store, b, 'out'));
    eq(buyItems(store.doc).map(i => i.title), ['Сахар'], '«Заканчивается» не попадает в «Купить»');
    ok(A.setStock(store, a, 'out'));
    eq(buyItems(store.doc).map(i => i.title).sort(), ['Сахар', 'Соль']);
    ok(!A.setStock(store, c, 'много'), 'четвёртого состояния нет');
    eq(stockOf(homeList(store.doc).items[2]), 'have');
    ok(A.setStock(store, a, 'have'));
    eq(buyItems(store.doc).map(i => i.title), ['Сахар']);
  });
  test(H, 'отметка «куплено» возвращает «Есть» в «Дом»: запись не удаляется и не дублируется', () => {
    const { store } = setup();
    A.addHomeItems(store, 'Соль\nСахар');
    const [a] = homeList(store.doc).items.map(i => i.id);
    A.setStock(store, a, 'out');
    ok(A.markBought(store, a));
    const home = homeList(store.doc);
    eq(home.items.length, 2);
    eq(home.items.map(i => [i.title, stockOf(i), !!i.deletedAt]), [['Соль', 'have', false], ['Сахар', 'have', false]]);
    eq(buyItems(store.doc), []);
    A.markBought(store, a);
    eq(home.items.length, 2, 'повторная отметка ничего не меняет');
  });
  test(H, 'личные списки «Купить» и «Дом» остаются обычными и не смешиваются со встроенными', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    A.addHomeItems(store, 'Соль');
    ok(activeLists(store.doc).some(l => l.id === 'l2'), 'личный «Купить» виден среди списков');
    ok(activeLists(store.doc).some(l => l.id === 'l3'), 'личный «Дом» виден среди списков');
    ok(!activeLists(store.doc).some(isHomeList), 'встроенный «Дом» среди обычных списков не показывается');
    eq(homeList(store.doc).items.map(i => i.title), ['Соль']);
    eq(buyItems(store.doc), [], 'пункты личного «Купить» в генерируемый список не попадают');
    eq(store.doc.lists.find(l => l.id === 'l2').items.map(i => i.title), ['Лампочка']);
    eq(ordinaryLists(store.doc).length, 3);
  });
  test(H, '«Дом» не попадает в удалённые, а удаление пункта «Дом» можно вернуть', () => {
    const { store } = setup();
    A.addHomeItems(store, 'Соль');
    const id = homeList(store.doc).items[0].id;
    ok(A.deleteContainerItem(store, 'lists', homeList(store.doc).id, id));
    eq(homeItems(store.doc), []);
    ok(!deletedRecords(store.doc).some(r => r.collection === 'lists'));
    ok(homeList(store.doc), 'сам список «Дом» остался');
  });
  test(H, 'списки из шаблонов и шаблоны не затронуты «Домом»', () => {
    const { store } = setup();
    const before = JSON.stringify(listTemplates(store.doc, 'ru'));
    A.addHomeItems(store, 'Соль');
    const id = A.createListFromTemplate(store, 'builtin:supermarket');
    ok(id);
    eq(JSON.stringify(listTemplates(store.doc, 'ru')), before, 'шаблон не изменился');
    ok(activeLists(store.doc).some(l => l.id === id));
  });

  // ---------- task <-> event ----------
  const C = 'Задача ↔ событие';
  test(C, 'задача → событие: название, дата и время сохранены; исходная задача мягко удалена; дубликатов нет', () => {
    const d = JSON.parse(V4_RAW);
    d.tasks.push(T('c1', 'Зубной', { kind: 'day', date: '2026-10-14' }, { time: '16:30' }));
    const { store } = setup({ [KEYS.data]: JSON.stringify(d) });
    const eb = store.doc.events.filter(e => !e.deletedAt).length, tb = store.doc.tasks.filter(x => !x.deletedAt).length;
    const id = A.convertTaskToEvent(store, 'c1');
    ok(typeof id === 'string');
    const e = store.doc.events.find(x => x.id === id);
    eq([e.title, e.start], ['Зубной', '2026-10-14T16:30']);
    eq(store.doc.events.filter(x => !x.deletedAt).length, eb + 1);
    eq(store.doc.tasks.filter(x => !x.deletedAt).length, tb - 1);
    ok(store.doc.tasks.find(x => x.id === 'c1').deletedAt, 'исходная задача в «Удалённых»');
    ok(deletedRecords(store.doc).some(r => r.id === 'c1'));
  });
  test(C, 'задача без даты: нужна дата и время; с дедлайном — только после подтверждения, иначе ничего не меняется', () => {
    const d = JSON.parse(V4_RAW);
    d.tasks.push(T('c1', 'Позвонить', { kind: 'none', date: null }, { deadline: '2026-10-20' }));
    const { store } = setup({ [KEYS.data]: JSON.stringify(d) });
    const snap = JSON.stringify(store.doc.tasks) + JSON.stringify(store.doc.events);
    ok(!A.convertTaskToEvent(store, 'c1', { date: '', time: '10:00' }), 'без даты нельзя');
    ok(!A.convertTaskToEvent(store, 'c1', { date: '2026-10-15', time: '' }), 'без времени нельзя');
    ok(!A.convertTaskToEvent(store, 'c1', { date: '2026-10-15', time: '10:00' }), 'дедлайн потерялся бы — нужно подтверждение');
    eq(JSON.stringify(store.doc.tasks) + JSON.stringify(store.doc.events), snap, 'ничего не изменилось');
    ok(A.convertTaskToEvent(store, 'c1', { date: '2026-10-15', time: '10:00', confirmed: true }));
    ok(store.doc.events.some(e => e.title === 'Позвонить' && e.start === '2026-10-15T10:00'));
    ok(store.doc.tasks.find(x => x.id === 'c1').deletedAt && store.doc.tasks.find(x => x.id === 'c1').deadline === '2026-10-20', 'дедлайн сохранён в удалённой записи');
  });
  test(C, 'выполненная задача и повторяющаяся: «готово» требует подтверждения; повтор не преобразуется', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    ok(!A.convertTaskToEvent(store, 'a2', { date: '2026-10-05', time: '09:00' }), 'выполненная — нужно подтверждение');
    ok(!A.convertTaskToEvent(store, 'a4', { time: '09:00', confirmed: true }), 'вхождение повтора нельзя');
    ok(!store.doc.tasks.find(x => x.id === 'a4').deletedAt);
    eq(A.taskConversionLosses(store.doc.tasks.find(x => x.id === 'a2')), ['done']);
    eq(A.taskConversionLosses(store.doc.tasks.find(x => x.id === 'a1')), ['deadline', 'review']);
  });
  test(C, 'событие → задача: название, дата и время сохранены; подготовка и конец требуют подтверждения', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    A.createPrep(store, 'e1'); A.addPrepItems(store, 'e1', 'Конспект');
    eq(A.eventConversionLosses(store.doc.events[0]), ['prep', 'end']);
    ok(!A.convertEventToTask(store, 'e1'), 'без подтверждения нельзя');
    ok(!store.doc.events[0].deletedAt);
    const id = A.convertEventToTask(store, 'e1', { confirmed: true });
    const t1 = store.doc.tasks.find(x => x.id === id);
    eq([t1.title, t1.plan, t1.time], ['Лекция', { kind: 'day', date: '2026-10-09' }, '10:00']);
    ok(store.doc.events[0].deletedAt);
    eq(store.doc.events[0].prep.map(i => i.title), ['Конспект'], 'подготовка осталась в удалённом событии');
    ok(!A.restoreDeleted(store, 'events', 'e1'), 'пока активна копия-задача, возврат без подтверждения не проходит');
    ok(A.restoreDeleted(store, 'events', 'e1', { confirmed: true }), 'событие можно вернуть с подтверждением');
    ok(!store.doc.events[0].deletedAt && store.doc.events[0].prep.length === 1);
  });
  test(C, 'простое событие → задача проходит без подтверждения', () => {
    const d = JSON.parse(V4_RAW);
    d.events[0].end = null;
    const { store } = setup({ [KEYS.data]: JSON.stringify(d) });
    ok(A.convertEventToTask(store, 'e1'));
  });
  test(C, '«Ожидаю от других» из задачи: задача мягко удалена, запись ожидания создана', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    ok(A.taskToWaiting(store, 'a3'));
    ok(store.doc.tasks.find(x => x.id === 'a3').deletedAt);
    ok(store.doc.waiting.some(w => w.title === 'Без даты' && !w.resolved));
  });


  // ---------- restoring an original after a conversion (no duplicates) ----------
  const RC = 'Возврат исходной записи после преобразования';
  const alive = (store, title) => store.doc.tasks.filter(x => !x.deletedAt && x.title === title).length + store.doc.events.filter(x => !x.deletedAt && x.title === title).length;
  const withTask = () => {
    const d = JSON.parse(V4_RAW);
    d.tasks.push(T('c1', 'Зубной', { kind: 'day', date: '2026-10-14' }, { time: '16:30' }));
    return setup({ [KEYS.data]: JSON.stringify(d) });
  };
  test(RC, 'задача → событие → возврат задачи: без подтверждения отказ и ничего не меняется; с подтверждением активна ровно одна запись', () => {
    const { store } = withTask();
    const evId = A.convertTaskToEvent(store, 'c1');
    eq(alive(store, 'Зубной'), 1);
    const snap = JSON.stringify(store.doc.tasks) + JSON.stringify(store.doc.events);
    eq(A.restoreConflicts(store.doc, 'tasks', 'c1').map(x => [x.collection, x.id, x.title]), [['events', evId, 'Зубной']]);
    ok(!A.restoreDeleted(store, 'tasks', 'c1'), 'без подтверждения нельзя');
    eq(JSON.stringify(store.doc.tasks) + JSON.stringify(store.doc.events), snap, 'данные не изменились');
    ok(A.restoreDeleted(store, 'tasks', 'c1', { confirmed: true }));
    eq(alive(store, 'Зубной'), 1, 'активна одна запись');
    ok(!store.doc.tasks.find(x => x.id === 'c1').deletedAt);
    const ev = store.doc.events.find(x => x.id === evId);
    ok(ev.deletedAt, 'копия-событие не пропала, а лежит в «Удалённых»');
    ok(deletedRecords(store.doc).some(r => r.id === evId));
  });
  test(RC, 'событие → задача → возврат события: подготовка цела, активна одна запись; копию можно вернуть обратно (обмен)', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    A.createPrep(store, 'e1'); A.addPrepItems(store, 'e1', 'Конспект');
    const tid = A.convertEventToTask(store, 'e1', { confirmed: true });
    store.update('t', d => { d.tasks.find(x => x.id === tid).title = 'Лекция (правка)'; });
    ok(A.restoreDeleted(store, 'events', 'e1', { confirmed: true }));
    eq(alive(store, 'Лекция'), 1);
    eq(store.doc.events.find(x => x.id === 'e1').prep.map(i => i.title), ['Конспект']);
    ok(store.doc.tasks.find(x => x.id === tid).deletedAt);
    eq(store.doc.tasks.find(x => x.id === tid).title, 'Лекция (правка)', 'правки копии сохранены');
    ok(!A.restoreDeleted(store, 'tasks', tid), 'обратный возврат тоже требует подтверждения');
    ok(A.restoreDeleted(store, 'tasks', tid, { confirmed: true }));
    ok(store.doc.events.find(x => x.id === 'e1').deletedAt && !store.doc.tasks.find(x => x.id === tid).deletedAt);
    eq(store.doc.events.filter(x => !x.deletedAt && x.id === 'e1').length + store.doc.tasks.filter(x => !x.deletedAt && x.id === tid).length, 1);
  });
  test(RC, 'цепочка задача → событие → задача: возврат самой первой оставляет одну активную запись', () => {
    const { store } = withTask();
    const evId = A.convertTaskToEvent(store, 'c1');
    const t2 = A.convertEventToTask(store, evId);
    ok(t2);
    eq(alive(store, 'Зубной'), 1);
    ok(!A.restoreDeleted(store, 'tasks', 'c1'));
    ok(A.restoreDeleted(store, 'tasks', 'c1', { confirmed: true }));
    eq(alive(store, 'Зубной'), 1);
    ok(!store.doc.tasks.find(x => x.id === 'c1').deletedAt && store.doc.tasks.find(x => x.id === t2).deletedAt);
    ok(store.doc.events.find(x => x.id === evId).deletedAt, 'промежуточная запись остаётся удалённой');
  });
  test(RC, 'если копию уже удалили (или она исчезла через 30 дней), оригинал возвращается без вопросов', () => {
    const { store } = withTask();
    const evId = A.convertTaskToEvent(store, 'c1');
    A.softDelete(store, 'events', evId);
    eq(A.restoreConflicts(store.doc, 'tasks', 'c1'), []);
    ok(A.restoreDeleted(store, 'tasks', 'c1'));
    eq(alive(store, 'Зубной'), 1);
    // the copy is gone completely
    const w = withTask();
    const ev2 = A.convertTaskToEvent(w.store, 'c1');
    w.store.update('t', d => { d.events.splice(d.events.findIndex(x => x.id === ev2), 1); });
    ok(A.restoreDeleted(w.store, 'tasks', 'c1'));
    eq(alive(w.store, 'Зубной'), 1);
  });
  test(RC, 'не связанные записи с тем же названием не затрагиваются; обычное удалённое возвращается без вопросов', () => {
    const { store } = withTask();
    A.addTaskSpecs(store, [{ title: 'Зубной', kind: 'day', date: '2026-10-20', time: null, deadline: null }]);
    A.convertTaskToEvent(store, 'c1');
    const other = store.doc.tasks.find(x => x.title === 'Зубной' && x.id !== 'c1' && !x.deletedAt);
    ok(other);
    A.softDelete(store, 'tasks', other.id);
    eq(A.restoreConflicts(store.doc, 'tasks', other.id), []);
    ok(A.restoreDeleted(store, 'tasks', other.id), 'без подтверждения');
    ok(!store.doc.tasks.find(x => x.id === other.id).deletedAt);
    ok(!store.doc.events.find(x => x.title === 'Зубной').deletedAt, 'чужая копия не тронута');
  });
  test(RC, 'связь хранится и переживает перезагрузку; испорченная связь отбрасывается без карантина', () => {
    const { store } = withTask();
    const evId = A.convertTaskToEvent(store, 'c1');
    const raw = store.doc;
    eq(raw.tasks.find(x => x.id === 'c1').convertedTo, evId);
    eq(raw.events.find(x => x.id === evId).convertedFrom, 'c1');
    const d = JSON.parse(JSON.stringify(raw));
    d.tasks.find(x => x.id === 'c1').convertedTo = 12345;
    const again = setup({ [KEYS.data]: JSON.stringify(d) });
    eq(again.store.doc.quarantine.length, setup({ [KEYS.data]: JSON.stringify(raw) }).store.doc.quarantine.length, 'ничего нового не ушло в карантин');
    ok(!('convertedTo' in again.store.doc.tasks.find(x => x.id === 'c1')));
    const ok2 = setup({ [KEYS.data]: JSON.stringify(raw) });
    eq(ok2.store.doc.tasks.find(x => x.id === 'c1').convertedTo, evId);
  });


  // ---------- fixes after the independent review ----------
  const RV = 'Исправления после независимого обзора';
  test(RV, 'встроенный шаблон: возврат из «Удалённых» возвращает его содержимое, а не пустой шаблон', () => {
    const { store } = setup();
    ok(A.softDelete(store, 'templates', 'builtin:supermarket'));
    const rec = deletedRecords(store.doc).find(r => r.collection === 'templates');
    ok(rec);
    ok(A.restoreDeleted(store, 'templates', rec.id));
    const tpl = listTemplates(store.doc, 'ru').filter(x => x.base === 'supermarket');
    eq(tpl.length, 1, 'ровно один');
    ok(tpl[0].items.length > 5, 'с пунктами');
    eq(missingBuiltins(store.doc), []);
  });
  test(RV, 'маркер встроенного шаблона при живой копии просто убирается, дубликата нет', () => {
    const { store } = setup();
    A.softDelete(store, 'templates', 'builtin:supermarket');
    const rec = deletedRecords(store.doc).find(r => r.collection === 'templates');
    A.restoreBuiltinTemplates(store, ['supermarket']);
    ok(A.restoreDeleted(store, 'templates', rec.id));
    eq(listTemplates(store.doc, 'ru').filter(x => x.base === 'supermarket').length, 1);
  });
  test(RV, 'задача с напоминанием → событие: при смене времени нужно подтверждение, при том же времени — нет', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    A.addTaskSpecs(store, [{ title: 'Звонок', kind: 'day', date: '2026-10-09', time: '10:00', deadline: null }]);
    const id = store.doc.tasks.find(x => x.title === 'Звонок').id;
    store.update('test', d => { d.tasks.find(x => x.id === id).reminder = { minutesBefore: 15 }; });
    ok(A.taskConversionLosses(store.doc.tasks.find(x => x.id === id)).includes('reminder'));
    const snap = JSON.stringify(store.doc.events);
    ok(!A.convertTaskToEvent(store, id, { time: '11:00' }), 'время изменено — напоминание пропало бы');
    eq(JSON.stringify(store.doc.events), snap);
    ok(A.convertTaskToEvent(store, id, { time: '11:00', confirmed: true }));
    eq(store.doc.tasks.find(x => x.id === id).reminder, { minutesBefore: 15 }, 'напоминание осталось в удалённой задаче');
  });
  test(RV, '«Дом»: переименование пункта в уже существующее имя не создаёт второй пункт', () => {
    const { store } = setup();
    A.addHomeItems(store, 'Соль\nСахар');
    const h = homeList(store.doc);
    const sugar = h.items.find(i => i.title === 'Сахар');
    ok(!A.editContainerItem(store, 'lists', h.id, sugar.id, { title: ' соль ', category: null }), 'отказ');
    eq(homeList(store.doc).items.filter(i => !i.deletedAt).map(i => i.title).sort(), ['Сахар', 'Соль']);
    ok(A.editContainerItem(store, 'lists', h.id, sugar.id, { title: 'Сахар-песок', category: null }));
    ok(A.editContainerItem(store, 'lists', h.id, sugar.id, { title: 'Сахар-песок', category: null }), 'то же имя у самого себя — можно');
  });


  // ---------- finished items below unfinished ones (display only) ----------
  const DL = 'Выполненное внизу группы';
  test(DL, 'doneLast: невыполненные по порядку, затем выполненные по порядку; исходный массив не меняется', () => {
    const a = [{ id: 1, done: true }, { id: 2, done: false }, { id: 3, done: true }, { id: 4, done: false }, { id: 5, done: false }];
    const snap = JSON.stringify(a);
    eq(doneLast(a).map(x => x.id), [2, 4, 5, 1, 3]);
    eq(JSON.stringify(a), snap, 'вход не изменён');
    eq(doneLast([]).length, 0);
    eq(doneLast(a.map(x => ({ ...x, done: false }))).map(x => x.id), [1, 2, 3, 4, 5], 'без выполненных порядок тот же');
  });
  test(DL, 'отметка и снятие отметки не меняют порядок и даты записей в данных; повторяющиеся и разбор не затронуты', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    const ids = () => store.doc.tasks.map(x => x.id).join(',');
    const plans = () => JSON.stringify(store.doc.tasks.map(x => x.plan));
    const before = [ids(), plans()];
    const open = store.doc.tasks.find(x => !x.done && !x.deletedAt && !x.seriesId);
    ok(A.setTaskDone(store, open.id, true));
    ok(A.setTaskDone(store, open.id, false));
    eq([ids(), plans()], before);
    const first = doneLast(tasksForDay(store.doc, '2026-10-09'));
    eq(first.length, tasksForDay(store.doc, '2026-10-09').length, 'ничего не потеряно');
  });

  // ---------- preparation list ----------
  const R = 'Подготовка к событию';
  test(R, 'создание, добавление нескольких пунктов, отметка, правка, удаление; всё в самом событии', () => {
    const { store, storage } = setup({ [KEYS.data]: V4_RAW });
    const tasksBefore = JSON.stringify(store.doc.tasks), projBefore = JSON.stringify(store.doc.projects);
    ok(A.createPrep(store, 'e1'));
    eq(store.doc.events[0].prep, []);
    eq(A.addPrepItems(store, 'e1', 'Конспект\n\nРучка\nПаспорт'), 3);
    const [a, b] = store.doc.events[0].prep.map(i => i.id);
    ok(A.setPrepDone(store, 'e1', a, true));
    ok(A.editPrepItem(store, 'e1', b, 'Шариковая ручка'));
    ok(A.deletePrepItem(store, 'e1', store.doc.events[0].prep[2].id));
    const prep = savedDoc(storage).events[0].prep;
    eq(prep.map(i => [i.title, i.done, !!i.deletedAt]), [['Конспект', true, false], ['Шариковая ручка', false, false], ['Паспорт', false, true]]);
    eq(JSON.stringify(store.doc.tasks), tasksBefore, 'задачи не затронуты');
    eq(JSON.stringify(store.doc.projects), projBefore, 'проекты не затронуты');
  });
  test(R, 'пустой пункт и несуществующее событие отклоняются, данные не меняются', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    A.createPrep(store, 'e1');
    const snap = JSON.stringify(store.doc.events);
    ok(!A.addPrepItems(store, 'e1', '  \n '));
    ok(!A.addPrepItems(store, 'nope', 'x'));
    ok(!A.setPrepDone(store, 'e1', 'nope', true));
    eq(JSON.stringify(store.doc.events), snap);
  });
  test(R, 'удалённые пункты подготовки очищаются через 30 дней, свежие — нет', () => {
    const d = JSON.parse(V4_RAW);
    const it = (id, deletedAt) => ({ id, title: id, done: false, category: null, createdAt: NOW, updatedAt: NOW, deletedAt });
    d.events[0].prep = [it('old', '2026-08-01T10:00:00.000Z'), it('fresh', '2026-10-05T10:00:00.000Z'), it('live', null)];
    const { store } = setup({ [KEYS.data]: JSON.stringify(d) });
    eq(store.doc.events[0].prep.map(i => i.id), ['fresh', 'live']);
  });
  test(R, 'событие в календаре показывает подготовку внутри себя, не как отдельные задачи', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    A.createPrep(store, 'e1'); A.addPrepItems(store, 'e1', 'Конспект');
    const c = dayContents(store.doc, '2026-10-09', '2026-10-09');
    eq(c.events.map(e => e.title), ['Лекция']);
    ok(!c.tasks.some(x => x.title === 'Конспект'));
  });

  // ---------- fast entry: default day ----------
  const Q5 = 'Быстрый ввод 0.5.0';
  test(Q5, 'строки без даты получают плановый день (а не «Без даты»); пустые строки игнорируются; ничего не теряется', () => {
    const { store } = setup();
    const r = A.splitQuick('Позвонить маме\n\n  Купить хлеб \nОплатить счёт\n', { kind: 'day', date: '2026-10-09' }, '2026-10-09');
    eq(r.specs.map(s => [s.title, s.kind, s.date]), [['Позвонить маме', 'day', '2026-10-09'], ['Купить хлеб', 'day', '2026-10-09'], ['Оплатить счёт', 'day', '2026-10-09']]);
    eq(r.rest, ''); ok(!r.ask);
    ok(A.addTaskSpecs(store, r.specs));
    eq(tasksForDay(store.doc, '2026-10-09').map(x => x.title), ['Позвонить маме', 'Купить хлеб', 'Оплатить счёт']);
  });
  test(Q5, 'ночью (плановый день ещё вчерашний) задача получает плановый день, а не календарную дату', () => {
    const d = JSON.parse(V4_RAW); d.settings.day.cutoff = '03:00';
    const { store } = setup({ [KEYS.data]: JSON.stringify(d) }, [2026, 10, 10, 1, 15]);
    eq(store.planningToday(), '2026-10-09');
    const r = A.splitQuick('Дописать письмо', { kind: 'day', date: store.planningToday() }, store.planningToday());
    A.addTaskSpecs(store, r.specs);
    eq(store.doc.tasks.find(x => x.title === 'Дописать письмо').plan, { kind: 'day', date: '2026-10-09' });
  });
  test(Q5, 'из календаря: выбранная дата — настоящая; явная дата в тексте важнее выбранной', () => {
    const r = A.splitQuick('Купить подарок\nСдать отчёт 20 октября\nbuy tickets tomorrow', { kind: 'day', date: '2026-11-03' }, '2026-10-09');
    eq(r.specs.map(s => [s.title, s.kind, s.date]), [['Купить подарок', 'day', '2026-11-03'], ['Сдать отчёт', 'day', '2026-10-20'], ['buy tickets', 'day', '2026-10-10']]);
  });
  test(Q5, 'строка со временем спрашивает «задача или событие?»; остальной текст остаётся целиком', () => {
    const r = A.splitQuick('Первое\nВрач завтра в 15:00\nТретье', { kind: 'day', date: '2026-10-09' }, '2026-10-09');
    eq(r.specs.map(s => s.title), ['Первое']);
    eq([r.ask.title, r.ask.date, r.ask.time], ['Врач', '2026-10-10', '15:00']);
    eq(r.rest, 'Врач завтра в 15:00\nТретье');
  });
  test(Q5, 'время без даты в календаре: берётся выбранная дата', () => {
    const r = A.splitQuick('Йога в 18:30', { kind: 'day', date: '2026-11-03' }, '2026-10-09');
    eq([r.ask.date, r.ask.time], ['2026-11-03', '18:30']);
  });

  // ---------- list items in bulk ----------
  const L = 'Списки 0.5.0';
  test(L, 'несколько пунктов за раз в обычный список и в шаблон; шаблон из встроенного создаётся копией', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    eq(A.addContainerItems(store, 'lists', 'l1', 'Яйца\n\nСыр', 'Молочное'), 2);
    eq(store.doc.lists[0].items.map(i => [i.title, i.category]).slice(2), [['Яйца', 'Молочное'], ['Сыр', 'Молочное']]);
    ok(!A.addContainerItems(store, 'lists', 'l1', ' '));
    const supermarket = JSON.stringify(listTemplates(store.doc, 'ru').find(x => x.id === 'builtin:supermarket').items.length);
    ok(A.addContainerItems(store, 'templates', 'builtin:supermarket', 'Кофе молотый'));
    eq(store.doc.templates.filter(x => x.base === 'supermarket').length, 1, 'встроенный стал обычной записью один раз');
    ok(Number(supermarket) > 0);
  });
  test(L, 'список из шаблона не меняет шаблон и не переносит отметки', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    const before = JSON.stringify(store.doc.templates);
    const id = A.createListFromTemplate(store, 'tp1');
    eq(JSON.stringify(store.doc.templates), before);
    const l = store.doc.lists.find(x => x.id === id);
    eq(l.items.map(i => [i.title, i.done, i.category]), [['Хлеб', false, 'Выпечка']]);
  });

  // ---------- texts ----------
  const X = 'Тексты 0.5.0';
  const ph = s => (s.match(/\{[^}]+\}/g) || []).map(x => x.replace(/\|.*\}/, '}')).sort();
  test(X, 'все новые тексты есть на обоих языках с одинаковыми подстановками', () => {
    eq(Object.keys(RU5).sort(), Object.keys(EN5).sort());
    for (const k of Object.keys(RU5)) eq(ph(RU5[k]), ph(EN5[k]), k);
  });
  test(X, 'новые тексты работают через t() на обоих языках', () => {
    setLang('en');
    eq([t('stock.out'), t('lists.buy'), t('lists.home')], ['Out', 'Buy', 'Home']);
    eq(dayLong('2026-10-09'), 'October 9');
    setLang('ru');
    eq([t('stock.out'), t('stock.low'), t('stock.have')], ['Закончилось', 'Заканчивается', 'Есть']);
    eq(dayLong('2026-10-09'), '9 октября');
    eq(dayLong('2026-01-01'), '1 января');
  });

  // ---------- limits stay in force ----------
  test(G, 'новые действия не нарушают предел: не больше пяти ежедневных копий', () => {
    const { store, clock } = setup({ [KEYS.data]: V4_RAW });
    for (let i = 0; i < 8; i++) { clock.addDays(1); A.addHomeItems(store, 'вещь' + i); A.setIndent(store, 'a3', i % 2 === 0); }
    eq(dailyCopies(store).length, 5);
  });
  test(G, 'создание событий и задач через код не требует новых обязательных полей', () => {
    const t1 = newTask({ id: 'x', title: 'y', plan: { kind: 'none', date: null }, now: NOW });
    ok(!('indent' in t1));
    const e1 = newEvent({ id: 'z', title: 'q', start: '2026-10-09T10:00', now: NOW });
    ok(!('prep' in e1));
  });

  // ---------- fixes after the independent review ----------
  const F = 'Исправления после обзора';
  test(F, 'правка и удаление пункта встроенного шаблона работают с первого раза, копия одна', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    ok(A.editContainerItem(store, 'templates', 'builtin:supermarket', 'supermarket-0', { title: 'Своё', category: null }));
    eq(store.doc.templates.filter(x => x.base === 'supermarket').length, 1);
    ok(A.deleteContainerItem(store, 'templates', 'builtin:supermarket', 'supermarket-1'));
    eq(store.doc.templates.filter(x => x.base === 'supermarket').length, 1, 'вторая правка использует ту же копию');
    const tpl = store.doc.templates.find(x => x.base === 'supermarket');
    eq(tpl.items.find(i => i.id === 'supermarket-0').title, 'Своё');
    ok(tpl.items.find(i => i.id === 'supermarket-1').deletedAt);
  });
  test(F, 'вернуть стандартные шаблоны: после возврата кнопка исчезает, шаблон один', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    ok(A.softDelete(store, 'templates', 'builtin:supermarket'));
    eq(missingBuiltins(store.doc), ['supermarket']);
    ok(A.restoreBuiltinTemplates(store, missingBuiltins(store.doc)));
    eq(missingBuiltins(store.doc), [], 'кнопка больше не показывается');
    eq(listTemplates(store.doc, 'ru').filter(x => x.base === 'supermarket').length, 1);
  });
  test(F, 'дубликат задачи сохраняет напоминание; задача → событие переносит его в оповещение', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    A.addTaskSpecs(store, [{ title: 'С напоминанием', kind: 'day', date: '2026-10-09', time: '10:00', deadline: null }]);
    const id = store.doc.tasks.find(x => x.title === 'С напоминанием').id;
    store.update('test', d => { d.tasks.find(x => x.id === id).reminder = { minutesBefore: 15 }; });
    const copyId = A.duplicateTask(store, id);
    eq(store.doc.tasks.find(x => x.id === copyId).reminder, { minutesBefore: 15 });
    const evId = A.convertTaskToEvent(store, id, {});
    eq(store.doc.events.find(x => x.id === evId).alerts, [{ minutesBefore: 15 }]);
  });
  test(F, '«Жду ответа»: срок задачи становится датой напоминания и не пропадает', () => {
    const { store } = setup({ [KEYS.data]: V4_RAW });
    ok(A.taskToWaiting(store, 'a1'));
    const w = store.doc.waiting.find(x => x.title === 'Сдать отчёт');
    eq(w.followUp, '2026-10-12');
  });
}
