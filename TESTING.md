# TESTING.md — version 0.6.0

## 1. What was actually tested (2026-10-11, by Claude)

**Environment:** headless **Chromium 141** driven by **Playwright 1.56** on Linux, iPhone-sized screen (390 × 844, touch; 320 px for a narrow check), local http server, simulated clock where dates matter. **Only Chromium. No WebKit, no Safari, no real iPhone or iPad.** Swipe, long-press, keyboard and safe-area behaviour were simulated, not felt on a device.

Results are from the final code, in one run after the last code change:

| Test set | Result | Notes |
|---|---|---|
| `tests.html` unit tests | **340 / 340** in each of five time zones | UTC, America/Los_Angeles, Pacific/Kiritimati (UTC+14), Pacific/Auckland, Europe/Athens. About 32 new tests for 0.6.0: search, week boundaries, recurrence (end date, nth weekday, last, skip, event series), undo guards, cleanup eligibility/protection/removal, schema 5, RU/EN key parity. |
| `e2e-v6-test.py` — new 0.6.0 click-through | **350 / 350** | Real browser. Tasks screen (No Date, This Week, Later), week boundaries on Sunday/Monday, «+» multi-line, search and highlight, Calendar history, undo (tick, move, delete, list item, event item), recurring events and old series, list search and multi-add, cleanup reminder / review / grace / bulk / keep, persistence after reload, offline, Russian and English × light and dark contrast audit, 320 px layout. |
| `e2e-v5-test.py` — 0.5.x click-through (adapted to the new Tasks screen) | **723 / 723** | Expectations changed on purpose: schema 5, finished tasks leave Tasks, unfinished prep items first, 5-item list menu. |
| `e2e-test.py` — legacy scenario | **125 / 125** | |
| `privacy-test.py` | **38 / 38** | Server saw only `GET` requests for the app's own files. |
| `upgrade-test.py` — real service-worker update, two people side by side | 0.2.0, 0.2.1, 0.2.2: **47 / 47**; 0.3.0: **46 / 46**; 0.4.0: **46 / 46**; 0.5.0: **47 / 47**; **0.5.2: 47 / 47** → 0.6.0 | Includes: records identical field by field, automatic pre-upgrade rollback copy (schema 4 → 5), an old window going read-only on newer data. |

**Not run by me:** an independent reviewer agent (none was started); the final ZIP contents are re-checked after packing (see the delivery message).

**Mistakes found by these tests and fixed before release** (each has a regression test): review checkboxes not selecting; disabled danger button failing contrast; monthly «n-th» select overflowing 390 px; cut-off date shown without a year; undo guard not detecting an unchanged-timestamp edit; Cyrillic regex in code; backup asked twice in a row on cleanup (30-minute grace added).

**Known limits (also in DECISIONS B14 and SECURITY 4a):**
- Repeating events are created ahead for **400 days**, never in the past; later occurrences appear as time passes.
- After a confirmed cleanup, the app's older automatic daily/rollback copies on the same device still contain the removed records until they rotate out (5 days / latest 5). The external backup you saved is the full history.
- Storage sizes in the cleanup screen are an **estimate**.
- Cleanup never touches series occurrences, unfinished items, future events, Home/Buy, templates, or anything marked «Keep».

## 2. Migration test report (release rule R11)

**0.6.0 adds schema 5** (new optional fields only; automatic rollback copy on migration). The table below was written for 0.5.0 and the same checks were re-run for 0.6.0 (see section 1: 0.2.0 → 0.5.2 all passed). Older apps open schema 5 data read-only.


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
- **Cleanup on a real device:** share sheet for the backup and the real storage savings (only Chromium simulated).
- **Very large organizers** (thousands of tasks) — performance not measured.

## 4. Release gate (every version — `DECISIONS.md` E12)

A version is **not published** unless every line is ticked:
- [ ] `tests.html` all green (ideally also in a second time zone).
- [ ] `e2e-test.py` and `e2e-v5-test.py` and `e2e-v6-test.py` all passed.
- [ ] `privacy-test.py` all passed (two independent browser contexts).
- [ ] `upgrade-test.py` all passed **from every supported earlier version** (keep a copy of each released ZIP for this).
- [ ] Section 2 updated: migration report and remaining data-loss risks.
- [ ] `version.js` and `sw.js` versions equal; `CHANGELOG.md` updated; `DECISIONS.md` / `SECURITY.md` updated if a rule changed.
- [ ] If any migration or isolation check fails: **stop**, do not publish.

## 5. On the iPhone (manual — NOT done by me)

**Before updating to 0.6.0:** «Данные → Сохранить копию» and keep the file outside the app.

**After updating (about 25 minutes).**
- [ ] `https://…/tests.html` in Safari: «340 из 340 тестов пройдено».
- [ ] «Доступна новая версия» → «Обновить». All tasks, events, lists still there. ⚙ → «Копии и данные» shows 0.6.0; a rollback copy «перед обновлением формата данных» exists.
- [ ] Four tabs, ⚙ gear, ＋ button unchanged.
- [ ] **Задачи:** «Без даты» on top with a small «＋»; tap it, type three lines, save: three tasks appear under «Без даты», the field closes. Below: «На этой неделе» by day (Mon–Sun; check on a Sunday and a Monday), then folded «Позже». No finished past tasks. Past unfinished are still in «Хвосты».
- [ ] **Search (🔍 in the Задачи header):** type «ужин»; results update while typing, newest first, tasks and events labelled. Tap a dated result: Calendar opens on that day and the exact record is briefly highlighted. Tap an undated task: the editor opens. The keyboard stays up while typing.
- [ ] **Calendar history:** open a past day; finished tasks and past events are there.
- [ ] **Undo:** tick a task → small «Отменить» appears for a few seconds → tap: unticked. Same for move to another date and for deleting a task, an event and a list item. Make another change before tapping Undo: the old undo must not overwrite it.
- [ ] **Recurring:** new rule with an end date; «2-й вторник месяца»; a repeating **event**; delete one occurrence (it stays skipped); old repeating tasks continue as before.
- [ ] **Lists:** search inside an opened list; add several items with one per line; event «Подготовка»: unfinished above finished, untick restores the order.
- [ ] **Cleanup (⚙ → cleanup):** open it; see totals and cut-off date; «Keep» on an old record protects it. «Сохранить копию» → file saved in Files. «Проверить» → select one record → remove. «Удалить все старые» → totals, cut-off, warning, tick the confirmation box, confirm; those records are gone from Calendar and Search; unfinished tasks, future events, Home/Buy and templates remain. The reminder card should not appear on the day you update; test "Remind me in a month" hides it.
- [ ] Languages and themes: Русский/English, light/dark: nothing unreadable.
- [ ] Airplane Mode: close and reopen: opens with your data.
- [ ] Export a backup, check the file in Files, import it back (preview first).

**Quick check for every later version (about 2 minutes).** `tests.html` green; «Обновить» shows the new version; add, tick, delete a task; export a backup.

## 6. Running the automated tests yourself

- **Unit tests:** open `tests.html` from the published site (or a local server). They use temporary in-memory data and never touch your real data.
- **The other tests (for developers)** need Python 3 and Playwright (`pip install playwright && playwright install chromium`). Each copies the app into its output folder, so the original files are not changed:
  - `python3 e2e-test.py <app_folder> <output_folder>`
  - `python3 e2e-v5-test.py <app_folder> <output_folder>` (several minutes; set `ONLY=<flow>` to run one flow)
  - `python3 e2e-v6-test.py <app_folder> <output_folder>`
  - `python3 privacy-test.py <app_folder> <output_folder>`
  - `python3 upgrade-test.py <old_version_folder> <new_version_folder> <output_folder>` — run it once for each earlier released version.
  - Do not run two tests with the same output folder at once.
