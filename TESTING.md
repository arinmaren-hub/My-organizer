# TESTING.md — version 0.2.2

## 1. What was actually tested (2026-10-09, by Claude — re-run in full for 0.2.2)

**Environment:** headless **Chromium 141** driven by Playwright 1.56 on Linux, iPhone-sized screen (390 × 844, touch), time zone Europe/Athens, served over local http. All runs used the files exactly as packed in the ZIP (unzipped into a fresh folder).

| Test set | Result | Notes |
|---|---|---|
| `tests.html` — automated unit tests | **73 / 73 passed** | Run in three time zones: Europe/Athens, America/Los_Angeles (UTC−7) and Pacific/Kiritimati (UTC+14). |
| `e2e-test.py` — click-through of the real app | **93 / 93 passed**, 3 runs in a row | Listed below. |

**Click-through checks (all passed):**
- Start: Today screen opens, 6 tabs, no sideways scrolling at iPhone width.
- Quick add: 2 lines → 2 tasks; box clears; date field appears for «На день»; a task for today shows in «Сегодня»; text typed in the box survives ticking a task.
- Done: tick survives reload; `completedAt` is recorded.
- **Bug 1 fixed:** an event, a project and a list can be created. Event appears in today's «Расписание».
- Progress: 2 milestones, 1 ticked → «Этапы · 1/2»; +1, +1 → 2/12; typing 7 → 7/12 (58%); −1 → 6/12; cursor stays in the milestone field after adding.
- Lists: items added and ticked.
- Soft delete: task hidden, still in data with `deletedAt`, listed in «Удалённые», restored; delete asks for confirmation.
- Morning review: overdue day task shown with its deadline; «Сегодня» moves it; **deadline unchanged** (decision 6).
- HTML typed into a task title is shown as text, not executed.
- Export: file downloaded with dated name, correct format, all data; «Последняя копия» updated; copy-as-text fallback shown.
- Import: preview first; data replaced; «перед импортом» automatic copy created; non-JSON text rejected with a clear message.
- **Bug 2 fixed:** importing a file with an event without a time → that record goes to quarantine, the rest imports, the app still works after reload.
- **Bug 3 fixed:** damaged saved data → warning banner, raw text kept unchanged in «Повреждённые данные», newest automatic copy loaded.
- **Bug 5 fixed:** simulated "storage full" → red banner and «⚠ Не сохранено»; «Повторить» saves and clears the banner; the task really is saved.
- Offline: service worker takes control; with the network off the app opens and a task can be added.
- **Failed save during import (0.2.1):** with saving blocked, import shows «Импорт не выполнен» and the reason, no success message, no false «⚠ Не сохранено», the preview stays for a retry, stored data and the screen are unchanged; once saving works again the same import succeeds.
- **Failed save during restore (0.2.1):** «Восстановление не выполнено», no success message, stored data unchanged.
- **Appearance (0.2.2):** «Настройки» opens from the header with three choices, default «Как в системе». For «Светлое», «Тёмное», and «Как в системе» with the device both light and dark: the page colour is right; date pickers, selects and checkboxes use the same scheme; and an automatic audit of **every screen** finds no text below 4.5:1 contrast and no bright-white surface. The audit covers the Today review, the import preview, the backup text, the Settings screen, and every banner and message style. The audit itself was checked against planted low-contrast text, a low-contrast field and a white box, and it flagged all three.
- Appearance: «Как в системе» follows a light/dark switch immediately; «Тёмное» also sets a dark status-bar colour; the choice survives a restart; it is applied **before the app code runs** (tested by blocking `app.js`), so there is no light flash; switching themes leaves the data, automatic copies and device info byte-for-byte unchanged.
- **Typing is not interrupted (0.2.2):** a background redraw while typing in a list's «Добавить пункт» field keeps focus and text, and continuing to type then pressing Enter adds the full item. (This check fails on 0.2.1, which lost both.)
- Update: after a new version is published, «Доступна новая версия» appears; «Обновить» loads the new version; data is kept.
- Prototype data under `arina-organizer-v1` is moved automatically, with a message; the old key is left unchanged.
- iPhone Safari (not installed): warning that Safari and the Home Screen app have separate data.
- **Bug 13 fixed:** with a simulated clock at 23:59, «Сегодня» switches to the next day by itself.
- No JavaScript errors and no Content-Security-Policy violations during the whole run.

**Unit tests added in 0.2.1 («Сбои записи»), all passing:**
- Import with a full disk: not reported as success; previous data in memory and in storage; no false "unsaved" flag; succeeds once space is free.
- Import where the write half-lands: the previous stored text is put back.
- Import while unsaved edits exist: those edits and their warning are kept.
- Restore with a full disk: not reported as success; data unchanged; the copy being restored is still there; succeeds once space is free.
- Restoring the oldest of 10 copies with a full disk: that copy is not pushed out.
- Two copies made in the same millisecond: the chosen one is restored.
- Out of space even after trimming old copies: the copies are put back.
- Ordinary edit where the write half-lands: previous stored text put back, change flagged unsaved, «Повторить» saves it.
- Unreadable copies area is not overwritten unless rescued first.
- Damaged texts are never dropped (7 kept), and an unreadable rescue area is preserved.
- Prototype migration with a failed save: no false «Перенесены», old data intact, migration repeats next start.
- Another window saving does not discard this window's unsaved changes.

## 2. What was NOT tested

- **A real iPhone or iPad, Safari, or WebKit.** Only Chromium was available. Safari usually behaves the same for this code, but that is not verified.
- Add to Home Screen, the installed-app look, and offline use **on iOS**.
- The **iOS share sheet** for backups (Chromium on Linux has no share sheet, so the download fallback was tested).
- Whether iOS grants **persistent storage**.
- Hosting on **GitHub Pages** (tested on a local server only).
- Two windows of the app open at once (the code handles it; no automated test).

These are exactly what the first-install checklist below covers.

## 3. First install on the iPhone (once, about 10 minutes)

Tick each line; report anything that fails.

- [ ] `https://…/tests.html` in Safari: «73 из 73 тестов пройдено».
- [ ] Installed via Share → Add to Home Screen; opens full-screen from the icon.
- [ ] «Данные → О приложении»: «Запущено с экрана «Домой»: да», «Офлайн-режим: готов…».
- [ ] Note what «Постоянное хранилище» says (for our records).
- [ ] Add a task, an event, a project with a milestone, a list with an item.
- [ ] Close the app fully (swipe it away), reopen: everything is still there.
- [ ] Airplane Mode on, close and reopen the app: it opens and works. Airplane Mode off.
- [ ] «Сохранить копию» → does the share sheet open? → «Сохранить в Файлы» → iCloud Drive. Check the file exists in Files.
- [ ] If the share sheet did not open: did a download happen instead? Note which.
- [ ] «Показать текст копии» → «Скопировать текст» → paste into Notes works.
- [ ] Import that saved file back: preview appears, «Заменить данные» works.
- [ ] Delete a task, restore it from «Удалённые».
- [ ] «Настройки» → «Тёмное»: every tab readable; open a date picker in «Календарь» (it should be dark too). Close and reopen the app: still dark, with no light flash.
- [ ] «Как в системе», then switch the iPhone between light and dark (Control Centre or Settings → Display & Brightness): the app follows.
- [ ] Note how the status bar and the launch screen look in dark mode (iOS controls these).

## 4. Quick check for every new version (about 2 minutes)

- [ ] `tests.html`: all green.
- [ ] App shows «Доступна новая версия» → «Обновить» → «Данные» shows the new version number.
- [ ] Existing data still there.
- [ ] Add, tick and delete a task; create an event.
- [ ] Export a backup.
- [ ] Anything the change touched, by hand.

## 5. Running the automated tests yourself

- **Unit tests:** open `tests.html` from the published site (or a local server). They use temporary in-memory data and never touch your real data.
- **Click-through (for developers):** needs Python 3 and Playwright (`pip install playwright && playwright install chromium`), then
  `python3 e2e-test.py <path-to-app-folder> <output-folder>`. It copies the app to the output folder, so the original files are not changed.
