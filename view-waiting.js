// «Ожидаю от других»: the section at the very bottom of the Home screen, and the
// reminder card shown near the top when a follow-up date has come.
// Waiting items are not tasks: they never become overdue and are not part of any review.

import { esc } from './util.js';
import { t, formatDay } from './i18n.js';
import { openWaiting, resolvedWaiting, waitingDue } from './selectors.js';
import { empty, uiState } from './components.js';
import { dateKey } from './dates.js';

const sinceDay = w => dateKey(new Date(w.createdAt));

function editForm(w) {
  const id = esc(w.id);
  return `
    <form class="editform" data-form="waiting.edit" data-id="${id}" autocomplete="off">
      <label class="field"><span>${esc(t('wait.what'))}</span><input name="title" value="${esc(w.title)}" required class="grow"></label>
      <label class="field"><span>${esc(t('wait.from'))}</span><input name="from" value="${esc(w.from || '')}" class="grow"></label>
      <label class="field"><span>${esc(t('wait.followUp'))}</span><input type="date" name="followUp" value="${esc(w.followUp || '')}"></label>
      <label class="field"><span>${esc(t('wait.note'))}</span><input name="note" value="${esc(w.note || '')}" class="grow"></label>
      <div class="line"><button type="submit" class="primary">${esc(t('btn.save'))}</button><button type="button" data-action="edit.cancel">${esc(t('btn.cancel'))}</button></div>
    </form>`;
}

function row(w, today) {
  const id = esc(w.id);
  if (uiState.editing && uiState.editing.kind === 'waiting' && uiState.editing.id === w.id) return `<div class="row"><div class="grow">${editForm(w)}</div></div>`;
  const meta = [];
  if (w.from) meta.push(t('wait.fromWho', { who: w.from }));
  meta.push(t('wait.since', { day: { $day: sinceDay(w) } }));
  if (w.followUp) meta.push(t('wait.followUpOn', { day: { $day: w.followUp } }));
  const due = !w.resolved && w.followUp && w.followUp <= today;
  return `
    <div class="row${w.resolved ? ' is-done' : ''}">
      <div class="grow"><div class="title">${esc(w.title)}</div>
        <div class="${due ? '' : 'muted '}small">${esc(meta.join(' · '))}</div>
        ${w.note ? `<div class="muted small">${esc(w.note)}</div>` : ''}
        ${w.taskId ? `<div class="muted small">${esc(t('wait.convertedHint'))}</div>` : ''}
        <div class="moves">
          ${w.resolved
            ? `<button type="button" data-action="wait.reopen" data-id="${id}">${esc(t('wait.reopen'))}</button>`
            : `<button type="button" data-action="wait.resolve" data-id="${id}">${esc(t('wait.resolve'))}</button>
               <button type="button" data-action="wait.toTask" data-id="${id}">${esc(t('wait.toTask'))}</button>`}
        </div>
      </div>
      <button type="button" class="icon" data-action="edit.open" data-kind="waiting" data-id="${id}" aria-label="${esc(t('aria.edit'))}">✎</button>
      <button type="button" class="icon" data-action="wait.delete" data-id="${id}" aria-label="${esc(t('btn.delete'))}">×</button>
    </div>`;
}

// The reminder card: items whose follow-up date has come (planning day).
export function renderWaitingDue(doc, today) {
  const due = waitingDue(doc, today);
  if (!due.length) return '';
  return `<section class="card review"><h2>${esc(t('wait.dueTitle', { n: due.length }))}</h2>
    ${due.map(w => {
      const id = esc(w.id);
      return `<div class="row"><div class="grow"><div class="title">${esc(w.title)}</div>
        <div class="small">${esc([w.from ? t('wait.fromWho', { who: w.from }) : '', t('wait.followUpOn', { day: { $day: w.followUp } })].filter(Boolean).join(' · '))}</div>
        <div class="moves">
          <button type="button" data-action="wait.again" data-id="${id}" data-days="1">${esc(t('wait.checkAgain', { n: 1 }))}</button>
          <button type="button" data-action="wait.again" data-id="${id}" data-days="3">${esc(t('wait.checkAgain', { n: 3 }))}</button>
          <button type="button" data-action="wait.again" data-id="${id}" data-days="7">${esc(t('wait.checkAgain', { n: 7 }))}</button>
          <button type="button" data-action="wait.resolve" data-id="${id}">${esc(t('wait.resolve'))}</button>
          <button type="button" data-action="wait.toTask" data-id="${id}">${esc(t('wait.toTask'))}</button>
        </div>
        <details class="datepick"><summary>${esc(t('wait.snooze'))}</summary>
          <form class="line" data-form="wait.snooze" data-id="${id}" autocomplete="off"><input type="date" name="date" required><button type="submit">${esc(t('wait.snoozeTo'))}</button></form></details>
      </div></div>`;
    }).join('')}</section>`;
}

// The section at the very bottom of Home.
export function renderWaitingSection(doc, today) {
  const open = openWaiting(doc), done = resolvedWaiting(doc);
  return `<section class="card" id="waiting-section">
    <h2>${esc(t('wait.title'))}</h2>
    <p class="muted small">${esc(t('wait.hint'))}</p>
    ${open.length ? open.map(w => row(w, today)).join('') : empty(t('wait.empty'))}
    <form data-form="wait.add" autocomplete="off">
      <div class="line"><input name="title" required placeholder="${esc(t('wait.what'))}" class="grow"></div>
      <div class="line"><input name="from" placeholder="${esc(t('wait.from'))}" class="grow">
        <input type="date" name="followUp" aria-label="${esc(t('wait.followUp'))}" title="${esc(t('wait.followUp'))}">
        <button type="submit" class="primary">${esc(t('btn.add'))}</button></div>
    </form>
    ${done.length ? `<details><summary>${esc(t('wait.resolvedTitle', { n: done.length }))}</summary>${done.map(w => row(w, today)).join('')}</details>` : ''}
  </section>`;
}
