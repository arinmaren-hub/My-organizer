# TESTING.md — version 0.8.0

## 1. What was actually tested (2026-11-18, by Claude)

**Environment:** headless **Chromium 153** driven by **Playwright 1.63** on Linux. The screen was iPhone-sized (390 × 844, touch), plus 320 px for narrow checks, served from a local http server with a simulated clock (Friday 9 October 2026). **Only Chromium was used: no WebKit, no Safari, no real iPhone or iPad.** Long press, the keyboard and safe areas were simulated, not tried on a device.

All results come from one run on the final code, after the last code change:

| Test set | Result | Notes |
|---|---|---|
| `tests.html` unit tests | **377 / 377** in each of five time zones | UTC, America/Los_Angeles, Pacific/Kiritimati (UTC+14), Pacific/Auckland, Europe/Athens. 17 new tests for 0.8.0 cover: the upgrade from 0.7.0 (schema 6 → 7); checking weekday lists and the «origin» flag; dates for several weekdays (every week, every 2 weeks, a start mid-week, an end date, across New Year); repeating events on Mon and Thu; weekdays turning a «from completion» rule into a calendar one; changing weekdays keeping hand-edited events; «Повторять» on an event (no duplicate, time, end and preparation kept, cannot be repeated twice, own weekday always included); deleting, restoring or changing the rule never removing the original event or task; «Повторять» on an undated task and on an old one (no backfill); «Завтра» with dates written in the line winning; English fallback for the new texts. |
| `e2e-v8-test.py`, new 0.8.0 click-through (**Russian only**) | **111 / 111** | Real browser. «Сегодня / Завтра»: default, switching keeps the text and focus, lines go to tomorrow, a written date wins, a line with a time asks on tomorrow's date, it starts on «Сегодня» again, it is shown from the Calendar only for today. «Повторять» on an event: the choices, the locked own weekday, ticking a weekday choosing «По дням недели», the card afterwards («↻ Повторяется», «Изменить повтор»), no duplicate, Thursdays and Mondays created, the rule editor's chips and showing/hiding by frequency, persistence after reload. «Повторять» on a task: from the editor and from the long-press menu; deleting the rule keeping the task. A new rule from «Задачи» on Tue and Fri. Contrast and overflow on 7 screens × light/dark × 390/320 px. Offline. |
| `e2e-v7-test.py`, 0.7.0 click-through | **276 / 276** | Only the schema number and the newer-data version changed. |
| `e2e-v6-test.py`, 0.6.0 click-through | **350 / 350** | Schema 7. |
| `e2e-v5-test.py`, 0.5.x click-through | **725 / 725** | Schema 7. |
| `e2e-test.py`, legacy scenario | **125 / 125** | Backup schema 7. |
| `privacy-test.py` | **38 / 38** | The server saw only `GET` requests for the app's own files. |
| `upgrade-test.py`: real service-worker update, two people side by side | **0.7.0: 47 / 47**; 0.6.0: 47 / 47; 0.5.2: 47 / 47; 0.5.0: 47 / 47; 0.4.0: 46 / 46; 0.3.0: 46 / 46; 0.2.2, 0.2.1, 0.2.0: 47 / 47 → 0.8.0 | Records identical field by field; a rollback copy before the migration; a window still running an older version (0.7.0 included) becomes read-only and writes nothing. |

**English:** paused by the owner. New screens were tested in Russian only. The older suites still run their English checks, which passed.

**Not run:** no independent reviewer agent was started. `e2e-v4-test.py` is kept only for history: its expectations predate 0.5.0, and it is not part of the gate. After packing, the unzipped package was re-checked (see the delivery message).

**Problems found while building and fixed before release:**
- Switching «Сегодня / Завтра» redrew the whole sheet, so it slid in again and the keyboard closed. It now changes in place.
- The yearly choice showed a weekday («пн, 12 окт»); it now reads «12 октября».
- «Добавить» wrapped under the switch on a 390 px screen.
- In the rule editor, «Закончить после» and «Конец» overlapped.
- Deleting and then restoring a rule could make a second task on the original task's date. That date is now remembered as taken.

**Known limits:**
- «Повторять» offers the common rules only. «2-й вторник месяца», «от выполнения» and the end time are in «Изменить повтор».
- A task without a date gets today's date when it starts repeating; a task planned for a week (not a day) also starts today.
- Everything listed for 0.6.0 and 0.7.0 still applies: repeating events are created 400 days ahead; steps of goals have no dates.

## 2. Migration test report (release rule R11)

**0.8.0 adds schema 7** (two optional fields: `series.days` and `seriesOrigin`; nothing in existing records changes; a rollback copy is taken automatically on migration). Before it, 0.7.0 added schema 6 (`goals`). The table below was first written for 0.5.0, and the same checks were re-run for 0.7.0 from every earlier release, 0.2.0 → 0.7.0 (section 1: all passed). An older app, 0.7.0 included, opens schema 7 data read-only: without this, 0.7.0 would make the wrong dates for a rule with several weekdays.


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
- **0.8.0 on a real device:** the «Сегодня / Завтра» switch with the iPhone keyboard open; the radio buttons and weekday chips under a finger; the date field «До какого дня».
- **Goals on a real device:** the keyboard over the goal and step sheets, long press on a step, links in notes opening from the installed app.
- **Cleanup on a real device:** share sheet for the backup and the real storage savings (only Chromium simulated).
- **Very large organizers** (thousands of tasks) — performance not measured.

## 4. Release gate (every version — `DECISIONS.md` E12)

A version is **not published** unless every line is ticked:
- [ ] `tests.html` all green (ideally also in a second time zone).
- [ ] `e2e-test.py`, `e2e-v5-test.py`, `e2e-v6-test.py`, `e2e-v7-test.py` and `e2e-v8-test.py` all passed.
- [ ] `privacy-test.py` all passed (two independent browser contexts).
- [ ] `upgrade-test.py` all passed **from every supported earlier version** (keep a copy of each released ZIP for this).
- [ ] Section 2 updated: migration report and remaining data-loss risks.
- [ ] `version.js` and `sw.js` versions equal; `CHANGELOG.md` updated; `DECISIONS.md` / `SECURITY.md` updated if a rule changed.
- [ ] If any migration or isolation check fails: **stop**, do not publish.

## 5. On the iPhone (manual — NOT done by me)

**Before updating to 0.8.0:** «Копии и данные → Сохранить копию», and keep the file outside the app.

**After updating (about 15 minutes).**
- [ ] `https://…/tests.html` in Safari shows «377 из 377 тестов пройдено».
- [ ] «Доступна новая версия» → «Обновить». Everything is still there. ⚙ → «Копии и данные» shows 0.8.0 and a copy «перед обновлением формата данных».
- [ ] **«Новые дела» in the evening:** «＋» → under the field are «Сегодня | Завтра» (with «Сегодня» chosen) and «На …». Type two lines, tap «Завтра»: the text stays, the keyboard stays up, and «На …» shows tomorrow. «Добавить» puts both on tomorrow. Open «＋» again: it is back on «Сегодня».
- [ ] With «Завтра» chosen, a line «… в пятницу» still goes to Friday.
- [ ] After midnight but before your «день заканчивается в» time, «Завтра» is the calendar today (your day has not ended yet).
- [ ] **Иконопись:** Календарь → the lesson's day → the lesson → **«Повторять»** → «Каждую неделю, по понедельникам» → «Повторять». The card shows «↻ Повторяется: каждую неделю». The next Mondays have the lesson, and there is still only one lesson on the first day. Its «Подготовка» is untouched.
- [ ] «Повторять» → «По дням недели»: the event's own day is ticked and cannot be unticked; tick another day → «Повторять». Both weekdays get the event.
- [ ] «Изменить повтор»: the rule editor shows the weekday chips. Change to «Каждые 2 недели» → «Сохранить».
- [ ] A task: tap it → «Повторять» → «Каждый день». Tomorrow a new one appears, and there is no copy today.
- [ ] Long press on a task or event: «Повторять» is in the menu.
- [ ] Задачи → «Повторяющиеся задачи» → «···» on that rule → «Удалить»: the original task or event stays, as an ordinary one.
- [ ] Light/dark: the switch, the chips and the radio buttons are readable.
- [ ] Airplane Mode: close and reopen the app; «＋» still shows «Сегодня | Завтра».
- [ ] The 0.7.0 items (goals) and 0.6.0 items still apply: repeat them quickly if those versions were never checked on the iPhone.

**Quick check for every later version (about 2 minutes).** `tests.html` is green; «Обновить» shows the new version; add a task for tomorrow; open one goal; export a backup.

## 6. Running the automated tests yourself

- **Unit tests:** open `tests.html` from the published site (or a local server). They use temporary in-memory data and never touch your real data.
- **The other tests (for developers)** need Python 3 and Playwright (`pip install playwright && playwright install chromium`). Each copies the app into its output folder, so the original files are not changed:
  - `python3 e2e-test.py <app_folder> <output_folder>`
  - `python3 e2e-v5-test.py <app_folder> <output_folder>` (several minutes; set `ONLY=<flow>` to run one flow)
  - `python3 e2e-v6-test.py <app_folder> <output_folder>`
  - `python3 e2e-v7-test.py <app_folder> <output_folder>`
  - `python3 e2e-v8-test.py <app_folder> <output_folder>` (Russian only)
  - `python3 privacy-test.py <app_folder> <output_folder>`
  - `python3 upgrade-test.py <old_version_folder> <new_version_folder> <output_folder>` — run it once for each earlier released version.
  - Do not run two tests with the same output folder at once.
