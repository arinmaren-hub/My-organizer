// «Списки» (0.5.0): an index first — «Купить» (generated), «Дом», then the person's lists.
// A tap opens one list on its own screen; the header shows «‹ Списки» and a «···» for management.
// Templates are not on this screen: they are reached from «＋ → Новый список».
// Routes (ui.list): null = index, 'buy', 'home', 'templates', 'l:<listId>', 't:<templateId>'.

import { esc } from './util.js';
import { t, getLang } from './i18n.js';
import { activeLists } from './selectors.js';
import { unfinishedFirst, empty, foldBlock, moreButton } from './components.js';
import { groupItems, listTemplates, missingBuiltins, isBuiltinId, baseOf } from './templates.js';
import { homeItems, buyItems, stockOf, STOCK_ORDER } from './home.js';
import { ICONS } from './icons.js';

// The container behind a route (a list or a template); a built-in template that was edited follows its copy.
export function getContainer(doc, coll, id) {
  if (coll === 'lists') return doc.lists.find(l => l.id === id && !l.deletedAt && l.kind !== 'home') || null;
  if (isBuiltinId(id)) {
    const moved = doc.templates.find(x => x.base === baseOf(id) && !x.deletedAt);
    if (moved) return moved;
  }
  return listTemplates(doc, getLang()).find(x => x.id === id) || null;
}

// What the header needs: { title, sub, back, more, fab }; null when the route no longer exists.
export function listsRoute(doc, route) {
  if (!route) return { route: null, title: t('tab.lists'), back: false, more: null, fab: 'newlist' };
  if (route === 'buy') return { route, title: t('lists.buy'), back: true, more: null, fab: null };
  if (route === 'home') return { route, title: t('lists.home'), back: true, more: null, fab: 'addhome' };
  if (route === 'templates') return { route, title: t('lists.templates'), back: true, more: null, fab: 'newtpl' };
  const coll = route.startsWith('t:') ? 'templates' : route.startsWith('l:') ? 'lists' : null;
  const c = coll && getContainer(doc, coll, route.slice(2));
  if (!c) return null;
  const items = c.items.filter(i => !i.deletedAt);
  const sub = coll === 'lists' && items.length ? t('lists.progress', { done: items.filter(i => i.done).length, total: items.length }) : '';
  return { route: (coll === 'lists' ? 'l:' : 't:') + c.id, coll, c, title: c.name, sub, back: true, more: 'menu.list', fab: 'additems' };
}

const indexRow = (route, title, count, hint = '') =>
  `<button type="button" class="indexrow" data-action="list.open" data-route="${esc(route)}">
    <span class="grow"><span class="title">${esc(title)}</span>${hint ? `<span class="meta">${esc(hint)}</span>` : ''}</span>
    ${count ? `<span class="count">${esc(count)}</span>` : ''}<span class="chev">${ICONS.chevron}</span></button>`;

function index(doc) {
  const lists = activeLists(doc);
  const buy = buyItems(doc).length, home = homeItems(doc).length;
  return `<section class="list">
      ${indexRow('buy', t('lists.buy'), buy ? String(buy) : '', t('lists.buyHint'))}
      ${indexRow('home', t('lists.home'), home ? String(home) : '', t('lists.homeHint'))}
      ${lists.map(l => {
        const items = l.items.filter(i => !i.deletedAt), open = items.filter(i => !i.done).length;
        return indexRow('l:' + l.id, l.name, items.length ? (open ? String(open) : '✓') : '');
      }).join('')}
    </section>${lists.length ? '' : empty(t('lists.empty'))}`;
}

function buyScreen(doc) {
  const items = buyItems(doc);
  return `<section class="list">${items.map(i => `<div class="row irow">
      <input type="checkbox" data-action="buy.toggle" data-id="${esc(i.id)}" aria-label="${esc(t('lists.bought'))}">
      <div class="grow ttext"><div class="title">${esc(i.title)}</div></div></div>`).join('')}</section>${items.length ? '' : empty(t('lists.buyEmpty'))}`;
}

function homeScreen(doc) {
  const items = homeItems(doc);
  if (!items.length) return empty(t('lists.homeEmpty'));
  return STOCK_ORDER.slice().reverse().map(k => {
    const list = items.filter(i => stockOf(i) === k);
    if (!list.length) return '';
    return foldBlock('home.' + k, t('stock.' + k), list.map(i => `<div class="row hrow"><div class="grow ttext" data-action="stock.open" data-id="${esc(i.id)}" role="button" tabindex="0"><div class="title">${esc(i.title)}</div></div></div>`).join(''),
      { count: String(list.length), defaultOpen: true });
  }).join('');
}

function itemRow(c, coll, i) {
  const cid = esc(c.id), iid = esc(i.id);
  const check = coll === 'lists' ? `<input type="checkbox" data-action="item.toggle" data-list="${cid}" data-id="${iid}" ${i.done ? 'checked' : ''} aria-label="${esc(t('aria.done'))}">` : '';
  return `<div class="row irow${i.done ? ' is-done' : ''}">${check}
    <div class="grow ttext" data-action="edit.open" data-kind="item" data-coll="${coll}" data-list="${cid}" data-id="${iid}" role="button" tabindex="0"><div class="title">${esc(i.title)}</div></div></div>`;
}

function listScreen(doc, r) {
  const { c, coll } = r;
  const groups = groupItems(c);
  const any = c.items.some(i => !i.deletedAt);
  let h = groups.map(g => {
    const rows = (coll === 'lists' ? unfinishedFirst(g.items) : g.items).map(i => itemRow(c, coll, i)).join('');
    if (g.category === null) return `<section class="list">${rows}</section>`;
    return foldBlock(`cat:${c.id}:${g.category}`, g.category, rows || empty(t('lists.categoryEmpty')), { count: String(g.items.length), defaultOpen: true });
  }).join('');
  if (!any && !groups.length) h = empty(t('lists.itemsEmpty'));
  return h;
}

function templatesScreen(doc) {
  const all = listTemplates(doc, getLang());
  const missing = missingBuiltins(doc);
  return `<section class="list">${all.map(tpl => {
      const n = tpl.items.filter(i => !i.deletedAt).length;
      return `<div class="row"><div class="grow ttext" data-action="tpl.edit" data-id="${esc(tpl.id)}" role="button" tabindex="0">
        <div class="title">${esc(tpl.name)}</div><div class="meta">${esc([tpl.builtin ? t('lists.builtin') : '', t('lists.itemsCount', { n })].filter(Boolean).join(' · '))}</div></div>
        ${moreButton('menu.tpl', tpl.id)}</div>`;
    }).join('')}</section>${all.length ? '' : empty(t('lists.noTemplates'))}
    ${missing.length ? `<div class="line"><button type="button" class="quiet" data-action="tpl.restoreBuiltin" data-bases="${esc(missing.join(','))}">${esc(t('lists.restoreBuiltin'))}</button></div>` : ''}`;
}

export function renderLists(doc, ctx) {
  const r = listsRoute(doc, ctx.ui.list) || listsRoute(doc, null);
  if (!r.route) return index(doc);
  if (r.route === 'buy') return buyScreen(doc);
  if (r.route === 'home') return homeScreen(doc);
  if (r.route === 'templates') return templatesScreen(doc);
  return listScreen(doc, r);
}
