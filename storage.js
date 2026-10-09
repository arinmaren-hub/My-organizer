// The ONLY place that touches browser storage. Everything else talks to store.js.
// Swapping localStorage for IndexedDB or a sync service later means replacing
// this adapter, not changing the screens.

export const KEYS = {
  data: 'organizer:data',            // the main document (schema v2+)
  snapshots: 'organizer:snapshots',  // automatic safety copies, newest first
  rescue: 'organizer:rescue',        // raw text that could not be read, kept untouched
  device: 'organizer:device',        // per-device info: last backup, last daily copy
  legacy: 'arina-organizer-v1'       // the first prototype's key (read, never written)
};

// Adapter over window.localStorage. Every write is read back to confirm it stuck.
export function createLocalStorageAdapter() {
  let ls = null;
  let initError = null;
  try {
    ls = window.localStorage;
    const probe = 'organizer:probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
  } catch (e) {
    initError = e;
  }
  const ensure = () => { if (!ls) throw initError || new Error('localStorage недоступен'); };
  return {
    get(key) { ensure(); return ls.getItem(key); },
    set(key, value) {
      ensure();
      ls.setItem(key, value);
      if (ls.getItem(key) !== value) {
        // Something was written, but not what we asked for. store.js puts the
        // previous version back when it sees this error.
        const e = new Error('запись не подтвердилась при проверке');
        e.name = 'VerifyError';
        throw e;
      }
    },
    remove(key) { ensure(); ls.removeItem(key); }
  };
}

// In-memory adapter for tests.
//  failWrites = true      → every write fails like a full disk
//  failKey(key, value)    → return 'quota' or 'verify' to fail that one write
//                           ('verify' stores a damaged value, like a write that half-landed)
export function createMemoryAdapter(initial = {}) {
  const map = new Map(Object.entries(initial));
  const adapter = {
    failWrites: false,
    failReads: false,
    failKey: null,
    get(key) {
      if (adapter.failReads) throw new Error('read failure (simulated)');
      return map.has(key) ? map.get(key) : null;
    },
    set(key, value) {
      const mode = adapter.failWrites ? 'quota' : (adapter.failKey && adapter.failKey(key, value));
      if (mode === 'quota') {
        const e = new Error('quota exceeded (simulated)');
        e.name = 'QuotaExceededError';
        throw e;
      }
      if (mode === 'verify') {
        map.set(key, String(value).slice(0, 7));
        const e = new Error('verify failed (simulated)');
        e.name = 'VerifyError';
        throw e;
      }
      map.set(key, String(value));
    },
    remove(key) { map.delete(key); },
    dump() { return Object.fromEntries(map); }
  };
  return adapter;
}
