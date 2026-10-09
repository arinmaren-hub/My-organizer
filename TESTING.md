# TESTING.md — version 0.3.0

## 1. What was actually tested (2026-10-09, by Claude)

**Environment:** headless **Chromium 141** driven by Playwright 1.56 on Linux, iPhone-sized screen (390 × 844, touch), served over local http. Every run below used the files exactly as packed in `organizer-0.3.0.zip`, unzipped into a fresh folder.

| Test set | Result | Notes |
|---|---|---|
| `tests.html` — unit tests | **147 / 147 passed** in each of three time zones | Europe/Athens, America/Los_Angeles (UTC−7), Pacific/Kiritimati (UTC+14). |
| `e2e-test.py` — click-through of the real app | **125 / 125 passed**, 3 runs in a row | Both languages, both themes, planning day with a simulated clock. |
| `privacy-test.py` — two independent browser contexts | **38 / 38 passed** | Logging server received 116 requests, all `GET`, all for the app's own files. |
| `upgrade-test.py` — real update from each earlier version | **47 / 47 passed** for 0.2.2 → 0.3.0, 0.2.1 → 0.3.0 and 0.2.0 → 0.3.0 | Two people upgraded side by side. See the migration report (section 2). |
| Screen-text comparison with 0.2.2 | Only expected changes | Same data on both versions: every 0.2.2 line on every Russian screen is still there, except the new explanation of automatic copies, the schema number (2 → 3) and the save-status lines (the upgrade saved the data). English: **no missing translations** on any screen. |
| Independent review (a separate agent that did not write the code) | No critical defects; 2 major and 4 minor findings, **all fixed** and covered by new tests | See «Review findings» below. |

**Unit tests by group:** Сохранность данных при обновлении 29 · Хранилище 19 · Плановый день 15 · Язык интерфейса 13 · Сбои записи 13 · Схема 11 · Приватность 8 · Оформление 8 · Перенос данных 7 · Даты 7 · Резервные копии 6 · PWA 5 · Выборки 3 · Вечерняя сводка 2 · Безопасность 1.

**New click-through checks in 0.3.0 (all passed):**
- First launch: questions about the day instead of tabs; language choice, Russian selected; nothing written before answering; «Пропустить» → day ends at 00:00 and the questions do not come back.
- First launch with answers: «День заканчивается в» follows the bedtime (01:30); answers saved; changed by hand later in «Настройки» → «Мой день».
- **Planning day at night** (simulated clock, Athens, day ends 03:00): Friday 22:00 shows Friday and «День заканчивается в 03:00»; a 01:00 Saturday event is in Friday's schedule with its real date, a 09:00 Saturday event is not. Saturday 01:30: still Friday, «По календарю: сб, 10 окт» shown, Friday's task **not** overdue; a task added «на сегодня» goes to Friday, with the real creation time. Saturday 03:01: Saturday, Friday's two tasks in the morning review; dates and deadline unchanged.
- **«Завершить день»** asks first, moves to Saturday with Friday's task in the review, changes no data; «Вернуть» goes back; after 03:00 it does not push the day further.
- **Evening cutoff** 23:00 on New Year's Eve: 22:59 → Thu 31 Dec, 23:01 → Fri 1 Jan.
- **English:** header, tabs and page language switch at once; every screen (incl. import preview, backup text, settings) has no missing translation and no Russian interface words; the choice survives a restart; Russian comes back in one tap; switching language leaves data, copies and device info byte-for-byte unchanged.
- **Another organizer's backup** (made in a second browser): warning in the preview; refusing the second question changes nothing (not even a copy is written); accepting replaces the data and keeps the previous data as a rollback copy.
- Export contains the organizer id and no device information. Theme switching also leaves the rollback copies untouched.
- All 0.2.2 checks still pass (quick add, done, events, projects, lists, background redraw while typing, delete/restore, morning review, HTML shown as text, export/import, failed saves, quarantine, damaged data, contrast audit in every theme, offline, update, prototype data, Safari hint, midnight switch).

**Review findings (independent agent) and what was done:**
1. *Major* — rollback copies could be rotated out silently, e.g. after six restores in a row. **Fixed:** an identical state is not copied twice, and before an import or restore rotates out a copy whose data exists nowhere else, the app asks («Хранятся последние 5 копий для отката…»).
2. *Major* — when space ran out, older copies could be removed to make room for another copy, against rule R9; 0.2.x import/restore copies could be trimmed before they were moved. **Fixed:** nothing is removed to make room for a copy (a copy that does not fit is not made, and import/restore then asks); only daily copies are ever trimmed for space; the move of 0.2.x copies is retried on every start; a half-written copies list is put back.
3. *Minor* — an organizer containing only quarantined records got no copies or foreign-backup question. **Fixed:** quarantine counts as content.
4. *Minor* — unreadable prototype data could not be downloaded from the app. **Fixed:** its text is kept in «Повреждённые данные»; readable prototype data also gets a rollback copy.
5. *Minor* — the lost-records check could block a valid upgrade when an invalid duplicate came first. **Fixed** (it now matches any original with that id).
6. *Minor* — after recovery from an old copy the new organizer id was not saved at once. **Fixed.**
The reviewer also checked the planning day for every minute of 2026 in 7 time zones with 14 cutoffs (incl. daylight-saving nights): the day changed exactly once per day and never went backwards.

## 2. Migration test report (release rule R11)

**Supported earlier versions:** prototype (schema 1, key `arina-organizer-v1`), 0.2.0, 0.2.1, 0.2.2 (schema 2).

**How it was tested.** For each of 0.2.0, 0.2.1 and 0.2.2, the **real old build** was served and opened in two independent browsers (A and B). Each was given realistic data (80 tasks: day/week/no-date, done with completion times, deadlines, times with reminders, project links, deleted ones; 15 events incl. a weekly repeat rule and an alert; 3 projects with 5 milestones; 3 lists with 8 items; a quarantine entry with an old Russian reason) and then **used through the old interface**: quick add, ticking, adding a list item, export, an import (which made a «перед импортом» copy), a restore (a «перед восстановлением» copy), and a deletion. The new files were then published, the service worker found them, and «Обновить» was tapped — exactly as on an iPhone.

| Checked after the update (A and B, every version) | Result |
|---|---|
| Every task, event, project, list and quarantine entry identical **field by field** (81 / 15 / 3 / 3 / 1) | ✓ |
| Evening-preview settings and document dates unchanged; done, deadlines, deleted records, repeat rule present | ✓ |
| The exact original text kept as a rollback copy («перед обновлением формата данных») | ✓ byte-for-byte |
| Every copy made by the old version still present (daily in daily copies, import/restore in rollback copies) | ✓ |
| No storage key removed; appearance and last-backup date untouched | ✓ |
| «Данные переведены в новый формат» message; the day questions asked once | ✓ |
| A's storage contains nothing of B's and vice versa | ✓ |
| A second window still running the old version goes read-only and writes nothing | ✓ |
| After answering the questions and restarting: records still identical; the pre-upgrade copy not duplicated | ✓ |
| Restoring the pre-upgrade copy returns every record exactly as in the old version, without asking the day questions again | ✓ |
| The old offline cache replaced by the new one; the app opens offline with the same data | ✓ |

**Also tested (unit and click-through):** prototype → 0.3.0 in one chain (and from the old key, which is never written); 0.2.x backup import; 0.2.x copy restore; a copy without id; a damaged copy; data from a newer version stays read-only and untouched; the upgrade stops and writes nothing if the upgrade code fails or if any record, title, done state, list item, milestone or quarantine entry would be lost (six cases); no room for the pre-upgrade copy → upgrade stopped, data untouched, original downloadable, «Продолжить обновление без копии» works; old daily copies trimmed (with a message) to make room for the pre-upgrade copy while 0.2.x import copies are kept; a failed save during the upgrade leaves the old data in place and the upgrade repeats next start without a second copy.

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
- Add to Home Screen, the installed-app look, and offline use **on iOS**; the update flow on iOS.
- The **iOS share sheet** for backups (the download fallback was tested).
- Whether iOS grants **persistent storage**.
- Hosting on **GitHub Pages** (a local server stood in for it).
- Real overnight use: the planning day was tested with a simulated clock.

These are exactly what the checklists below cover.

## 4. Release gate (every version — `DECISIONS.md` E12)

A version is **not published** unless every line is ticked:
- [ ] `tests.html` all green (ideally also in a second time zone).
- [ ] `e2e-test.py` all passed.
- [ ] `privacy-test.py` all passed (two independent browser contexts).
- [ ] `upgrade-test.py` all passed **from every supported earlier version** (keep a copy of each released ZIP for this).
- [ ] Section 2 updated: migration report and remaining data-loss risks.
- [ ] `version.js` and `sw.js` versions equal; `CHANGELOG.md` updated; `DECISIONS.md` / `SECURITY.md` updated if a rule changed.
- [ ] If any migration or isolation check fails: **stop**, do not publish.

## 5. On the iPhone

**After installing 0.3.0 (about 10 minutes).** Before updating, save a backup («Данные → Сохранить копию»).
- [ ] `https://…/tests.html` in Safari: «147 из 147 тестов пройдено».
- [ ] In the app: «Доступна новая версия» → «Обновить». The message «Данные переведены в новый формат» appears; then the day questions.
- [ ] Your tasks, events, projects and lists are all there. «Данные → Автокопии» shows «перед обновлением формата данных».
- [ ] Answer the questions (or skip). With a late bedtime, check after midnight that «Сегодня» still shows the previous day and «По календарю: …».
- [ ] «Завершить день» → «Сегодня» moves to the next day → «Вернуть» brings it back.
- [ ] «Настройки» → «Язык» → English: every screen in English; back to Русский.
- [ ] «Данные → О приложении» shows the address your data belongs to.
- [ ] Airplane Mode on, close and reopen the app: it opens with your data. Airplane Mode off.
- [ ] Export a backup and check the file in Files.

**First install on a new device (once).**
- [ ] Opened from the Home Screen icon, full screen; «Запущено с экрана «Домой»: да», «Офлайн-режим: готов…».
- [ ] Add a task, an event, a project with a milestone, a list with an item; close the app fully and reopen: all there.
- [ ] «Сохранить копию» → share sheet → «Сохранить в Файлы» → iCloud Drive; or note that a download happened instead.
- [ ] Import that file back: preview, «Заменить данные» works.
- [ ] «Тёмное» / «Как в системе» readable everywhere; note «Постоянное хранилище».

**Quick check for every later version (about 2 minutes).**
- [ ] `tests.html`: all green.
- [ ] «Обновить» → «Данные» shows the new version number; existing data still there.
- [ ] Add, tick and delete a task; create an event; export a backup.
- [ ] Anything the change touched, by hand.

## 6. Running the automated tests yourself

- **Unit tests:** open `tests.html` from the published site (or a local server). They use temporary in-memory data and never touch your real data.
- **The other tests (for developers)** need Python 3 and Playwright (`pip install playwright && playwright install chromium`). Each copies the app into its output folder, so the original files are not changed:
  - `python3 e2e-test.py <app_folder> <output_folder>`
  - `python3 privacy-test.py <app_folder> <output_folder>`
  - `python3 upgrade-test.py <old_version_folder> <new_version_folder> <output_folder>` — run it once for each earlier released version.
