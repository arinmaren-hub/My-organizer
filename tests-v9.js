// Tests added in 0.9.0 (repeat in words, «Удалить → это и все следующие»). Registered from tests.js.

import * as A from './actions.js';
import { findRepeat, untilKey } from './parserepeat.js';
import { upcomingDates } from './recur.js';
import { DICTS } from './i18n.js';
import { RU9 } from './i18n-v9.js';

export function registerV9(h) {
  const { test, eq, ok, setup } = h;
  const G = 'Версия 0.9.0 — повтор словами и удаление повтора';
  const live = list => list.filter(x => !x.deletedAt);
  const TODAY = '2026-10-09'; // the test clock: Friday 9 October 2026
  const rep = line => { const r = findRepeat(line); return r && [r.rest, r.rule.freq, r.rule.interval, r.rule.days, r.until && [r.until.d, r.until.m, r.until.y]]; };

  // ---------- reading the words ----------
  test(G, 'повтор словами: дни недели, «по …ам», будни и выходные, окончание', () => {
    eq(rep('Тренировка в зале каждый вторник, четверг и субботу до 21/12'), ['Тренировка в зале', 'weekly', 1, [2, 4, 6], [21, 12, null]]);
    eq(rep('Тренировка в зале повтор каждый вторник четверг и субботу окончание 21/12'), ['Тренировка в зале', 'weekly', 1, [2, 4, 6], [21, 12, null]]);
    eq(rep('Йога по вторникам и четвергам'), ['Йога', 'weekly', 1, [2, 4], null]);
    eq(rep('Бег по будням'), ['Бег', 'weekly', 1, [1, 2, 3, 4, 5], null]);
    eq(rep('Уборка по выходным'), ['Уборка', 'weekly', 1, [6, 7], null]);
    eq(rep('Встреча каждые 2 недели по средам до 20.01.27'), ['Встреча', 'weekly', 2, [3], [20, 1, 2027]]);
    eq(rep('Английский каждый понедельник и среду в 19:00 до 21 декабря'), ['Английский в 19:00', 'weekly', 1, [1, 3], [21, 12, null]]);
    eq(rep('Йога КАЖДЫЙ Вторник'), ['Йога', 'weekly', 1, [2], null], 'большие буквы');
    eq(rep('Сдать отчёт каждое воскресенье'), ['Сдать отчёт', 'weekly', 1, [7], null]);
  });

  test(G, 'повтор словами: дни, недели, месяцы, годы', () => {
    eq(rep('Полить цветы каждые 3 дня'), ['Полить цветы', 'daily', 3, null, null]);
    eq(rep('Витамины каждый день'), ['Витамины', 'daily', 1, null, null]);
    eq(rep('Витамины ежедневно до 31.12.2026'), ['Витамины', 'daily', 1, null, [31, 12, 2026]]);
    eq(rep('Звонок маме раз в неделю'), ['Звонок маме', 'weekly', 1, null, null]);
    eq(rep('Платёж ежемесячно'), ['Платёж', 'monthly', 1, null, null]);
    eq(rep('Отчёт каждый месяц до 31 декабря 2026'), ['Отчёт', 'monthly', 1, null, [31, 12, 2026]]);
    eq(rep('Страховка каждый год'), ['Страховка', 'yearly', 1, null, null]);
    eq(rep('Стрижка каждые два месяца'), ['Стрижка', 'monthly', 2, null, null]);
  });

  test(G, 'без слов повтора строка читается как раньше', () => {
    for (const s of ['Купить хлеб в пятницу', 'Позвонить до 21/12', 'каждый вторник', 'Стрижка каждый', 'Подарок по случаю', 'Сходить по магазинам']) eq(findRepeat(s), null, s);
  });

  test(G, 'окончание без года — ближайшая такая дата не раньше начала', () => {
    eq(untilKey({ d: 21, m: 12, y: null }, '2026-11-18'), '2026-12-21');
    eq(untilKey({ d: 5, m: 1, y: null }, '2026-11-18'), '2027-01-05');
    eq(untilKey({ d: 29, m: 2, y: null }, '2026-11-18'), '2028-02-29');
    eq(untilKey({ d: 31, m: 4, y: 2027 }, '2026-11-18'), null, 'такой даты нет');
    eq(untilKey(null, '2026-11-18'), null);
  });

  // ---------- fast entry ----------
  test(G, '«Новые дела»: строка с повтором становится повторяющейся задачей; задача появляется в свой день', () => {
    const { store, clock } = setup();
    const r = A.splitQuick('Тренировка в зале каждый вторник, четверг и субботу до 21/12\nКупить хлеб', { kind: 'day', date: TODAY }, TODAY);
    eq(r.ask, null);
    eq(r.specs[0].repeat, { freq: 'weekly', interval: 1, days: [2, 4, 6], until: '2026-12-21' });
    eq([r.specs[0].title, r.specs[0].date], ['Тренировка в зале', TODAY]);
    ok(!r.specs[1].repeat);
    A.addTaskSpecs(store, r.specs);
    const s = store.doc.series[0];
    eq([s.title, s.kind || null, s.mode, s.freq, s.days, s.until, s.startDate], ['Тренировка в зале', null, 'fixed', 'weekly', [2, 4, 6], '2026-12-21', TODAY]);
    eq(live(store.doc.tasks).map(x => x.title), ['Купить хлеб'], 'сегодня пятница — тренировки нет');
    clock.addDays(1); A.syncSeries(store);
    eq(live(store.doc.tasks).filter(x => x.seriesId === s.id).map(x => x.plan.date), ['2026-10-10'], 'в субботу появилась');
    clock.addDays(3); A.syncSeries(store);
    eq(live(store.doc.tasks).filter(x => x.seriesId === s.id).map(x => x.plan.date), ['2026-10-10', '2026-10-13'], 'и во вторник');
    const all = upcomingDates(s, '2026-12-14', 10);
    eq(all, ['2026-12-15', '2026-12-17', '2026-12-19'], 'последняя — до 21 декабря');
  });

  test(G, 'со временем — вопрос «задача или событие»; событие становится повторяющимся событием', () => {
    const { store } = setup();
    const r = A.splitQuick('Английский каждый понедельник и среду в 19:00 до 21 декабря', { kind: 'day', date: TODAY }, TODAY);
    ok(r.ask && r.ask.repeat && r.ask.time === '19:00');
    A.addEventFromSpec(store, r.ask);
    const s = store.doc.series[0];
    eq([s.kind, s.time, s.days, s.until], ['event', '19:00', [1, 3], '2026-12-21']);
    const starts = live(store.doc.events).map(e => e.start).sort();
    eq(starts.slice(0, 3), ['2026-10-12T19:00', '2026-10-14T19:00', '2026-10-19T19:00']);
    ok(starts.every(x => x <= '2026-12-21T23:59'));
  });

  test(G, 'со временем — как задача: повторяющаяся задача со временем', () => {
    const { store } = setup();
    const r = A.splitQuick('Бег по будням в 7:00', { kind: 'day', date: TODAY }, TODAY);
    A.addTaskSpecs(store, [r.ask]);
    const s = store.doc.series[0];
    eq([s.kind || null, s.time, s.days], [null, '07:00', [1, 2, 3, 4, 5]]);
    eq(live(store.doc.tasks).filter(x => x.seriesId === s.id).map(x => [x.plan.date, x.time]), [[TODAY, '07:00']], 'сегодня пятница — уже есть');
  });

  test(G, 'с «Завтра» повтор начинается завтра; свой день в строке важнее', () => {
    const r = A.splitQuick('Зарядка каждый день', { kind: 'day', date: '2026-10-10' }, TODAY);
    eq(r.specs[0].date, '2026-10-10');
    const r2 = A.splitQuick('Зарядка каждый день с понедельника', { kind: 'day', date: TODAY }, TODAY);
    eq(r2.specs[0].repeat.freq, 'daily');
  });

  // ---------- «это и все следующие» ----------
  test(G, '«Это и все следующие» у события: повтор заканчивается накануне, прошлые остаются, изменённые — в «Удалённых»', () => {
    const { store } = setup();
    const sid = A.addSeries(store, { title: 'Иконопись', kind: 'event', freq: 'weekly', interval: 1, startDate: '2026-10-12', time: '18:00' });
    const at = d => live(store.doc.events).find(e => e.seriesId === sid && e.occurrenceDate === d);
    A.editEvent(store, at('2026-11-02').id, { title: 'Иконопись (другой зал)', start: '2026-11-02T18:00', end: '' });
    const res = A.deleteRepeatFrom(store, 'events', at('2026-10-26').id);
    ok(res && !res.whole && res.n > 10);
    const s = store.doc.series.find(x => x.id === sid);
    eq([s.deletedAt, s.until], [null, '2026-10-25']);
    eq(live(store.doc.events).filter(e => e.seriesId === sid).map(e => e.occurrenceDate), ['2026-10-12', '2026-10-19']);
    ok(store.doc.events.some(e => e.title === 'Иконопись (другой зал)' && e.deletedAt), 'изменённое вручную можно восстановить');
    A.syncSeries(store);
    eq(live(store.doc.events).filter(e => e.seriesId === sid).length, 2, 'новые не появляются');
  });

  test(G, '«Это и все следующие» с первого раза удаляет весь повтор и само событие', () => {
    const { store } = setup();
    A.addEvent(store, { title: 'Тренировка в зале', start: '2026-10-13T20:44' });
    const e = store.doc.events[store.doc.events.length - 1];
    const sid = A.repeatRecord(store, 'events', e.id, { freq: 'weekly', interval: 1, days: [4, 6] });
    const res = A.deleteRepeatFrom(store, 'events', e.id);
    ok(res.whole);
    ok(store.doc.series.find(x => x.id === sid).deletedAt);
    eq(live(store.doc.events).length, 0);
    ok(store.doc.events.find(x => x.id === e.id).deletedAt, 'исходное событие — в «Удалённых»');
  });

  test(G, '«Это и все следующие» у задачи: сделанные раньше остаются, повтор закончен', () => {
    const { store, clock } = setup();
    const sid = A.addSeries(store, { title: 'Зарядка', freq: 'daily', interval: 1, mode: 'fixed', startDate: TODAY });
    clock.addDays(2); A.syncSeries(store);
    const mine = () => live(store.doc.tasks).filter(x => x.seriesId === sid);
    A.setTaskDone(store, mine()[0].id, true);
    const res = A.deleteRepeatFrom(store, 'tasks', mine().find(x => x.occurrenceDate === '2026-10-10').id);
    eq(res.whole, false);
    eq(mine().map(x => [x.occurrenceDate, x.done]), [[TODAY, true]]);
    eq(store.doc.series.find(x => x.id === sid).until, TODAY);
    clock.addDays(3); A.syncSeries(store);
    eq(mine().length, 1);
  });

  test(G, 'у обычной записи «все следующие» нет', () => {
    const { store } = setup();
    A.addEvent(store, { title: 'Ужин', start: '2026-10-12T19:00' });
    eq(A.deleteRepeatFrom(store, 'events', store.doc.events[0].id), false);
    ok(!store.doc.events[0].deletedAt);
  });

  test(G, 'английский на паузе: новые тексты есть и в английском словаре, старые английские не заменены', () => {
    for (const k of Object.keys(RU9)) ok(k in DICTS.en, k);
    eq(DICTS.en['err.convertSeries'], 'a recurring task cannot be converted');
    ok(/удалите повтор/.test(DICTS.ru['err.convertSeries']));
  });

  // ---------- 0.9.2: moving rows by long press ----------
  const G2 = 'Версия 0.9.2 — перестановка';
  test(G2, 'список: переставляются только перетаскиваемые пункты, остальные остаются на своих местах', () => {
    const { store } = setup();
    A.addList(store, 'Одежда');
    const l = () => store.doc.lists.find(x => x.name === 'Одежда');
    A.addContainerItems(store, 'lists', l().id, 'юбка\nкардиган\nперчатки\nкосынка');
    const id = n => l().items.find(x => x.title === n).id;
    A.setListItemDone(store, l().id, id('кардиган'), true);
    A.deleteContainerItem(store, 'lists', l().id, id('перчатки'));
    A.reorderItems(store, 'lists', l().id, [id('косынка'), id('юбка')]);
    eq(l().items.map(x => x.title), ['косынка', 'кардиган', 'перчатки', 'юбка'], 'сделанный и удалённый не сдвинулись');
    eq(A.reorderItems(store, 'lists', l().id, [id('косынка'), id('косынка')]), false, 'повтор в наборе — отказ');
    eq(A.reorderItems(store, 'lists', l().id, [id('косынка'), id('перчатки')]), false, 'удалённый — отказ');
    eq(A.reorderItems(store, 'lists', l().id, [id('косынка'), 'nope']), false, 'чужой — отказ');
    eq(l().items.map(x => x.title), ['косынка', 'кардиган', 'перчатки', 'юбка']);
  });

  test(G2, 'шаги цели переставляются; «Дом» не переставляется', () => {
    const { store } = setup();
    A.addGoal(store, { title: 'Аудиокнига', steps: 'A\nB\nC' });
    const g = () => store.doc.goals[0];
    const ids = g().steps.map(x => x.id);
    A.reorderSteps(store, g().id, [ids[2], ids[0], ids[1]]);
    eq(g().steps.map(x => x.title), ['C', 'A', 'B']);
    const home = store.doc.lists.find(x => x.kind === 'home');
    if (home) eq(A.reorderItems(store, 'lists', home.id, home.items.filter(x => !x.deletedAt).map(x => x.id)), false);
  });
}
