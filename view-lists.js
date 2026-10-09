// "Списки" screen: lists with categories and checkable items, and reusable templates.
// A list and a template have the same shape; templates have no checkmarks.

import { esc } from './util.js';
import { t, getLang } from './i18n.js';
import { activeLists } from './selectors.js';
import { empty, uiState } from './components.js';
import { groupItems, categoriesOf, listTemplates, missingBuiltins, isBuiltinId, baseOf } from './templates.js';

const isEditingItem = (id) => !!uiState.editing && uiState.editing.kind === 'item' && uiState.editing.id === id;

function categoryField(c, value = '') {
  const dl = `cats-${esc(c.id)}`;
  return `<input name="category" list="${dl}" value="${esc(value || '')}" placeholder="${esc(t('lists.categoryPh'))}" aria-label="${esc(t('lists.categoryPh'))}">
    <datalist id="${dl}">${categoriesOf(c).map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist>`;
}

function itemRow(c, coll, i) {
  const cid = esc(c.id), iid = esc(i.id);
  if (isEditingItem(i.id)) {
    return `<div class="row"><form class="editform grow" data-form="item.edit" data-coll="${coll}" data-list="${cid}" data-item="${iid}" autocomplete="off">
      <div class="line"><input name="title" value="${esc(i.title)}" required class="grow" aria-label="${esc(t('lists.itemPh'))}">${categoryField(c, i.category)}</div>
      <div class="line"><button type="submit" class="primary">${esc(t('btn.save'))}</button><button type="button" data-action="edit.cancel">${esc(t('btn.cancel'))}</button></div></form></div>`;
  }
  const tools = `<button type="button" class="icon" data-action="edit.open" data-kind="item" data-id="${iid}" aria-label="${esc(t('aria.edit'))}">✎</button>
      <button type="button" class="icon" data-action="item.delete" data-coll="${coll}" data-list="${cid}" data-id="${iid}" aria-label="${esc(t('btn.delete'))}">×</button>`;
  if (coll === 'lists') {
    return `<div class="row${i.done ? ' is-done' : ''}">
      <label class="grow itemlabel"><input type="checkbox" data-action="item.toggle" data-list="${cid}" data-id="${iid}" ${i.done ? 'checked' : ''}> <span class="title">${esc(i.title)}</span></label>${tools}</div>`;
  }
  return `<div class="row"><div class="grow title">${esc(i.title)}</div>${tools}</div>`;
}

function categoryHead(c, coll, name) {
  const cid = esc(c.id), n = esc(name);
  return `<div class="line cathead"><h3 class="grow">${esc(name)}</h3>
    <button type="button" class="quiet" data-action="cat.rename" data-coll="${coll}" data-list="${cid}" data-name="${n}">${esc(t('lists.renameCategory'))}</button>
    <button type="button" class="quiet" data-action="cat.remove" data-coll="${coll}" data-list="${cid}" data-name="${n}">${esc(t('lists.removeCategory'))}</button></div>`;
}

// The body shared by a list card and a template editor.
function containerBody(c, coll) {
  const cid = esc(c.id);
  const groups = groupItems(c);
  let h = groups.map(g => `${g.category !== null ? categoryHead(c, coll, g.category) : ''}${g.items.map(i => itemRow(c, coll, i)).join('')}`).join('');
  h += `<form class="line" data-form="item.add" data-coll="${coll}" data-list="${cid}" autocomplete="off">
      <input name="title" required placeholder="${esc(t('lists.addItem'))}" class="grow">${categoryField(c)}<button type="submit" aria-label="${esc(t('lists.addItem'))}">+</button></form>
    <form class="line" data-form="cat.add" data-coll="${coll}" data-list="${cid}" autocomplete="off">
      <input name="name" required placeholder="${esc(t('lists.categoryNamePh'))}" class="grow"><button type="submit">${esc(t('lists.addCategory'))}</button></form>`;
  return h;
}

function listCard(l) {
  const lid = esc(l.id);
  return `
    <section class="card">
      <div class="line"><h2 class="grow">${esc(l.name)}</h2>
        <button type="button" class="quiet" data-action="list.saveTemplate" data-id="${lid}">${esc(t('lists.saveAsTemplate'))}</button>
        <button type="button" data-action="list.delete" data-id="${lid}">${esc(t('btn.delete'))}</button></div>
      ${containerBody(l, 'lists')}
    </section>`;
}

function templateRow(tpl) {
  const id = esc(tpl.id);
  const n = tpl.items.filter(i => !i.deletedAt).length;
  return `<div class="row"><div class="grow"><div class="title">${esc(tpl.name)}${tpl.builtin ? ` <span class="muted small">(${esc(t('lists.builtin'))})</span>` : ''}</div>
      <div class="muted small">${esc(t('lists.itemsCount', { n }))}</div>
      <div class="moves"><button type="button" class="primary" data-action="tpl.use" data-id="${id}">${esc(t('lists.useTemplate', { name: tpl.name }))}</button>
        <button type="button" data-action="tpl.edit" data-id="${id}">${esc(t('lists.editTemplate'))}</button></div></div>
      <button type="button" class="icon" data-action="tpl.delete" data-id="${id}" aria-label="${esc(t('btn.delete'))}">×</button></div>`;
}

function templatesSection(doc, ctx) {
  const all = listTemplates(doc, getLang());
  // an edited built-in has become an ordinary record: follow it
  let editId = ctx.ui.tplEdit;
  if (isBuiltinId(editId)) { const moved = doc.templates.find(x => x.base === baseOf(editId) && !x.deletedAt); if (moved) editId = moved.id; }
  const editing = editId && all.find(x => x.id === editId);
  const missing = missingBuiltins(doc);
  return `
    <section class="card">
      <h2>${esc(t('lists.templates'))}</h2>
      <p class="muted small">${esc(t('lists.templatesHint'))}</p>
      ${all.length ? all.map(templateRow).join('') : empty(t('lists.noTemplates'))}
      <form class="line" data-form="tpl.add" autocomplete="off">
        <input name="name" required placeholder="${esc(t('lists.templateNamePh'))}" class="grow"><button type="submit">${esc(t('lists.newTemplate'))}</button></form>
      ${missing.length ? `<div class="line"><button type="button" class="quiet" data-action="tpl.restoreBuiltin" data-bases="${esc(missing.join(','))}">${esc(t('lists.restoreBuiltin'))}</button></div><p class="muted small">${esc(t('lists.restoreHint'))}</p>` : ''}
    </section>
    ${editing ? `<section class="card" id="template-editor"><div class="line"><h2 class="grow">${esc(editing.name)}</h2>
        <button type="button" data-action="tpl.close">${esc(t('lists.close'))}</button></div>
      <form class="line" data-form="tpl.rename" data-list="${esc(editing.id)}" autocomplete="off"><label class="field grow"><span>${esc(t('lists.rename'))}</span><input name="name" value="${esc(editing.name)}" required class="grow"></label><button type="submit">${esc(t('btn.save'))}</button></form>
      ${containerBody(editing, 'templates')}</section>` : ''}`;
}

export function renderLists(doc, ctx) {
  const lists = activeLists(doc);
  return `
    <section class="card">
      <h2>${esc(t('lists.new'))}</h2>
      <form class="line" data-form="list.add" autocomplete="off">
        <input name="name" required placeholder="${esc(t('lists.namePh'))}" class="grow"><button type="submit" class="primary">${esc(t('btn.create'))}</button>
      </form>
    </section>
    ${lists.length ? lists.map(listCard).join('') : `<section class="card">${empty(t('lists.empty'))}</section>`}
    ${templatesSection(doc, ctx)}`;
}
