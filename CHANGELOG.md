# Changelog

## 0.2.2 — 2026-10-09 — Appearance: light, dark, system

**New**
- «Настройки» screen (button in the header) with three appearance modes: «Светлое» (soft warm off-white), «Тёмное» (muted dark colours) and «Как в системе» (follows the iPhone's light/dark setting live). Default: «Как в системе».
- The choice is saved on this device under its own key and applied before the page is drawn, so there is no flash of the wrong theme on start.
- All colours are now theme tokens; date and time pickers, selects and checkboxes follow the theme. Every text/background pair has a contrast ratio of at least 4.5:1 in both themes.
- The light theme no longer uses bright white anywhere.

**Fixed (found while testing this update; existed since 0.2.0)**
- A redraw the user did not cause, such as the offline cache becoming ready shortly after start, could interrupt typing. The field lost focus (on iPhone the keyboard would close), and text typed in forms other than quick add was lost. Focus, text and cursor position are now kept. Such background redraws also happen less often: only when something visible changed.

**Unchanged**
- No change to app functions, the data document, backups or automatic copies. Switching the theme writes only `organizer:appearance`.

**Documentation**
- `DECISIONS.md`: new section B3, Quarterly Cleanup («Уборка»), recorded as a future feature after Phase 3.

**Tests:** 8 new unit tests (73 total) and 22 new click-through checks (93 total). They include a contrast audit of every screen in every mode, and a check that a background redraw does not interrupt typing (this check fails on the previous version).

## 0.2.1 — 2026-10-09 — Phase 0 correction: failed saves during import and restore

Found in review: `applyImport()` and `restoreSnapshot()` reported success without checking that the new data was saved.

**Fixed**
- **Import and restore are now all-or-nothing.** Success is reported only after the new data is confirmed saved. If saving fails, the previous data stays on screen and in storage, the error is shown, and the import preview stays so it can be retried.
- **Automatic copies are identified by a unique id** instead of their timestamp. Two copies made in the same millisecond could be confused, so restore could pick the wrong one.
- **Restoring the oldest copy** no longer pushes that same copy out of the 10-copy list (which mattered when the save then failed).
- **Out-of-space handling:** old automatic copies trimmed to make room are put back if the main save still fails.
- **Half-finished writes:** if a write cannot be confirmed by reading it back, the previous saved text is written back.
- **Damaged-data rescue** no longer drops older entries (was limited to 5) and keeps an unreadable rescue area instead of overwriting it.
- **Unreadable automatic-copies area** is never overwritten unless its text was first moved to rescue.
- **Prototype data migration** no longer says «Перенесены» when the save failed (the old data was always safe and the migration simply repeats).
- **Another window saving** no longer discards this window's unsaved changes.
- The import error message is no longer hidden when the preview is still shown.

**Tests:** 12 new unit tests (65 total) and 9 new click-through checks (71 total).

## 0.2.0 — 2026-10-09 — Phase 0: foundation and data safety

**Restructure**
- The single-file prototype is split into small plain-JavaScript modules (see `DECISIONS.md`, section C). No framework, no build step, no dependencies.
- All clicks, changes and forms go through one router in `app.js` (`data-action` / `data-form`); no inline handlers.

**Fixed**
- Creating an **event**, a **project** or a **list** did nothing (the inline handler called `id()`, which the browser resolved to the form's own `id` property). Fixed by removing inline handlers.
- One malformed record (e.g. an imported event without a time) made the whole app blank, permanently. Bad records now go to a quarantine; everything else loads, and screens are drawn defensively.
- Unreadable saved data was silently replaced by an empty organizer. Its raw text is now kept in a rescue area and the newest automatic copy is loaded.
- Import replaced everything after a shallow check. Import now validates every record, shows a preview, and takes an automatic copy first.
- Save failures were invisible. They now show a red banner with «Повторить» and «Сохранить копию».
- Imported file content could reach click handlers unescaped. Ids are validated and every value is escaped; a Content-Security-Policy blocks inline scripts.
- "Today" was only recomputed on redraw. It now updates after midnight and when the app returns to the foreground.
- Dates no longer depend on the browser's Canadian locale format.
- Text typed in the quick-add box is no longer lost when you tick a task.

**New**
- Versioned data store (schema 2) with automatic upgrade from the prototype format (`arina-organizer-v1`, left untouched).
- Timestamps on every record (`createdAt`, `updatedAt`, `completedAt`, `deletedAt`).
- Soft delete with a restore list (30 days).
- Automatic copies: daily and before import/restore (max 10), restorable and downloadable.
- Backup via the iPhone share sheet, download fallback, and copy-as-text fallback; backup reminder after 7 days.
- Import from file or pasted text, with preview.
- «Данные» tab: save status, copies, deleted items, quarantine, rescued data, storage status.
- Installable app: manifest, icons, offline cache, «Доступна новая версия · Обновить» banner.
- Requests persistent storage from the browser.
- Data model prepared for task time/reminder, deadlines, project links, repeating events, event alerts and the Evening Preview.
- Automated tests (`tests.html`) and a manual checklist (`TESTING.md`).

**Unchanged on purpose (Phase 1 and later)**
- Morning review still covers only past **day** tasks; quick add still defaults to «Без даты»; no editing, no «Завтра» button, no date recognition; calendar is still a plain list. See `DECISIONS.md`.

## 0.1.0 — prototype (single `organizer.html`, written with ChatGPT)
