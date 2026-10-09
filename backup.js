// Backup file format (export) and reading backup files (import). No DOM here;
// the share/download step lives in app.js.
//
// Export format:
// { app: 'organizer', kind: 'backup', appVersion, schemaVersion, exportedAt, data: <document> }
// Import also accepts a bare document and the first prototype's format.

import { SCHEMA_VERSION, normalizeDoc } from './schema.js';
import { APP_VERSION } from './version.js';
import { dateKey, pad } from './dates.js';

export function buildBackupText(doc, nowIso) {
  return JSON.stringify({
    app: 'organizer',
    kind: 'backup',
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso,
    data: doc
  }, null, 2);
}

export function backupFileName(date) {
  return `organizer-backup-${dateKey(date)}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

export function parseBackupText(text, nowIso) {
  let obj;
  try { obj = JSON.parse(text); } catch {
    return { ok: false, error: 'Это не корректный JSON-файл.' };
  }
  let data = obj;
  let meta = { format: 'unknown', exportedAt: null, appVersion: null };
  if (obj && obj.app === 'organizer' && obj.kind === 'backup') {
    data = obj.data;
    meta = { format: 'backup', exportedAt: obj.exportedAt ?? null, appVersion: obj.appVersion ?? null };
  } else if (obj && obj.schemaVersion !== undefined) {
    meta.format = 'document';
  } else {
    meta.format = 'prototype';
  }
  const res = normalizeDoc(data, { now: nowIso, source: 'import' });
  if (res.fatal === 'newer') {
    return { ok: false, error: `Файл создан более новой версией приложения (схема ${res.newerVersion}). Сначала обновите приложение.` };
  }
  if (res.fatal) return { ok: false, error: `Файл не похож на резервную копию органайзера (${res.fatal}).` };
  return { ok: true, doc: res.doc, quarantined: res.quarantined, meta };
}
