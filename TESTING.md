# TESTING.md — version 0.9.0

## 1. What was actually tested (2026-11-18, by Claude)

**Environment:** headless **Chromium 153** driven by **Playwright 1.63** on Linux. The screen was iPhone-sized (390 × 844, touch), plus 320 px for narrow checks, served from a local http server with a simulated clock (Friday 9 October 2026; the upgrade test uses the real clock). **Only Chromium was used: no WebKit, no Safari, no real iPhone or iPad.**

All results are from the final code:

| Test set | Result | Notes |
|---|---|---|
| `tests.html` unit tests | **390 / 390** in each of five time zones | UTC, America/Los_Angeles, Pacific/Kiritimati, Pacific/Auckland, Europe/Athens. 13 new tests for 0.9.0 cover: repeat words (weekdays in any form, «по …ам», будни/выходные, «каждые N дней/недель/месяцев», «раз в неделю», «ежедневно/ежемесячно», end dates 21/12, 21.12.27, 21 декабря 2026); lines without repeat words read as before («в пятницу», «до 21/12» is still a deadline); the end date without a year; a typed rule giving a task on each of its days and none after the end; a line with a time becoming a repeating event or a task with a time; «Завтра» as the start; «Это и все следующие» for events (the rule ends the day before, edited ones go to «Удалённые», nothing new appears), from the first time (the whole rule and the original event), and for tasks (finished ones stay); English fallback. |
| `e2e-v9-test.py`, new 0.9.0 click-through (**Russian only**) | **105 / 105** | Real browser. Typing «Тренировка в зале каждый вторник, четверг и субботу до 21/12» plus another line: the message, the rule, the clean title, the other line a normal task, the Calendar showing Tuesdays ahead and not Wednesdays, the task appearing on Saturday, nothing after 21 December. A line with a time: the question names the rule; «Событие» gives Mondays and Wednesdays. The repeating event's card: «Изменить», «Изменить повтор», «Удалить», no «Сделать задачей». The delete choice: «Это и все следующие» (no extra dialog), «Только это» with Undo, «Весь повтор» on the first time. «Удалить» directly in an ordinary event's card and in the task editor (with the usual confirmation). The menu of a repeating event (no «Сделать задачей»; «Удалить» asks the same). A repeating task from its editor. Contrast and overflow on 5 screens × light/dark × 390/320 px, with no «↻». Offline, including typing a repeat without network. |
| `e2e-v8-test.py`, 0.8.x click-through | **139 / 139** | |
| `e2e-v7-test.py`, 0.7.0 click-through | **276 / 276** | |
| `e2e-v6-test.py`, 0.6.0 click-through | **350 / 350** | 4 checks first failed, because deleting one time of a repeating event now asks «Только это / Это и все следующие». The test now chooses «Только это», and that flow was re-run: 26 / 26. |
| `e2e-v5-test.py`, 0.5.x click-through | **725 / 725** | |
| `e2e-test.py`, legacy scenario | **125 / 125** | |
| `privacy-test.py` | **38 / 38** | The server saw only `GET` requests for the app's own files. |
| `upgrade-test.py`: real service-worker update, two people side by side | **0.8.1: 45 / 45** (same data format; an open 0.8.1 window keeps working); 0.7.0: 47 / 47; 0.6.0: 47 / 47; 0.5.2: 47 / 47; 0.5.0: 47 / 47; 0.4.0: 46 / 46; 0.3.0: 46 / 46; 0.2.2, 0.2.1, 0.2.0: 47 / 47 → 0.9.0 | The three 0.2.x runs first failed one step. Run after 21:00, the app opened the evening overview by itself (that person has it on at 21:00), so the test's «＋» was hidden. This was the test's own timing, not an app fault: the test now goes to «Сегодня» first, and those three runs were repeated. |

**English:** paused. New screens were tested in Russian only.

**Not run:** no independent reviewer agent was started. `e2e-v4-test.py` is kept for history only and is not part of the gate. After packing, the unzipped package was re-checked (see the delivery message).

**Known limits:**
- Repeat words are Russian only. An unusual phrasing is not understood and stays in the title; the message after adding shows what was understood.
- A rule typed in «Новые дела» uses the calendar rhythm. «От выполнения» is still set in «Изменить повтор».
- «Это и все следующие» has no Undo: the choice is the confirmation. Edited occurrences, the original record and a whole deleted rule can be restored from «Удалённые» for 30 days.

## 2. Migration test report (release rule R11)

0.9.0 keeps schema 7 (nothing is converted from 0.8.x). **0.8.0 added schema 7** (two optional fields: `series.days` and `seriesOrigin`; nothing in existing records changes; a rollback copy is taken automatically on migration). Before it, 0.7.0 added schema 6 (`goals`). The table below was first written for 0.5.0, and the same checks were re-run for 0.7.0 from every earlier release, 0.2.0 → 0.7.0 (section 1: all passed). An older app, 0.7.0 included, opens schema 7 data read-only: without this, 0.7.0 would make the wrong dates for a rule with several weekdays.


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
- **0.9.0 on a real device:** typing repeat words with the iPhone keyboard (autocorrect may change «вт» or «21/12»); the delete choice under a finger.
- **0.8.0 on a real device:** the «Сегодня / Завтра» switch with the iPhone keyboard open; the radio buttons and weekday chips under a finger; the date field «До какого дня».
- **Goals on a real device:** the keyboard over the goal and step sheets, long press on a step, links in notes opening from the installed app.
- **Cleanup on a real device:** share sheet for the backup and the real storage savings (only Chromium simulated).
- **Very large organizers** (thousands of tasks) — performance not measured.

## 4. Release gate (every version — `DECISIONS.md` E12)

A version is **not published** unless every line is ticked:
- [ ] `tests.html` all green (ideally also in a second time zone).
- [ ] `e2e-test.py` and `e2e-v5-test.py` … `e2e-v9-test.py` all passed.
- [ ] `privacy-test.py` all passed (two independent browser contexts).
- [ ] `upgrade-test.py` all passed **from every supported earlier version** (keep a copy of each released ZIP for this).
- [ ] Section 2 updated: migration report and remaining data-loss risks.
- [ ] `version.js` and `sw.js` versions equal; `CHANGELOG.md` updated; `DECISIONS.md` / `SECURITY.md` updated if a rule changed.
- [ ] If any migration or isolation check fails: **stop**, do not publish.

## 5. On the iPhone (manual — NOT done by me)

**Before updating to 0.9.0:** «Копии и данные → Сохранить копию».

**After updating (about 10 minutes).**
- [ ] `https://…/tests.html` in Safari shows «390 из 390 тестов пройдено».
- [ ] «Обновить» → ⚙ → «Копии и данные» shows 0.9.0. Coming from 0.8.x, nothing is converted.
- [ ] **Repeat in words:** «＋» → «Тренировка в зале каждый вторник, четверг и субботу до 21/12» → «Добавить». A message says «каждую неделю: вт, чт, сб, до … 21 дек». In the Calendar the coming Tuesdays, Thursdays and Saturdays show it. On the next of those days it is in «Сегодня».
- [ ] With a time, «… в 20:44»: the question names the rule. «Событие» puts the events in the Calendar.
- [ ] Watch autocorrect: «вт», «чт» or «21/12» must stay as typed.
- [ ] **Delete all at once:** Календарь → a repeating event → «Удалить» (right in the card) → «Это и все следующие». That time and all later ones disappear; earlier ones stay. From the first time the button reads «Весь повтор».
- [ ] «Удалить» → «Только это»: one time is removed, and «Отменить» brings it back.
- [ ] A repeating event's card has no «Сделать задачей».
- [ ] An ordinary event or task: «Удалить» is in the card or editor and asks for confirmation.
- [ ] Light/dark: the delete choice is readable.

**Quick check for every later version (about 2 minutes).** `tests.html` is green; «Обновить» shows the new version; add a task for tomorrow; open one goal; export a backup.

## 6. Running the automated tests yourself

- **Unit tests:** open `tests.html` from the published site (or a local server). They use temporary in-memory data and never touch your real data.
- **The other tests (for developers)** need Python 3 and Playwright (`pip install playwright && playwright install chromium`). Each copies the app into its output folder, so the original files are not changed:
  - `python3 e2e-test.py <app_folder> <output_folder>`
  - `python3 e2e-v5-test.py <app_folder> <output_folder>` (several minutes; set `ONLY=<flow>` to run one flow)
  - `python3 e2e-v6-test.py <app_folder> <output_folder>`
  - `python3 e2e-v7-test.py <app_folder> <output_folder>`
  - `python3 e2e-v8-test.py <app_folder> <output_folder>` (Russian only)
  - `python3 e2e-v9-test.py <app_folder> <output_folder>` (Russian only)
  - `python3 privacy-test.py <app_folder> <output_folder>`
  - `python3 upgrade-test.py <old_version_folder> <new_version_folder> <output_folder>` — run it once for each earlier released version.
  - Do not run two tests with the same output folder at once.
