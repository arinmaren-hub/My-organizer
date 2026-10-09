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
//     next change or with the retry button.
//  4. IMPORT and RESTORE are all-or-nothing: if the new data cannot be saved,
//     the app keeps the previous data (in memory and in storage) and reports
//     failure. They never report success unless the save succeeded.
//  5. A failed write never leaves damaged data behind: if a write half-landed,
//     the previous saved version is put back.
//  6. Deleting only marks a record (deletedAt); it can be restored for 30 days.
//  7. Two kinds of copies (DECISIONS.md, release rule R9):
//     - daily copies: one per calendar day, the latest 5 (organizer:snapshots);
//     - rollback copies: taken before every data-format upgrade, import and
//       restore, the latest 5 (organizer:rollback). The newest pre-upgrade copy
//       is never rotated out, and before an import or restore rotates out a
//       copy whose data exists nowhere else, the user is asked.
//     Nothing is removed to make room for another copy. Only daily copies are
//     ever trimmed for space (for the main data or the pre-upgrade copy), and
//     they are put back if that still does not help.
//  8. Data written by a newer app version is never touched (read-only mode).
//  9. A data-format upgrade first saves the ORIGINAL text as a rollback copy and
//     checks that every record survived. If either fails, the upgrade stops:
//     nothing is overwritten and the app opens read-only with a way to save
//     the original data (release rules R3, R12).

import { KEYS } from './storage.js';
import { SCHEMA_VERSION, COLLECTIONS, emptyDoc, normalizeDoc, countActive, hasContent, findLostRecords } from './schema.js';
import { parseBackupText } from './backup.js';
import { dateKey } from './dates.js';
import { clone, uid, isPlainObject } from './util.js';
import { m } from './i18n.js';
import { naturalDay, planningDay } from './planday.js';

export const MAX_DAILY = 5;
export const MAX_ROLLBACK = 5;
export const KEEP_DAILY_WHEN_FULL = 2;
export const PURGE_AFTER_DAYS = 30;

const isQuota = e => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
const isVerify = e => !!e && e.name === 'VerifyError';
const snapId = s => s.id || s.at; // older copies have no id: use their time
// Messages are stored as keys (see i18n.js), so they follow the interface language.
const describe = e => (isQuota(e) ? m('save.quota') : isVerify(e) ? m('save.verify') : (e && e.message) || m('save.unknown'));

// `normalize` can be replaced in tests to simulate a broken upgrade.
export function createStore({ storage, clock = () => new Date(), keys = KEYS, normalize = normalizeDoc } = {}) {
  let doc = emptyDoc(clock().toISOString());
  let pendingUpgrade = null; // { raw } while an upgrade waits for the user (no room for its copy)
  // The text we know is stored under keys.data (null = nothing stored yet).
  // Used to put the previous version back after a write that half-landed.
  let diskText = null;
  const listeners = new Set();
  const status = {
    readOnly: false,      // true = nothing will be written
    readOnlyReason: '',
    saveError: '',        // set (a message) = there are changes in memory that are NOT saved
    lastSavedAt: null,
    notices: [],          // [{ id, level: 'info'|'warn'|'error', key, params }]
    blockedRaw: null,     // raw text we refused to overwrite (downloadable)
    stopped: null         // message key when loading was stopped to protect the data
  };

  const now = () => clock().toISOString();
  const today = () => dateKey(clock()); // calendar date: used only for the daily automatic copy
  // Planning day (DECISIONS.md, B4): what «Сегодня», reviews and actions call "today".
  const cutoff = () => (doc && doc.settings && doc.settings.day ? doc.settings.day.cutoff : '00:00');
  const naturalToday = () => naturalDay(clock(), cutoff());
  const planningToday = () => planningDay(clock(), cutoff(), device().dayFinishedThrough || null);
  const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  const notice = (level, key, params) => status.notices.push({ id: uid(), level, key, params });
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

  // A write that half-landed (VerifyError) must not leave a damaged value behind:
  // put the previous text back (or remove the key if there was none), then rethrow.
  function safeSet(key, text, prevRaw) {
    try {
      storage.set(key, text);
    } catch (e) {
      if (isVerify(e)) {
        try { if (prevRaw == null) storage.remove(key); else storage.set(key, prevRaw); } catch { notice('error', 'notice.storageOdd'); }
      }
      throw e;
    }
  }

  // ----- rescue (raw text we could not read) -----
  // Keeps every distinct damaged text; nothing is ever dropped from here.
  function rescue(raw, reason) {
    const cur = readList(keys.rescue);
    if (cur.readFailed) return false;
    let list = cur.list.filter(isPlainObject);
    if (cur.unreadable) {
      // The rescue area itself is damaged: keep its text as the first entry.
      list = [{ at: now(), reason: 'rescue.archiveUnreadable', raw: cur.raw }];
    }
    if (list.some(x => x.raw === raw)) return true;
    list.unshift({ at: now(), reason, raw });
    try { safeSet(keys.rescue, JSON.stringify(list), cur.raw); return true; } catch { return false; }
  }

  // ----- copies: daily (organizer:snapshots) and rollback (organizer:rollback) -----
  // Rules (DECISIONS.md C6, release rule R9):
  //  - copies are rotated only by count (daily: 5, rollback: 5), never to make
  //    room for another copy; a copy that does not fit is simply not made (and
  //    the user is told);
  //  - only DAILY copies are ever trimmed for space, and only to save the main
  //    data or the pre-upgrade copy (then they are put back if that fails);
  //  - before an import or restore would rotate out a rollback copy whose data
  //    exists nowhere else, the user is asked (needDropConfirm).
  const isCopy = c => isPlainObject(c) && typeof c.at === 'string' && ('data' in c || typeof c.raw === 'string');
  const isDaily = c => c.reason === 'daily';
  const readCopies = key => readList(key).list.filter(isCopy);

  // The data inside a copy: a document object, or the original text (pre-upgrade copies).
  function copyData(c) {
    if (typeof c.raw === 'string') { try { return JSON.parse(c.raw); } catch { return null; } }
    return c.data;
  }

  // What a copy holds, for comparing copies (the change time does not count).
  const contentKey = d => { try { return isPlainObject(d) ? JSON.stringify({ ...d, updatedAt: null }) : null; } catch { return null; } };
  const copyKey = c => (typeof c.raw === 'string' ? 'raw:' + c.raw : contentKey(c.data));

  // Current list ready to be rewritten ({ list, raw }), or null when the key is
  // unreadable and could not be rescued (then it must not be touched).
  function copiesForWriting(key, rescueReason) {
    const cur = readList(key);
    if (cur.readFailed) return null;
    if (cur.unreadable) {
      if (!rescue(cur.raw, rescueReason)) return null;
      return { list: [], raw: cur.raw };
    }
    return { list: cur.list.filter(isCopy), raw: cur.raw };
  }

  // Rotation by count: removes the oldest entries not named in `keep` while
  // count(list) > max. Returns the removed entries.
  function rotate(list, max, keep, count = l => l.length) {
    const dropped = [];
    while (count(list) > max) {
      let i = list.length - 1;
      while (i >= 0 && keep.has(snapId(list[i]))) i--;
      if (i < 0) break;
      dropped.push(...list.splice(i, 1));
    }
    return dropped;
  }

  // Daily list: rotation counts and removes only daily copies (copies left by
  // 0.2.x that are not daily are kept until they are moved to the rollback list).
  const dailyRules = {
    max: MAX_DAILY,
    keep: list => new Set(list.filter(c => !isDaily(c)).map(snapId)),
    count: list => list.filter(isDaily).length
  };
  // Rollback list: the copy being restored and the newest pre-upgrade copy are never rotated out.
  const rollbackKeep = (list, protect) => {
    const k = new Set();
    if (protect) k.add(protect);
    const newestUpgrade = list.find(c => c.reason === 'before-migration');
    if (newestUpgrade) k.add(snapId(newestUpgrade));
    return k;
  };

  // Adds one copy. Never removes anything to make room: if it does not fit, no copy is made.
  function addCopy(key, entry, { max, rescueReason, keep = () => new Set(), count }) {
    const cur = copiesForWriting(key, rescueReason);
    if (cur === null) { notice('warn', 'notice.snapshotUnreadable'); return false; }
    const list = [entry, ...cur.list];
    const k = keep(list);
    k.add(entry.id);
    rotate(list, max, k, count);
    try {
      safeSet(key, JSON.stringify(list), cur.raw);
      return true;
    } catch {
      notice('warn', 'notice.snapshotNoSpace');
      return false;
    }
  }

  // Rollback copy before an upgrade, import or restore. `raw` keeps the exact original text.
  function takeRollback(reason, { data, raw, schemaVersion, protect = null } = {}) {
    const existing = readCopies(keys.rollback);
    // Already kept: the same original text, or exactly the same data, is not copied twice.
    if (raw !== undefined && existing.some(c => c.raw === raw)) return true;
    if (raw === undefined) {
      const k = contentKey(data ?? doc);
      if (k && existing.some(c => copyKey(c) === k)) return true;
    }
    const entry = { id: uid(), at: now(), reason, schemaVersion: schemaVersion ?? SCHEMA_VERSION };
    if (raw !== undefined) entry.raw = raw; else entry.data = clone(data ?? doc);
    return addCopy(keys.rollback, entry, {
      // A pre-upgrade copy happens without the user; it never rotates anything out.
      max: reason === 'before-migration' ? Infinity : MAX_ROLLBACK,
      rescueReason: 'rescue.rollbackUnreadable',
      keep: list => rollbackKeep(list, protect)
    });
  }

  // The rollback copies that one more copy of the current data would rotate
  // out although their data exists nowhere else (no other copy, not the
  // current data). Empty when nothing unique would be lost.
  function uniqueRollbackToDrop(protect) {
    const rb = readList(keys.rollback);
    if (rb.unreadable) return [];
    const list = rb.list.filter(isCopy);
    const cur = contentKey(doc);
    if (cur && list.some(c => copyKey(c) === cur)) return []; // no new copy would be made
    const sim = [{ id: '\u0000new', at: now(), reason: 'new' }, ...list];
    const k = rollbackKeep(sim, protect);
    k.add('\u0000new');
    const dropped = rotate(sim, MAX_ROLLBACK, k);
    const others = [...readCopies(keys.snapshots), ...sim.filter(c => c.id !== '\u0000new')].map(copyKey);
    return dropped.filter(c => { const key = copyKey(c); return key !== cur && !others.includes(key); });
  }

  // Space is short: keep only the newest daily copies (other copies untouched).
  // Returns the previous text of the daily list to put back, or null if nothing was trimmed.
  function trimDailyCopies() {
    const cur = readList(keys.snapshots);
    if (cur.unreadable) return null;
    const daily = cur.list.filter(c => isCopy(c) && isDaily(c));
    if (daily.length <= KEEP_DAILY_WHEN_FULL) return null;
    const drop = new Set(daily.slice(KEEP_DAILY_WHEN_FULL));
    try { safeSet(keys.snapshots, JSON.stringify(cur.list.filter(c => !drop.has(c))), cur.raw); } catch { return null; }
    return cur.raw;
  }
  function putBackDailyCopies(prevRaw) {
    try { storage.set(keys.snapshots, prevRaw); } catch { notice('warn', 'notice.trimRestoreFailed'); }
  }

  // The copy taken before a data-format upgrade matters more than old daily
  // copies: if there is no room for it, keep only the newest daily copies and
  // try once more; if that still fails, the daily copies are put back.
  function takeUpgradeCopy(raw, fromVersion) {
    const mark = status.notices.length;
    if (takeRollback('before-migration', { raw, schemaVersion: fromVersion })) return true;
    status.notices.length = mark; // the first attempt's "no space" notice: we try again below
    const prev = trimDailyCopies();
    if (prev === null) return false;
    if (takeRollback('before-migration', { raw, schemaVersion: fromVersion })) {
      notice('warn', 'notice.trimmedCopies');
      return true;
    }
    putBackDailyCopies(prev);
    return false;
  }

  // All copies, newest first (daily and rollback together; duplicates removed).
  function allCopies() {
    const seen = new Set();
    return [...readCopies(keys.snapshots).map(c => ({ ...c, kind: isDaily(c) ? 'daily' : 'rollback' })), ...readCopies(keys.rollback).map(c => ({ ...c, kind: 'rollback' }))]
      .filter(c => (seen.has(snapId(c)) ? false : seen.add(snapId(c))))
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  function newestValidSnapshot() {
    for (const c of allCopies()) {
      const data = copyData(c);
      if (!data) continue;
      let res;
      try { res = normalizeDoc(data, { now: now(), source: 'snapshot' }); } catch { continue; }
      if (!res.fatal) return { at: c.at, doc: res.doc };
    }
    return null;
  }

  function dailySnapshot() {
    const day = today();
    if (device().lastDailySnapshot === day) return;
    if (!hasContent(doc)) { setDevice({ lastDailySnapshot: day }); return; }
    const already = readCopies(keys.snapshots).some(c => isDaily(c) && dateKey(new Date(c.at)) === day);
    const ok = already || addCopy(keys.snapshots,
      { id: uid(), at: now(), reason: 'daily', schemaVersion: SCHEMA_VERSION, data: clone(doc) },
      { ...dailyRules, rescueReason: 'rescue.snapshotsUnreadable' });
    if (ok) setDevice({ lastDailySnapshot: day });
  }

  // 0.2.x kept import/restore copies in the daily list: move them to the rollback
  // list, without deleting anything. Tried on every start until it succeeds
  // (if the move fails, nothing changes).
  function splitLegacyCopies() {
    const cur = readList(keys.snapshots);
    if (cur.unreadable) return;
    const moving = cur.list.filter(c => isCopy(c) && !isDaily(c));
    if (!moving.length) return;
    const rb = readList(keys.rollback);
    if (rb.unreadable) return;
    const ids = new Set(rb.list.filter(isCopy).map(snapId));
    const merged = [...rb.list.filter(isCopy), ...moving.filter(c => !ids.has(snapId(c)))].sort((a, b) => b.at.localeCompare(a.at));
    try { safeSet(keys.rollback, JSON.stringify(merged), rb.raw); } catch { return; }
    try { safeSet(keys.snapshots, JSON.stringify(cur.list.filter(c => !moving.includes(c))), cur.raw); } catch { /* a duplicate is harmless */ }
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
      notice('error', 'notice.storageOdd');
    }
  }

  // Last resort when space runs out: keep only the newest DAILY copies (rollback
  // copies are never touched here), retry the main save, and put the daily
  // copies back if it still fails.
  function writeMainAfterTrim(text) {
    const prev = trimDailyCopies();
    if (prev === null) return false;
    try {
      writeMain(text);
      notice('warn', 'notice.trimmedCopies');
      return true;
    } catch {
      putBackDailyCopies(prev);
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
    return { ok: false, error: m('err.replaceNotSaved', { reason }) };
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
      notice('error', 'notice.recoveredFromCopy', { reason: { $t: reason }, at: { $stamp: snap.at } });
    } else {
      doc = emptyDoc(now());
      notice('error', 'notice.recoveredEmpty', { reason: { $t: reason } });
    }
    ensureDataId();
    if (rescued) {
      notice('info', 'notice.rescueSaved');
      persist(); // if this fails, the red banner shows; the damaged text is safe in rescue
    } else {
      status.blockedRaw = raw;
      setReadOnly(m('ro.rescueFailed'));
    }
  }

  function loadLegacyOrNew() {
    const r = tryGet(keys.legacy);
    if (!r.ok || r.raw == null) { doc = emptyDoc(now()); return; }
    // Prototype data that cannot be read stays under its key untouched, and its
    // text is also kept in «Повреждённые данные» so it can be downloaded.
    const unreadable = (key, params) => {
      doc = emptyDoc(now());
      notice('warn', key, params);
      if (rescue(r.raw, 'rescue.legacyUnreadable')) notice('info', 'notice.rescueSaved');
    };
    let parsed;
    try { parsed = JSON.parse(r.raw); } catch { unreadable('notice.legacyDamaged'); return; }
    let res;
    try { res = normalize(parsed, { now: now(), source: 'legacy' }); } catch (e) {
      console.error(e);
      stopLoading('ro.upgradeFailed', r.raw, null);
      return;
    }
    if (res.fatal) {
      unreadable('notice.legacyUnreadable', { reason: { $t: res.fatal === 'newer' ? 'fatal.unknownVersion' : res.fatal } });
      return;
    }
    // The prototype's key is never written, so it stays as the original copy;
    // still, nothing is saved if a record would go missing.
    if (findLostRecords(parsed, res)) { stopLoading('ro.upgradeFailed', r.raw, res.doc); return; }
    // A copy that can be restored or downloaded from «Данные» (the original key stays anyway).
    takeUpgradeCopy(r.raw, 1);
    doc = res.doc;
    ensureDataId();
    const c = countActive(doc);
    const params = {
      what: { $counts: c },
      q: res.quarantined.length ? { $t: 'notice.legacyQuarantined', params: { n: res.quarantined.length } } : ''
    };
    if (persist()) notice('info', 'notice.legacyMigrated', params);
    else notice('warn', 'notice.legacyNotSaved', params);
  }

  // Stops loading without writing anything: the data stays exactly as stored,
  // the app opens read-only and offers the original text for download.
  // `shown` is what is displayed meanwhile (the upgraded data when there is some).
  function stopLoading(reasonKey, raw, shown, params) {
    doc = shown || emptyDoc(now());
    status.blockedRaw = raw;
    status.stopped = reasonKey;
    setReadOnly(m(reasonKey, params));
  }

  // A new organizer gets its random id on first start (DECISIONS.md, privacy).
  function ensureDataId() {
    if (doc.dataId) return false;
    doc.dataId = uid();
    return true;
  }

  function load() {
    status.notices = [];
    status.readOnly = false;
    status.readOnlyReason = '';
    status.saveError = '';
    status.blockedRaw = null;
    status.stopped = null;
    pendingUpgrade = null;

    const r = tryGet(keys.data);
    if (!r.ok) {
      doc = emptyDoc(now());
      diskText = null;
      setReadOnly(m('ro.storageUnavailable', { msg: (r.error && r.error.message) || '' }));
      return status;
    }
    diskText = r.raw;
    if (r.raw == null) { loadLegacyOrNew(); if (!status.stopped) ensureDataId(); return status; }

    let parsed;
    try { parsed = JSON.parse(r.raw); } catch { recover(r.raw, 'fatal.textDamaged'); ensureDataId(); return status; }

    let res;
    try {
      res = normalize(parsed, { now: now(), source: 'load' });
    } catch (e) {
      // A bug in reading or upgrading: never write anything (R12).
      console.error(e);
      stopLoading('ro.upgradeFailed', r.raw, null);
      return status;
    }
    if (res.fatal === 'newer') {
      stopLoading('ro.newer', r.raw, null, { v: res.newerVersion });
      return status;
    }
    if (res.fatal) { recover(r.raw, res.fatal); ensureDataId(); return status; }

    // Every record must be loaded or quarantined before anything is written (R12).
    const lost = findLostRecords(parsed, res);
    if (lost) {
      console.error('Records would be lost while loading:', lost);
      stopLoading('ro.upgradeFailed', r.raw, res.doc);
      return status;
    }

    doc = res.doc;
    let changed = false;
    if (res.migratedFrom) {
      // Upgrade: the original text is copied first (R3). No copy, no upgrade.
      if (!takeUpgradeCopy(r.raw, res.migratedFrom)) {
        stopLoading('ro.upgradeNoCopy', r.raw, res.doc);
        pendingUpgrade = { raw: r.raw };
        return status;
      }
      notice('info', 'notice.upgraded', { from: res.migratedFrom, to: SCHEMA_VERSION });
      changed = true;
    }
    splitLegacyCopies();
    if (res.quarantined.length) {
      notice('warn', 'notice.loadQuarantined', { n: res.quarantined.length });
      changed = true;
    }
    if (ensureDataId()) changed = true;
    if (purgeOldDeleted()) changed = true;
    // If this save fails, the stored text is unchanged and gives the same result next time.
    if (changed) persist();
    return status;
  }

  // Recovery option when the pre-upgrade copy could not be made (storage full):
  // after the user has downloaded the original data, they may continue the
  // upgrade without the copy. Only allowed in exactly that situation.
  function continueUpgradeWithoutCopy() {
    if (status.stopped !== 'ro.upgradeNoCopy' || !pendingUpgrade) return { ok: false };
    const raw = pendingUpgrade.raw;
    const cur = tryGet(keys.data);
    if (!cur.ok || cur.raw !== raw) { load(); emit(); return { ok: false }; } // changed meanwhile: start over
    status.readOnly = false;
    status.readOnlyReason = '';
    status.stopped = null;
    status.blockedRaw = null;
    pendingUpgrade = null;
    ensureDataId();
    purgeOldDeleted();
    const ok = persist();
    if (ok) notice('warn', 'notice.upgradedWithoutCopy');
    emit();
    return { ok };
  }

  // ----- changing data -----
  // mutate(draft, { now, today, uid }) edits a copy; throw an Error to cancel.
  // Ordinary edits: if saving fails, the change stays in memory, the red banner
  // and the "not saved" status show, and the save is retried on the next change.
  // `label` is a message key naming the action (e.g. 'act.addTasks').
  function update(label, mutate) {
    if (status.readOnly) {
      notice('error', 'notice.actionFailed', { label: { $t: label }, reason: status.readOnlyReason });
      emit();
      return false;
    }
    const t = now();
    const draft = clone(doc);
    let result;
    try {
      result = mutate(draft, { now: t, today: planningToday(), uid });
    } catch (e) {
      notice('error', 'notice.actionFailed', { label: { $t: label }, reason: e.key ? m(e.key, e.params) : e.message });
      emit();
      return false;
    }
    draft.updatedAt = t;
    const check = normalizeDoc(draft, { now: t, source: 'update' });
    if (check.fatal || check.quarantined.length) {
      const why = check.fatal || check.quarantined[0].reason;
      console.error('Rejected update', label, check);
      notice('error', 'notice.actionRejected', { label: { $t: label }, reason: { $t: why } });
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
  // Data from before 0.3.0 (an old backup, a pre-upgrade copy) has no answers to
  // the first-launch questions: keep this device's day settings instead of
  // asking them again. Everything else comes from the imported data.
  function keepDaySettings(next) {
    if (next.settings.day.setupDone || !doc.settings.day.setupDone) return;
    next.settings.day = clone(doc.settings.day);
  }

  // origin: 'same' (made by this organizer), 'other' (made by a different
  // organizer: another device or another person), 'unknown' (older backup
  // without an id). Only matters when there is current data to replace.
  function previewImport(text) {
    const p = parseBackupText(text, now());
    if (!p.ok) return p;
    const origin = !p.doc.dataId ? 'unknown' : p.doc.dataId === doc.dataId ? 'same' : 'other';
    return { ok: true, doc: p.doc, counts: countActive(p.doc), quarantined: p.quarantined.length, meta: p.meta, origin, replacesData: hasContent(doc) };
  }

  // Replaces all data with an import preview. A rollback copy of the current
  // data is taken first; if that copy fails, the caller must confirm with
  // force: true. A backup from a different organizer that would replace
  // existing data needs its own explicit confirmation (foreignConfirmed: true).
  // Returns { ok: true } ONLY when the imported data is saved.
  function applyImport(preview, { force = false, foreignConfirmed = false, dropConfirmed = false } = {}) {
    if (status.readOnly) return { ok: false, error: status.readOnlyReason };
    if (!preview || !preview.ok || !isPlainObject(preview.doc)) return { ok: false, error: m('err.noReadyImport') };
    const fromOther = hasContent(doc) && preview.doc.dataId && preview.doc.dataId !== doc.dataId;
    if (fromOther && !foreignConfirmed) return { ok: false, needForeignConfirm: true };
    if (hasContent(doc) && !dropConfirmed) {
      const lost = uniqueRollbackToDrop(null);
      if (lost.length) return { ok: false, needDropConfirm: true, dropAt: lost[lost.length - 1].at };
    }
    if (hasContent(doc) && !takeRollback('before-import') && !force) return { ok: false, needForce: true };
    const next = clone(preview.doc);
    next.dataId = next.dataId || doc.dataId; // an older backup continues this organizer
    keepDaySettings(next);
    next.updatedAt = now();
    const res = replaceDocument(next);
    if (!res.ok) {
      notice('error', 'notice.importFailed', { reason: res.error });
      emit();
      return { ...res, noticed: true };
    }
    notice('info', 'notice.importDone');
    emit();
    return { ok: true };
  }

  // A copy read for display or restore: { res } or { fatal }.
  function readCopy(c) {
    const data = copyData(c);
    if (data == null) return { fatal: 'fatal.textDamaged' };
    try { return normalizeDoc(data, { now: now(), source: 'snapshot' }); } catch { return { fatal: 'fatal.textDamaged' }; }
  }

  // kind: 'daily' or 'rollback'. Pre-upgrade copies hold the original text and
  // are shown with what they contain after upgrading.
  function listSnapshots() {
    return allCopies().map(c => {
      const res = readCopy(c);
      return { id: snapId(c), at: c.at, reason: c.reason, kind: c.kind, ok: !res.fatal, counts: res.fatal ? null : countActive(res.doc) };
    });
  }

  // The copy as a file: the exact stored text for pre-upgrade copies.
  function snapshotText(id) {
    const c = allCopies().find(x => snapId(x) === id);
    if (!c) return null;
    return typeof c.raw === 'string' ? c.raw : JSON.stringify(c.data);
  }

  // Returns { ok: true } ONLY when the restored data is saved. The copy being
  // restored is never dropped from the list while making room for new copies.
  function restoreSnapshot(id, { force = false, dropConfirmed = false } = {}) {
    if (status.readOnly) return { ok: false, error: status.readOnlyReason };
    const c = allCopies().find(x => snapId(x) === id);
    if (!c) return { ok: false, error: m('err.copyNotFound') };
    const res = readCopy(c);
    if (res.fatal) return { ok: false, error: res.fatal === 'newer' ? m('ro.newer', { v: res.newerVersion }) : res.fatal };
    if (hasContent(doc) && !dropConfirmed) {
      const lost = uniqueRollbackToDrop(id);
      if (lost.length) return { ok: false, needDropConfirm: true, dropAt: lost[lost.length - 1].at };
    }
    if (hasContent(doc) && !takeRollback('before-restore', { protect: id }) && !force) return { ok: false, needForce: true };
    const next = res.doc;
    next.dataId = next.dataId || doc.dataId;
    keepDaySettings(next);
    next.updatedAt = now();
    const out = replaceDocument(next);
    if (!out.ok) {
      notice('error', 'notice.restoreFailed', { reason: out.error });
      emit();
      return { ...out, noticed: true };
    }
    notice('info', 'notice.restoreDone');
    emit();
    return { ok: true };
  }

  return {
    load,
    // Another window saved data. Reload it, unless this window holds unsaved
    // changes: those are never thrown away silently.
    reload() {
      if (status.saveError) {
        notice('warn', 'notice.otherWindowPending');
        emit();
        return false;
      }
      load();
      emit();
      return true;
    },
    get doc() { return doc; },
    planningToday,
    naturalToday,
    // «Завершить день»: from now on the app shows the next planning day, until the
    // natural day change at the cutoff. Stored on this device only.
    finishDay() {
      const nat = naturalToday();
      if (planningToday() !== nat) return { ok: false, already: true };
      const ok = setDevice({ dayFinishedThrough: nat });
      emit();
      return { ok };
    },
    undoFinishDay() {
      const ok = setDevice({ dayFinishedThrough: null });
      emit();
      return { ok };
    },
    dayFinishedEarly() { return planningToday() !== naturalToday(); },
    status,
    update,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dismissNotice(id) { status.notices = status.notices.filter(n => n.id !== id); emit(); },
    notify(level, key, params) { notice(level, key, params); emit(); },
    retrySave() { persist(); emit(); return !status.saveError; },
    takeRollback(reason = 'manual') { const ok = takeRollback(reason); emit(); return ok; },
    continueUpgradeWithoutCopy,
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
