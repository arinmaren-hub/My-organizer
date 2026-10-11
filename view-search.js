// Search sheet (0.6.0): a field at the top and the matches below, updated as the person types.
// Reading only: nothing is changed here. Tapping a dated result goes to the Calendar (app.js, 'search.go').

import { esc } from './util.js';
import { t, formatDay } from './i18n.js';
import { searchRecords, searchListItems, queryWords, MAX_RESULTS } from './search.js';

// Inside one opened ordinary list: its items (titles and category names), nothing else.
function listResultsHtml(doc, s) {
  const c = doc.lists.find(l => l.id === s.list && !l.deletedAt && l.kind !== 'home');
  if (!queryWords(s.q).length) return `<p class="muted small">${esc(t('search.listHint'))}</p>`;
  const found = c ? searchListItems(c.items.filter(i => !i.deletedAt), s.q) : [];
  if (!found.length) return `<p class="muted">${esc(t('search.none'))}</p>`;
  return `<div class="srch-list">${found.map(i => `<button type="button" class="srch item${i.done ? ' is-done' : ''}" data-action="listsearch.go" data-coll="lists" data-list="${esc(c.id)}" data-id="${esc(i.id)}">
      <span class="stitle">${esc(i.title)}</span>${i.category ? `<span class="meta">${esc(i.category)}</span>` : ''}</button>`).join('')}</div>`;
}

export function searchResultsHtml(doc, s) {
  if (s.scope === 'list') return listResultsHtml(doc, s);
  const q = s.q;
  if (!queryWords(q).length) return `<p class="muted small">${esc(t('search.hint'))}</p>`;
  const found = searchRecords(doc, q);
  if (!found.length) return `<p class="muted">${esc(t('search.none'))}</p>`;
  const rows = found.map(r => {
    const when = r.date ? `${r.planKind === 'week' ? t('plan.week', { day: { $day: r.date } }) : formatDay(r.date)}${r.time ? ', ' + r.time : ''}` : t('plan.none');
    const typeLabel = t(r.type === 'event' ? 'search.event' : 'search.task');
    return `<button type="button" class="srch ${r.type}${r.done ? ' is-done' : ''}" data-action="search.go" data-type="${r.type}" data-id="${esc(r.id)}">
      <span class="stitle">${r.recurring ? '↻ ' : ''}${esc(r.title)}</span>
      <span class="meta">${esc(typeLabel)} · ${esc(when)}${r.done ? ` · ${esc(t('search.done'))}` : ''}</span></button>`;
  }).join('');
  return `<div class="srch-list">${rows}</div>${found.length >= MAX_RESULTS ? `<p class="muted small">${esc(t('search.limit', { n: MAX_RESULTS }))}</p>` : ''}`;
}

export function searchBody(doc, s) {
  const q = s.q || '';
  return `<form data-form="search" autocomplete="off" role="search">
      <input type="search" name="q" value="${esc(q || '')}" data-focus placeholder="${esc(t(s.scope === 'list' ? 'search.listPh' : 'search.ph'))}" aria-label="${esc(t('search.title'))}" enterkeyhint="search" class="grow">
    </form>
    <div id="search-results" aria-live="polite">${searchResultsHtml(doc, s)}</div>`;
}
