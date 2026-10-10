// Bottom sheets and menus (0.5.0). Everything that used to sit permanently on a screen —
// forms, date buttons, list management — opens here only when asked for.
// renderSheet(doc, ctx) returns the HTML of the open sheet, or '' when there is none (or when
// the record it is about no longer exists). app.js puts the HTML into #sheet-root.

import { esc } from './util.js';
import { t, formatDay, weekdayLong, dayLong, getLang, LANGS, LANG_NAMES } from './i18n.js';
import { isoWeekday } from './dates.js';
import { ICONS } from './icons.js';
import { editTaskForm, editEventForm, foldBlock } from './components.js';
import { seriesEditForm, ruleFields } from './view-tasks.js';
import { activeProjects } from './selectors.js';
import { listTemplates, categoriesOf, missingBuiltins } from './templates.js';
import { stockOf, STOCK_ORDER } from './home.js';
import { getContainer } from './view-lists.js';
import { MODES } from './appearance.js';
import { taskConversionLosses, eventConversionLosses } from './actions.js';

const alive = r => !r.deletedAt;
const find = (arr, id) => (arr || []).find(x => x.id === id && alive(x)) || null;

function sheet(title, body, cls = '') {
  return `<div class="scrim" data-action="sheet.close"></div>
    <div class="sheet${cls ? ' ' + cls : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h2 class="grow">${esc(title)}</h2>
        <button type="button" class="icon-btn" data-action="sheet.close" aria-label="${esc(t('btn.close'))}">${ICONS.close}</button></div>
      <div class="sheet-body">${body}</div>
    </div>`;
}

const item = (action, label, attrs = '', cls = '') =>
  `<button type="button" class="menuitem${cls ? ' ' + cls : ''}" data-action="${action}"${attrs ? ' ' + attrs : ''}>${esc(label)}</button>`;
const idAttr = id => `data-id="${esc(id)}"`;
const menu = items => `<div class="menu">${items.join('')}</div>`;
const seg = (label, buttons) => `<div class="segrow"><span class="small muted">${esc(label)}</span><div class="seg" role="group" aria-label="${esc(label)}">${buttons}</div></div>`;
const segBtn = (action, mode, current, label) =>
  `<button type="button" class="${current === mode ? 'on' : ''}" data-action="${action}" data-mode="${mode}" aria-pressed="${current === mode}">${esc(label)}</button>`;

// ---------- the «···» menu of the page header ----------

function appMenu(doc, ctx) {
  const rows = [item('go', t('menu.evening'), 'data-tab="evening"'), item('go', t('tab.settings'), 'data-tab="settings"'),
    item('go', t('menu.data'), 'data-tab="data"')];
  if (activeProjects(doc).length) rows.push(item('go', t('tab.projects'), 'data-tab="projects"'));
  rows.push(item('go', t('menu.about'), 'data-tab="about"'));
  rows.push(ctx.finishedEarly ? item('day.undoFinish', t('day.undoFinish')) : item('day.finish', t('day.finish')));
  const appearance = seg(t('set.appearance'), MODES.map(m => segBtn('appearance.set', m, ctx.appearance, t(m === 'light' ? 'set.light' : m === 'dark' ? 'set.dark' : 'set.system'))).join(''));
  const lang = seg(t('set.language'), LANGS.map(c => segBtn('language.set', c, ctx.language, LANG_NAMES[c])).join(''));
  return sheet(t('menu.title'), menu(rows) + lang + appearance);
}

// ---------- fast entry ----------

function quickSheet(doc, ctx, s) {
  const q = ctx.ui.quick;
  let ask = '';
  if (q.ask) {
    const a = q.ask;
    const when = `${formatDay(a.date)}${a.time ? ', ' + a.time : ''}`;
    ask = `<div class="banner info"><b>${esc(t('quick.askTitle', { title: a.title, when }))}</b><br>${esc(t('quick.askHint'))}
      <div class="moves"><button type="button" class="primary" data-action="quick.asTask">${esc(t('quick.asTask'))}</button>
        <button type="button" data-action="quick.asEvent">${esc(t('quick.asEvent'))}</button>
        <button type="button" data-action="quick.asText">${esc(t('quick.asText'))}</button>
        <button type="button" class="quiet" data-action="quick.askCancel">${esc(t('quick.askCancel'))}</button></div></div>`;
  }
  return sheet(t('quick.title'), `${ask}
    <form data-form="task.quickAdd" autocomplete="off">
      <textarea name="text" rows="4" data-focus placeholder="${esc(t('quick.placeholder'))}" aria-label="${esc(t('quick.title'))}" enterkeyhint="enter" autocapitalize="sentences">${esc(q.text)}</textarea>
      <div class="line"><span class="muted small grow">${esc(t('quick.to', { day: { $day: s.date } }))}</span>
        <button type="submit" class="primary">${esc(t('btn.add'))}</button></div>
    </form>`, 'sheet-quick');
}

// ---------- row menus ----------

function taskMenu(doc, ctx, s) {
  const task = find(doc.tasks, s.id);
  if (!task) return '';
  const rows = s.part ? [item('review', t('review.keep'), `${idAttr(task.id)} data-choice="keep" data-part="${esc(s.part)}"`)] : [];
  rows.push(item('edit.open', t('btn.edit'), `data-kind="task" ${idAttr(task.id)}`), item('sheet.move', t('menu.move'), idAttr(task.id)),
    item('task.duplicate', t('menu.duplicate'), idAttr(task.id)), item('task.toWaiting', t('menu.toWaiting'), idAttr(task.id)));
  if (!task.seriesId) rows.push(item('convert.open', t('menu.toEvent'), `data-from="task" ${idAttr(task.id)}`));
  rows.push(item('task.delete', t('btn.delete'), idAttr(task.id), 'danger'));
  return sheet(task.title, menu(rows));
}

function eventMenu(doc, ctx, s) {
  const e = find(doc.events, s.id);
  if (!e) return '';
  return sheet(e.title, menu([item('event.open', t('menu.open'), idAttr(e.id)), item('edit.open', t('btn.edit'), `data-kind="event" ${idAttr(e.id)}`),
    item('convert.open', t('menu.toTask'), `data-from="event" ${idAttr(e.id)}`), item('event.delete', t('btn.delete'), idAttr(e.id), 'danger')]));
}

function waitMenu(doc, ctx, s) {
  const w = find(doc.waiting, s.id);
  if (!w) return '';
  const rows = [item('edit.open', t('btn.edit'), `data-kind="waiting" ${idAttr(w.id)}`)];
  if (!w.resolved) {
    rows.push(item('wait.again', t('wait.checkAgain', { n: 3 }), `${idAttr(w.id)} data-days="3"`));
    rows.push(item('wait.toTask', t('wait.toTask'), idAttr(w.id)));
    rows.push(item('wait.resolve', t('wait.resolve'), idAttr(w.id)));
  } else rows.push(item('wait.reopen', t('wait.reopen'), idAttr(w.id)));
  rows.push(item('wait.delete', t('btn.delete'), idAttr(w.id), 'danger'));
  return sheet(w.title, menu(rows));
}

function seriesMenu(doc, ctx, s) {
  const r = find(doc.series, s.id);
  if (!r) return '';
  return sheet(r.title, menu([item('edit.open', t('btn.edit'), `data-kind="series" ${idAttr(r.id)}`),
    item('series.pause', t(r.paused ? 'recur.resume' : 'recur.pause'), `${idAttr(r.id)} data-paused="${r.paused ? '' : '1'}"`),
    item('series.delete', t('btn.delete'), idAttr(r.id), 'danger')]));
}

// ---------- moving a task ----------

function moveSheet(doc, ctx, s) {
  const task = find(doc.tasks, s.id);
  if (!task) return '';
  const id = esc(task.id);
  return sheet(t('menu.move'), `${menu([item('task.move', t('move.today'), `${idAttr(task.id)} data-kind="day"`),
    item('task.move', t('move.week'), `${idAttr(task.id)} data-kind="week"`), item('task.move', t('move.none'), `${idAttr(task.id)} data-kind="none"`)])}
    <form class="line" data-form="task.moveDate" data-id="${id}" autocomplete="off">
      <label class="field grow"><span>${esc(t('edit.date'))}</span><input type="date" name="date" value="${esc(task.plan.date || ctx.today)}" required></label>
      <button type="submit" class="primary">${esc(t('review.moveToDate'))}</button></form>
    <p class="muted small">${esc(t('edit.deadlineNote'))}</p>`);
}

function pickSheet(doc, ctx, s) {
  const task = find(doc.tasks, s.id);
  if (!task) return '';
  return sheet(t('tail.pick'), `<p class="title">${esc(task.title)}</p>
    <form class="line" data-form="review.date" data-id="${esc(task.id)}" data-part="${esc(s.part || 'am')}" autocomplete="off">
      <input type="date" name="date" value="${esc(ctx.today)}" required class="grow" aria-label="${esc(t('edit.date'))}">
      <button type="submit" class="primary">${esc(t('review.moveToDate'))}</button></form>`);
}

// ---------- editing ----------

function editSheet(doc, ctx, s) {
  let body = '', title = t('btn.edit');
  if (s.kind === 'task') {
    const task = find(doc.tasks, s.id);
    if (!task) return '';
    body = editTaskForm(task) + `<div class="line"><button type="button" class="quiet" data-action="menu.task" ${idAttr(task.id)}>${esc(t('aria.more'))}</button>${task.seriesId ? '' : `<button type="button" class="quiet" data-action="convert.open" data-from="task" ${idAttr(task.id)}>${esc(t('menu.toEvent'))}</button>`}</div>`;
  } else if (s.kind === 'event') {
    const e = find(doc.events, s.id);
    if (!e) return '';
    body = editEventForm(e) + `<div class="line"><button type="button" class="quiet" data-action="menu.event" ${idAttr(e.id)}>${esc(t('aria.more'))}</button><button type="button" class="quiet" data-action="convert.open" data-from="event" ${idAttr(e.id)}>${esc(t('menu.toTask'))}</button></div>`;
  } else if (s.kind === 'waiting') {
    const w = find(doc.waiting, s.id);
    if (!w) return '';
    body = `<form class="editform" data-form="waiting.edit" data-id="${esc(w.id)}" autocomplete="off">
      <label class="field"><span>${esc(t('wait.what'))}</span><input name="title" value="${esc(w.title)}" required class="grow"></label>
      <label class="field"><span>${esc(t('wait.from'))}</span><input name="from" value="${esc(w.from || '')}"></label>
      <label class="field"><span>${esc(t('wait.followUp'))}</span><input type="date" name="followUp" value="${esc(w.followUp || '')}"></label>
      <label class="field"><span>${esc(t('wait.note'))}</span><input name="note" value="${esc(w.note || '')}"></label>
      <div class="line"><button type="submit" class="primary">${esc(t('btn.save'))}</button><button type="button" data-action="sheet.close">${esc(t('btn.cancel'))}</button></div></form>`;
  } else if (s.kind === 'series') {
    const r = find(doc.series, s.id);
    if (!r) return '';
    body = seriesEditForm(doc, r, ctx.today);
  } else if (s.kind === 'item') {
    const c = getContainer(doc, s.coll, s.list);
    const it = c && find(c.items, s.id);
    if (!c || !it) return '';
    body = `<form class="editform" data-form="item.edit" data-coll="${esc(s.coll)}" data-list="${esc(c.id)}" data-item="${esc(it.id)}" autocomplete="off">
      <label class="field"><span>${esc(t('lists.itemPh'))}</span><input name="title" value="${esc(it.title)}" required class="grow"></label>
      ${s.coll === 'lists' && c.kind === 'home' ? '' : categoryField(c, it.category)}
      <div class="line"><button type="submit" class="primary">${esc(t('btn.save'))}</button><button type="button" data-action="sheet.close">${esc(t('btn.cancel'))}</button>
        <button type="button" class="quiet danger-text" data-action="item.delete" data-coll="${esc(s.coll)}" data-list="${esc(c.id)}" data-id="${esc(it.id)}">${esc(t('btn.delete'))}</button></div></form>`;
  } else return '';
  return sheet(title, body);
}

function categoryField(c, value = '') {
  const dl = `cats-${esc(c.id)}`;
  return `<label class="field"><span>${esc(t('lists.categoryPh'))}</span><input name="category" list="${dl}" value="${esc(value || '')}" autocomplete="off">
    <datalist id="${dl}">${categoriesOf(c).map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist></label>`;
}

// ---------- an event: details and its preparation list ----------

function prepBlock(e) {
  const items = Array.isArray(e.prep) ? e.prep.filter(alive) : null;
  if (items === null) return `<button type="button" class="linkrow" data-action="prep.create" ${idAttr(e.id)}><span class="grow">${esc(t('prep.add'))}</span>${ICONS.plus}</button>`;
  const done = items.filter(i => i.done).length;
  const rows = items.map(i => `<div class="row prow${i.done ? ' is-done' : ''}">
      <input type="checkbox" data-action="prep.toggle" data-event="${esc(e.id)}" data-id="${esc(i.id)}" ${i.done ? 'checked' : ''} aria-label="${esc(t('aria.done'))}">
      <div class="grow ttext" data-action="prep.edit" data-event="${esc(e.id)}" data-id="${esc(i.id)}" role="button" tabindex="0"><div class="title">${esc(i.title)}</div></div></div>`).join('');
  const form = `<form class="line" data-form="prep.add" data-event="${esc(e.id)}" autocomplete="off">
      <input name="title" required placeholder="${esc(t('prep.itemPh'))}" class="grow" aria-label="${esc(t('prep.itemPh'))}"><button type="submit">${esc(t('btn.add'))}</button></form>`;
  return foldBlock('prep', t('prep.title'), rows + form, { count: items.length ? `${done}/${items.length}` : null });
}

function eventSheet(doc, ctx, s) {
  const e = find(doc.events, s.id);
  if (!e) return '';
  const day = e.start.slice(0, 10);
  const when = `${weekdayLong(isoWeekday(day) - 1)}, ${dayLong(day)} · ${e.start.slice(11)}${e.end ? ' – ' + (e.end.slice(0, 10) === day ? e.end.slice(11) : formatDay(e.end.slice(0, 10)) + ' ' + e.end.slice(11)) : ''}`;
  return sheet(e.title, `<p class="muted">${esc(when)}</p>${prepBlock(e)}
    <div class="line"><button type="button" data-action="edit.open" data-kind="event" ${idAttr(e.id)}>${esc(t('btn.edit'))}</button>
      <button type="button" class="quiet" data-action="convert.open" data-from="event" ${idAttr(e.id)}>${esc(t('menu.toTask'))}</button></div>`);
}

function prepEditSheet(doc, ctx, s) {
  const e = find(doc.events, s.event);
  const it = e && find(e.prep, s.id);
  if (!it) return '';
  return sheet(t('prep.edit'), `<form class="editform" data-form="prep.edit" data-event="${esc(e.id)}" data-id="${esc(it.id)}" autocomplete="off">
    <label class="field"><span>${esc(t('lists.itemPh'))}</span><input name="title" value="${esc(it.title)}" required class="grow"></label>
    <div class="line"><button type="submit" class="primary">${esc(t('btn.save'))}</button><button type="button" data-action="prep.back" data-event="${esc(e.id)}">${esc(t('btn.cancel'))}</button>
      <button type="button" class="quiet danger-text" data-action="prep.delete" data-event="${esc(e.id)}" data-id="${esc(it.id)}">${esc(t('btn.delete'))}</button></div></form>`);
}

// ---------- task ↔ event ----------

const LOSS_TEXT = { deadline: 'conv.loss.deadline', done: 'conv.loss.done', review: 'conv.loss.review', project: 'conv.loss.project', prep: 'conv.loss.prep', end: 'conv.loss.end', repeat: 'conv.loss.repeat', alerts: 'conv.loss.alerts', reminder: 'conv.loss.reminder' };

function convertSheet(doc, ctx, s) {
  if (s.from === 'task') {
    const task = find(doc.tasks, s.id);
    if (!task || task.seriesId) return '';
    const losses = taskConversionLosses(task);
    const day = task.plan.kind === 'day' ? task.plan.date : (ctx.ui.cal && ctx.ui.cal.sel) || ctx.today;
    return sheet(t('menu.toEvent'), `<p class="title">${esc(task.title)}</p>
      <form data-form="convert.go" data-from="task" data-id="${esc(task.id)}" data-confirmed="${losses.length ? '1' : ''}" autocomplete="off">
        ${task.plan.kind === 'day' ? '' : `<label class="field"><span>${esc(t('edit.date'))}</span><input type="date" name="date" value="${esc(day)}" required></label>`}
        <label class="field"><span>${esc(t('edit.time'))}</span><input type="time" name="time" value="${esc(task.time || '')}" required></label>
        ${lossBlock(losses)}
        <div class="line"><button type="submit" class="primary${losses.length ? ' danger' : ''}">${esc(t(losses.length ? 'conv.confirm' : 'conv.go'))}</button>
          <button type="button" data-action="sheet.close">${esc(t('btn.cancel'))}</button></div></form>`);
  }
  const e = find(doc.events, s.id);
  if (!e) return '';
  const losses = eventConversionLosses(e);
  return sheet(t('menu.toTask'), `<p class="title">${esc(e.title)}</p>
    <form data-form="convert.go" data-from="event" data-id="${esc(e.id)}" data-confirmed="${losses.length ? '1' : ''}" autocomplete="off">
      <p class="muted small">${esc(t('conv.eventToTask', { day: { $day: e.start.slice(0, 10) }, time: e.start.slice(11) }))}</p>
      ${lossBlock(losses)}
      <div class="line"><button type="submit" class="primary${losses.length ? ' danger' : ''}">${esc(t(losses.length ? 'conv.confirm' : 'conv.go'))}</button>
        <button type="button" data-action="sheet.close">${esc(t('btn.cancel'))}</button></div></form>`);
}

function lossBlock(losses) {
  if (!losses.length) return `<p class="muted small">${esc(t('conv.safe'))}</p>`;
  return `<div class="banner warn"><b>${esc(t('conv.lossTitle'))}</b><ul>${losses.map(l => `<li>${esc(t(LOSS_TEXT[l]))}</li>`).join('')}</ul>
    <span class="small">${esc(t('conv.restorable'))}</span></div>`;
}

// ---------- creating things ----------

function waitAddSheet() {
  return sheet(t('wait.add'), `<form data-form="wait.add" autocomplete="off">
    <label class="field"><span>${esc(t('wait.what'))}</span><input name="title" required data-focus class="grow"></label>
    <label class="field"><span>${esc(t('wait.from'))}</span><input name="from"></label>
    <label class="field"><span>${esc(t('wait.followUp'))}</span><input type="date" name="followUp"></label>
    <div class="line"><button type="submit" class="primary">${esc(t('btn.add'))}</button></div></form>`);
}

function newListSheet(doc) {
  const tpls = listTemplates(doc, ctxLang());
  const missing = missingBuiltins(doc);
  return sheet(t('lists.new'), `<form class="line" data-form="list.add" autocomplete="off">
      <input name="name" required data-focus placeholder="${esc(t('lists.namePh'))}" class="grow" aria-label="${esc(t('lists.namePh'))}"><button type="submit" class="primary">${esc(t('lists.blank'))}</button></form>
    <h3 class="sub">${esc(t('lists.fromTemplate'))}</h3>
    ${tpls.length ? menu(tpls.map(x => item('tpl.use', x.name, idAttr(x.id)))) : `<p class="muted">${esc(t('lists.noTemplates'))}</p>`}
    ${missing.length ? `<div class="line"><button type="button" class="quiet" data-action="tpl.restoreBuiltin" data-bases="${esc(missing.join(','))}">${esc(t('lists.restoreBuiltin'))}</button></div>` : ''}
    ${menu([item('tpl.manage', t('lists.manageTemplates'))])}`);
}
const ctxLang = () => getLang();

function newTemplateSheet() {
  return sheet(t('lists.newTemplate'), `<form class="line" data-form="tpl.add" autocomplete="off">
    <input name="name" required data-focus placeholder="${esc(t('lists.templateNamePh'))}" class="grow" aria-label="${esc(t('lists.templateNamePh'))}"><button type="submit" class="primary">${esc(t('btn.create'))}</button></form>`);
}

function addItemsSheet(doc, ctx, s) {
  const c = getContainer(doc, s.coll, s.list);
  if (!c) return '';
  const cats = categoriesOf(c);
  const catSel = cats.length ? `<label class="field"><span>${esc(t('lists.categoryPh'))}</span><select name="category"><option value="">${esc(t('lists.noCategory'))}</option>
      ${cats.map(x => `<option value="${esc(x)}"${s.category === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>` : '';
  return sheet(t('lists.addItem'), `<form data-form="items.add" data-coll="${esc(s.coll)}" data-list="${esc(c.id)}" autocomplete="off">
    <textarea name="text" rows="4" data-focus placeholder="${esc(t('lists.itemsPh'))}" aria-label="${esc(t('lists.addItem'))}">${esc(s.text || '')}</textarea>
    ${catSel}
    <div class="line"><button type="submit" class="primary">${esc(t('btn.add'))}</button></div></form>`, 'sheet-quick');
}

function addHomeSheet(doc, ctx, s) {
  return sheet(t('lists.addItem'), `<form data-form="home.add" autocomplete="off">
    <textarea name="text" rows="4" data-focus placeholder="${esc(t('lists.homePh'))}" aria-label="${esc(t('lists.addItem'))}">${esc(s.text || '')}</textarea>
    <div class="line"><button type="submit" class="primary">${esc(t('btn.add'))}</button></div></form>`, 'sheet-quick');
}

function stockSheet(doc, ctx, s) {
  const h = doc.lists.find(l => l.kind === 'home' && alive(l));
  const it = h && find(h.items, s.id);
  if (!it) return '';
  const cur = stockOf(it);
  const btns = STOCK_ORDER.map(k => `<button type="button" class="stockbtn${cur === k ? ' on' : ''}" data-action="stock.set" data-id="${esc(it.id)}" data-stock="${k}" aria-pressed="${cur === k}">${esc(t('stock.' + k))}</button>`).join('');
  return sheet(it.title, `<div class="stockrow">${btns}</div>
    <form class="editform" data-form="item.edit" data-coll="lists" data-list="${esc(h.id)}" data-item="${esc(it.id)}" autocomplete="off">
      <label class="field"><span>${esc(t('lists.itemPh'))}</span><input name="title" value="${esc(it.title)}" required class="grow"></label>
      <div class="line"><button type="submit">${esc(t('btn.save'))}</button>
        <button type="button" class="quiet danger-text" data-action="item.delete" data-coll="lists" data-list="${esc(h.id)}" data-id="${esc(it.id)}">${esc(t('btn.delete'))}</button></div></form>`);
}

// ---------- list management («···» inside a list) ----------

function containerOf(doc, s) { return getContainer(doc, s.coll, s.id); }

function listMenu(doc, ctx, s) {
  let c = containerOf(doc, s);
  if (!c) return '';
  const a = `data-coll="${esc(s.coll)}" ${idAttr(c.id)}`;
  const rows = [item('sheet.rename', t('lists.renameList'), a), item('sheet.cats', t('lists.categories'), a)];
  if (s.coll === 'lists') rows.push(item('list.saveTemplate', t('lists.saveAsTemplate'), idAttr(c.id)));
  rows.push(item(s.coll === 'lists' ? 'list.delete' : 'tpl.delete', t('btn.delete'), idAttr(c.id), 'danger'));
  return sheet(c.name, menu(rows));
}

function renameSheet(doc, ctx, s) {
  const c = containerOf(doc, s);
  if (!c) return '';
  return sheet(t('lists.renameList'), `<form class="line" data-form="${s.coll === 'lists' ? 'list.rename' : 'tpl.rename'}" data-list="${esc(c.id)}" autocomplete="off">
    <input name="name" value="${esc(c.name)}" required class="grow" aria-label="${esc(t('lists.rename'))}"><button type="submit" class="primary">${esc(t('btn.save'))}</button></form>`);
}

function catsSheet(doc, ctx, s) {
  const c = containerOf(doc, s);
  if (!c) return '';
  const a = n => `data-coll="${esc(s.coll)}" data-list="${esc(c.id)}" data-name="${esc(n)}"`;
  const rows = categoriesOf(c).map(n => s.renaming === n
    ? `<form class="row line" data-form="cat.rename" data-coll="${esc(s.coll)}" data-list="${esc(c.id)}" data-name="${esc(n)}" autocomplete="off">
        <input name="name" value="${esc(n)}" required class="grow" aria-label="${esc(t('lists.rename'))}"><button type="submit" class="primary">${esc(t('btn.save'))}</button></form>`
    : `<div class="row"><div class="grow title">${esc(n)}</div>
        <button type="button" class="quiet" data-action="cat.renameOpen" ${a(n)}>${esc(t('lists.renameCategory'))}</button>
        <button type="button" class="quiet" data-action="cat.remove" ${a(n)}>${esc(t('lists.removeCategory'))}</button></div>`).join('');
  return sheet(t('lists.categories'), `${rows || `<p class="muted">${esc(t('lists.noCategories'))}</p>`}
    <form class="line" data-form="cat.add" data-coll="${esc(s.coll)}" data-list="${esc(c.id)}" autocomplete="off">
      <input name="name" required placeholder="${esc(t('lists.categoryNamePh'))}" class="grow" aria-label="${esc(t('lists.categoryNamePh'))}"><button type="submit">${esc(t('lists.addCategory'))}</button></form>`);
}

function tplMenu(doc, ctx, s) {
  const tpl = listTemplates(doc, ctxLang()).find(x => x.id === s.id);
  if (!tpl) return '';
  return sheet(tpl.name, menu([item('tpl.use', t('lists.useTemplate', { name: tpl.name }), idAttr(tpl.id)), item('tpl.edit', t('lists.editTemplate'), idAttr(tpl.id)),
    item('tpl.delete', t('btn.delete'), idAttr(tpl.id), 'danger')]));
}

function seriesNewSheet(doc, ctx) {
  return sheet(t('recur.add'), `<form data-form="series.add" autocomplete="off">
    <label class="field"><span>${esc(t('recur.name'))}</span><input name="title" required data-focus class="grow"></label>
    ${ruleFields(null, ctx.today)}
    <div class="line"><button type="submit" class="primary">${esc(t('recur.add'))}</button></div></form>`);
}

const SHEETS = {
  appmenu: appMenu, quick: quickSheet, taskmenu: taskMenu, eventmenu: eventMenu, waitmenu: waitMenu, seriesmenu: seriesMenu,
  move: moveSheet, pick: pickSheet, edit: editSheet, event: eventSheet, prepedit: prepEditSheet, convert: convertSheet,
  waitadd: waitAddSheet, newlist: newListSheet, newtpl: newTemplateSheet, additems: addItemsSheet, addhome: addHomeSheet,
  seriesnew: seriesNewSheet, stock: stockSheet, listmenu: listMenu, rename: renameSheet, cats: catsSheet, tplmenu: tplMenu
};

export function renderSheet(doc, ctx) {
  const s = ctx.ui.sheet;
  if (!s || !SHEETS[s.type]) return '';
  return SHEETS[s.type](doc, ctx, s) || '';
}
