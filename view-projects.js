// "Прогресс" screen: projects with milestones AND a quantity counter, side by side.

import { esc } from './util.js';
import { t } from './i18n.js';
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
        <button type="button" data-action="project.delete" data-id="${pid}">${esc(t('btn.delete'))}</button></div>
      <h3>${esc(t('proj.milestones', { done, n: ms.length }))}</h3>
      ${bar(ms.length ? done / ms.length * 100 : 0)}
      ${ms.map(m => `
        <label class="row${m.done ? ' is-done' : ''}">
          <input type="checkbox" data-action="milestone.toggle" data-project="${pid}" data-id="${esc(m.id)}" ${m.done ? 'checked' : ''}>
          <span class="grow title">${esc(m.title)}</span>
        </label>`).join('')}
      <form class="line" data-form="milestone.add" data-project="${pid}" autocomplete="off">
        <input name="title" required placeholder="${esc(t('proj.newMilestone'))}" class="grow"><button type="submit" aria-label="${esc(t('proj.addMilestone'))}">+</button>
      </form>
      <h3>${esc(t('proj.quantity', { cur: q.current, total: q.total, unit: q.unit, pct: percent }))}</h3>
      ${bar(percent)}
      <div class="line">
        <button type="button" data-action="qty.step" data-id="${pid}" data-delta="-1">−1</button>
        <button type="button" data-action="qty.step" data-id="${pid}" data-delta="1">+1</button>
        <input class="num" type="number" min="0" step="any" inputmode="decimal" value="${esc(q.current)}" data-action="qty.set" data-id="${pid}" aria-label="${esc(t('proj.current'))}">
      </div>
    </section>`;
}

export function renderProjects(doc) {
  const projects = activeProjects(doc);
  return `
    <section class="card">
      <h2>${esc(t('proj.new'))}</h2>
      <form data-form="project.add" autocomplete="off">
        <div class="line">
          <input name="name" required placeholder="${esc(t('proj.namePh'))}" class="grow">
          <input name="total" type="number" min="0" step="any" inputmode="decimal" placeholder="${esc(t('proj.targetPh'))}" aria-label="${esc(t('proj.targetAria'))}" class="num">
          <input name="unit" placeholder="${esc(t('proj.unitPh'))}" class="unit">
          <button type="submit" class="primary">${esc(t('btn.create'))}</button>
        </div>
      </form>
    </section>
    ${projects.length ? projects.map(projectCard).join('') : `<section class="card">${empty(t('proj.empty'))}</section>`}`;
}
