# TESTING.md — version 0.7.0

## 1. What was actually tested (2026-11-15, by Claude)

**Environment:** headless **Chromium 153** driven by **Playwright 1.63** on Linux. The screen was iPhone-sized (390 × 844, touch), plus 320 px for a narrow check, served from a local http server with a simulated clock where dates matter. **Only Chromium was used: no WebKit, no Safari, no real iPhone or iPad.** Swipe, long press, the keyboard and safe areas were simulated, not tried on a device.

All results come from one run on the final code, after the last code change:

| Test set | Result | Notes |
|---|---|---|
| `tests.html` unit tests | **360 / 360** in each of five time zones | UTC, America/Los_Angeles, Pacific/Kiritimati (UTC+14), Pacific/Auckland, Europe/Athens. 20 new tests for 0.7.0 cover: the upgrade from 0.6.0 (schema 5 → 6), newer data staying read-only, checking goals and quarantining a single step, the lost-records check for steps, creating goals, ticking and undoing steps, moving steps (deleted ones ignored), deleting and restoring steps and goals, goal reached, pause, steps never getting dates or turning into «хвосты» as days pass, goals not touching tasks, the 30-day purge, search, backup round trip, cleanup never touching goals, counts, and note links/escaping. |
| `e2e-v7-test.py`, new 0.7.0 click-through | **276 / 276** | Real browser, Russian and English. Covers: five tabs; creating a goal with steps; the next-step marker; ticking with Undo; the note (link opens outside the app, typed HTML shown as text); adding steps; ↑/↓ and renaming; deleting a step with Undo; long press on a step; progress on the index; persistence after reload. «Шаги к целям» in Задачи: its place, folded by default, the hint text, ticking with Undo, a tap opening the goal with the step highlighted, pause and resume. Goal reached, the «Достигнутые» fold, deleting a goal with Undo, restoring from «Удалённые», search for goals, notes and steps, read-only on newer data, offline. A contrast and overflow audit covered 11 screens × RU/EN × light/dark, and a 320 px check covered nav labels and goal screens. |
| `e2e-v6-test.py`, 0.6.0 click-through | **350 / 350** | Only the schema number changed (5 → 6). |
| `e2e-v5-test.py`, 0.5.x click-through | **725 / 725** | Five tabs instead of four; schema 6. |
| `e2e-test.py`, legacy scenario | **125 / 125** | Five tabs; backup schema 6. |
| `privacy-test.py` | **38 / 38** | The server saw only `GET` requests for the app's own files. |
| `upgrade-test.py`: real service-worker update, two people side by side | **0.6.0: 47 / 47**; 0.5.2: 47 / 47; 0.5.0: 47 / 47; 0.4.0: 46 / 46; 0.3.0: 46 / 46; 0.2.2, 0.2.1, 0.2.0: 47 / 47 → 0.7.0 | Checks that records are identical field by field, that `goals` is empty, that a rollback copy is taken before the migration, and that a window still running the old version (including 0.6.0) becomes read-only and writes nothing. |

**Not run:** no independent reviewer agent was started. After packing, the unzipped package was re-checked (see the delivery message).

**Problems found while building and fixed before release:** step rows briefly had divider lines (now none, like task rows); the step sheet repeated «Шаг» as its title (it now shows the goal's name); search order between two goals was alphabetical (a goal matched by its name now comes before one matched only in its note). One pre-existing bug was also fixed: «Удалённые» showed technical keys for deleted repeating rules, waiting items and templates.

**Known limits:**
- Steps have no dates or reminders. This is on purpose (DECISIONS B15).
- Links in notes are not checked or previewed; a tap opens them outside the app.
- Everything listed for 0.6.0 still applies: repeating events are created 400 days ahead; older safety copies keep cleaned records until they rotate out; storage sizes are estimates.

## 2. Migration test report (release rule R11)

**0.7.0 adds schema 6** (one new collection, `goals`; nothing in existing records changes; a rollback copy is taken automatically on migration). The table below was first written for 0.5.0, and the same checks were re-run for 0.7.0 from every earlier release, 0.2.0 → 0.6.0 (section 1: all passed). An older app, 0.6.0 included, opens schema 6 data read-only: without this, 0.6.0 would silently drop the goals when saving.


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
- **Goals on a real device:** the keyboard over the goal and step sheets, long press on a step, links in notes opening from the installed app.
- **Cleanup on a real device:** share sheet for the backup and the real storage savings (only Chromium simulated).
- **Very large organizers** (thousands of tasks) — performance not measured.

## 4. Release gate (every version — `DECISIONS.md` E12)

A version is **not published** unless every line is ticked:
- [ ] `tests.html` all green (ideally also in a second time zone).
- [ ] `e2e-test.py`, `e2e-v5-test.py`, `e2e-v6-test.py` and `e2e-v7-test.py` all passed.
- [ ] `privacy-test.py` all passed (two independent browser contexts).
- [ ] `upgrade-test.py` all passed **from every supported earlier version** (keep a copy of each released ZIP for this).
- [ ] Section 2 updated: migration report and remaining data-loss risks.
- [ ] `version.js` and `sw.js` versions equal; `CHANGELOG.md` updated; `DECISIONS.md` / `SECURITY.md` updated if a rule changed.
- [ ] If any migration or isolation check fails: **stop**, do not publish.

## 5. On the iPhone (manual — NOT done by me)

**Before updating to 0.7.0:** «Копии и данные → Сохранить копию», and keep the file outside the app.

**After updating (about 20 minutes).**
- [ ] `https://…/tests.html` in Safari shows «360 из 360 тестов пройдено».
- [ ] «Доступна новая версия» → «Обновить». All tasks, events and lists are still there. ⚙ → «Копии и данные» shows 0.7.0 and a copy «перед обновлением формата данных».
- [ ] **Five tabs** at the bottom: Сегодня, Календарь, Задачи, Списки, Цели. No label is cut off, and nothing hides behind the home indicator.
- [ ] **Цели → ＋:** «Записать аудиокнигу», steps «Сделать тестовое задание» / «Записать пробную главу» on two lines → «Создать». The goal opens, the steps are in order, and the first one says «следующий шаг». The keyboard does not cover the fields.
- [ ] Tick the first step: it stays in place, struck through. «Шаг сделан · Отменить» appears for a few seconds, and the next step becomes «следующий шаг».
- [ ] «Добавить заметку»: write a few lines with a web address → «Сохранить». The address is a link; tapping it opens it outside the app, and coming back the app is unchanged.
- [ ] Tap a step: rename it, ↑/↓, delete (it asks; Undo brings it back). A long press on a step opens the same sheet.
- [ ] **Задачи:** below «На этой неделе» there is one folded line «Шаги к целям · N». Open it: one step per goal. Tick one: the next step of that goal appears; Undo works. Tapping the step's title opens the goal with that step highlighted.
- [ ] **No pressure:** the next day, the steps are not in «Хвосты», «Сегодня» shows nothing about goals, and nothing is red or overdue.
- [ ] «···» in a goal → «Поставить на паузу»: its step leaves «Задачи», and the goal shows «на паузе». «Снять с паузы» brings it back.
- [ ] Tick all steps → «Цель достигнута»: the goal moves to «Достигнутые» (folded). «Вернуть в работу» works.
- [ ] Delete a goal (it asks) → Undo. Delete again → ⚙ → «Копии и данные» → «Удалённые» shows «Цель: …» → «Восстановить».
- [ ] 🔍 in Задачи or Цели: a word from a goal, its note or a step finds it; a tap opens the goal.
- [ ] Русский/English and light/dark: nothing is unreadable.
- [ ] Airplane Mode: close and reopen the app; «Цели» opens with your data.
- [ ] Export a backup and import it back (preview first): the goals are in the preview counts.
- [ ] The 0.6.0 items still apply (search, undo, recurrence, cleanup): repeat them quickly if 0.6.0 was never checked on the iPhone.

**Quick check for every later version (about 2 minutes).** `tests.html` is green; «Обновить» shows the new version; add, tick and delete a task; open one goal; export a backup.

## 6. Running the automated tests yourself

- **Unit tests:** open `tests.html` from the published site (or a local server). They use temporary in-memory data and never touch your real data.
- **The other tests (for developers)** need Python 3 and Playwright (`pip install playwright && playwright install chromium`). Each copies the app into its output folder, so the original files are not changed:
  - `python3 e2e-test.py <app_folder> <output_folder>`
  - `python3 e2e-v5-test.py <app_folder> <output_folder>` (several minutes; set `ONLY=<flow>` to run one flow)
  - `python3 e2e-v6-test.py <app_folder> <output_folder>`
  - `python3 e2e-v7-test.py <app_folder> <output_folder>`
  - `python3 privacy-test.py <app_folder> <output_folder>`
  - `python3 upgrade-test.py <old_version_folder> <new_version_folder> <output_folder>` — run it once for each earlier released version.
  - Do not run two tests with the same output folder at once.
