// «Ожидаю от других»: the section at the very bottom of the Home screen, and the
// reminder card shown near the top when a follow-up date has come.
// Waiting items are not tasks: they never become overdue and are not part of any review.
// Adding and editing happen in a sheet («＋» beside the heading and «···» on a row).

import { esc } from './util.js';
import { t } from './i18n.js';
import { openWaiting, resolvedWaiting, waitingDue } from './selectors.js';
import { empty, moreButton, foldBlock } from './components.js';
import { dateKey } from './dates.js';
import { ICONS } from './icons.js';

const sinceDay = w => dateKey(new Date(w.createdAt));

function row(w, today) {
  const meta = [];
  if (w.from) meta.push(t('wait.fromWho', { who: w.from }));
  if (w.followUp) meta.push(t('wait.followUpOn', { day: { $day: w.followUp } }));
  else meta.push(t('wait.since', { day: { $day: sinceDay(w) } }));
  const due = !w.resolved && w.followUp && w.followUp <= today;
  return `
    <div class="row wrow${w.resolved ? ' is-done' : ''}" data-id="${esc(w.id)}">
      <div class="grow ttext" data-action="edit.open" data-kind="waiting" data-id="${esc(w.id)}" role="button" tabindex="0">
        <div class="title">${esc(w.title)}</div>
        <div class="meta${due ? ' due' : ''}">${esc(meta.join(' · '))}</div>
        ${w.note ? `<div class="meta">${esc(w.note)}</div>` : ''}
      </div>
      ${moreButton('menu.wait', w.id)}
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
        <div class="meta">${esc([w.from ? t('wait.fromWho', { who: w.from }) : '', t('wait.followUpOn', { day: { $day: w.followUp } })].filter(Boolean).join(' · '))}</div>
        <div class="moves">
          <button type="button" data-action="wait.again" data-id="${id}" data-days="3">${esc(t('wait.checkAgain', { n: 3 }))}</button>
          <button type="button" data-action="wait.toTask" data-id="${id}">${esc(t('wait.toTask'))}</button>
          <button type="button" data-action="wait.resolve" data-id="${id}">${esc(t('wait.resolve'))}</button>
        </div></div>${moreButton('menu.wait', w.id)}</div>`;
    }).join('')}</section>`;
}

// The section at the very bottom of Home.
export function renderWaitingSection(doc, today) {
  const open = openWaiting(doc), done = resolvedWaiting(doc);
  return `<section class="waiting" id="waiting-section">
    <div class="sechead"><h2 class="grow">${esc(t('wait.title'))}${open.length ? ` <span class="count">${open.length}</span>` : ''}</h2>
      <button type="button" class="icon-btn" data-action="wait.new" aria-label="${esc(t('wait.add'))}">${ICONS.plus}</button></div>
    ${open.length ? open.map(w => row(w, today)).join('') : empty(t('wait.empty'))}
    ${done.length ? foldBlock('waitDone', t('wait.resolvedShort'), done.map(w => row(w, today)).join(''), { count: String(done.length) }) : ''}
  </section>`;
}
