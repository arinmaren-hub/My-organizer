// «Цели» (0.7.0): pure helpers over the goals collection. Reading only — nothing here changes data.
//
// A goal holds its steps in the order the person put them. The «next step» is simply the first
// step that is not finished yet; it is what «Задачи» shows, so the person does not have to keep
// the whole chain in mind. A goal marked as reached (`doneAt`) no longer offers a next step; a goal on pause
// (`pausedAt`) keeps it, but «Задачи» does not show it.

const alive = r => !r.deletedAt;

export const liveSteps = g => (Array.isArray(g.steps) ? g.steps.filter(alive) : []);

// Goals in work (oldest first, as they were added) and reached goals (most recently reached first).
export function activeGoals(doc) {
  return (doc.goals || []).filter(g => alive(g) && !g.doneAt);
}
export function reachedGoals(doc) {
  return (doc.goals || []).filter(g => alive(g) && g.doneAt).sort((a, b) => b.doneAt.localeCompare(a.doneAt));
}

export function nextStep(g) {
  if (!g || g.doneAt) return null;
  return liveSteps(g).find(s => !s.done) || null;
}

export function goalProgress(g) {
  const steps = liveSteps(g);
  return { done: steps.filter(s => s.done).length, total: steps.length };
}

// For «Задачи»: one row per goal in work (not on pause) that has an unfinished step — { goal, step }.
// Steps have no dates on purpose: they never become overdue, never go to «Хвосты» and are never moved.
export function nextSteps(doc) {
  const out = [];
  for (const g of activeGoals(doc)) {
    if (g.pausedAt) continue;
    const s = nextStep(g);
    if (s) out.push({ goal: g, step: s });
  }
  return out;
}

export function findGoal(doc, id) {
  return (doc.goals || []).find(g => g.id === id && alive(g)) || null;
}

// Plain-text note → safe HTML: every character escaped, web addresses (http/https only) made into links
// that open outside the app. `esc` is passed in so this file stays free of DOM and i18n imports.
const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;
export function noteHtml(text, esc) {
  const s = String(text || '');
  let out = '', last = 0;
  for (const m of s.matchAll(URL_RE)) {
    out += esc(s.slice(last, m.index));
    const url = m[0];
    out += `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`;
    last = m.index + url.length;
  }
  return out + esc(s.slice(last));
}
