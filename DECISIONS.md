# DECISIONS.md — Мой органайзер

This file is the single list of rules for the app. Both AIs (ChatGPT and Claude) and the owner follow it.
A rule changes only when this file is edited on purpose, with the date and the reason.

Last updated: 2026-10-09 (Phase 0 correction, app version 0.2.1)

---

## A. Confirmed product decisions (owner, 2026-10-09)

| # | Decision | Status in 0.2.0 |
|---|---|---|
| 1 | The week starts on **Monday**. | Implemented: a week is stored as the date of its Monday (`dates.js → weekKey`). |
| 2 | Quick entry supports **Russian and English**. | Planned (Phase 1, `parse.js`). Multi-line entry already works. |
| 3 | A task can be planned for a **specific day**, for a **week** (no day), or have **no date**. | Implemented (`task.plan.kind` = `day` / `week` / `none`). |
| 4 | When a typed entry contains a **time**, the app offers a **quick choice: Task or Event**, with no complicated form. | Planned (Phase 1 quick entry). Data model ready: tasks have an optional `time`, events have `start`. |
| 5 | Tasks can have an **optional time and an optional reminder**. | Data model ready (`task.time`, `task.reminder`). No UI yet. |
| 6 | **Planned date and deadline are separate.** Rescheduling never silently changes a deadline. | Implemented: `moveTask` changes only `plan` (and clears `time`/`reminder` when the task is no longer on a specific day). Covered by an automated test. |
| 7 | Unfinished tasks are **never automatically rescheduled**. The user decides during the morning review. | Implemented: nothing moves without a tap. |
| 8 | The app works **without AI, paid APIs, accounts or cloud sync**. | Implemented. No network requests except loading the app's own files. |
| 9 | All data is stored **locally on one device**, with **safe backup and restore**. | Implemented: versioned store, automatic copies, export/import with preview, see section C. |

---

## B. Evening Preview — «Сводка на завтра» (confirmed feature, not built yet)

**Goal.** At a time the user chooses (e.g. 21:30), show a short overview of the next day, built locally without AI.

**Contents**, in this order:
1. Tomorrow's events and timetable (including repeating classes once Phase 2 adds them).
2. Tasks planned for tomorrow (timed tasks first, by time).
3. Approaching deadlines: unfinished tasks whose deadline is on or before **tomorrow + 3 days** *(the 3 days is a proposal — confirm or change)*.
4. Unfinished tasks that still need attention: unfinished day tasks planned before tomorrow (including today's) and unfinished week tasks from weeks that have already ended.
5. Quick actions on each task: done, edit, move (Today / Tomorrow / a weekday / This week / No date), and "add a task for tomorrow".

**When it appears.**
- Only while the app is open, or the first time it is opened after the chosen time. A local-only iOS web app cannot show it while closed (no scheduled background notifications without a server).
- At most once per evening: the app remembers which day it was last shown for.
- It can always be opened by hand (e.g. a «Завтра» button).

**Already prepared in 0.2.0** (tested, not shown in the UI):
- `settings.eveningPreview = { enabled: false, time: '21:30' }` in the data document (included in backups).
- `selectors.js → buildDaySummary(doc, day)` returns `{ events, tasks, weekTasks, deadlines, unfinished }`.
- `selectors.js → eveningPreviewDue(settings, now, lastShownFor)` returns the day to summarise, or `null`.
- Device key `organizer:device → lastEveningPreviewShownFor` is reserved for "already shown".

**Still to build:** settings UI (on/off + time), the summary screen, the open-on-launch check, the manual button. Suggested timing: right after Phase 1, because it reuses Phase 1's review buttons and task editing.

---

## C. Technical decisions (Phase 0, proposed by Claude — open to review)

### Code structure
- Plain JavaScript ES modules. **No framework, no npm, no build step, no external libraries.**
- **Flat folder** (every file at the top level), so the app can be uploaded to GitHub from any device, including an iPhone.
- One job per file:

| File | Job |
|---|---|
| `index.html`, `app.css`, `boot.js` | Page shell, styles, "app did not start" safety message |
| `app.js` | Starts the app, draws the current tab, routes every click/change/submit |
| `actions.js` | Every user change as a named operation (add task, move task, delete, …) |
| `store.js` | The only code that reads/writes app data: validation, saving, copies, recovery |
| `storage.js` | The only code that touches `localStorage` (swap point for IndexedDB/sync later) |
| `schema.js` | Data format, version number, validation, upgrade from the prototype |
| `selectors.js` | Read-only questions ("tasks for today", review list, evening summary) |
| `dates.js` | All date maths (no locale tricks) and Russian date formatting |
| `backup.js` | Backup file format and import parsing |
| `components.js`, `view-*.js` | HTML for each screen |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Installable app and offline cache |
| `version.js` | App version (must match `sw.js`) |
| `tests.html`, `tests.js`, `tests.css` | Automated tests (open in a browser) |

### Data safety rules (implemented in `store.js`)
1. **Validate before save.** Every change is made on a copy, validated, then saved. An invalid change is rejected whole and a message is shown.
2. **Never overwrite unreadable data.** If saved data cannot be read, its raw text is first copied to `organizer:rescue`; then the newest valid automatic copy is loaded. If the rescue copy cannot be written, the app becomes **read-only**.
3. **Quarantine, don't drop.** A record that fails validation on load or import goes into `doc.quarantine` (with its original content and the reason). Everything else loads. Quarantine is kept in every backup.
4. **Visible save errors (ordinary edits).** A failed save shows a red banner with «Повторить» and «Сохранить копию» and the status «⚠ Не сохранено»; the change stays visible in memory and is retried on the next change. If space runs out, old automatic copies are trimmed so the main data can be saved — and put back if the save still fails.
4a. **Import and restore are all-or-nothing** (since 0.2.1). They report success only after the new data is confirmed saved. If saving fails, the previous data stays both on screen and in storage, the import preview stays available to retry, and an error explains why. Any future operation that replaces the whole document (e.g. sync) must use the same `replaceDocument()` path.
4b. **A half-finished write is undone.** If a write cannot be confirmed by reading it back, the previously saved text is written back.
5. **Soft delete.** Deleting sets `deletedAt`. Deleted records can be restored in «Данные → Удалённые» for 30 days, then are purged on app start.
6. **Automatic copies** (`organizer:snapshots`): one per day (before the first change of the day), and before every import or restore. At most 10. Each copy has its own id. The copy being restored is never pushed out by the new «перед восстановлением» copy. An unreadable copies area is moved to rescue before it is ever rewritten. They live on the same device, so they do **not** replace exported backups.
7. **Newer data is untouchable.** Data with a higher `schemaVersion` than the app knows makes the app read-only instead of guessing.
8. **Other windows.** If another window saves, this one reloads the data instead of overwriting it later — unless this window holds unsaved changes, which are kept and flagged instead of being discarded.
9. **Import is always previewed** (counts, quarantine) and confirmed; a copy of the current data is taken first.

### Storage keys (`localStorage`)
| Key | Contents |
|---|---|
| `organizer:data` | The main document (schema v2) |
| `organizer:snapshots` | Automatic copies, newest first |
| `organizer:rescue` | Raw text that could not be read (every distinct text is kept; nothing is dropped) |
| `organizer:device` | This device only: `lastBackupAt`, `lastDailySnapshot`, `lastEveningPreviewShownFor` |
| `arina-organizer-v1` | The prototype's data. **Read once, never written or deleted.** |

`localStorage` is enough for this data size (hundreds of KB). Only `storage.js` touches it.

### Dates and times
- Calendar dates are local date keys `YYYY-MM-DD`; times are `HH:MM`; event moments are local wall-clock `YYYY-MM-DDTHH:MM` (no time zone).
- Record timestamps (`createdAt`, `updatedAt`, `completedAt`, `deletedAt`) are ISO 8601 UTC.
- The app re-checks "today" every 30 seconds and when it returns to the foreground.
- *Sync note for later:* event times have no time zone; if devices in different zones ever sync, add one then.

### Tasks, events, reminders
- A **task** is something to do; an **event** happens at a time. They are separate collections.
- A task's `time` is allowed only on day tasks. A `reminder` is `{ minutesBefore }` relative to the task's time, so it moves with the task. Moving a task off a specific day clears its time and reminder; the deadline never changes.
- Reminders while the app is closed are not possible in a local-only iOS web app. Plan: in-app reminders while open, and an `.ics` export so Apple Calendar delivers alerts (Phase 2).

### Morning review
- Phase 0 keeps the prototype's behaviour: unfinished **day** tasks planned before today, with «Сегодня», «На неделю», «Без даты».
- Phase 1 adds unfinished **week** tasks from past weeks (`unfinishedBefore` is ready), plus «Завтра» and weekday choices.

### Screens and security
- UI language: **Russian** (as in the prototype). *Assumption — confirm.*
- No inline event-handler attributes. Elements carry `data-action` / `data-form`; one listener in `app.js` routes them (this removed the cause of the "create event/project/list does nothing" bug).
- Every value placed into HTML passes through `esc()`. Ids must match `[A-Za-z0-9_.:-]`.
- A Content-Security-Policy in `index.html` allows only the app's own scripts.

### Installed app and updates
- `sw.js` caches all app files (cache-first), so the app opens offline.
- **Release rule:** after changing any file, bump `APP_VERSION` in `version.js` **and** `VERSION` in `sw.js` to the same new value; add new files to `ASSETS`. `tests.html` checks both.
- A new version is installed in the background and waits. The app shows «Доступна новая версия · Обновить»; it never reloads on its own.

### Backups
- «Сохранить копию» opens the iPhone share sheet (choose «Сохранить в Файлы»); if sharing is unavailable it downloads a file; a third fallback shows the backup text to copy.
- File name: `organizer-backup-YYYY-MM-DD-HHMM.json`. Format: `{ app: 'organizer', kind: 'backup', appVersion, schemaVersion, exportedAt, data }`.
- Import accepts this format, a bare document, and the prototype's format.
- The Today screen reminds about a backup when none was made from this device, or the last one is 7+ days old.

---

## D. Data model (schema version 2)

Document: `{ schemaVersion: 2, createdAt, updatedAt, tasks, events, projects, lists, settings, quarantine }`

**Task**
| Field | Type | Notes |
|---|---|---|
| `id` | string | random UUID |
| `title` | string | |
| `plan` | `{ kind: 'day'│'week'│'none', date }` | `date` = day, or the Monday of the week, or `null` |
| `time` | `'HH:MM'` or null | day tasks only |
| `reminder` | `{ minutesBefore }` or null | needs `time` |
| `deadline` | `'YYYY-MM-DD'` or null | never changed by rescheduling |
| `projectId` | string or null | link to a project (Phase 3) |
| `done`, `completedAt` | boolean, ISO or null | |
| `createdAt`, `updatedAt`, `deletedAt` | ISO, ISO, ISO or null | |

**Event:** `id, title, start ('YYYY-MM-DDTHH:MM'), end (same or null), allDay, repeat (null or { freq: 'weekly', days: [1..7], until, skip: [dates] }), alerts ([{ minutesBefore }]), createdAt, updatedAt, deletedAt`. `repeat` and `alerts` are validated now and used from Phase 2.

**Project:** `id, name, milestones ([{ id, title, done, createdAt, updatedAt, deletedAt }]), quantity ({ current, total, unit }), createdAt, updatedAt, deletedAt`. Milestone progress and quantity progress are shown separately.

**List:** `id, name, items ([{ id, title, done, createdAt, updatedAt, deletedAt }]), createdAt, updatedAt, deletedAt`.

**Settings:** `{ eveningPreview: { enabled, time } }`.

**Quarantine entry:** `{ at, source: 'load'│'import'│'legacy'│…, collection, parentId, reason, record }`.

Unknown extra fields on records are preserved. Changing the format means: bump `SCHEMA_VERSION`, add an upgrade step in `schema.js`, add a test.

---

## E. Working rules for development

1. **One source of truth:** the GitHub repository. Never merge two different copies by hand.
2. **One AI changes code at a time.** Each change lists the files it touched.
3. **Small changes.** Before a release: run `tests.html` (all green) and the manual checklist in `TESTING.md`.
4. **Data is changed only** through `actions.js` → `store.update()` (or `replaceDocument()` inside `store.js` for whole-document replacement). Nothing else writes to `localStorage`. A storage operation may report success only after the write is confirmed.
5. **No inline handlers, always `esc()`** for anything placed into HTML.
6. **Format changes** need a schema version bump, an upgrade step and a test. Never remove a field without an upgrade step.
7. **Release:** bump both version numbers, update `CHANGELOG.md`, and update this file when a rule changes.
8. **Phases:** Phase 1 does not start until Phase 0 is reviewed (owner, 2026-10-09).
