// Small shared helpers. No DOM access here.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Escape any value for safe use inside HTML text or a quoted attribute.
// Every piece of user or file data that goes into innerHTML must pass through this.
// Never throws, even for odd values from an imported file.
export function esc(value) {
  let s;
  try { s = String(value ?? ''); } catch { s = ''; }
  return s.replace(/[&<>"']/g, c => ESCAPES[c]);
}

// Random unique id, safe for HTML attributes (letters, digits, dashes).
export function uid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

// Deep copy of plain JSON data (the whole app state is plain JSON).
export const clone = value => JSON.parse(JSON.stringify(value));

export const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
