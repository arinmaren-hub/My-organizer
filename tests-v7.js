// Tests added in 0.7.0 («Цели»). Registered from tests.js (same runner, same page).

import { SCHEMA_VERSION, normalizeDoc, findLostRecords, countActive, emptyDoc, newGoal, newItem } from './schema.js';
import { KEYS } from './storage.js';
import * as A from './actions.js';
import { nextStep, nextSteps, goalProgress, activeGoals, reachedGoals, liveSteps, noteHtml } from './goals.js';
import { searchRecords } from './search.js';
import { deletedRecords, tasksScreen } from './selectors.js';
import { buildBackupText, parseBackupText } from './backup.js';
import { findCleanup, removeCleanup } from './cleanup.js';
import { countsText } from './i18n.js';
import { esc } from './util.js';

export function registerV7(h) {
  const { test, eq, ok, setup, savedDoc, rollbackCopies } = h;
  const G = 'Версия 0.7.0 — цели';
  const NOW = '2026-11-15T09:00:00.000Z';
  const clone = x => JSON.parse(JSON.stringify(x));
  const titles = list => list.map(x => x.title);
  const goal = (store, i = 0) => store.doc.goals.filter(g => !g.deletedAt)[i];

  // ---------- upgrade from 0.6.0 (schema 5) ----------
  test(G, 'данные 0.6.0 (схема 5): все записи на месте, добавлен пустой список целей, есть страховочная копия', () => {
    const a = setup();
    A.addTasksFromText(a.store, 'Купить хлеб\nПозвонить');
    A.addSeries(a.store, { title: 'Полив', freq: 'weekly', interval: 1, mode: 'fixed', startDate: '2026-10-09', time: '08:00' });
    A.addSeries(a.store, { title: 'Йога', freq: 'weekly', interval: 1, mode: 'fixed', startDate: '2026-10-09', time: '19:00', kind: 'event', until: '2026-12-31' });
    A.addEvent(a.store, { title: 'Ужин', start: '2026-10-09T19:00' });
    const old = clone(a.store.doc);
    old.schemaVersion = 5;
    delete old.goals; // exactly what 0.6.0 wrote
    const b = setup({ [KEYS.data]: JSON.stringify(old) });
    ok(!b.store.status.readOnly);
    const after = clone(b.store.doc);
    eq(after.schemaVersion, 6);
    eq(SCHEMA_VERSION, 6);
    for (const k of ['tasks', 'events', 'series', 'lists', 'templates', 'waiting', 'projects', 'settings', 'quarantine', 'dataId']) eq(after[k], old[k], k);
    eq(after.goals, [], 'целей пока нет');
    eq(rollbackCopies(b.store).length, 1, 'копия данных до перехода сохранена');
    eq(savedDoc(b.storage).schemaVersion, 6);
  });

  test(G, 'данные новее (схема 7) открываются только для чтения и не меняются', () => {
    const raw = JSON.stringify({ ...emptyDoc(NOW), schemaVersion: 7, goals: [{ id: 'g', title: 'X', steps: [] }] });
    const { store, storage } = setup({ [KEYS.data]: raw });
    ok(store.status.readOnly);
    eq(storage.get(KEYS.data), raw);
    eq(A.addGoal(store, { title: 'Новая' }), false, 'ничего не записывается');
  });

  // ---------- validation ----------
  test(G, 'проверка целей: сломанная цель и сломанный шаг уходят в карантин по отдельности', () => {
    const d = emptyDoc(NOW);
    const g = newGoal({ id: 'g1', title: 'Аудиокнига', now: NOW });
    g.steps = [newItem({ id: 's1', title: 'Тестовое задание', now: NOW }), { id: 's2', title: 42, done: false }, newItem({ id: 's3', title: 'Запись', now: NOW })];
    d.goals = [g, { id: 'bad id!', title: 'Без id', steps: [] }, { id: 'g3', title: 'Заметка не текст', note: 5, steps: [] }, { id: 'g4', title: 'Шаги не список', steps: 'x' }];
    const res = normalizeDoc(d, { now: NOW });
    eq(res.doc.goals.map(x => x.id), ['g1']);
    eq(titles(res.doc.goals[0].steps), ['Тестовое задание', 'Запись'], 'хорошие шаги остались, порядок тот же');
    eq(res.quarantined.map(q => q.collection).sort(), ['goals', 'goals', 'goals', 'goals.steps']);
    eq(findLostRecords(d, res), null, 'ничего не потеряно: всё загружено или в карантине');
  });

  test(G, 'необязательные поля: заметка по умолчанию пустая, неверное время шага убирается, «Хранить» только true', () => {
    const d = emptyDoc(NOW);
    d.goals = [{ id: 'g', title: 'Цель', steps: [{ ...newItem({ id: 's', title: 'Шаг', now: NOW }), done: true, doneAt: 'вчера' }, { ...newItem({ id: 't', title: 'Шаг 2', now: NOW }), doneAt: NOW }], keep: 'да' }];
    const r = normalizeDoc(d, { now: NOW });
    const g = r.doc.goals[0];
    eq(g.note, ''); eq(g.doneAt, null); ok(!('keep' in g));
    ok(!('doneAt' in g.steps[0]), 'неверное время убрано'); ok(g.steps[0].done, 'отметка осталась');
    ok(!('doneAt' in g.steps[1]), 'у невыполненного шага времени выполнения нет');
    eq(r.quarantined.length, 0);
  });

  test(G, 'проверка потерь замечает пропавший шаг', () => {
    const d = emptyDoc(NOW);
    const g = newGoal({ id: 'g', title: 'Цель', now: NOW });
    g.steps = [newItem({ id: 'a', title: 'A', now: NOW }), newItem({ id: 'b', title: 'B', now: NOW })];
    d.goals = [g];
    const res = normalizeDoc(d, { now: NOW });
    eq(findLostRecords(d, res), null);
    res.doc.goals[0].steps.pop();
    eq(findLostRecords(d, res), 'goals.steps');
    eq(findLostRecords(d, { ...res, doc: { ...res.doc, goals: [] } }), 'goals');
  });

  // ---------- creating and working with goals ----------
  test(G, 'новая цель с шагами по одному на строку; следующий шаг — первый невыполненный', () => {
    const { store } = setup();
    const id = A.addGoal(store, { title: '  Записать аудиокнигу ', steps: 'Сделать тестовое задание\n\n  Записать пробную главу\nОтправить' });
    ok(typeof id === 'string');
    const g = goal(store);
    eq(g.id, id); eq(g.title, 'Записать аудиокнигу');
    eq(titles(g.steps), ['Сделать тестовое задание', 'Записать пробную главу', 'Отправить']);
    eq(nextStep(g).title, 'Сделать тестовое задание');
    eq(goalProgress(g), { done: 0, total: 3 });
    eq(A.addGoal(store, { title: '   ' }), false, 'без названия цель не создаётся');
    eq(store.doc.goals.length, 1);
  });

  test(G, 'отметка шага: следующий шаг сдвигается, снятие отметки возвращает его; время выполнения записывается', () => {
    const { store } = setup();
    A.addGoal(store, { title: 'Раскопки агоры', steps: 'Написать поллали\nЗаполнить анкету' });
    const g = () => goal(store);
    const [s1, s2] = g().steps.map(x => x.id);
    A.setGoalStepDone(store, g().id, s1, true);
    eq(nextStep(g()).id, s2);
    ok(typeof g().steps[0].doneAt === 'string');
    eq(titles(g().steps), ['Написать поллали', 'Заполнить анкету'], 'выполненный шаг остаётся на своём месте');
    A.setGoalStepDone(store, g().id, s1, false);
    eq(nextStep(g()).id, s1);
    ok(!('doneAt' in g().steps[0]));
    A.setGoalStepDone(store, g().id, s1, true); A.setGoalStepDone(store, g().id, s2, true);
    eq(nextStep(g()), null, 'все шаги сделаны');
  });

  test(G, 'шаги можно переставить выше/ниже (удалённые не мешают), края ничего не меняют', () => {
    const { store } = setup();
    A.addGoal(store, { title: 'Цель', steps: 'A\nB\nC\nD' });
    const g = () => goal(store);
    const id = n => g().steps.find(x => x.title === n).id;
    A.deleteGoalStep(store, g().id, id('B'));
    A.moveGoalStep(store, g().id, id('C'), -1);
    eq(titles(liveSteps(g())), ['C', 'A', 'D']);
    A.moveGoalStep(store, g().id, id('C'), -1);
    eq(titles(liveSteps(g())), ['C', 'A', 'D'], 'выше первого некуда');
    A.moveGoalStep(store, g().id, id('A'), 1);
    eq(titles(liveSteps(g())), ['C', 'D', 'A']);
    eq(g().steps.length, 4, 'удалённый шаг всё ещё в данных');
  });

  test(G, 'удаление шага и его отмена; переименование шага и цели; заметка', () => {
    const { store } = setup();
    A.addGoal(store, { title: 'Речь', steps: 'Прочитать книгу' });
    const g = () => goal(store);
    const s = g().steps[0].id;
    A.deleteGoalStep(store, g().id, s);
    eq(liveSteps(g()).length, 0);
    A.undoGoalStepDelete(store, g().id, s);
    eq(titles(liveSteps(g())), ['Прочитать книгу']);
    A.editGoalStep(store, g().id, s, '  Прочитать «Риторику» ');
    eq(g().steps[0].title, 'Прочитать «Риторику»');
    eq(A.editGoalStep(store, g().id, s, ' '), false, 'пустое название не принимается');
    A.renameGoal(store, g().id, 'Красивая речь');
    eq(g().title, 'Красивая речь');
    A.setGoalNote(store, g().id, 'Книги:\nhttps://example.org/book\n\n');
    eq(g().note, 'Книги:\nhttps://example.org/book', 'пустые строки в конце убираются');
  });

  test(G, 'цель достигнута: уходит в «Достигнутые», шаги не меняются, в «Задачах» её шага нет; можно вернуть', () => {
    const { store } = setup();
    A.addGoal(store, { title: 'Первая', steps: 'шаг 1' });
    A.addGoal(store, { title: 'Вторая', steps: 'шаг A' });
    A.addGoal(store, { title: 'Без шагов' });
    eq(nextSteps(store.doc).map(x => x.goal.title), ['Первая', 'Вторая']);
    const first = goal(store).id;
    const before = clone(goal(store).steps);
    A.setGoalReached(store, first, true);
    eq(titles(activeGoals(store.doc)), ['Вторая', 'Без шагов']);
    eq(titles(reachedGoals(store.doc)), ['Первая']);
    eq(store.doc.goals.find(g => g.id === first).steps, before);
    eq(nextSteps(store.doc).map(x => x.goal.title), ['Вторая']);
    A.setGoalReached(store, first, false);
    eq(nextSteps(store.doc).map(x => x.goal.title), ['Первая', 'Вторая']);
  });

  test(G, 'пауза: шаг цели не показывается в «Задачах», цель и шаги не меняются; снятие паузы возвращает шаг', () => {
    const { store } = setup();
    A.addGoal(store, { title: 'Литрес', steps: 'Тестовое аудио' });
    A.addGoal(store, { title: 'Агора', steps: 'Поллали' });
    const id = goal(store).id;
    const steps = clone(goal(store).steps);
    A.setGoalPaused(store, id, true);
    ok(typeof goal(store).pausedAt === 'string');
    eq(nextSteps(store.doc).map(x => x.goal.title), ['Агора']);
    eq(titles(activeGoals(store.doc)), ['Литрес', 'Агора'], 'цель на паузе остаётся в списке целей');
    eq(goal(store).steps, steps);
    A.setGoalPaused(store, id, false);
    ok(!('pausedAt' in goal(store)));
    eq(nextSteps(store.doc).map(x => x.goal.title), ['Литрес', 'Агора']);
    const d = emptyDoc(NOW); d.goals = [{ ...newGoal({ id: 'g', title: 'X', now: NOW }), pausedAt: 'когда-то' }];
    ok(!('pausedAt' in normalizeDoc(d, { now: NOW }).doc.goals[0]), 'неверное время паузы убирается');
  });

  test(G, 'у шагов нет дат: прошедшие дни ничего не меняют, шаги не становятся «хвостами»', () => {
    const { store, clock } = setup();
    A.addGoal(store, { title: 'Цель', steps: 'Шаг' });
    const before = clone(store.doc.goals);
    clock.addDays(10);
    A.syncSeries(store); A.clearTailIndents(store);
    eq(store.doc.goals, before);
    eq(nextSteps(store.doc).map(x => x.step.title), ['Шаг']);
    ok(!JSON.stringify(store.doc.goals).includes('"plan"'), 'у шага нет плана/даты');
  });

  test(G, 'цели не создают и не меняют задачи; экран «Задачи» прежний', () => {
    const { store } = setup();
    A.addTasksFromText(store, 'Без даты');
    const before = clone(store.doc.tasks);
    const scr = clone(tasksScreen(store.doc, '2026-10-09'));
    A.addGoal(store, { title: 'Цель', steps: 'шаг' });
    A.setGoalStepDone(store, goal(store).id, goal(store).steps[0].id, true);
    eq(store.doc.tasks, before);
    eq(clone(tasksScreen(store.doc, '2026-10-09')), scr);
  });

  test(G, 'удаление цели: в «Удалённых», восстановление возвращает её целиком', () => {
    const { store } = setup();
    A.addGoal(store, { title: 'Аудиокнига', steps: 'тест\nзапись' });
    const id = goal(store).id;
    const was = clone(goal(store));
    A.softDelete(store, 'goals', id);
    eq(activeGoals(store.doc).length, 0);
    eq(nextSteps(store.doc).length, 0);
    const del = deletedRecords(store.doc).find(r => r.collection === 'goals');
    eq(del && del.label, 'Аудиокнига');
    A.restoreDeleted(store, 'goals', id);
    const now = clone(store.doc.goals[0]);
    eq({ ...now, updatedAt: null }, { ...was, updatedAt: null });
  });

  test(G, 'через 30 дней удалённые цели и шаги убираются, остальное остаётся', () => {
    const d = emptyDoc(NOW);
    const old = '2026-09-01T09:00:00.000Z';
    const keep = newGoal({ id: 'g1', title: 'Живая', now: old });
    keep.steps = [{ ...newItem({ id: 'a', title: 'старый удалённый шаг', now: old }), deletedAt: old }, newItem({ id: 'b', title: 'шаг', now: old })];
    const gone = { ...newGoal({ id: 'g2', title: 'Давно удалённая', now: old }), deletedAt: old };
    d.goals = [keep, gone];
    d.schemaVersion = 6;
    const { store } = setup({ [KEYS.data]: JSON.stringify(d) }, [2026, 11, 15]);
    eq(store.doc.goals.map(g => g.id), ['g1']);
    eq(titles(store.doc.goals[0].steps), ['шаг']);
  });

  // ---------- search, backup, cleanup, counts ----------
  test(G, 'поиск находит цель по названию и заметке и шаг цели; удалённое не находит; цели после записей с датой', () => {
    const { store } = setup();
    A.addEvent(store, { title: 'Ужин с Аней', start: '2026-09-01T19:00' });
    A.addGoal(store, { title: 'Ужин для друзей', steps: 'Выбрать рецепт ужина\nКупить продукты' });
    A.addGoal(store, { title: 'Красивая речь' });
    A.setGoalNote(store, goal(store, 1).id, 'Книга про ужин и беседу');
    A.addGoal(store, { title: 'Ужин удалённый' });
    A.softDelete(store, 'goals', goal(store, 2).id);
    const before = JSON.stringify(store.doc);
    const r = searchRecords(store.doc, 'ужин');
    eq(r.map(x => x.type), ['event', 'goal', 'goal', 'step']);
    eq(r[1].title, 'Ужин для друзей');
    eq(r[2].title, 'Красивая речь'); ok(r[2].inNote);
    eq(r[3].goalTitle, 'Ужин для друзей');
    eq(JSON.stringify(store.doc), before, 'поиск ничего не меняет');
  });

  test(G, 'резервная копия содержит цели и шаги и импортируется без потерь', () => {
    const { store } = setup();
    A.addGoal(store, { title: 'Аудиокнига', steps: 'тест\nзапись', note: 'идея' });
    A.setGoalStepDone(store, goal(store).id, goal(store).steps[0].id, true);
    const text = buildBackupText(store.doc, NOW);
    eq(JSON.parse(text).schemaVersion, 6);
    const p = parseBackupText(text, NOW);
    ok(p.ok);
    eq(p.doc.goals, store.doc.goals);
    eq(p.quarantined.length, 0);
  });

  test(G, 'очистка никогда не предлагает и не удаляет цели и шаги', () => {
    const { store } = setup();
    A.addGoal(store, { title: 'Старая цель', steps: 'шаг' });
    A.setGoalStepDone(store, goal(store).id, goal(store).steps[0].id, true);
    A.setGoalReached(store, goal(store).id, true);
    const d = clone(store.doc);
    for (const g of d.goals) { g.createdAt = g.updatedAt = g.doneAt = '2025-01-01T09:00:00.000Z'; for (const s of g.steps) s.updatedAt = s.doneAt = '2025-01-01T09:00:00.000Z'; }
    const f = findCleanup(d, '2026-11-15', NOW);
    ok(!JSON.stringify(f).includes('Старая цель'));
    const before = clone(d.goals);
    removeCleanup(d, '2026-11-15', NOW, null);
    eq(d.goals, before);
  });

  test(G, 'счётчики и описание копии упоминают цели только когда они есть', () => {
    const { store } = setup();
    ok(!('goals' in countActive(store.doc)));
    A.addGoal(store, { title: 'A' }); A.addGoal(store, { title: 'B' });
    eq(countActive(store.doc).goals, 2);
    ok(/2/.test(countsText(countActive(store.doc))));
  });

  test(G, 'заметка: текст экранируется, ссылками становятся только http/https', () => {
    eq(noteHtml('<b>книга</b> https://ex.org/a?b=1&c=2, ещё', esc),
      '&lt;b&gt;книга&lt;/b&gt; <a href="https://ex.org/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">https://ex.org/a?b=1&amp;c=2</a>, ещё');
    ok(!noteHtml('javascript:alert(1) data:text/html,x', esc).includes('<a'), 'другие схемы не ссылки');
    eq(noteHtml('см. http://x.org/p.', esc), 'см. <a href="http://x.org/p" target="_blank" rel="noopener noreferrer">http://x.org/p</a>.');
    eq(noteHtml('"><img src=x onerror=1>', esc).includes('<img'), false);
  });
}
