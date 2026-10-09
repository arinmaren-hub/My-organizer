// "Списки" screen: lists with checkable items.

import { esc } from './util.js';
import { activeLists } from './selectors.js';
import { empty } from './components.js';

function listCard(l) {
  const lid = esc(l.id);
  const items = l.items.filter(i => !i.deletedAt);
  return `
    <section class="card">
      <div class="line"><h2 class="grow">${esc(l.name)}</h2>
        <button type="button" data-action="list.delete" data-id="${lid}">Удалить</button></div>
      ${items.map(i => `
        <label class="row${i.done ? ' is-done' : ''}">
          <input type="checkbox" data-action="item.toggle" data-list="${lid}" data-id="${esc(i.id)}" ${i.done ? 'checked' : ''}>
          <span class="grow title">${esc(i.title)}</span>
        </label>`).join('')}
      <form class="line" data-form="item.add" data-list="${lid}" autocomplete="off">
        <input name="title" required placeholder="Добавить пункт" class="grow"><button type="submit" aria-label="Добавить пункт">+</button>
      </form>
    </section>`;
}

export function renderLists(doc) {
  const lists = activeLists(doc);
  return `
    <section class="card">
      <h2>Новый список</h2>
      <form class="line" data-form="list.add" autocomplete="off">
        <input name="name" required placeholder="Например, покупки" class="grow"><button type="submit" class="primary">Создать</button>
      </form>
    </section>
    ${lists.length ? lists.map(listCard).join('') : `<section class="card">${empty('Списков пока нет')}</section>`}`;
}
