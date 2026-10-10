## 0.5.1 verification notes (10 October 2026)

- Source syntax checked using Node.js.
- JavaScript unit tests: 310/310 in a Node.js test harness with mocked DOM and local file responses. This is not equivalent to real Chromium, Safari or iPhone testing.
- 0.5.0 browser suites have been adjusted for intentional removal of per-row ellipsis buttons but were not run in this environment.
- **Manual iPhone checks before relying on 0.5.1:** settings gear opens settings menu; tap task text to edit; hold task/event to open actions; task and list checks are round; unfinished entries appear above finished within the same day/category; unchecking returns to earlier position; event preparation order remains untouched; data/backup, offline operation and Russian/English still work.

# TESTING.md — version 0.5.0

## 1. What was actually tested (2026-10-10, by Claude)

**Environment:** headless **Chromium 141.0.7390.37** driven by **Playwright 1.56.0** on Linux, iPhone-sized screen (390 × 844, touch), served over local http; a simulated clock where dates matter. **Only Chromium. No WebKit, no Safari, no real iPhone or iPad.** Swipe, long-press, keyboard and safe-area behaviour were simulated with pointer events and viewport changes, not felt on a device.

Results are from the final code (after the last change to `sw.js`):

| Test set | Result | Notes |
|---|---|---|
| `tests.html` — unit tests | **306 / 306 passed** in each of four time zones | UTC, America/Los_Angeles, Asia/Tokyo, Pacific/Kiritimati (UTC+14). 55 new tests for 0.5.0 (quick entry rules, indent, home inventory, templates, conversion, prep list, review fixes). Console lines like «Records would be lost while loading» during this run are the tests deliberately feeding broken data. |
| `e2e-v5-test.py` — new click-through of the 0.5.0 interface | **677 / 677 passed** | Russian first, then the same flows in English. Four tabs, «···» menu, Today layout, «＋» multi-line entry, row menus, reschedule, swipe indent, Lists index, Купить, Дом, list screens, templates, calendar, task↔event conversion, Подготовка, reviews, waiting, recurring, backups, language and theme switching, contrast audit. |
| `e2e-test.py` — legacy scenario | **125 / 125 passed** | Ported to the 0.5.0 navigation. Includes the «Обновление версии» step. |
| `privacy-test.py` — two independent browser contexts | **38 / 38 passed** | Server saw only `GET` requests for the app's own files. |
| `upgrade-test.py` — real service-worker update | **47 / 47** (0.2.0), **47 / 47** (0.2.1), **47 / 47** (0.2.2), **46 / 46** (0.3.0), **45 / 45** (0.4.0) → 0.5.0 | Two people upgraded side by side from the real old builds. |
| `e2e-v4-test.py` | **obsolete, not run** | Describes the 0.4.0 screens; its flows are covered by `e2e-v5-test.py`. Kept only for history. |

**Independent review (second round, 2026-10-10).** A separate agent that had not written the code reviewed the final changes (data preservation, task↔event conversion, Home inventory, lists/templates, service-worker updating) read-only and with small experiments. It found **no data-loss path**. Material findings and what was done:
1. Restoring a deleted built-in template from «Удалённые» gave an empty template — **fixed** (content comes back; with a live copy the marker is dropped); 2 tests.
2. «Сделать событием» silently dropped a task's reminder when the time was changed — **fixed** (listed, needs confirmation; unchanged time still carries it over); test.
3. Renaming a «Дом» item to an existing name made a second row — **fixed**; test.
4. Restoring the original after a task↔event conversion made two active records (owner's request) — **fixed** with linked records and an explicit confirmation (`DECISIONS.md` B12); 6 unit tests and a browser check in both languages.
5. *Not changed (documented):* the service-worker install verifies `version.js` and that every file downloads, but not that each file is the new one; a site where `sw.js` and `version.js` are new but another file is a stale CDN copy could be cached as a mixed set until the next version bump (GitHub Pages publishes one commit atomically, so this needs a CDN inconsistency). Recovery: bump the version and re-upload. Also not changed: restoring a task that became «Ожидаю от других» while the waiting item is active gives both (nothing lost).
The checks above are otherwise my own tests; earlier defects found while writing them (menu contrast, list not opening, template edits, reminder carry-over, waiting deadline, typed text lost on a failed save) each have a regression test.

**Unzipped packages:** after packing, the unit tests (one time zone), privacy, legacy and the 0.4.0 upgrade were re-run on the unzipped full ZIP, and the changed-only ZIP laid over 0.4.0 was compared with it (identical); results in the delivery message.

## 2. Migration test report (release rule R11)

**Supported earlier versions:** prototype (schema 1, key `arina-organizer-v1`), 0.2.0, 0.2.1, 0.2.2 (schema 2), 0.3.0 and 0.4.0 (schema 3 and 4; 0.5.0 keeps schema 4 — the same data, same keys).

**How it was tested.** For each of 0.2.0, 0.2.1, 0.2.2, 0.3.0 and 0.4.0, the **real old build** was served and opened in two independent browsers (A and B). Each was given realistic data (80 tasks: day/week/no-date, done with completion times, deadlines, times with reminders, project links, deleted ones; 15 events incl. a weekly repeat rule and an alert; 3 projects with 5 milestones; 3 lists with 8 items; a quarantine entry with an old Russian reason) and then **used through the old interface**: quick add, ticking, adding a list item, export, an import (which made a «перед импортом» copy), a restore (a «перед восстановлением» copy), and a deletion. The new files were then published, the service worker found them, and «Обновить» was tapped — exactly as on an iPhone.

| Checked after the update (A and B, every version) | Result |
|---|---|
| Every task, event, project, list and quarantine entry identical **field by field** (81 / 15 / 3 / 3 / 1); 0.5.0 adds only optional fields (none are written until used) | ✓ |
| Evening-preview settings and document dates unchanged; done, deadlines, deleted records, repeat rule present | ✓ |
| The exact original text kept as a rollback copy («перед обновлением формата данных») | ✓ byte-for-byte (from 0.3.0 two such copies: 0.3.0's own 2→3 copy and the new 3→4 copy) |
| Every copy made by the old version still present (daily in daily copies, import/restore in rollback copies) | ✓ |
| No storage key removed; appearance and last-backup date untouched | ✓ |
| «Данные переведены в новый формат» message; the day questions asked once (from 0.2.x) or not again (from 0.3.0) | ✓ |
| A's storage contains nothing of B's and vice versa | ✓ |
| A second window still running the old version goes read-only and writes nothing | ✓ |
| After answering the questions and restarting: records still identical; the pre-upgrade copy not duplicated | ✓ |
| Restoring the pre-upgrade copy returns every record exactly as in the old version, without asking the day questions again | ✓ |
| The old offline cache replaced by the new one; the app opens offline with the same data | ✓ |

**Also tested (unit and click-through):** prototype → 0.5.0 in one chain, a schema-3 document with every old field upgraded to 4 with no record lost, a week task with a non-Monday date going to quarantine instead of being dropped, the new collections in the lost-records check, backups (v1–v4) and snapshots importing/restoring into 4; earlier: (and from the old key, which is never written); 0.2.x backup import; 0.2.x copy restore; a copy without id; a damaged copy; data from a newer version stays read-only and untouched; the upgrade stops and writes nothing if the upgrade code fails or if any record, title, done state, list item, milestone or quarantine entry would be lost (six cases); no room for the pre-upgrade copy → upgrade stopped, data untouched, original downloadable, «Продолжить обновление без копии» works; old daily copies trimmed (with a message) to make room for the pre-upgrade copy while 0.2.x import copies are kept; a failed save during the upgrade leaves the old data in place and the upgrade repeats next start without a second copy.

**Remaining data-loss risks (not prevented by the app):**
- **Device lost, broken or reset** — everything on it is gone; only exported backups kept elsewhere help.
- **Browser storage deleted** — by «Очистить историю и данные сайтов», by Safari for websites not added to the Home Screen and not used for a while, or possibly by iOS when storage is very low (persistent storage is not guaranteed; see «Данные → О приложении»).
- **Deleting the Home Screen app** deletes its data on iOS. Reinstalling starts empty.
- **Moving the app to a new address** (e.g. its own origin, recommended before sharing) starts empty there; data must be moved by export and import.
- **Automatic copies live on the same device** and are lost together with it. Daily copies keep 5 days; rollback copies keep the latest 5 (the user is asked before a unique one is removed).
- **Storage full** — saves fail visibly (red banner); some operations then need confirmation to proceed without a copy.
- **Two windows editing at once** — the other window reloads instead of overwriting, and unsaved changes are kept and flagged; tested in code, not on an iPhone.
- **Not verified on real iOS / Safari / WebKit** (see section 3).

## 3. What was NOT tested

- **A real iPhone or iPad, Safari, or WebKit.** Only Chromium was available. Safari usually behaves the same for this code, but that is not verified.
- **Touch feel on a device:** swipe-to-indent, long-press, scrolling inside sheets, the on-screen keyboard covering fields, and safe-area padding were only simulated.
- Add to Home Screen, the installed-app look, offline use and the update flow **on iOS**; the iOS share sheet for backups (download fallback tested); whether iOS grants persistent storage.
- Hosting on **GitHub Pages** (a local server stood in for it), including CDN delay after upload.
- **Time-based features on a real clock:** evening overview and day changes were tested with a simulated clock.
- **Very large organizers** (thousands of tasks) — performance not measured.

## 4. Release gate (every version — `DECISIONS.md` E12)

A version is **not published** unless every line is ticked:
- [ ] `tests.html` all green (ideally also in a second time zone).
- [ ] `e2e-test.py` and `e2e-v5-test.py` all passed.
- [ ] `privacy-test.py` all passed (two independent browser contexts).
- [ ] `upgrade-test.py` all passed **from every supported earlier version** (keep a copy of each released ZIP for this).
- [ ] Section 2 updated: migration report and remaining data-loss risks.
- [ ] `version.js` and `sw.js` versions equal; `CHANGELOG.md` updated; `DECISIONS.md` / `SECURITY.md` updated if a rule changed.
- [ ] If any migration or isolation check fails: **stop**, do not publish.

## 5. On the iPhone

**Before updating to 0.5.0:** «Данные → Сохранить копию» and keep the file outside the app (see README).

**After updating (about 20 minutes).**
- [ ] `https://…/tests.html` in Safari: «306 из 306 тестов пройдено».
- [ ] In the app: «Доступна новая версия» → «Обновить». All tasks, events, lists, projects are still there. «···» → «Копии и данные» shows the new version number.
- [ ] **Bottom bar:** exactly four tabs — Сегодня, Календарь, Задачи, Списки. Not hidden behind the home indicator.
- [ ] **«···» in the header** opens the menu (Копии и данные, Настройки, …); the bottom bar and content do not jump.
- [ ] **Сегодня:** the checklist on top; «Хвосты» folded; «Вечер» link; «Ожидаю от других» at the bottom; the backup chip appears only when a copy is due.
- [ ] **«＋» quick entry:** open it, the keyboard appears and the text field stays visible above it. Type two lines («купить молоко завтра» and «позвонить маме»); both are added; the dates match the message.
- [ ] **A task row:** tap the checkbox (done, tap again to undo); tap «···»: Перенести, Изменить, Сделать событием, Удалить; «Удалить» is readable in light and dark.
- [ ] **Перенести** a task that has a deadline: the deadline stays.
- [ ] **Swipe a row right** to indent it once, left to remove the indent; the page does not scroll sideways; a long press opens the row menu and does not tick the box.
- [ ] **Списки:** the index shows «Купить» and «Дом»; open «Дом», cycle an item through its three states; open a list with categories, fold/unfold one; add an item with the keyboard open.
- [ ] **Templates:** new list from «Супермаркет»; tick two items; the template still shows them unticked.
- [ ] **Календарь:** the compact month; tap a day; add a task and an event; the dots show.
- [ ] **Conversion:** task → event and back; the confirmation names what is lost.
- [ ] **Подготовка** in an event: add two items, tick one, delete one (asks first).
- [ ] **Recurring** (at the bottom of «Задачи»): add «Полить цветы» every 3 days; tick it, the next one appears.
- [ ] **Языки и темы:** «Настройки» → English: every screen English; back to Русский. Dark theme: nothing unreadable. The language does not change when the iPhone language changes.
- [ ] Airplane Mode on, close and reopen the app: it opens with your data. Airplane Mode off.
- [ ] Export a backup and check the file in Files; import it back (preview, «Заменить данные»).

**First install on a new device (once).**
- [ ] Opened from the Home Screen icon, full screen; «Запущено с экрана «Домой»: да», «Офлайн-режим: готов…».
- [ ] Add a task, an event, a list with an item; close the app fully and reopen: all there.
- [ ] «Сохранить копию» → share sheet → «Сохранить в Файлы»; or note that a download happened instead.
- [ ] Note «Постоянное хранилище».

**Quick check for every later version (about 2 minutes).**
- [ ] `tests.html`: all green.
- [ ] «Обновить» → «Копии и данные» shows the new version number; existing data still there.
- [ ] Add, tick and delete a task; create an event; export a backup.
- [ ] Anything the change touched, by hand.

## 6. Running the automated tests yourself

- **Unit tests:** open `tests.html` from the published site (or a local server). They use temporary in-memory data and never touch your real data.
- **The other tests (for developers)** need Python 3 and Playwright (`pip install playwright && playwright install chromium`). Each copies the app into its output folder, so the original files are not changed:
  - `python3 e2e-test.py <app_folder> <output_folder>`
  - `python3 e2e-v5-test.py <app_folder> <output_folder>` (several minutes; set `ONLY=<flow>` to run one flow)
  - `python3 privacy-test.py <app_folder> <output_folder>`
  - `python3 upgrade-test.py <old_version_folder> <new_version_folder> <output_folder>` — run it once for each earlier released version.
  - Do not run two tests with the same output folder at once.
