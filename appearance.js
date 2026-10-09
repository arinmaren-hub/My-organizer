// Appearance: light / dark / follow the system.
// A per-device preference stored under its own key (organizer:appearance),
// OUTSIDE the data document: it is not part of backups, and changing it never
// touches tasks, events, projects, lists or automatic copies.
// boot.js reads the same key before the page is drawn, so there is no flash
// of the wrong colours on start.

import { KEYS } from './storage.js';

export const MODES = ['system', 'light', 'dark'];
export const DEFAULT_MODE = 'system';

// Must match --bg in app.css; used for the browser/status-bar colour.
const PAGE_COLORS = { light: '#f2eee6', dark: '#1b1a18' };

export function readAppearance(storage) {
  try {
    const v = storage.get(KEYS.appearance);
    return MODES.includes(v) ? v : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

// Returns true when the choice is saved; false when it could not be written
// (it still applies until the app is closed).
export function saveAppearance(storage, mode) {
  if (!MODES.includes(mode)) throw new Error('unknown appearance mode');
  try {
    storage.set(KEYS.appearance, mode);
    return true;
  } catch {
    return false;
  }
}

export function applyAppearance(mode, doc = document) {
  const root = doc.documentElement;
  if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode);
  else root.removeAttribute('data-theme');
  // Two theme-color tags (one per system scheme); a fixed choice overrides both.
  for (const meta of doc.querySelectorAll('meta[name="theme-color"][data-scheme]')) {
    const scheme = meta.getAttribute('data-scheme');
    meta.setAttribute('content', PAGE_COLORS[mode === 'system' ? scheme : mode] || PAGE_COLORS.light);
  }
}
