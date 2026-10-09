// Reusable list templates (DECISIONS.md, B8). Pure functions.
//
// Two built-in templates (Supermarket, Suitcase Packing) live in the CODE, not in the
// data, so a new organizer stores nothing for them and no update can ever duplicate
// them. The first time one is edited or deleted, an ordinary template record is made
// from it (base = 'supermarket' / 'suitcase'); from then on that record is the template
// and the built-in copy is no longer shown. A deleted record of this kind is kept as a
// marker (never purged) so a deleted built-in does not come back by itself.

import { BUILTIN_TEMPLATES } from './schema.js';
import { BUILTIN_DATA } from './i18n-v4.js';

export const BUILTIN_PREFIX = 'builtin:';
export const isBuiltinId = id => typeof id === 'string' && id.startsWith(BUILTIN_PREFIX) && BUILTIN_TEMPLATES.includes(id.slice(BUILTIN_PREFIX.length));
export const baseOf = id => id.slice(BUILTIN_PREFIX.length);

// The built-in template in a language, in the shape of a template record (fixed ids, never saved).
export function builtinTemplate(base, lang) {
  const data = BUILTIN_DATA[base][lang === 'en' ? 'en' : 'ru'];
  const items = [];
  for (const [category, titles] of data.categories) {
    titles.forEach((title, i) => items.push({ id: `${base}-${items.length}`, title, done: false, category, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null }));
  }
  return { id: BUILTIN_PREFIX + base, name: data.name, base, builtin: true, items, categories: data.categories.map(c => c[0]), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null };
}

// Templates to show: the person's own (and edited built-ins), then built-ins that were never touched.
export function listTemplates(doc, lang) {
  const own = doc.templates.filter(t => !t.deletedAt);
  const touched = new Set(doc.templates.filter(t => t.base).map(t => t.base)); // includes deleted markers
  const builtins = BUILTIN_TEMPLATES.filter(b => !touched.has(b)).map(b => builtinTemplate(b, lang));
  return [...own, ...builtins];
}

// Built-ins that are not available now (deleted or replaced by an edited copy → only deleted ones count).
export function missingBuiltins(doc) {
  return BUILTIN_TEMPLATES.filter(b => {
    const recs = doc.templates.filter(t => t.base === b);
    return recs.length > 0 && recs.every(t => t.deletedAt);
  });
}

// Categories of a list or template in display order: declared ones first, then any used by items.
export function categoriesOf(container) {
  const out = [];
  const add = c => { if (typeof c === 'string' && c !== '' && !out.includes(c)) out.push(c); };
  (container.categories || []).forEach(add);
  container.items.filter(i => !i.deletedAt).forEach(i => add(i.category));
  return out;
}

// Items grouped for display: [{ category: name|null, items }] with uncategorized first.
export function groupItems(container) {
  const items = container.items.filter(i => !i.deletedAt);
  const groups = [];
  const loose = items.filter(i => !i.category);
  if (loose.length) groups.push({ category: null, items: loose });
  for (const c of categoriesOf(container)) groups.push({ category: c, items: items.filter(i => i.category === c) });
  return groups;
}
