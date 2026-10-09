# Changelog

## 0.4.0 — 2026-10-10 — Calendar, reviews, evening overview, waiting, templates, recurring tasks, quick entry

One integrated release. **Your existing data is kept as it is:** the upgrade only adds empty fields and new empty collections; before it writes anything, the exact old text is saved as a rollback copy («перед обновлением формата данных») and a check confirms that every record survived (otherwise the app stays read-only and changes nothing). Same address, same storage keys, same language/appearance/day settings.

**New**
- **Calendar tab:** Monday-first month grid, previous/next month, month and year picker, optional 12-month year view. Tap a date to see its events, tasks, week tasks, deadlines and repeats, and to add a task or an event to that date. Real calendar dates; your planning day only decides what «today» is.
- **Morning and evening reviews** of unfinished day and week tasks: tomorrow, another date, this week, no date, keep, done. Nothing moves without a tap; deadlines never change. Decisions are remembered (`review`), so the same question is not asked twice; tasks kept in the evening are listed quietly next morning; unfinished tasks always stay visible under «Уже разобрано».
- **«Вечер» / Evening overview:** opens by hand at any time, and once per planning day when the time you set has passed (while the app is open — there are no background notifications). Review of unfinished tasks plus tomorrow's events, tasks, deadlines, follow-ups and repeats with quick add/move.
- **Waiting for others** at the very bottom of «Сегодня»: optional «from whom» and follow-up date; a reminder card on the follow-up day («проверить через 3 дня», «Нужно действие» → task, «Решено»). Not tasks, never overdue.
- **List templates:** built-in «Супермаркет» and «Чемодан» (Supermarket, Suitcase Packing), editable, with categories; your own templates; «Новый список из шаблона» (all unticked, template unchanged); «Сохранить как шаблон». List items can be edited and deleted.
- **Recurring tasks** (Tasks tab): daily/weekly/monthly/yearly, every N, counted from completion or on a fixed rhythm; history; pause; edit; no duplicates. The app never decides something was missed because it was not opened: past occurrences wait in «Повторы без подтверждения» for «Сделано», «Сделано в тот день», «Пропустить», «Сегодня».
- **Quick entry:** a title is enough; one line per task; Russian and English dates (today/tomorrow, weekdays, «до пятницы / by Friday» as a deadline, «15 октября / Oct 15», `15.10`, «через 3 дня / in 3 days», «на этой неделе»). A typed clock time asks «Задача или Событие?». Quantities like `1.5 л` or `2/3 cup` are not read as dates.
- **Editing** of tasks, events, waiting items and series (✎): title, day/week/no date, time, deadline. Moving a plan never changes the deadline.

**Data format:** schema 4 — collections `series`, `waiting`, `templates`; task fields `review`, `seriesId`, `occurrenceDate`, `skipped`, `doneDay`; optional list `categories` / item `category`. Upgrades from the prototype and from 0.2.0–0.3.0 are automatic. Daily copies (1 per day, latest 5) and rollback copies work as in 0.3.0 and cover the new collections.

**Fixed during development (found by the tests and an independent review):** a morning decision no longer silences the evening question; re-completing a recurring task after an undo no longer skips a date; a skip counts the next date from today; switching a series from «by completion» to «fixed» or restoring a deleted series does not create a flood of past occurrences; «as text» with a week plan no longer rejects the task; `confirmOccurrence` refuses non-recurring tasks; editing quick-entry text while the Task/Event question is open can no longer remove the wrong line; past calendar days no longer show repeats that were never created; restoring a deleted recurring occurrence can no longer leave two open ones.

**Not in this release:** repeating events driven by the same engine, end dates and «2nd Tuesday» rules, Quarterly Cleanup, notifications. See `ROADMAP.md`.

**Tests:** see `TESTING.md`.

## 0.3.0 — 2026-10-09 — Language, personal planning day, data preservation and privacy

**New: interface language**
- Russian or English, chosen by hand on the first-launch screen and in «Настройки» → «Язык». Russian is the default; the device language is never detected. Saved on this device only (`organizer:language`) and applied before the page is drawn.
- Every interface text, plural form, weekday and month name is in `i18n.js`. Messages saved by the app (notices, reasons) are stored as keys, so they switch language too. Texts you typed are never translated.

**New: personal planning day**
- First-launch screen: language, usual wake-up time, bedtime, and «День заканчивается в» (your bedtime is suggested). «Пропустить» keeps the day ending at 00:00, exactly as before. Existing users see it once after the update.
- «Сегодня», the morning review, overdue detection and «на сегодня» in quick add follow your planning day: with the day ending at 03:00, Saturday 01:30 is still Friday, and Friday's tasks become overdue only at 03:00. A day ending at 23:00 already shows Saturday at 23:30.
- Real dates never change: event times, deadlines and timestamps stay on the calendar. Events after midnight appear in the planning day's schedule with their real date; «По календарю: …» is shown when the dates differ.
- «Завершить день»: move to the next day early (after a confirmation); «Вернуть» undoes it. Stored on this device only; changes no data.
- «Настройки» → «Мой день» to change the times at any time.
- Daylight-saving nights: the day changes exactly once and never goes back.

**Data preservation (owner's release rules R1–R12)**
- Two kinds of automatic copies: **daily** (one per day, latest 5) and **rollback** copies before every data-format upgrade, import and restore (latest 5). The newest pre-upgrade copy keeps the exact original text and is never rotated out by imports or restores. Copies made by 0.2.x are all kept (import/restore copies move to the rollback list).
- **Guarded upgrade:** before old data is rewritten, the app checks that every record survived (same id, title and done state; quarantine kept) and saves the exact original text. If either fails, or the upgrade code fails, nothing is written: the app opens read-only, shows what it could read, and offers «Скачать исходные данные» (and «Продолжить обновление без копии» when only space was missing).
- A message tells you when your data was moved to the new format, and where the previous copy is.
- A backup or copy made before 0.3.0 keeps your current day settings instead of asking the first-launch questions again.

**Privacy (owner's requirements, see `SECURITY.md`)**
- Each organizer has a random id (`dataId`, not personal). A backup from **another organizer** that would replace your data shows a warning and needs a second confirmation; your data is kept as a rollback copy first.
- Hardening: odd values in an imported file (e.g. `constructor`, `__proto__`, objects where text is expected) can no longer break a screen; backup-file headers are read as plain text only.
- «Данные → О приложении» states that data stays in this browser on this device, and shows the address it belongs to.
- New `SECURITY.md`: guarantees, limitations, tests. README: publish the app on its own address (origin) before sharing it.

**Fixed**
- At midnight, a screen whose planning day did not change was not redrawn, so the calendar-date hint and event labels could be a day behind until the next action.

**Data format:** schema 3 — `settings.day = { wake, bed, cutoff, setupDone }` and `dataId`. Upgrades from the prototype (1) and from 0.2.0–0.2.2 (2) are automatic and keep every record. New keys: `organizer:language`, `organizer:rollback`.

**Tests:** see `TESTING.md` — unit tests in three time zones, click-through in both languages and both themes, a two-browser privacy test, and real-update upgrade tests from 0.2.0, 0.2.1 and 0.2.2.

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
