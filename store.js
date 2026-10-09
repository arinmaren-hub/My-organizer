// The central data store. Every read and write of app data goes through here.
//
// Safety rules implemented in this file:
//  1. Unreadable saved data is never overwritten: its raw text is first copied
//     to a separate "rescue" key. If that copy fails, the app goes read-only.
//     The same applies to the automatic-copies key.
//  2. Every change is made on a copy, validated, and only then accepted.
//     An invalid change is rejected and nothing is saved.
//  3. Every save is checked. For ORDINARY EDITS a failed save is reported
//     (red banner), the change stays visible in memory and is retried on the
//     next change or with "Повторить".
//  4. IMPORT and RESTORE are all-or-nothing: if the new data cannot be saved,
//     the app keeps the previous data (in memory and in storage) and reports
//     failure. They never report success unless the save succeeded.
//  5. A failed write never leaves damaged data behind: if a write half-landed,
//     the previous saved version is put back.
//  6. Deleting only marks a record (deletedAt); it can be restored for 30 days.
//  7. An automatic safety copy is kept once a day and before every import or
//     restore (up to 10 copies). Copies are only trimmed to make room for the
//     main data, and are put back if that still does not help.
//  8. Data written by a newer app version is never touched (read-only mode).

import { KEYS } from './storage.js';
import { SCHEMA_VERSION, COLLECTIONS, emptyDoc, normalizeDoc, countActive, hasContent } from './schema.js';
import { parseBackupText } from './backup.js';
import { dateKey, formatStamp } from './dates.js';
import { clone, uid, isPlainObject } from './util.js';

export const MAX_SNAPSHOTS = 10;
export const KEEP_SNAPSHOTS_WHEN_FULL = 2;
export const PURGE_AFTER_DAYS = 30;

const isQuota = e => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
const isVerify = e => !!e && e.name === 'VerifyError';
const snapId = s => s.id || s.at; // older copies have no id: use their time
const describe = e => (isQuota(e) ? 'память браузера заполнена' : (e && e.message) || 'неизвестная ошибка');

export function createStore({ storage, clock = () => new Date(), keys = KEYS } = {}) {
  let doc = emptyDoc(clock().toISOString());
  // The text we know is stored under keys.data (null = nothing stored yet).
  // Used to put the previous version back after a write that half-landed.
  let diskText = null;
  const listeners = new Set();
  const status = {
    readOnly: false,      // true = nothing will be written
    readOnlyReason: '',
    saveError: '',        // non-empty = there are changes in memory that are NOT saved
    lastSavedAt: null,
    notices: [],          // [{ id, level: 'info'|'warn'|'error', text }]
    blockedRaw: null      // raw text we refused to overwrite (downloadable)
  };

  const now = () => clock().toISOString();
  const today = () => dateKey(clock());
  const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  const notice = (level, text) => status.notices.push({ id: uid(), level, text });
  const setReadOnly = reason => { status.readOnly = true; status.readOnlyReason = reason; };

  // ----- small storage helpers -----
  function tryGet(key) {
    try { return { ok: true, raw: storage.get(key) }; } catch (e) { return { ok: false, error: e }; }
  }

  // Reads a key that should hold a JSON array.
  // { list, raw, unreadable } – unreadable means the key exists but is not a valid array
  // (or could not be read at all); such a key must not be overwritten unless rescued first.
  function readList(key) {
    const r = tryGet(key);
    if (!r.ok) return { list: [], raw: null, unreadable: true, readFailed: true };
    if (r.raw == null) return { list: [], raw: null, unreadable: false };
    try {
      const v = JSON.parse(r.raw);
      if (Array.isArray(v)) return { list: v, raw: r.raw, unreadable: false };
    } catch { /* fall through */ }
    return { list: [], raw: r.raw, unreadable: true };
  }

  function device() {
    const r = tryGet(keys.device);
    if (!r.ok || r.raw == null) return {};
    try { const v = JSON.parse(r.raw); return isPlainObject(v) ? v : {}; } catch { return {}; }
  }

  // Device info is convenience data (dates of last backup / last copy).
  function setDevice(patch) {
    try { storage.set(keys.device, JSON.stringify({ ...device(), ...patch })); return true; } catch { return false; }
  }

  // ----- rescue (raw text we could not read) -----
  // Keeps every distinct damaged text; nothing is ever dropped from here.
  function rescue(raw, reason) {
    const cur = readList(keys.rescue);
    if (cur.readFailed) return false;
    let list = cur.list.filter(isPlainObject);
    if (cur.unreadable) {
      // The rescue area itself is damaged: keep its text as the first entry.
      list = [{ at: now(), reason: 'архив повреждённых данных не читается', raw: cur.raw }];
    }
    if (list.some(x => x.raw === raw)) return true;
    list.unshift({ at: now(), reason, raw });
    try { storage.set(keys.rescue, JSON.stringify(list)); return true; } catch { return false; }
  }

  // ----- snapshots (automatic safety copies) -----
  function readSnapshots() {
    return readList(keys.snapshots).list.filter(s => isPlainObject(s) && typeof s.at === 'string' && 'data' in s);
  }

  // Returns the current snapshot list ready to be rewritten, or null when the
  // key is unreadable and could not be rescued (then it must not be touched).
  function snapshotsForWriting() {
    const cur = readList(keys.snapshots);
    if (cur.readFailed) return null;
    if (cur.unreadable) {
      if (!rescue(cur.raw, 'автокопии не читаются')) return null;
      return [];
    }
    return cur.list.filter(s => isPlainObject(s) && typeof s.at === 'string' && 'data' in s);
  }

  // `protect`: the id of a copy that must not be dropped (the one being restored).
  function takeSnapshot(reason, source = doc, { protect = null } = {}) {
    let list = snapshotsForWriting();
    if (list === null) {
      notice('warn', 'Не удалось создать автоматическую копию: хранилище автокопий не читается. Сделайте экспорт во вкладке «Данные».');
      return false;
    }
    const dropOldest = () => {
      for (let i = list.length - 1; i > 0; i--) {
        if (snapId(list[i]) !== protect) { list.splice(i, 1); return true; }
      }
      return false;
    };
    list.unshift({ id: uid(), at: now(), reason, schemaVersion: SCHEMA_VERSION, data: clone(source) });
    while (list.length > MAX_SNAPSHOTS && dropOldest()) { /* trim */ }
    for (;;) {
      try { storage.set(keys.snapshots, JSON.stringify(list)); return true; } catch {
        if (!dropOldest()) break; // drop the oldest unprotected copy and try again
      }
    }
    notice('warn', 'Не удалось создать автоматическую копию (мало места). Сделайте экспорт во вкладке «Данные».');
    return false;
  }

  function newestValidSnapshot() {
    for (const s of readSnapshots()) {
      const res = normalizeDoc(s.data, { now: now(), source: 'snapshot' });
      if (!res.fatal) return { at: s.at, doc: res.doc };
    }
    return null;
  }

  function dailySnapshot() {
    const key = today();
    if (device().lastDailySnapshot === key) return;
    if (!hasContent(doc)) { setDevice({ lastDailySnapshot: key }); return; }
    if (takeSnapshot('daily', doc)) setDevice({ lastDailySnapshot: key });
  }

  // ----- saving -----
  function writeMain(text) {
    try {
      storage.set(keys.data, text);
      diskText = text;
    } catch (e) {
      if (isVerify(e)) restoreDiskText();
      throw e;
    }
  }

  // After a write that half-landed, put the last known good text back.
  function restoreDiskText() {
    try {
      if (diskText === null) storage.remove(keys.data);
      else storage.set(keys.data, diskText);
    } catch {
      notice('error', 'Хранилище повело себя неожиданно при записи. Сделайте экспорт во вкладке «Данные».');
    }
  }

  // Last resort when space runs out: keep only the newest automatic copies,
  // retry the main save, and put the copies back if it still fails.
  function writeMainAfterTrim(text) {
    const cur = readList(keys.snapshots);
    if (cur.unreadable || cur.list.length <= KEEP_SNAPSHOTS_WHEN_FULL) return false;
    try { storage.set(keys.snapshots, JSON.stringify(cur.list.slice(0, KEEP_SNAPSHOTS_WHEN_FULL))); } catch { return false; }
    try {
      writeMain(text);
      notice('warn', 'Память почти заполнена: старые автокопии удалены, чтобы сохранить данные. Сделайте экспорт.');
      return true;
    } catch {
      try { storage.set(keys.snapshots, cur.raw); } catch {
        notice('warn', 'Старые автокопии пришлось удалить, чтобы освободить место, и вернуть их не удалось. Сделайте экспорт.');
      }
      return false;
    }
  }

  // Writes the current document. Returns true only if it is really stored.
  function persist() {
    if (status.readOnly) return false;
    const text = JSON.stringify(doc);
    try {
      writeMain(text);
    } catch (e) {
      if (!(isQuota(e) && writeMainAfterTrim(text))) {
        status.saveError = describe(e);
        return false;
      }
    }
    status.saveError = '';
    status.lastSavedAt = now();
    return true;
  }

  // All-or-nothing replacement of the whole document (import, restore).
  // On failure the previous document stays in memory and in storage.
  function replaceDocument(next) {
    const prev = { doc, saveError: status.saveError, lastSavedAt: status.lastSavedAt };
    doc = next;
    if (persist()) return { ok: true };
    const reason = status.saveError;
    doc = prev.doc;
    status.saveError = prev.saveError;
    status.lastSavedAt = prev.lastSavedAt;
    return { ok: false, error: `новые данные не удалось сохранить (${reason}); текущие данные не изменены` };
  }

  function purgeOldDeleted() {
    const cutoff = clock().getTime() - PURGE_AFTER_DAYS * 864e5;
    const old = r => r.deletedAt && Date.parse(r.deletedAt) < cutoff;
    let n = 0;
    for (const k of COLLECTIONS) {
      const before = doc[k].length;
      doc[k] = doc[k].filter(r => !old(r));
      n += before - doc[k].length;
    }
    for (const p of doc.projects) { const b = p.milestones.length; p.milestones = p.milestones.filter(m => !old(m)); n += b - p.milestones.length; }
    for (const l of doc.lists) { const b = l.items.length; l.items = l.items.filter(i => !old(i)); n += b - l.items.length; }
    return n;
  }

  // ----- loading -----
  function recover(raw, reason) {
    const rescued = rescue(raw, reason);
    const snap = newestValidSnapshot();
    if (snap) {
      doc = snap.doc;
      notice('error', `Основные данные не читаются (${reason}). Загружена автоматическая копия от ${formatStamp(snap.at)}; изменения после неё могли не сохраниться.`);
    } else {
      doc = emptyDoc(now());
      notice('error', `Основные данные не читаются (${reason}), автоматических копий нет. Начат пустой органайзер — импортируйте последний экспорт во вкладке «Данные».`);
    }
    if (rescued) {
      notice('info', 'Исходный повреждённый текст сохранён отдельно: «Данные» → «Повреждённые данные».');
      persist(); // if this fails, the red banner shows; the damaged text is safe in rescue
    } else {
      status.blockedRaw = raw;
      setReadOnly('не удалось отдельно сохранить повреждённые данные, поэтому запись отключена, чтобы их не перезаписать. Скачайте их во вкладке «Данные».');
    }
  }

  function loadLegacyOrNew() {
    const r = tryGet(keys.legacy);
    if (!r.ok || r.raw == null) { doc = emptyDoc(now()); return; }
    let parsed;
    try { parsed = JSON.parse(r.raw); } catch {
      doc = emptyDoc(now());
      notice('warn', 'Найдены данные прототипа, но они повреждены. Они оставлены без изменений.');
      return;
    }
    const res = normalizeDoc(parsed, { now: now(), source: 'legacy' });
    if (res.fatal) {
      doc = emptyDoc(now());
      notice('warn', `Данные прототипа не удалось прочитать (${res.fatal === 'newer' ? 'неизвестная версия' : res.fatal}). Они оставлены без изменений.`);
      return;
    }
    doc = res.doc;
    const c = countActive(doc);
    const what = `задач ${c.tasks}, событий ${c.events}, проектов ${c.projects}, списков ${c.lists}`;
    const q = res.quarantined.length ? ` ${res.quarantined.length} записей не прошли проверку и лежат в карантине.` : '';
    if (persist()) {
      notice('info', `Перенесены данные прототипа: ${what}. Старая копия не тронута.${q}`);
    } else {
      notice('warn', `Данные прототипа прочитаны (${what}), но сохранить их в новом формате не удалось. Старая копия не тронута; перенос повторится при следующем запуске.${q}`);
    }
  }

  function load() {
    status.notices = [];
    status.readOnly = false;
    status.readOnlyReason = '';
    status.saveError = '';
    status.blockedRaw = null;

    const r = tryGet(keys.data);
    if (!r.ok) {
      doc = emptyDoc(now());
      diskText = null;
      setReadOnly(`хранилище браузера недоступно (${r.error && r.error.message}). Ничего не сохраняется.`);
      return status;
    }
    diskText = r.raw;
    if (r.raw == null) { loadLegacyOrNew(); return status; }

    let parsed;
    try { parsed = JSON.parse(r.raw); } catch { recover(r.raw, 'текст повреждён'); return status; }

    const res = normalizeDoc(parsed, { now: now(), source: 'load' });
    if (res.fatal === 'newer') {
      doc = emptyDoc(now());
      status.blockedRaw = r.raw;
      setReadOnly(`данные записаны более новой версией приложения (схема ${res.newerVersion}). Обновите приложение. Запись отключена, чтобы ничего не потерять.`);
      return status;
    }
    if (res.fatal) { recover(r.raw, res.fatal); return status; }

    doc = res.doc;
    let changed = false;
    if (res.quarantined.length) {
      notice('warn', `${res.quarantined.length} запис(ь/и) не прошли проверку и отложены в карантин («Данные» → «Карантин»). Остальное загружено.`);
      changed = true;
    }
    if (res.migratedFrom) changed = true;
    if (purgeOldDeleted()) changed = true;
    // If this save fails, the stored text is unchanged and gives the same result next time.
    if (changed) persist();
    return status;
  }

  // ----- changing data -----
  // mutate(draft, { now, today, uid }) edits a copy; throw an Error to cancel.
  // Ordinary edits: if saving fails, the change stays in memory, the red banner
  // and "⚠ Не сохранено" show, and the save is retried on the next change.
  function update(label, mutate) {
    if (status.readOnly) {
      notice('error', `«${label}» не выполнено: ${status.readOnlyReason}`);
      emit();
      return false;
    }
    const t = now();
    const draft = clone(doc);
    let result;
    try {
      result = mutate(draft, { now: t, today: today(), uid });
    } catch (e) {
      notice('error', `«${label}» не выполнено: ${e.message}`);
      emit();
      return false;
    }
    draft.updatedAt = t;
    const check = normalizeDoc(draft, { now: t, source: 'update' });
    if (check.fatal || check.quarantined.length) {
      const why = check.fatal || check.quarantined[0].reason;
      console.error('Rejected update', label, check);
      notice('error', `«${label}» отменено: данные не прошли проверку (${why}). Ничего не изменено.`);
      emit();
      return false;
    }
    dailySnapshot();
    doc = check.doc;
    persist();
    emit();
    return result === undefined ? true : result;
  }

  // ----- import / restore (all-or-nothing) -----
  function previewImport(text) {
    const p = parseBackupText(text, now());
    if (!p.ok) return p;
    return { ok: true, doc: p.doc, counts: countActive(p.doc), quarantined: p.quarantined.length, meta: p.meta };
  }

  // Replaces all data with an import preview. A safety copy of the current data
  // is taken first; if that copy fails, the caller must confirm with force: true.
  // Returns { ok: true } ONLY when the imported data is saved.
  function applyImport(preview, { force = false } = {}) {
    if (status.readOnly) return { ok: false, error: status.readOnlyReason };
    if (!preview || !preview.ok) return { ok: false, error: 'нет проверенных данных для импорта' };
    if (hasContent(doc) && !takeSnapshot('before-import', doc) && !force) return { ok: false, needForce: true };
    const next = clone(preview.doc);
    next.updatedAt = now();
    const res = replaceDocument(next);
    if (!res.ok) {
      notice('error', `Импорт не выполнен: ${res.error}.`);
      emit();
      return { ...res, noticed: true };
    }
    notice('info', 'Импорт выполнен. Прежние данные сохранены в автокопиях («Данные» → «Автокопии»).');
    emit();
    return { ok: true };
  }

  function listSnapshots() {
    return readSnapshots().map(s => {
      const res = normalizeDoc(s.data, { now: now(), source: 'snapshot' });
      return { id: snapId(s), at: s.at, reason: s.reason, ok: !res.fatal, counts: res.fatal ? null : countActive(res.doc) };
    });
  }

  function snapshotText(id) {
    const s = readSnapshots().find(x => snapId(x) === id);
    return s ? JSON.stringify(s.data) : null;
  }

  // Returns { ok: true } ONLY when the restored data is saved. The copy being
  // restored is never dropped from the list while making room for new copies.
  function restoreSnapshot(id, { force = false } = {}) {
    if (status.readOnly) return { ok: false, error: status.readOnlyReason };
    const s = readSnapshots().find(x => snapId(x) === id);
    if (!s) return { ok: false, error: 'копия не найдена' };
    const res = normalizeDoc(s.data, { now: now(), source: 'snapshot' });
    if (res.fatal) return { ok: false, error: res.fatal };
    if (hasContent(doc) && !takeSnapshot('before-restore', doc, { protect: id }) && !force) return { ok: false, needForce: true };
    const next = res.doc;
    next.updatedAt = now();
    const out = replaceDocument(next);
    if (!out.ok) {
      notice('error', `Восстановление не выполнено: ${out.error}.`);
      emit();
      return { ...out, noticed: true };
    }
    notice('info', 'Данные восстановлены из автокопии. Состояние до восстановления тоже сохранено в автокопиях.');
    emit();
    return { ok: true };
  }

  return {
    load,
    // Another window saved data. Reload it, unless this window holds unsaved
    // changes: those are never thrown away silently.
    reload() {
      if (status.saveError) {
        notice('warn', 'Данные изменены в другом окне, но здесь есть несохранённые изменения. Они оставлены как есть: сохраните копию во вкладке «Данные».');
        emit();
        return false;
      }
      load();
      emit();
      return true;
    },
    get doc() { return doc; },
    status,
    update,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dismissNotice(id) { status.notices = status.notices.filter(n => n.id !== id); emit(); },
    notify(level, text) { notice(level, text); emit(); },
    retrySave() { persist(); emit(); return !status.saveError; },
    takeSnapshot(reason) { const ok = takeSnapshot(reason, doc); emit(); return ok; },
    listSnapshots,
    snapshotText,
    restoreSnapshot,
    previewImport,
    applyImport,
    rescueList() { return readList(keys.rescue).list.filter(isPlainObject); },
    lastBackupAt() { return device().lastBackupAt || null; },
    markBackupDone() { setDevice({ lastBackupAt: now() }); emit(); },
    device,
    setDevice
  };
}
