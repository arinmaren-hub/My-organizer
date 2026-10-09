// "Прогресс" screen: projects with milestones AND a quantity counter, side by side.

import { esc } from './util.js';
import { activeProjects } from './selectors.js';
import { bar, empty } from './components.js';

function projectCard(p) {
  const pid = esc(p.id);
  const ms = p.milestones.filter(m => !m.deletedAt);
  const done = ms.filter(m => m.done).length;
  const q = p.quantity;
  const percent = q.total ? Math.min(100, Math.round(q.current / q.total * 100)) : 0;
  return `
    <section class="card">
      <div class="line"><h2 class="grow">${esc(p.name)}</h2>
        <button type="button" data-action="project.delete" data-id="${pid}">Удалить</button></div>
      <h3>Этапы · ${done}/${ms.length}</h3>
      ${bar(ms.length ? done / ms.length * 100 : 0)}
      ${ms.map(m => `
        <label class="row${m.done ? ' is-done' : ''}">
          <input type="checkbox" data-action="milestone.toggle" data-project="${pid}" data-id="${esc(m.id)}" ${m.done ? 'checked' : ''}>
          <span class="grow title">${esc(m.title)}</span>
        </label>`).join('')}
      <form class="line" data-form="milestone.add" data-project="${pid}" autocomplete="off">
        <input name="title" required placeholder="Новый этап" class="grow"><button type="submit" aria-label="Добавить этап">+</button>
      </form>
      <h3>Количество · ${esc(q.current)}/${esc(q.total)} ${esc(q.unit)} (${percent}%)</h3>
      ${bar(percent)}
      <div class="line">
        <button type="button" data-action="qty.step" data-id="${pid}" data-delta="-1">−1</button>
        <button type="button" data-action="qty.step" data-id="${pid}" data-delta="1">+1</button>
        <input class="num" type="number" min="0" step="any" inputmode="decimal" value="${esc(q.current)}" data-action="qty.set" data-id="${pid}" aria-label="Текущее значение">
      </div>
    </section>`;
}

export function renderProjects(doc) {
  const projects = activeProjects(doc);
  return `
    <section class="card">
      <h2>Новый проект</h2>
      <form data-form="project.add" autocomplete="off">
        <div class="line">
          <input name="name" required placeholder="Название" class="grow">
          <input name="total" type="number" min="0" step="any" inputmode="decimal" placeholder="Цель" aria-label="Цель, число" class="num">
          <input name="unit" placeholder="Главы, страницы…" class="unit">
          <button type="submit" class="primary">Создать</button>
        </div>
      </form>
    </section>
    ${projects.length ? projects.map(projectCard).join('') : `<section class="card">${empty('Проектов пока нет')}</section>`}`;
}
