// Unified search over tasks and events (0.6.0). Pure and read-only: it only looks at the data,
// it never changes it, keeps no index and talks to nothing outside the device.
//
// What is searched (0.7.0 adds goals: their titles, notes and step titles): titles of tasks (open, done, without a date, recurring occurrences) and events
// (past, current, upcoming, occurrences of repeating events). Deleted records and occurrences the
// user skipped are not shown. Case does not matter; «ё» and «е» are the same letter; every word
// typed must appear in the title (in any order).

export const MAX_RESULTS = 200;

export function normalize(s) {
  return String(s == null ? '' : s).toLocaleLowerCase().replace(/\u0451/g, '\u0435').replace(/\s+/g, ' ').trim();
}

export const queryWords = q => normalize(q).split(' ').filter(Boolean);

function matches(title, words) {
  const n = normalize(title);
  return words.every(w => n.includes(w));
}

// A result: { type: 'task'|'event'|'goal'|'step', id, (step: goalId, goalTitle; goal: inNote) title, date: 'YYYY-MM-DD'|null, time: 'HH:MM'|null,
//             done, planKind: 'day'|'week'|'none'|'event', recurring }
export function searchRecords(doc, query, { limit = MAX_RESULTS } = {}) {
  const words = queryWords(query);
  if (!words.length) return [];
  const out = [];
  for (const t of doc.tasks) {
    if (t.deletedAt || t.skipped || !matches(t.title, words)) continue;
    out.push({
      type: 'task', id: t.id, title: t.title, date: t.plan.kind === 'none' ? null : t.plan.date,
      time: t.plan.kind === 'day' ? (t.time || null) : null, done: !!t.done, planKind: t.plan.kind, recurring: !!t.seriesId
    });
  }
  for (const e of doc.events) {
    if (e.deletedAt || !matches(e.title, words)) continue;
    out.push({ type: 'event', id: e.id, title: e.title, date: e.start.slice(0, 10), time: e.start.slice(11, 16), done: false, planKind: 'event', recurring: !!e.seriesId });
  }
  // 0.7.0: goals (title or note) and their steps. They have no date, so they come after the dated records.
  for (const g of doc.goals || []) {
    if (g.deletedAt) continue;
    const inTitle = matches(g.title, words), inNote = !inTitle && matches(g.note || '', words);
    if (inTitle || inNote) out.push({ type: 'goal', id: g.id, title: g.title, date: null, time: null, done: !!g.doneAt, planKind: 'goal', recurring: false, inNote });
    for (const x of g.steps || []) {
      if (x.deletedAt || !matches(x.title, words)) continue;
      out.push({ type: 'step', id: x.id, goalId: g.id, goalTitle: g.title, title: x.title, date: null, time: null, done: !!x.done, planKind: 'step', recurring: false });
    }
  }
  // Newest first; records without a date go last; on one date later times first, events before tasks.
  const RANK = { event: 0, task: 1, goal: 2, step: 3 };
  out.sort((a, b) => {
    if (a.date !== b.date) return a.date === null ? 1 : b.date === null ? -1 : b.date.localeCompare(a.date);
    if (a.type !== b.type) return RANK[a.type] - RANK[b.type];
    if (!!a.inNote !== !!b.inNote) return a.inNote ? 1 : -1; // a goal found by its name before one found in its note
    const ta = a.time || '', tb = b.time || '';
    if (ta !== tb) return tb.localeCompare(ta);
    return a.title.localeCompare(b.title);
  });
  return out.slice(0, limit);
}

// Items of one opened ordinary list: titles and category labels (list search, 0.6.0).
export function searchListItems(items, query) {
  const words = queryWords(query);
  if (!words.length) return items;
  return items.filter(i => matches(`${i.title} ${i.category || ''}`, words));
}
