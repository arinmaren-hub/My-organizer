# TESTING.md — version 0.4.0

## 1. What was actually tested (2026-10-10, by Claude)

**Environment:** headless **Chromium 141** driven by Playwright 1.56 on Linux, iPhone-sized screen (390 × 844, touch), served over local http; a simulated clock where dates matter. The results below are from the final code; the same tests were re-run on the unzipped `organizer-0.4.0.zip` (see the end of this section).

| Test set | Result | Notes |
|---|---|---|
| `tests.html` — unit tests | **251 / 251 passed** in each of four time zones | Europe/Athens, America/Los_Angeles, Pacific/Kiritimati (UTC+14), Pacific/Auckland. Includes ~100 new tests for dates, quick entry, reviews, evening rule, recurrence, waiting, templates, calendar, schema 4 and migrations. |
| `e2e-v4-test.py` — new click-through of the 0.4.0 features | **337 / 337 passed** | Russian and English; quick entry and Task/Event question, editing, calendar (months, year view, date panel, adding), planning day vs real dates, morning/evening reviews and memory, automatic evening overview, waiting, recurring tasks (incl. app closed for weeks), templates, upgrade of old data, language switching, contrast audit in ru/en × light/dark. |
| `e2e-test.py` — earlier click-through (0.3.0 features) | **125 / 125 passed** | Updated only where the screens changed (calendar form, review buttons). |
| `privacy-test.py` — two independent browser contexts | **38 / 38 passed** | Now also fills waiting items, recurring tasks and saved templates for both people; nothing crosses. Server saw only `GET` requests for the app's own files. |
| `upgrade-test.py` — real service-worker update | **47 / 47** for 0.2.0 → 0.4.0, **47 / 47** for 0.2.1 → 0.4.0, **47 / 47** for 0.2.2 → 0.4.0, **46 / 46** for 0.3.0 → 0.4.0 | Two people upgraded side by side from the real old builds. See section 2. |
| Independent code review (a separate agent that did not write the code) | No data-loss defects; 5 wrong-behavior findings in recurrence and quick entry, **all fixed** and covered by new tests | Details below. |

**Review findings (0.4.0) and what was done**
1. *Wrong behavior* — completing a recurring task, undoing, and completing again skipped a date (the removed successor kept its date reserved). **Fixed:** an untouched app-made successor is removed outright; test added.
2. *Wrong behavior* — after a skip, the next date was counted from an old completion and could land in the past. **Fixed:** counted from today; test added.
3. *Wrong behavior* — switching a series from «by completion» to «fixed», or restoring a deleted series, created up to 60 past occurrences. **Fixed:** starts from today; test added.
4. *Wrong behavior* — «as text» in quick entry with a week plan was rejected (not a Monday). **Fixed.**
5. *Wrong behavior* — `1.5 л`, `2/3 cup`, `10.5 euro` were read as dates and removed from the title. **Fixed;** test added.
6. *Minor, fixed:* `confirmOccurrence` accepted non-recurring tasks.
7. *Found by my own browser tests:* a morning decision silenced the evening question for the same day. **Fixed** (`review.part`), covered by unit and browser tests.
8. *Three known minor issues, fixed afterwards at the owner's request (2026-10-10):* (a) editing the quick-entry text while the Task/Event question was open could remove the wrong line — the question is now dropped as soon as the text is edited and asked again on the next submit, so nothing is added or removed by a stale answer (browser test: three lines, edit in the middle, none lost or doubled); (b) past calendar days could show a repeat that was never created — repeats are now shown only from the planning day on; (c) restoring a deleted occurrence of a completion-based series could leave two open occurrences — now an untouched app-made one gives way, and if the other occurrence was changed by you the restore is refused with a message and nothing is lost. Each has a regression test.
*Still known, not changed (minor):* the «capped at 60» notice appears at app start only; a backup file without `dataId` gets a hint but not the second confirmation.

**What the new browser tests proved (examples)**
- App opened with weeks of closed time: fixed repeats appear as «unconfirmed», none is marked done or skipped by itself; each button does exactly what it says; reopening creates no duplicates.
- Completion-based repeat: next date = completion day + interval; month-end and 29 Feb cases are in the unit tests.
- Planning day: with the day ending at 04:00, an evening at 01:30 is still the previous evening for the overview, while events and deadlines keep their real dates.
- Reviews: moving to tomorrow keeps the deadline; «Оставить» keeps the task visible; kept-in-evening tasks are not asked next morning; «Всё на завтра» confirms with the count and moves only the shown tasks.
- Templates: new list from the Supermarket template is unticked; the template is unchanged by edits to the list; a deleted built-in is not recreated until «Вернуть стандартные шаблоны».
- Language switching leaves data untouched; no missing translations; dark and light themes pass the contrast audit on every screen including the new ones.

## 2. Migration test report (release rule R11)

**Supported earlier versions:** prototype (schema 1, key `arina-organizer-v1`), 0.2.0, 0.2.1, 0.2.2 (schema 2), 0.3.0 (schema 3).

**How it was tested.** For each of 0.2.0, 0.2.1, 0.2.2 and 0.3.0, the **real old build** was served and opened in two independent browsers (A and B). Each was given realistic data (80 tasks: day/week/no-date, done with completion times, deadlines, times with reminders, project links, deleted ones; 15 events incl. a weekly repeat rule and an alert; 3 projects with 5 milestones; 3 lists with 8 items; a quarantine entry with an old Russian reason) and then **used through the old interface**: quick add, ticking, adding a list item, export, an import (which made a «перед импортом» copy), a restore (a «перед восстановлением» copy), and a deletion. The new files were then published, the service worker found them, and «Обновить» was tapped — exactly as on an iPhone.

| Checked after the update (A and B, every version) | Result |
|---|---|
| Every task, event, project, list and quarantine entry identical **field by field** (81 / 15 / 3 / 3 / 1); 0.4.0 only adds the new task fields, all at their empty defaults | ✓ |
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

**Also tested (unit and click-through):** prototype → 0.4.0 in one chain, a schema-3 document with every old field upgraded to 4 with no record lost, a week task with a non-Monday date going to quarantine instead of being dropped, the new collections in the lost-records check, backups (v1–v4) and snapshots importing/restoring into 4; earlier: (and from the old key, which is never written); 0.2.x backup import; 0.2.x copy restore; a copy without id; a damaged copy; data from a newer version stays read-only and untouched; the upgrade stops and writes nothing if the upgrade code fails or if any record, title, done state, list item, milestone or quarantine entry would be lost (six cases); no room for the pre-upgrade copy → upgrade stopped, data untouched, original downloadable, «Продолжить обновление без копии» works; old daily copies trimmed (with a message) to make room for the pre-upgrade copy while 0.2.x import copies are kept; a failed save during the upgrade leaves the old data in place and the upgrade repeats next start without a second copy.

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

- **Time-based features on a real clock:** the evening overview and day changes were tested with a simulated clock only. Nothing runs when the app is closed (no notifications by design).
- **Very large organizers** (thousands of tasks, many series) — performance was not measured.

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

**After updating to 0.4.0 (about 15 minutes).** Before updating, save a backup («Данные → Сохранить копию»).
- [ ] `https://…/tests.html` in Safari: «251 из 251 тестов пройдено».
- [ ] In the app: «Доступна новая версия» → «Обновить». The message «Данные переведены в новый формат» appears; then the day questions.
- [ ] Your tasks, events, projects and lists are all there. «Данные → Автокопии» shows «перед обновлением формата данных».
- [ ] Answer the questions (or skip). With a late bedtime, check after midnight that «Сегодня» still shows the previous day and «По календарю: …».
- [ ] «Завершить день» → «Сегодня» moves to the next day → «Вернуть» brings it back.
- [ ] «Настройки» → «Язык» → English: every screen in English; back to Русский.
- [ ] «Данные → О приложении» shows the address your data belongs to.
- [ ] Airplane Mode on, close and reopen the app: it opens with your data. Airplane Mode off.
- [ ] Export a backup and check the file in Files.
- [ ] **Calendar:** open it; swipe nothing — use ‹ › and the month/year choice; tap a date: add a task and an event to it; the dots show; the year view opens a month.
- [ ] **Quick entry:** type «купить молоко завтра» → task for tomorrow, the message names the date; type «встреча в пятницу в 15:30» → «Задача или Событие?» appears; «до пятницы отчёт» → deadline only.
- [ ] **Edit** a task (✎): change the day and the deadline; moving the day leaves the deadline alone.
- [ ] **Morning review:** with an unfinished task from yesterday: choose «Сегодня»; it leaves the list and is not asked again. «Оставить» keeps it visible under «Уже разобрано».
- [ ] **Вечер:** open it by hand; mark one task done, move one to tomorrow; check tomorrow's list. In «Настройки» turn on the evening overview and set a time a few minutes ahead; keep the app open: it opens by itself once.
- [ ] **Ожидаю от других:** add «Посылка» from «Иван» with tomorrow's date; tomorrow a reminder card appears at the top of «Сегодня».
- [ ] **Templates:** «Списки» → new list from «Супермаркет»; tick two items; the template still shows them unticked.
- [ ] **Recurring:** «Задачи» → add «Полить цветы» every 3 days «по выполнению»; tick it: the next one appears 3 days later. Add a weekly «по расписанию» series starting two weeks ago: «Повторы без подтверждения» appears; nothing is marked by itself.
- [ ] Switch to English and to the dark theme: nothing unreadable, no Russian left on the new screens.

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
  - `python3 e2e-v4-test.py <app_folder> <output_folder>` (about 3 minutes; set `ONLY=review` etc. to run one flow)
  - `python3 privacy-test.py <app_folder> <output_folder>`
  - `python3 upgrade-test.py <old_version_folder> <new_version_folder> <output_folder>` — run it once for each earlier released version.
