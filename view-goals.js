// «Цели» (0.7.0): the fifth tab. An index of goals in work (with how far each one is and its next step),
// reached goals folded below; a tap opens one goal on its own screen: its note (ideas, books, links) and
// its steps in order. The first unfinished step is the «next step»; «Задачи» shows it too.
// Routes (ui.goal): null = index, '<goalId>' = one goal.

import { esc } from './util.js';
import { t } from './i18n.js';
import { empty, foldBlock } from './components.js';
import { activeGoals, reachedGoals, findGoal, goalProgress, nextStep, liveSteps, noteHtml } from './goals.js';
import { ICONS } from './icons.js';

// What the header needs: { route, g, title, sub, back, more, fab }; null when the goal no longer exists.
export function goalsRoute(doc, route) {
  if (!route) return { route: null, title: t('tab.goals'), sub: '', back: false, more: null, fab: 'newgoal' };
  const g = findGoal(doc, route);
  if (!g) return null;
  const p = goalProgress(g);
  return { route: g.id, g, title: g.title, sub: p.total ? t('goals.progress', p) : '', back: true, more: 'menu.goal', fab: 'addsteps' };
}

function goalMeta(g) {
  const p = goalProgress(g);
  if (g.doneAt) return t('goals.reachedOn', { day: { $day: g.doneAt.slice(0, 10) } });
  const pause = g.pausedAt ? t('goals.pausedMeta') + ' · ' : '';
  if (!p.total) return pause + t('goals.noSteps');
  const n = nextStep(g);
  return `${pause}${t('goals.progress', p)} · ${n ? t('goals.nextMeta', { step: n.title }) : t('goals.allDone')}`;
}

const goalRow = g => `<button type="button" class="indexrow goalrow" data-action="goal.open" data-id="${esc(g.id)}">
    <span class="grow"><span class="title">${esc(g.title)}</span><span class="meta">${esc(goalMeta(g))}</span></span>
    <span class="chev">${ICONS.chevron}</span></button>`;

function index(doc) {
  const open = activeGoals(doc), reached = reachedGoals(doc);
  let h = open.length ? `<section class="list">${open.map(goalRow).join('')}</section>` : empty(t('goals.empty'));
  if (reached.length) h += foldBlock('goals.reached', t('goals.reached'), `<section class="list">${reached.map(goalRow).join('')}</section>`, { count: String(reached.length) });
  return h;
}

// A step row; also used in «Задачи» (opts.inTasks: the goal's name underneath, a tap opens the goal).
export function stepRow(g, s, { next = false, inTasks = false } = {}) {
  const gid = esc(g.id), sid = esc(s.id);
  const meta = inTasks ? t('tasks.goalMeta', { goal: g.title }) : next ? t('goals.next') : '';
  const open = inTasks
    ? `data-action="goal.open" data-id="${gid}" data-step="${sid}"`
    : `data-action="step.open" data-goal="${gid}" data-id="${sid}"`;
  return `<div class="row irow gsrow${s.done ? ' is-done' : ''}${next ? ' next' : ''}" data-id="${sid}" data-goal="${gid}">
    <input type="checkbox" data-action="step.toggle" data-goal="${gid}" data-id="${sid}" ${s.done ? 'checked' : ''} aria-label="${esc(t('aria.done'))}">
    <div class="grow ttext" ${open} role="button" tabindex="0"><div class="title">${esc(s.title)}</div>${meta ? `<div class="meta">${esc(meta)}</div>` : ''}</div></div>`;
}

function goalScreen(doc, r) {
  const g = r.g;
  const steps = liveSteps(g);
  const next = nextStep(g);
  const p = goalProgress(g);
  let h = '';
  if (g.doneAt) {
    h += `<div class="banner info line"><span class="grow">${esc(t('goals.reachedOn', { day: { $day: g.doneAt.slice(0, 10) } }))}<br><span class="small">${esc(t('goals.reachedHint'))}</span></span>
      <button type="button" data-action="goal.reached" data-id="${esc(g.id)}" data-on="">${esc(t('goals.reopen'))}</button></div>`;
  } else if (g.pausedAt) {
    h += `<div class="banner info line"><span class="grow">${esc(t('goals.pausedBanner'))}</span>
      <button type="button" data-action="goal.pause" data-id="${esc(g.id)}" data-on="">${esc(t('goals.resume'))}</button></div>`;
  }
  if (!g.doneAt && p.total && p.done === p.total) {
    h += `<div class="banner info line"><span class="grow">${esc(t('goals.allDoneBanner'))}</span>
      <button type="button" data-action="goal.reached" data-id="${esc(g.id)}" data-on="1">${esc(t('goals.markReached'))}</button></div>`;
  }
  h += g.note
    ? `<section class="goalnote"><div class="note">${noteHtml(g.note, esc)}</div>
        <button type="button" class="linkrow" data-action="goal.noteOpen" data-id="${esc(g.id)}"><span class="grow">${esc(t('goals.noteEdit'))}</span></button></section>`
    : `<button type="button" class="linkrow" data-action="goal.noteOpen" data-id="${esc(g.id)}"><span class="grow">${esc(t('goals.noteAdd'))}</span>${ICONS.plus}</button>`;
  h += steps.length
    ? `<section class="group steps"><h2>${esc(t('goals.stepsTitle'))}</h2>${steps.map(s => stepRow(g, s, { next: s === next })).join('')}</section>`
    : empty(t('goals.stepsEmpty'));
  return h;
}

export function renderGoals(doc, ctx) {
  const r = goalsRoute(doc, ctx.ui.goal) || goalsRoute(doc, null);
  return r.route ? goalScreen(doc, r) : index(doc);
}

// ---------- sheets (used by view-sheets.js) ----------

export function newGoalBody() {
  return `<form data-form="goal.add" autocomplete="off">
    <label class="field"><span>${esc(t('goals.name'))}</span><input name="title" required data-focus placeholder="${esc(t('goals.namePh'))}" class="grow"></label>
    <label class="field"><span>${esc(t('goals.steps'))}</span><textarea name="steps" rows="4" placeholder="${esc(t('goals.stepsPh'))}"></textarea></label>
    <div class="line"><button type="submit" class="primary">${esc(t('goals.create'))}</button></div></form>`;
}

export function addStepsBody(g) {
  return `<form data-form="steps.add" data-goal="${esc(g.id)}" autocomplete="off">
    <textarea name="text" rows="4" data-focus placeholder="${esc(t('goals.stepsPh'))}" aria-label="${esc(t('goals.addSteps'))}"></textarea>
    <div class="line"><button type="submit" class="primary">${esc(t('btn.add'))}</button></div></form>`;
}

export function noteBody(g) {
  return `<form data-form="goal.note" data-goal="${esc(g.id)}" autocomplete="off">
    <textarea name="note" rows="9" data-focus placeholder="${esc(t('goals.notePh'))}" aria-label="${esc(t('goals.note'))}">${esc(g.note || '')}</textarea>
    <div class="line"><button type="submit" class="primary">${esc(t('btn.save'))}</button><button type="button" data-action="sheet.close">${esc(t('btn.cancel'))}</button></div></form>`;
}

export function renameBody(g) {
  return `<form class="line" data-form="goal.rename" data-goal="${esc(g.id)}" autocomplete="off">
    <input name="title" value="${esc(g.title)}" required data-focus class="grow" aria-label="${esc(t('goals.rename'))}"><button type="submit" class="primary">${esc(t('btn.save'))}</button></form>`;
}

export function stepBody(g, s) {
  const live = liveSteps(g);
  const i = live.indexOf(s);
  const a = `data-goal="${esc(g.id)}" data-id="${esc(s.id)}"`;
  return `<form class="editform" data-form="step.edit" ${a} autocomplete="off">
    <label class="field"><span>${esc(t('goals.step'))}</span><input name="title" value="${esc(s.title)}" required class="grow"></label>
    <div class="line"><button type="submit" class="primary">${esc(t('btn.save'))}</button><button type="button" data-action="sheet.close">${esc(t('btn.cancel'))}</button></div></form>
    <div class="line">${i > 0 ? `<button type="button" class="quiet" data-action="step.move" ${a} data-dir="-1">↑ ${esc(t('goals.up'))}</button>` : ''}
      ${i < live.length - 1 ? `<button type="button" class="quiet" data-action="step.move" ${a} data-dir="1">↓ ${esc(t('goals.down'))}</button>` : ''}
      <button type="button" class="quiet danger-text" data-action="step.delete" ${a}>${esc(t('btn.delete'))}</button></div>`;
}

export function goalMenuItems(g, item) {
  const a = `data-id="${esc(g.id)}"`;
  return [item('goal.renameOpen', t('goals.rename'), a), item('goal.noteOpen', t(g.note ? 'goals.noteEdit' : 'goals.note'), a),
    ...(g.doneAt ? [] : [g.pausedAt ? item('goal.pause', t('goals.resume'), `${a} data-on=""`) : item('goal.pause', t('goals.pause'), `${a} data-on="1"`)]),
    g.doneAt ? item('goal.reached', t('goals.reopen'), `${a} data-on=""`) : item('goal.reached', t('goals.markReached'), `${a} data-on="1"`),
    item('goal.delete', t('btn.delete'), a, 'danger')];
}

