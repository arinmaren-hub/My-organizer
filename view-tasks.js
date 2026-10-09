// "Задачи" screen: quick add and all tasks grouped by plan kind.

import { tasksByKind } from './selectors.js';
import { quickAdd, taskList } from './components.js';

const GROUPS = [['day', 'По дням'], ['week', 'По неделям'], ['none', 'Без даты']];

export function renderTasks(doc, ctx) {
  return quickAdd(ctx.quick, ctx.today) + GROUPS.map(([kind, title]) => `
    <section class="card"><h2>${title}</h2>${taskList(tasksByKind(doc, kind), { withMove: true })}</section>`).join('');
}
