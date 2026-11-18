// Tests added in 0.8.0 («Сегодня / Завтра», «Повторять», several weekdays). Registered from tests.js.

import { SCHEMA_VERSION, normalizeDoc, emptyDoc, newSeries } from './schema.js';
import { KEYS } from './storage.js';
import * as A from './actions.js';
import { fixedDatesBetween, upcomingDates } from './recur.js';
import { ruleText } from './view-tasks.js';
import { DICTS, setLang, t } from './i18n.js';
import { RU8 } from './i18n-v8.js';

export function registerV8(h) {
  const { test, eq, ok, setup, savedDoc, rollbackCopies } = h;
  const G = 'Версия 0.8.0 — повтор и «завтра»';
  const NOW = '2026-10-09T09:00:00.000Z';
  const clone = x => JSON.parse(JSON.stringify(x));
  const live = (list) => list.filter(x => !x.deletedAt);
  const ser = (o) => ({ ...newSeries({ id: 's', title: 'X', freq: 'weekly', interval: 1, mode: 'fixed', startDate: '2026-11-23', time: '18:00', now: NOW }), ...o });
  const lastEvent = store => store.doc.events[store.doc.events.length - 1];
  const lastTask = store => store.doc.tasks[store.doc.tasks.length - 1];

  // ---------- data format ----------
  test(G, 'данные 0.7.0 (схема 6): всё на месте, схема 7, есть страховочная копия', () => {
    const a = setup();
    A.addTasksFromText(a.store, 'Купить хлеб');
    A.addSeries(a.store, { title: 'Полив', freq: 'weekly', interval: 1, mode: 'fixed', startDate: '2026-10-09' });
    A.addGoal(a.store, { title: 'Цель', steps: 'шаг' });
    A.addEvent(a.store, { title: 'Иконопись', start: '2026-10-12T18:00' });
    const old = clone(a.store.doc); old.schemaVersion = 6;
    const b = setup({ [KEYS.data]: JSON.stringify(old) });
    ok(!b.store.status.readOnly);
    eq(SCHEMA_VERSION, 7);
    eq(b.store.doc.schemaVersion, 7);
    for (const k of ['tasks', 'events', 'series', 'lists', 'templates', 'waiting', 'projects', 'goals', 'settings', 'quarantine', 'dataId']) eq(clone(b.store.doc)[k], old[k], k);
    eq(rollbackCopies(b.store).length, 1);
    eq(savedDoc(b.storage).schemaVersion, 7);
  });

  test(G, 'проверка правила: дни недели только для «каждую неделю по календарю»; плохие значения убираются, правило остаётся', () => {
    const d = emptyDoc(NOW);
    d.series = [ser({ id: 'a', days: [4, 1, 4, 9, 'x'] }), ser({ id: 'b', freq: 'daily', days: [1, 4] }), ser({ id: 'c', mode: 'completion', days: [1, 4] }),
      ser({ id: 'd', days: [1] }), ser({ id: 'e', days: 'пн' }), ser({ id: 'f', days: [3] })];
    const r = normalizeDoc(d, { now: NOW });
    eq(r.quarantined.length, 0);
    const by = id => r.doc.series.find(s => s.id === id);
    eq(by('a').days, [1, 4]);
    for (const id of ['b', 'c', 'd', 'e']) ok(!('days' in by(id)), id);
    eq(by('f').days, [3], 'другой день недели, чем начало, сохраняется');
  });

  test(G, 'пометка «было до правила» хранится только у связанной записи', () => {
    const d = emptyDoc(NOW);
    d.series = [ser({})];
    d.events = [{ id: 'e1', title: 'A', start: '2026-11-23T18:00', end: null, seriesId: 's', occurrenceDate: '2026-11-23', seriesOrigin: true, createdAt: NOW, updatedAt: NOW, deletedAt: null },
      { id: 'e2', title: 'B', start: '2026-11-24T18:00', end: null, seriesOrigin: true, createdAt: NOW, updatedAt: NOW, deletedAt: null }];
    const r = normalizeDoc(d, { now: NOW });
    ok(r.doc.events.find(e => e.id === 'e1').seriesOrigin === true);
    ok(!('seriesOrigin' in r.doc.events.find(e => e.id === 'e2')));
  });

  // ---------- several weekdays ----------
  test(G, 'по дням недели: пн и чт каждую неделю; каждые 2 недели; начало в середине недели; дата окончания', () => {
    eq(fixedDatesBetween(ser({ days: [1, 4] }), null, '2026-12-03'), ['2026-11-23', '2026-11-26', '2026-11-30', '2026-12-03']);
    eq(fixedDatesBetween(ser({ days: [1, 4], interval: 2 }), null, '2026-12-10'), ['2026-11-23', '2026-11-26', '2026-12-07', '2026-12-10']);
    eq(fixedDatesBetween(ser({ startDate: '2026-11-25', days: [1, 4] }), null, '2026-12-01'), ['2026-11-26', '2026-11-30']);
    eq(fixedDatesBetween(ser({ days: [1, 4], until: '2026-11-30' }), null, '2026-12-31'), ['2026-11-23', '2026-11-26', '2026-11-30']);
    eq(fixedDatesBetween(ser({ days: [1, 4] }), '2026-11-26', '2026-12-03'), ['2026-11-30', '2026-12-03'], 'после уже созданных');
    eq(upcomingDates(ser({ days: [1, 4] }), '2026-11-27', 2), ['2026-11-30', '2026-12-03']);
    eq(fixedDatesBetween(ser({ days: [7, 1], startDate: '2026-12-27' }), null, '2027-01-04'), ['2026-12-27', '2026-12-28', '2027-01-03', '2027-01-04'], 'через Новый год');
  });

  test(G, 'повторяющееся событие по пн и чт: только эти дни, не в прошлом; текст правила', () => {
    const { store } = setup();
    const id = A.addSeries(store, { title: 'Иконопись', kind: 'event', freq: 'weekly', interval: 1, startDate: '2026-10-05', time: '18:00', days: [1, 4] });
    const s = store.doc.series.find(x => x.id === id);
    eq(s.days, [1, 4]);
    const dates = live(store.doc.events).filter(e => e.seriesId === id).map(e => e.occurrenceDate).sort();
    eq(dates.slice(0, 4), ['2026-10-12', '2026-10-15', '2026-10-19', '2026-10-22'], 'с сегодняшнего дня (пт 9 окт), прошлых нет');
    ok(dates.every(d => [1, 4].includes(new Date(d + 'T12:00').getDay() || 7)));
    eq(ruleText(s), 'каждую неделю: пн, чт');
  });

  test(G, 'дни недели у правила задачи «от выполнения» делают его «по календарю»', () => {
    const { store } = setup();
    const id = A.addSeries(store, { title: 'Спорт', freq: 'weekly', interval: 1, mode: 'completion', startDate: '2026-10-09', days: [2, 5] });
    const s = store.doc.series.find(x => x.id === id);
    eq(s.mode, 'fixed'); eq(s.days, [2, 5]);
    const id2 = A.addSeries(store, { title: 'Полив', freq: 'weekly', interval: 1, mode: 'completion', startDate: '2026-10-09', days: [5] });
    const s2 = store.doc.series.find(x => x.id === id2);
    eq(s2.mode, 'completion', 'только день начала — обычное правило'); ok(!('days' in s2));
  });

  test(G, 'смена дней у повторяющегося события пересоздаёт только нетронутые будущие', () => {
    const { store } = setup();
    const id = A.addSeries(store, { title: 'Иконопись', kind: 'event', freq: 'weekly', interval: 1, startDate: '2026-10-12', time: '18:00' });
    const first = live(store.doc.events).find(e => e.occurrenceDate === '2026-10-19');
    A.editEvent(store, first.id, { title: 'Иконопись (другой зал)', start: '2026-10-19T18:00', end: '' });
    A.editSeries(store, id, { title: 'Иконопись', freq: 'weekly', interval: 1, startDate: '2026-10-12', time: '18:00', days: [1, 4] });
    const ev = live(store.doc.events).filter(e => e.seriesId === id);
    ok(ev.some(e => e.title === 'Иконопись (другой зал)'), 'изменённое вручную осталось');
    ok(ev.some(e => e.occurrenceDate === '2026-10-15'), 'добавились четверги');
    eq(ev.filter(e => e.occurrenceDate === '2026-10-19').length, 1, 'нет дублей');
  });

  // ---------- «Повторять» from an event ----------
  test(G, '«Повторять» у события: оно становится первым, правило с его временем, без дубля; подготовка на месте', () => {
    const { store } = setup();
    A.addEvent(store, { title: 'Иконопись урок', start: '2026-10-12T18:00' });
    const e = lastEvent(store);
    A.editEvent(store, e.id, { title: 'Иконопись урок', start: '2026-10-12T18:00', end: '2026-10-12T20:00' });
    A.createPrep(store, e.id); A.addPrepItems(store, e.id, 'Кисти\nЛевкас');
    const before = clone(store.doc.events.find(x => x.id === e.id));
    const sid = A.repeatRecord(store, 'events', e.id, { freq: 'weekly', interval: 1 });
    ok(typeof sid === 'string');
    const s = store.doc.series.find(x => x.id === sid);
    eq([s.kind, s.freq, s.interval, s.startDate, s.time, s.endTime, s.title], ['event', 'weekly', 1, '2026-10-12', '18:00', '20:00', 'Иконопись урок']);
    const me = store.doc.events.find(x => x.id === e.id);
    eq([me.seriesId, me.occurrenceDate, me.seriesOrigin], [sid, '2026-10-12', true]);
    eq({ ...me, seriesId: undefined, occurrenceDate: undefined, seriesOrigin: undefined, updatedAt: null }, { ...before, updatedAt: null }, 'событие не изменилось');
    const mine = live(store.doc.events).filter(x => x.seriesId === sid);
    eq(mine.filter(x => x.occurrenceDate === '2026-10-12').length, 1, 'на 12-е только оно само');
    ok(mine.some(x => x.occurrenceDate === '2026-10-19' && x.start === '2026-10-19T18:00' && x.end === '2026-10-19T20:00'));
    eq(A.repeatRecord(store, 'events', e.id, { freq: 'daily', interval: 1 }), false, 'второй раз нельзя');
  });

  test(G, '«Повторять» по дням недели: день самого события входит всегда', () => {
    const { store } = setup();
    A.addEvent(store, { title: 'Урок', start: '2026-10-12T18:00' }); // понедельник
    const sid = A.repeatRecord(store, 'events', lastEvent(store).id, { freq: 'weekly', interval: 1, days: [4] });
    eq(store.doc.series.find(x => x.id === sid).days, [1, 4]);
    const sid2 = (A.addEvent(store, { title: 'Другой', start: '2026-10-13T10:00' }), A.repeatRecord(store, 'events', lastEvent(store).id, { freq: 'weekly', interval: 1, days: [2] }));
    ok(!('days' in store.doc.series.find(x => x.id === sid2)), 'только свой день — обычное «каждую неделю»');
  });

  test(G, 'удаление правила не трогает событие, с которого всё началось; восстановление не делает копию', () => {
    const { store } = setup();
    A.addEvent(store, { title: 'Иконопись', start: '2026-10-12T18:00' });
    const e = lastEvent(store);
    const sid = A.repeatRecord(store, 'events', e.id, { freq: 'weekly', interval: 1 });
    ok(live(store.doc.events).filter(x => x.seriesId === sid).length > 10);
    A.softDelete(store, 'series', sid);
    const me = store.doc.events.find(x => x.id === e.id);
    ok(!me.deletedAt, 'событие осталось'); ok(!me.seriesId && !me.seriesOrigin, 'и стало обычным');
    eq(live(store.doc.events).filter(x => x.seriesId === sid).length, 0, 'созданные правилом будущие убраны');
    A.restoreDeleted(store, 'series', sid);
    eq(live(store.doc.events).filter(x => x.start.startsWith('2026-10-12')).length, 1, 'на 12-е по-прежнему одно событие');
  });

  test(G, 'изменение правила не удаляет исходное событие', () => {
    const { store } = setup();
    A.addEvent(store, { title: 'Иконопись', start: '2026-10-12T18:00' });
    const e = lastEvent(store);
    const sid = A.repeatRecord(store, 'events', e.id, { freq: 'weekly', interval: 1 });
    A.editSeries(store, sid, { title: 'Иконопись', freq: 'weekly', interval: 2, startDate: '2026-10-12', time: '18:00' });
    ok(store.doc.events.some(x => x.id === e.id && !x.deletedAt));
  });

  // ---------- «Повторять» from a task ----------
  test(G, '«Повторять» у задачи без даты: первый раз сегодня, следующий появляется в свой день, дублей нет', () => {
    const { store, clock } = setup();
    A.addTasksFromText(store, 'Полить цветы');
    const task = lastTask(store);
    A.editTask(store, task.id, { title: 'Полить цветы', kind: 'none', date: '', time: '', deadline: '' });
    const sid = A.repeatRecord(store, 'tasks', task.id, { freq: 'daily', interval: 1 });
    const me = store.doc.tasks.find(x => x.id === task.id);
    eq([me.plan.kind, me.plan.date, me.seriesId, me.occurrenceDate, me.seriesOrigin], ['day', '2026-10-09', sid, '2026-10-09', true]);
    eq(live(store.doc.tasks).filter(x => x.seriesId === sid).length, 1);
    clock.addDays(1); A.syncSeries(store);
    eq(live(store.doc.tasks).filter(x => x.seriesId === sid).map(x => x.occurrenceDate).sort(), ['2026-10-09', '2026-10-10']);
  });

  test(G, '«Повторять» у старой задачи: прошлые даты не заполняются', () => {
    const { store } = setup();
    A.addTasksFromText(store, 'Отчёт');
    const task = lastTask(store);
    A.editTask(store, task.id, { title: 'Отчёт', kind: 'day', date: '2026-09-21', time: '', deadline: '' });
    const sid = A.repeatRecord(store, 'tasks', task.id, { freq: 'weekly', interval: 1 });
    eq(live(store.doc.tasks).filter(x => x.seriesId === sid).map(x => x.occurrenceDate), ['2026-09-21']);
  });

  test(G, 'удаление правила задачи оставляет саму задачу', () => {
    const { store } = setup();
    A.addTasksFromText(store, 'Йога');
    const task = lastTask(store);
    const sid = A.repeatRecord(store, 'tasks', task.id, { freq: 'weekly', interval: 1 });
    A.softDelete(store, 'series', sid);
    const me = store.doc.tasks.find(x => x.id === task.id);
    ok(!me.deletedAt); eq([me.seriesId, me.occurrenceDate], [null, null]); ok(!('seriesOrigin' in me));
    A.restoreDeleted(store, 'series', sid);
    eq(live(store.doc.tasks).filter(x => x.title === 'Йога' && x.plan.date === '2026-10-09').length, 1, 'восстановление правила не делает копию на тот же день');
  });

  test(G, 'то же для правила «от выполнения»', () => {
    const { store } = setup();
    A.addTasksFromText(store, 'Полить');
    const task = lastTask(store);
    const sid = A.repeatRecord(store, 'tasks', task.id, { freq: 'weekly', interval: 1, mode: 'completion' });
    eq(store.doc.series.find(x => x.id === sid).mode, 'completion');
    A.softDelete(store, 'series', sid);
    A.restoreDeleted(store, 'series', sid);
    eq(live(store.doc.tasks).filter(x => x.title === 'Полить').map(x => x.plan.date).sort(), ['2026-10-09', '2026-10-16']);
  });

  // ---------- «Сегодня / Завтра» ----------
  test(G, '«Завтра»: строки без даты идут на завтра, дата в самой строке важнее', () => {
    const r = A.splitQuick('Купить хлеб\nПозвонить маме в пятницу\nСегодня: вынести мусор', { kind: 'day', date: '2026-10-10' }, '2026-10-09');
    eq(r.specs.map(s => [s.title, s.date]), [['Купить хлеб', '2026-10-10'], ['Позвонить маме', '2026-10-16'], ['вынести мусор', '2026-10-09']]);
  });

  // ---------- English paused ----------
  test(G, 'английский на паузе: новые тексты в английском режиме показываются по-русски, а не ключом', () => {
    for (const k of Object.keys(RU8)) eq(DICTS.en[k], DICTS.ru[k], k);
    setLang('en');
    const s = t('repeat.btn');
    setLang('ru');
    eq(s, 'Повторять');
  });
}
