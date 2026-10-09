// "Задачи" screen: quick add and all tasks grouped by plan kind.

import { esc } from './util.js';
import { t } from './i18n.js';
import { tasksByKind } from './selectors.js';
import { quickAdd, taskList } from './components.js';

const GROUPS = [['day', 'tasks.byDay'], ['week', 'tasks.byWeek'], ['none', 'tasks.none']];

export function renderTasks(doc, ctx) {
  return quickAdd(ctx.quick, ctx.today) + GROUPS.map(([kind, key]) => `
    <section class="card"><h2>${esc(t(key))}</h2>${taskList(tasksByKind(doc, kind), { withMove: true })}</section>`).join('');
}
