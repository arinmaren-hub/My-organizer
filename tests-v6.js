// Tests added in 0.6.0. Registered from tests.js (same runner, same page).

import { SCHEMA_VERSION, normalizeDoc, newTask, newEvent } from './schema.js';
import { KEYS } from './storage.js';
import { createStore } from './store.js';
import * as A from './actions.js';
import { fixedDatesBetween, ensureOccurrences } from './recur.js';
import { tasksScreen } from './selectors.js';
import { searchRecords, searchListItems, normalize } from './search.js';
import { dayContents } from './calendar.js';
import { findCleanup, removeCleanup, readState, reminderDue, cutoffFor, estimateSizes, CLEANUP_DAYS } from './cleanup.js';
import { addDays } from './dates.js';

export function registerV6(h) {
  const { test, eq, ok, setup, makeClock, savedDoc, rollbackCopies } = h;
  const G = 'Версия 0.6.0';
  const NOW = '2026-10-09T09:00:00.000Z';
  const clone = x => JSON.parse(JSON.stringify(x));
  const ids = list => list.map(x => x.title);

  // ---------- upgrade from 0.5.2 (schema 4) ----------
  test(G, 'данные 0.5.2: все записи на месте, старые повторы работают, есть страховочная копия', () => {
    const a = setup();
    A.addTasksFromText(a.store, 'Купить хлеб\nПозвонить');
    A.addSeries(a.store, { title: 'Полив', freq: 'weekly', interval: 1, mode: 'fixed', startDate: '2026-10-09', time: '08:00' });
    A.addSeries(a.store, { title: 'Зарядка', freq: 'daily', interval: 2, mode: 'completion', startDate: '2026-10-09' });
    A.addEvent(a.store, { title: 'Лекция', start: '2026-10-09T10:00' });
    const old = clone(a.store.doc);
    old.schemaVersion = 4; // exactly what 0.5.2 wrote: none of the new optional fields exist
    for (const s of old.series) for (const k of ['until', 'monthBy', 'kind', 'endTime', 'skip']) ok(!(k in s), 'в старой серии нет поля ' + k);
    const raw = JSON.stringify(old);
    const b = setup({ [KEYS.data]: raw });
    ok(!b.store.status.readOnly);
    const after = clone(b.store.doc);
    eq(after.schemaVersion, 5);
    for (const k of ['tasks', 'events', 'series', 'lists', 'templates', 'waiting', 'projects']) eq(after[k], old[k], k);
    eq(rollbackCopies(b.store).length, 1, 'копия данных до перехода сохранена');
    eq(SCHEMA_VERSION, 5);
  });

  // ---------- recurrence ----------
  test(G, 'правило «второй вторник месяца» и «последняя пятница»', () => {
    const mk = o => ({ id: 's', freq: 'monthly', interval: 1, mode: 'fixed', startDate: '2026-10-13', ...o });
    eq(fixedDatesBetween(mk({ monthBy: 'nth' }), null, '2027-01-31'), ['2026-10-13', '2026-11-10', '2026-12-08', '2027-01-12']);
    eq(fixedDatesBetween(mk({ startDate: '2026-10-30', monthBy: 'last' }), null, '2027-01-31'), ['2026-10-30', '2026-11-27', '2026-12-25', '2027-01-29']);
    eq(fixedDatesBetween({ id: 's', freq: 'monthly', interval: 1, mode: 'fixed', startDate: '2026-01-31' }, null, '2026-05-31'),
      ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'], 'без нового правила всё как раньше');
  });
  test(G, 'дата окончания: после неё повторов нет (фиксированные и «после выполнения»)', () => {
    eq(fixedDatesBetween({ id: 's', freq: 'weekly', interval: 1, mode: 'fixed', startDate: '2026-10-05', until: '2026-10-19' }, null, '2027-01-01'), ['2026-10-05', '2026-10-12', '2026-10-19']);
    const { store, clock } = setup();
    A.addSeries(store, { title: 'Ежедневно', freq: 'daily', interval: 1, mode: 'completion', startDate: '2026-10-09', until: '2026-10-10' });
    const open = () => store.doc.tasks.filter(t => !t.deletedAt && !t.done);
    eq(open().map(t => t.occurrenceDate), ['2026-10-09']);
    A.setTaskDone(store, open()[0].id, true);
    eq(open().map(t => t.occurrenceDate), ['2026-10-10'], 'последний повтор до даты окончания');
    A.setTaskDone(store, open()[0].id, true);
    eq(open().length, 0, 'дальше повторов нет');
  });
  test(G, 'дата окончания раньше начала отклоняется', () => {
    const { store } = setup();
    eq(A.addSeries(store, { title: 'X', freq: 'weekly', interval: 1, mode: 'fixed', startDate: '2026-10-09', until: '2026-10-01' }), false);
    eq(store.doc.series.length, 0);
  });
  test(G, 'повторяющееся событие: создаётся на 400 дней вперёд, в прошлое не добавляет, без дублей', () => {
    const { store, clock } = setup();
    const id = A.addSeries(store, { title: 'Планёрка', freq: 'weekly', interval: 1, kind: 'event', startDate: '2026-10-05', time: '10:00', endTime: '11:00' });
    ok(typeof id === 'string');
    const evs = () => store.doc.events.filter(e => e.seriesId === id);
    ok(evs().length >= 55 && evs().length <= 60, 'около 57 недель: ' + evs().length);
    ok(evs().every(e => e.start.slice(0, 10) >= '2026-10-09'), 'ничего в прошлом');
    ok(evs().every(e => e.start.endsWith('T10:00') && e.end.endsWith('T11:00')));
    const n = evs().length;
    A.syncSeries(store); A.syncSeries(store);
    eq(evs().length, n, 'повторная синхронизация не создаёт дубли');
    eq(new Set(evs().map(e => e.occurrenceDate)).size, n);
    clock.addDays(30);
    A.syncSeries(store);
    ok(evs().length > n, 'горизонт сдвинулся');
    eq(new Set(evs().map(e => e.occurrenceDate)).size, evs().length, 'по-прежнему без дублей');
  });
  test(G, 'повторяющееся событие: без времени начала нельзя; конец не раньше начала', () => {
    const { store } = setup();
    eq(A.addSeries(store, { title: 'E', freq: 'weekly', interval: 1, kind: 'event', startDate: '2026-10-09' }), false);
    eq(A.addSeries(store, { title: 'E', freq: 'weekly', interval: 1, kind: 'event', startDate: '2026-10-09', time: '10:00', endTime: '09:00' }), false);
  });
  test(G, 'удалённое повторение события пропускается навсегда; восстановление возвращает дату', () => {
    const { store } = setup();
    const id = A.addSeries(store, { title: 'Кружок', freq: 'weekly', interval: 1, kind: 'event', startDate: '2026-10-12', time: '17:00' });
    const second = store.doc.events.filter(e => e.seriesId === id).sort((a, b) => a.start.localeCompare(b.start))[1];
    A.softDelete(store, 'events', second.id);
    eq(store.doc.series[0].skip, [second.occurrenceDate]);
    A.syncSeries(store);
    eq(store.doc.events.filter(e => e.seriesId === id && e.occurrenceDate === second.occurrenceDate && !e.deletedAt).length, 0, 'не воссоздаётся');
    eq(store.doc.events.filter(e => e.seriesId === id && e.occurrenceDate === second.occurrenceDate).length, 1, 'пара одна');
    A.restoreDeleted(store, 'events', second.id);
    ok(!store.doc.series[0].skip, 'дата снята со списка пропусков');
    ok(!store.doc.events.find(e => e.id === second.id).deletedAt);
  });
  test(G, 'изменение правила события пересоздаёт только нетронутые будущие; правленое остаётся', () => {
    const { store } = setup();
    const id = A.addSeries(store, { title: 'Йога', freq: 'weekly', interval: 1, kind: 'event', startDate: '2026-10-12', time: '19:00' });
    const evs = () => store.doc.events.filter(e => e.seriesId === id && !e.deletedAt).sort((a, b) => a.start.localeCompare(b.start));
    const edited = evs()[2];
    A.editEvent(store, edited.id, { title: 'Йога (гости)', start: edited.start, end: edited.end });
    A.editSeries(store, id, { title: 'Йога', freq: 'weekly', interval: 2, kind: 'event', startDate: '2026-10-12', time: '19:00' }, false);
    ok(evs().some(e => e.id === edited.id && e.title === 'Йога (гости)'), 'правленое событие на месте');
    const dates = evs().filter(e => e.id !== edited.id).map(e => e.occurrenceDate);
    ok(dates.length > 20);
    ok(dates.every(d => ((Date.parse(d) - Date.parse('2026-10-12')) / 864e5) % 14 === 0), 'остальные — через неделю');
    eq(new Set(evs().map(e => e.occurrenceDate)).size, evs().length, 'без дублей');
  });
  test(G, 'удаление серии событий: нетронутые будущие исчезают, прошедшие и правленые остаются', () => {
    const { store, clock } = setup();
    const id = A.addSeries(store, { title: 'Планёрка', freq: 'daily', interval: 1, kind: 'event', startDate: '2026-10-09', time: '09:00' });
    clock.addDays(3);
    A.syncSeries(store);
    const past = store.doc.events.filter(e => e.seriesId === id && e.occurrenceDate < '2026-10-12').length;
    ok(past >= 3);
    A.softDelete(store, 'series', id);
    const left = store.doc.events.filter(e => e.seriesId === id && !e.deletedAt);
    eq(left.length, past, 'прошедшие остались как история');
    ok(left.every(e => e.occurrenceDate < '2026-10-12'));
  });
  test(G, 'событие-повтор нельзя превратить в задачу, пока оно в серии', () => {
    const { store } = setup();
    const id = A.addSeries(store, { title: 'Йога', freq: 'weekly', interval: 1, kind: 'event', startDate: '2026-10-12', time: '19:00' });
    const e = store.doc.events.find(x => x.seriesId === id);
    eq(A.convertEventToTask(store, e.id), false);
    ok(store.doc.events.find(x => x.id === e.id && !x.deletedAt));
  });
  test(G, 'схема: лишние поля серии и keep проверяются мягко', () => {
    const { store } = setup();
    A.addSeries(store, { title: 'С', freq: 'weekly', interval: 1, mode: 'fixed', startDate: '2026-10-09' });
    const d = clone(store.doc);
    d.series[0].until = 'не дата'; d.series[0].monthBy = 'xx'; d.series[0].skip = ['2026-10-10', 'bad', '2026-10-10']; d.series[0].kind = 'zzz';
    d.series[0].endTime = '10:00';
    d.tasks.push(newTask({ id: 'kk', title: 'k', plan: { kind: 'none', date: null }, now: NOW }));
    d.tasks[d.tasks.length - 1].keep = 'yes';
    const r = normalizeDoc(d, { now: NOW });
    ok(!r.fatal);
    eq(r.quarantined.length, 0);
    const s = r.doc.series[0];
    ok(!('until' in s) && !('monthBy' in s) && !('kind' in s) && !('endTime' in s));
    eq(s.skip, ['2026-10-10']);
    ok(!('keep' in r.doc.tasks.find(x => x.id === 'kk')));
  });

  // ---------- Tasks screen ----------
  const mkTask = (id, title, plan, extra = {}) => ({ ...newTask({ id, title, plan, now: NOW }), ...extra });
  function docWith(tasks, events = []) {
    const { store } = setup();
    const d = clone(store.doc);
    d.tasks = tasks; d.events = events;
    return d;
  }
  test(G, 'экран «Задачи»: без даты / эта неделя / позже; прошлое и выполненное не показывается', () => {
    const d = docWith([
      mkTask('n1', 'Без даты', { kind: 'none', date: null }),
      mkTask('n2', 'Без даты готово', { kind: 'none', date: null }, { done: true, completedAt: NOW }),
      mkTask('w1', 'Пн', { kind: 'day', date: '2026-10-05' }),
      mkTask('w2', 'Пт', { kind: 'day', date: '2026-10-09' }),
      mkTask('w3', 'Вс', { kind: 'day', date: '2026-10-11' }),
      mkTask('w4', 'Пт готово', { kind: 'day', date: '2026-10-09' }, { done: true, completedAt: NOW }),
      mkTask('w5', 'Неделя без дня', { kind: 'week', date: '2026-10-05' }),
      mkTask('l1', 'Следующий пн', { kind: 'day', date: '2026-10-12' }),
      mkTask('l2', 'Через две недели', { kind: 'week', date: '2026-10-19' }),
      mkTask('p1', 'Прошлая неделя', { kind: 'day', date: '2026-10-02' }),
      mkTask('p2', 'Прошлая неделя (неделя)', { kind: 'week', date: '2026-09-28' }),
      mkTask('x1', 'Удалена', { kind: 'day', date: '2026-10-09' }, { deletedAt: NOW })
    ]);
    const s = tasksScreen(d, '2026-10-09');
    eq(ids(s.none), ['Без даты']);
    eq(s.week.days.map(g => [g.date, ids(g.tasks)]), [['2026-10-05', ['Пн']], ['2026-10-09', ['Пт']], ['2026-10-11', ['Вс']]]);
    eq(ids(s.week.noDay), ['Неделя без дня']);
    eq(s.later.map(g => [g.date, g.kind, ids(g.tasks)]), [['2026-10-12', 'day', ['Следующий пн']], ['2026-10-19', 'week', ['Через две недели']]]);
    eq(s.laterCount, 2);
  });
  test(G, 'неделя Пн–Вс: в воскресенье это та же неделя, в понедельник — новая', () => {
    const d = docWith([mkTask('a', 'Вс', { kind: 'day', date: '2026-10-11' }), mkTask('b', 'Пн', { kind: 'day', date: '2026-10-12' }), mkTask('c', 'Нед', { kind: 'week', date: '2026-10-12' })]);
    const sun = tasksScreen(d, '2026-10-11');
    eq(sun.week.days.map(g => g.date), ['2026-10-11']);
    eq(sun.later.map(g => g.date), ['2026-10-12', '2026-10-12']);
    eq(sun.later.map(g => g.kind), ['week', 'day'], 'неделя перед днями того же числа');
    const mon = tasksScreen(d, '2026-10-12');
    eq(mon.week.days.map(g => g.date), ['2026-10-12']);
    eq(ids(mon.week.noDay), ['Нед']);
    eq(mon.later.length, 0);
    eq(mon.week.days.flatMap(g => ids(g.tasks)), ['Пн'], 'воскресенье прошло — не показывается');
  });
  test(G, 'экран «Задачи» ничего не меняет', () => {
    const d = docWith([mkTask('a', 'A', { kind: 'none', date: null }), mkTask('b', 'B', { kind: 'day', date: '2026-10-01' })]);
    const before = JSON.stringify(d);
    tasksScreen(d, '2026-10-09');
    eq(JSON.stringify(d), before);
  });
  test(G, 'задачи без даты: несколько строк — несколько задач именно «без даты»', () => {
    const { store } = setup();
    eq(A.addTasksFromText(store, ' Первая \n\n  \nВторая\nТретья'), 3);
    ok(store.doc.tasks.every(t => t.plan.kind === 'none' && t.plan.date === null));
    eq(tasksScreen(store.doc, '2026-10-09').none.length, 3);
  });

  // ---------- search ----------
  const searchDoc = () => docWith([
    mkTask('t1', 'Ужин с Машей', { kind: 'day', date: '2026-08-14' }, { done: true, completedAt: '2026-08-14T20:00:00.000Z', doneDay: '2026-08-14' }),
    mkTask('t2', 'купить продукты на УЖИН', { kind: 'day', date: '2026-10-11' }),
    mkTask('t3', 'ужин — идея', { kind: 'none', date: null }),
    mkTask('t4', 'Ужин удалён', { kind: 'day', date: '2026-10-10' }, { deletedAt: NOW }),
    mkTask('t5', 'Ужин пропущен', { kind: 'day', date: '2026-10-12' }, { skipped: true, seriesId: 's', occurrenceDate: '2026-10-12' }),
    mkTask('t6', 'Всё про ёлку', { kind: 'week', date: '2026-09-28' })
  ], [
    { ...newEvent({ id: 'e1', title: 'Ужин в ресторане', start: '2026-08-14T19:00', end: null, now: NOW }) },
    { ...newEvent({ id: 'e2', title: 'Ужин у бабушки', start: '2026-10-20T18:30', end: null, now: NOW }) },
    { ...newEvent({ id: 'e3', title: 'Обед', start: '2026-08-14T13:00', end: null, now: NOW }) },
    { ...newEvent({ id: 'e4', title: 'Ужин отменён', start: '2026-08-15T19:00', end: null, now: NOW }), deletedAt: NOW }
  ]);
  test(G, 'поиск: «ужин» находит задачи и события разных месяцев, новые сверху, без удалённых и пропущенных', () => {
    const r = searchRecords(searchDoc(), 'ужин');
    eq(r.map(x => x.id), ['e2', 't2', 'e1', 't1', 't3']);
    eq(r.map(x => x.type), ['event', 'task', 'event', 'task', 'task']);
    eq(r[3].done, true);
    eq(r[4].date, null);
  });
  test(G, 'поиск: регистр, «ё/е», несколько слов, пустой запрос, английский', () => {
    const d = searchDoc();
    eq(searchRecords(d, 'УЖИН МАШЕЙ').map(x => x.id), ['t1']);
    eq(searchRecords(d, 'елк').map(x => x.id), ['t6'], 'ё = е');
    eq(searchRecords(d, 'ёлк').map(x => x.id), ['t6']);
    eq(searchRecords(d, '   '), []);
    eq(searchRecords(d, 'нет такого'), []);
    const e = docWith([mkTask('q', 'Dinner Plan', { kind: 'none', date: null })]);
    eq(searchRecords(e, 'dINNER').length, 1);
    eq(normalize('  ЁЖ  Ёлка '), 'еж елка');
  });
  test(G, 'поиск: несколько записей на одну дату различаются; поиск ничего не меняет', () => {
    const d = searchDoc();
    const before = JSON.stringify(d);
    const r = searchRecords(d, 'ужин').filter(x => x.date === '2026-08-14');
    eq(r.map(x => x.id), ['e1', 't1']);
    eq(JSON.stringify(d), before);
  });
  test(G, 'поиск: найденное можно показать в календаре на своей дате (в том числе выполненное и прошедшее)', () => {
    const d = searchDoc();
    const day = dayContents(d, '2026-08-14');
    ok(day.events.some(e => e.id === 'e1'));
    ok(day.tasks.some(t => t.id === 't1' && t.done), 'выполненная задача осталась на своём дне');
    const wk = dayContents(d, '2026-09-28');
    ok(wk.weekTasks.some(t => t.id === 't6'), 'задача недели видна в календаре недели');
  });
  test(G, 'поиск по пунктам списка: названия и категории', () => {
    const items = [{ id: 'a', title: 'Молоко', category: 'Молочное' }, { id: 'b', title: 'Хлеб', category: 'Выпечка' }, { id: 'c', title: 'Йогурт', category: 'Молочное' }];
    eq(searchListItems(items, 'молоч').map(i => i.id), ['a', 'c']);
    eq(searchListItems(items, 'ХЛЕБ').map(i => i.id), ['b']);
    eq(searchListItems(items, '').length, 3);
  });

  // ---------- undo (actions) ----------
  test(G, 'отмена выполнения: возвращает исходное состояние, в том числе дату выполнения', () => {
    const { store, clock } = setup();
    A.addTasksFromText(store, 'Дело', 'day', '2026-10-09');
    const id = store.doc.tasks[0].id;
    A.setTaskDone(store, id, true);
    clock.addDays(2);
    const done = clone(store.doc.tasks[0]);
    ok(done.done && done.doneDay);
    // un-tick, then undo the un-tick → the original completion day is back
    const snap = { done: true, completedAt: done.completedAt, doneDay: done.doneDay, plan: done.plan, time: null, reminder: null };
    A.setTaskDone(store, id, false);
    ok(!store.doc.tasks[0].done);
    A.undoTaskFields(store, id, snap);
    eq([store.doc.tasks[0].done, store.doc.tasks[0].completedAt, store.doc.tasks[0].doneDay], [true, done.completedAt, done.doneDay]);
  });
  test(G, 'отмена переноса: возвращает прежнюю дату и время', () => {
    const { store } = setup();
    A.addTasksFromText(store, 'Дело', 'day', '2026-10-09');
    const t0 = clone(store.doc.tasks[0]);
    A.editTask(store, t0.id, { title: 'Дело', kind: 'day', date: '2026-10-09', time: '10:00' });
    const before = clone(store.doc.tasks[0]);
    A.moveTask(store, before.id, 'day', '2026-10-15');
    eq(store.doc.tasks[0].plan.date, '2026-10-15');
    A.undoTaskFields(store, before.id, { done: false, completedAt: null, doneDay: null, plan: before.plan, time: before.time, reminder: before.reminder, indent: before.indent });
    eq([store.doc.tasks[0].plan, store.doc.tasks[0].time], [before.plan, '10:00']);
  });
  test(G, 'отмена выполнения повторяющейся задачи убирает созданный следом повтор', () => {
    const { store } = setup();
    A.addSeries(store, { title: 'Полив', freq: 'daily', interval: 1, mode: 'completion', startDate: '2026-10-09' });
    const first = store.doc.tasks[0];
    const snap = { done: false, completedAt: null, doneDay: null, plan: clone(first.plan), time: null, reminder: null };
    A.setTaskDone(store, first.id, true);
    eq(store.doc.tasks.filter(t => !t.deletedAt && !t.done).length, 1, 'следующий создан');
    A.undoTaskFields(store, first.id, snap);
    eq(store.doc.tasks.filter(t => !t.deletedAt).length, 1, 'остался один повтор');
    ok(!store.doc.tasks[0].done);
  });
  test(G, 'отмена удаления пункта списка возвращает его на место', () => {
    const { store } = setup();
    A.addList(store, 'Л');
    const lid = store.doc.lists[0].id;
    A.addContainerItems(store, 'lists', lid, 'a\nb\nc');
    const bid = store.doc.lists[0].items[1].id;
    A.deleteContainerItem(store, 'lists', lid, bid);
    ok(store.doc.lists[0].items[1].deletedAt);
    A.undoContainerItemDelete(store, 'lists', lid, bid);
    eq(store.doc.lists[0].items.map(i => [i.title, !!i.deletedAt]), [['a', false], ['b', false], ['c', false]]);
  });

  // ---------- cleanup ----------
  const TODAY = '2026-10-09';
  const old = n => addDays(TODAY, -n);
  const iso = n => `${old(n)}T09:00:00.000Z`;
  function cleanDoc() {
    const { store } = setup();
    const d = clone(store.doc);
    d.tasks = [
      mkTask('c100', 'Готово 100', { kind: 'day', date: old(120) }, { done: true, completedAt: iso(100), doneDay: old(100) }),
      mkTask('c91', 'Готово 91', { kind: 'day', date: old(91) }, { done: true, completedAt: iso(91), doneDay: old(91) }),
      mkTask('c90', 'Готово ровно 90', { kind: 'day', date: old(90) }, { done: true, completedAt: iso(90), doneDay: old(90) }),
      mkTask('c80', 'Готово 80', { kind: 'day', date: old(80) }, { done: true, completedAt: iso(80), doneDay: old(80) }),
      mkTask('cOld', 'Открыта давно', { kind: 'day', date: old(200) }),
      mkTask('cNone', 'Без даты открыта', { kind: 'none', date: null }),
      mkTask('cKeep', 'Хранить', { kind: 'day', date: old(300) }, { done: true, completedAt: iso(300), doneDay: old(300), keep: true }),
      mkTask('cSer', 'Повтор', { kind: 'day', date: old(300) }, { done: true, completedAt: iso(300), doneDay: old(300), seriesId: 'sx', occurrenceDate: old(300) }),
      mkTask('cNoDate', 'Готово без даты', { kind: 'none', date: null }, { done: true, completedAt: null, doneDay: null }),
      mkTask('cDel', 'Удалена давно', { kind: 'day', date: old(300) }, { done: true, completedAt: iso(300), doneDay: old(300), deletedAt: `${old(60)}T09:00:00.000Z` }),
      mkTask('cDelNew', 'Удалена недавно', { kind: 'day', date: old(300) }, { done: true, completedAt: iso(300), doneDay: old(300), deletedAt: `${old(5)}T09:00:00.000Z` })
    ];
    d.events = [
      newEvent({ id: 'eOld', title: 'Старое событие', start: `${old(100)}T10:00`, end: null, now: NOW }),
      newEvent({ id: 'eEdge', title: 'Событие 80', start: `${old(80)}T10:00`, end: null, now: NOW }),
      newEvent({ id: 'eFuture', title: 'Будущее', start: `${addDays(TODAY, 5)}T10:00`, end: null, now: NOW }),
      newEvent({ id: 'eLong', title: 'Длинное (кончилось недавно)', start: `${old(120)}T10:00`, end: `${old(10)}T10:00`, now: NOW }),
      { ...newEvent({ id: 'eKeep', title: 'Хранить событие', start: `${old(200)}T10:00`, end: null, now: NOW }), keep: true },
      { ...newEvent({ id: 'eSer', title: 'Повтор события', start: `${old(200)}T10:00`, end: null, now: NOW }), seriesId: 'sx', occurrenceDate: old(200) }
    ];
    const item = (id, done, at) => ({ id, title: id, done, category: null, createdAt: at, updatedAt: at, deletedAt: null });
    d.lists = [
      { ...d.lists[0] },
    ].filter(l => l.kind === 'home');
    const mkList = (id, name, items, at, extra = {}) => ({ id, name, items, categories: [], createdAt: at, updatedAt: at, deletedAt: null, ...extra });
    d.lists.push(
      mkList('lDone', 'Поездка', [item('i1', true, iso(150)), item('i2', true, iso(140))], iso(140)),
      mkList('lOpen', 'Не всё', [item('i3', true, iso(150)), item('i4', false, iso(150))], iso(150)),
      mkList('lRecent', 'Недавний', [item('i5', true, iso(150))], iso(5)),
      mkList('lEmpty', 'Пустой', [], iso(150)),
      mkList('lKeep', 'Хранить список', [item('i6', true, iso(150))], iso(150), { keep: true })
    );
    return d;
  }
  test(G, 'очистка: подходят только давно выполненные задачи, прошедшие события, завершённые списки и просроченная корзина', () => {
    const d = cleanDoc();
    const f = findCleanup(d, TODAY, `${TODAY}T10:00:00.000Z`);
    eq(f.cutoff, old(CLEANUP_DAYS));
    eq(f.tasks.map(x => x.id).sort(), ['c100', 'c91']);
    eq(f.events.map(x => x.id).sort(), ['eOld']);
    eq(f.lists.map(x => x.id), ['lDone']);
    eq(f.trash.map(x => x.id), ['cDel']);
    eq(f.total, 5);
  });
  test(G, 'очистка: не трогает невыполненное, будущее, повторы, «Хранить всегда», «Дом», шаблоны, настройки; чтение ничего не меняет', () => {
    const d = cleanDoc();
    const snapshot = JSON.stringify(d);
    const f = findCleanup(d, TODAY, `${TODAY}T10:00:00.000Z`);
    estimateSizes(d, f);
    eq(JSON.stringify(d), snapshot, 'чтение не меняет данные');
    const draft = clone(d);
    const removed = removeCleanup(draft, TODAY, `${TODAY}T10:00:00.000Z`, null);
    eq(removed, { tasks: 2, events: 1, lists: 1, trash: 1 });
    const left = new Set(draft.tasks.map(t => t.id));
    for (const id of ['c90', 'c80', 'cOld', 'cNone', 'cKeep', 'cSer', 'cNoDate', 'cDelNew']) ok(left.has(id), id + ' остаётся');
    for (const id of ['c100', 'c91', 'cDel']) ok(!left.has(id), id + ' удалена');
    eq(draft.events.map(e => e.id).sort(), ['eEdge', 'eFuture', 'eKeep', 'eLong', 'eSer']);
    eq(draft.lists.map(l => l.id).sort(), ['lEmpty', 'lKeep', 'lOpen', 'lRecent'].concat(d.lists.filter(l => l.kind === 'home').map(l => l.id)).sort());
    eq(draft.series, d.series); eq(draft.templates, d.templates); eq(draft.settings, d.settings); eq(draft.waiting, d.waiting);
  });
  test(G, 'очистка по выбору: удаляется только выбранное; устаревший выбор не удаляет защищённое', () => {
    const d = cleanDoc();
    const draft = clone(d);
    const removed = removeCleanup(draft, TODAY, `${TODAY}T10:00:00.000Z`, new Set(['tasks:c100', 'tasks:cOld', 'tasks:cKeep', 'events:eFuture']));
    eq(removed, { tasks: 1, events: 0, lists: 0, trash: 0 });
    ok(draft.tasks.some(t => t.id === 'cOld') && draft.tasks.some(t => t.id === 'cKeep'));
    ok(draft.events.some(e => e.id === 'eFuture'));
    ok(!draft.tasks.some(t => t.id === 'c100'));
  });
  test(G, 'очистка через хранилище: сохраняется, переживает перезапуск, схема остаётся валидной', () => {
    const { store, storage } = setup();
    const d = cleanDoc();
    // load the prepared document through the normal path
    const raw = JSON.stringify({ ...d, schemaVersion: SCHEMA_VERSION, dataId: 'org-test-clean' });
    const s2 = setup({ [KEYS.data]: raw });
    ok(!s2.store.status.readOnly);
    const r = A.runCleanup(s2.store, TODAY);
    ok(r && r.tasks === 2 && r.events === 1 && r.lists === 1);
    const reloaded = createStore({ storage: s2.storage, clock: s2.clock });
    reloaded.load();
    ok(!reloaded.doc.tasks.some(t => t.id === 'c100'));
    ok(reloaded.doc.tasks.some(t => t.id === 'cOld'));
    eq(reloaded.status.readOnly, false);
  });
  test(G, 'очистка: «Хранить всегда» ставится и снимается', () => {
    const { store } = setup();
    A.addTasksFromText(store, 'Дело');
    const id = store.doc.tasks[0].id;
    ok(A.setKeep(store, 'tasks', id, true));
    eq(store.doc.tasks[0].keep, true);
    ok(A.setKeep(store, 'tasks', id, false));
    ok(!('keep' in store.doc.tasks[0]));
    eq(A.setKeep(store, 'projects', id, true), false);
  });
  test(G, 'напоминание: 90 дней от первого запуска, не чаще; «через месяц» и «оставить всё»', () => {
    const base = '2026-10-09';
    const st = (o = {}) => ({ baseline: base, lastReview: null, remindAt: null, ...o });
    eq(reminderDue(st(), base), false);
    eq(reminderDue(st(), addDays(base, 89)), false);
    eq(reminderDue(st(), addDays(base, 90)), true);
    eq(reminderDue(st({ remindAt: addDays(base, 120) }), addDays(base, 100)), false, 'отложено — не каждый день');
    eq(reminderDue(st({ remindAt: addDays(base, 120) }), addDays(base, 119)), false);
    eq(reminderDue(st({ remindAt: addDays(base, 120) }), addDays(base, 120)), true);
    eq(reminderDue(st({ lastReview: addDays(base, 95) }), addDays(base, 100)), false, 'после просмотра отсчёт заново');
    eq(reminderDue(st({ lastReview: addDays(base, 95) }), addDays(base, 185)), true);
    eq(reminderDue({ baseline: null, lastReview: null, remindAt: null }, base), false);
    eq(readState({ cleanup: { baseline: 'мусор', lastReview: '2026-13-01' } }), { baseline: null, lastReview: null, remindAt: null });
    eq(readState({}), { baseline: null, lastReview: null, remindAt: null });
  });
  test(G, 'состояние напоминания хранится на устройстве, а не в данных и не в копиях', () => {
    const { store, storage } = setup();
    store.setDevice({ cleanup: { baseline: '2026-10-09', lastReview: null, remindAt: '2026-11-08' } });
    ok(!JSON.stringify(store.doc).includes('remindAt'));
    ok(!JSON.stringify(JSON.parse(storage.get(KEYS.data))).includes('remindAt'));
    eq(readState(store.device()).remindAt, '2026-11-08');
  });
  test(G, 'размер: оценка не отрицательная и считает только подходящее', () => {
    const d = cleanDoc();
    const f = findCleanup(d, TODAY, `${TODAY}T10:00:00.000Z`);
    const s = estimateSizes(d, f);
    ok(s.total > s.removable && s.removable > 0);
    eq(estimateSizes(d, { tasks: [], events: [], lists: [], trash: [] }).removable, 0);
  });
}
