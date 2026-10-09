// "Календарь": month grid (Monday first), 12-month year view, month and year picker,
// and the day's tasks and events with quick adding. Real calendar dates are shown;
// the personal planning day is only marked.

import { esc } from './util.js';
import { dateKey, addDays, isoWeekday } from './dates.js';
import { t, formatDay, monthName, monthShort, weekdayShort, weekdayLong } from './i18n.js';
import { monthGrid, shiftMonth, summarizeRange, dayContents, firstOfMonth } from './calendar.js';
import { taskRow, eventRow, empty } from './components.js';

const WEEKDAY_ROW = () => Array.from({ length: 7 }, (_, i) => `<div class="wd" aria-hidden="true">${esc(weekdayShort(i))}</div>`).join('');

function marks(s) {
  if (!s) return '';
  let h = '';
  if (s.events) h += '<i class="mk ev"></i>';
  if (s.tasks) h += '<i class="mk tk"></i>';
  if (s.deadlines) h += '<i class="mk dl"></i>';
  return h ? `<span class="marks">${h}</span>` : '';
}

function ariaFor(date, s) {
  const parts = [];
  if (s) {
    if (s.tasks) parts.push(t('cal.nTasks', { n: s.tasks }));
    if (s.done) parts.push(t('cal.nDone', { n: s.done }));
    if (s.events) parts.push(t('cal.nEvents', { n: s.events }));
    if (s.deadlines) parts.push(t('cal.nDeadlines', { n: s.deadlines }));
  }
  return t('cal.aria', { day: { $day: date }, parts: parts.length ? parts.join(', ') : t('cal.ariaNothing') });
}

function monthView(doc, cal, ctx) {
  const weeks = monthGrid(cal.y, cal.m);
  const sum = summarizeRange(doc, weeks[0][0], weeks[weeks.length - 1][6]);
  const cells = weeks.map(w => w.map(d => {
    const inMonth = Number(d.slice(5, 7)) === cal.m;
    const cls = ['day', inMonth ? '' : 'out', d === ctx.calendarToday ? 'today' : '', d === ctx.today ? 'planning' : '', d === cal.sel ? 'sel' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-action="cal.select" data-date="${d}" aria-label="${esc(ariaFor(d, sum.get(d)))}"${d === cal.sel ? ' aria-pressed="true"' : ''}><span class="n">${Number(d.slice(8))}</span>${marks(sum.get(d))}</button>`;
  }).join('')).join('');
  return `<div class="cal-grid" role="group" aria-label="${esc(monthName(cal.m))} ${cal.y}">${WEEKDAY_ROW()}${cells}</div>
    <p class="muted small">${esc(t('cal.legend'))}</p>`;
}

function yearView(doc, cal, ctx) {
  const sum = summarizeRange(doc, `${cal.y}-01-01`, `${cal.y}-12-31`);
  return `<div class="year-grid">${Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const weeks = monthGrid(cal.y, m);
    let busy = 0;
    const cells = weeks.map(w => w.map(d => {
      if (Number(d.slice(5, 7)) !== m) return '<span class="mini out"></span>';
      const s = sum.get(d);
      if (s && (s.tasks || s.events || s.deadlines)) busy++;
      const cls = ['mini', s && (s.tasks || s.events || s.deadlines) ? 'has' : '', d === ctx.calendarToday ? 'today' : ''].filter(Boolean).join(' ');
      return `<span class="${cls}">${Number(d.slice(8))}</span>`;
    }).join('')).join('');
    return `<button type="button" class="mini-month${cal.y === Number(ctx.calendarToday.slice(0, 4)) && m === Number(ctx.calendarToday.slice(5, 7)) ? ' cur' : ''}" data-action="cal.openMonth" data-y="${cal.y}" data-m="${m}" aria-label="${esc(monthName(m))} ${cal.y}">
      <b>${esc(monthName(m))}</b><span class="mini-grid" aria-hidden="true">${cells}</span></button>`;
  }).join('')}</div><p class="muted small">${esc(t('cal.legend'))}</p>`;
}

function picker(cal) {
  return `<form class="line" data-form="cal.go" autocomplete="off">
    <select name="m" aria-label="${esc(t('cal.month'))}">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}"${cal.m === i + 1 ? ' selected' : ''}>${esc(monthName(i + 1))}</option>`).join('')}</select>
    <input type="number" name="y" min="1900" max="2200" step="1" value="${cal.y}" class="num" aria-label="${esc(t('cal.year'))}" required>
    <button type="submit" class="primary">${esc(t('cal.go'))}</button></form>`;
}

function dayPanel(doc, cal, ctx) {
  const d = cal.sel;
  const c = dayContents(doc, d, ctx.today);
  const tags = [];
  if (d === ctx.calendarToday) tags.push(t('cal.isToday'));
  if (d === ctx.today) tags.push(t('cal.isPlanning'));
  const wd = weekdayLong(isoWeekday(d) - 1);
  let body = '';
  if (c.events.length) body += `<h3>${esc(t('cal.events2'))}</h3>${c.events.map(e => eventRow(e, e.start.slice(11))).join('')}`;
  if (c.tasks.length) body += `<h3>${esc(t('cal.tasks'))}</h3>${c.tasks.map(x => taskRow(x, { withMove: true })).join('')}`;
  if (c.deadlines.length) body += `<h3>${esc(t('cal.deadlines'))}</h3>${c.deadlines.map(x => taskRow(x, { withMove: true })).join('')}`;
  if (c.repeats.length) body += `<h3>${esc(t('cal.repeats'))}</h3>${c.repeats.map(r => `<div class="row"><div class="grow">↻ ${esc(r.title)}</div></div>`).join('')}`;
  if (!body) body = empty(t('cal.noItems'));
  const week = c.weekTasks.length ? `<details><summary>${esc(t('cal.weekTasks', { n: c.weekTasks.length }))}</summary>${c.weekTasks.map(x => taskRow(x, { withMove: true })).join('')}</details>` : '';
  return `<section class="card" id="day-panel">
    <h2>${esc(wd)}, ${esc(formatDay(d))}</h2>
    ${tags.length ? `<p class="muted small">${esc(tags.join(' · '))}</p>` : ''}
    ${body}${week}
    <h3>${esc(t('cal.addTo', { day: { $day: d } }))}</h3>
    <form data-form="cal.add" data-date="${d}" autocomplete="off">
      <div class="line"><input name="title" required placeholder="${esc(t('cal.addTitlePh'))}" class="grow" aria-label="${esc(t('cal.addTitlePh'))}">
        <input type="time" name="time" aria-label="${esc(t('cal.addTime'))}" title="${esc(t('cal.addTime'))}"></div>
      <div class="line"><button type="submit" name="as" value="task" class="primary">${esc(t('cal.asTask'))}</button>
        <button type="submit" name="as" value="event">${esc(t('cal.asEvent'))}</button></div>
    </form>
  </section>`;
}

export function renderCalendar(doc, ctx) {
  const cal = ctx.ui.cal;
  const year = cal.mode === 'year';
  const head = year
    ? `<div class="line cal-nav"><button type="button" data-action="cal.prevYear" aria-label="${esc(t('cal.prevYear'))}">‹</button>
        <button type="button" class="grow cal-title" data-action="cal.pickToggle" aria-expanded="${cal.picker ? 'true' : 'false'}" aria-label="${esc(t('cal.pick'))}">${cal.y}</button>
        <button type="button" data-action="cal.nextYear" aria-label="${esc(t('cal.nextYear'))}">›</button></div>`
    : `<div class="line cal-nav"><button type="button" data-action="cal.prev" aria-label="${esc(t('cal.prev'))}">‹</button>
        <button type="button" class="grow cal-title" data-action="cal.pickToggle" aria-expanded="${cal.picker ? 'true' : 'false'}" aria-label="${esc(t('cal.pick'))}">${esc(monthName(cal.m))} ${cal.y}</button>
        <button type="button" data-action="cal.next" aria-label="${esc(t('cal.next'))}">›</button></div>`;
  return `<section class="card">
      ${head}
      <div class="line"><button type="button" data-action="cal.today">${esc(t('cal.todayBtn'))}</button>
        <button type="button" data-action="cal.mode" data-mode="${year ? 'month' : 'year'}">${esc(t(year ? 'cal.monthView' : 'cal.yearView'))}</button></div>
      ${cal.picker ? picker(cal) : ''}
      ${year ? yearView(doc, cal, ctx) : monthView(doc, cal, ctx)}
    </section>
    ${year ? '' : dayPanel(doc, cal, ctx)}`;
}

export { shiftMonth, firstOfMonth, monthShort };
