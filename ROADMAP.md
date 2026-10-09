# ROADMAP.md — release order

Updated 2026-10-09. **Current version: 0.3.0** (S1 + S2 combined at the owner's request; waiting for the owner's review).
Designs are in `DECISIONS.md` (sections B–B9). Release rules for data (R1–R12) are in `DECISIONS.md` section F; privacy rules (P1–P8) in section G and `SECURITY.md`.
Each release is small, changes the data format at most once, keeps all existing data, and must be approved before work starts and reviewed before the next one begins. **The next release does not start until 0.3.0 is reviewed.**

| Step | Version | Release | Data format change | Depends on | Status |
|---|---|---|---|---|---|
| S1 + S2 | 0.3.0 | Interface language RU / EN; planning day and onboarding; data-preservation safeguards; privacy checks | schema 3: `settings.day`, `dataId`; new keys `organizer:language`, `organizer:rollback` | — | **built, waiting for review** |
| S3 | 0.4.0 | Task core: editing, morning review v2, review memory | schema 4: `task.review` | 0.3.0 | not started |
| S4 | 0.5.0 | «Вечер»: evening review + Tomorrow's Summary | none | S3 | |
| S5 | 0.6.0 | Smart quick entry (RU/EN dates, Task-or-Event choice) | none | S3 | |
| S6 | 0.7.0 | Waiting for Others | schema 5: `waiting` | 0.3.0 | |
| S7 | 0.8.0 | Lists: categories, edit/delete items, templates | schema 6: `templates`, list categories | 0.3.0 | |
| S8 | 0.9.0 | Recurring tasks | schema 7: `series`, occurrence links | S3, S4 | |
| later | — | Phase 2 calendar (views, repeating events on the same engine, `.ics` alerts), Phase 3 projects, Quarterly Cleanup (B3) | as designed | S8 | |

S5, S6 and S7 do not depend on each other and can be done in any order.

## Before the app is shared with other people

- **Publish it on its own address (origin)** — see `README.md` → «Publish» and `SECURITY.md` → limitation 2. On a `username.github.io/organizer/` address, every other site of the same GitHub account shares the browser storage. This is a hosting step, not a code change.
- Moving an existing installation to the new address: export at the old address, import at the new one (rule R10). Nothing moves by itself.

## Why this order

1. **Language first.** Every later release adds screens. Moving all text into `i18n.js` before adding them means each new screen is written once, not translated afterwards.
2. **Planning day before any review work.** Overdue logic, morning and evening reviews, recurring tasks and follow-up dates all depend on which day it is.
3. **Task core before the evening review.** The evening review reuses the same actions («На завтра», «Другая дата…», «Без даты», «Готово») and the same review memory.
4. **Recurring tasks last of these.** They are the most complex part, and they need editing, both reviews and the planning day to be stable first. Their rule engine is then reused for repeating events in Phase 2.

## The releases

### 0.3.0 — S1 Interface language + S2 Planning day (built)
- **Language:** `i18n.js` with every interface text in Russian and English; manual choice in onboarding and «Настройки»; Russian by default; no automatic detection; per-device key `organizer:language`.
- **Planning day:** `planday.js`; «Сегодня», reviews, overdue detection and quick add follow the planning day; the screen changes day at the cutoff; onboarding (language, wake-up, bedtime, cutoff = bedtime, skip = 00:00); «Настройки» → «Мой день»; «Завершить день».
- **Data safety and privacy (owner's rules of 2026-10-09):** daily copies (5) and rollback copies (5); guarded upgrade; `dataId` and a second confirmation for another organizer's backup; hardening against odd backup files; `SECURITY.md`; two-context privacy test; real-update upgrade test from 0.2.0, 0.2.1 and 0.2.2.

### S3 — Task core (0.4.0)
- **Scope:** edit a task (title, plan, time, deadline); morning review v2 (adds unfinished week tasks from past weeks; buttons Сегодня / Завтра / weekday / На эту неделю / Без даты / Готово); review memory; «Готово сегодня» folds finished tasks; Tasks tab sorted by date; Undo after delete/complete; quick add says where the task went.
- **Schema 4:** `task.review = null` for existing tasks.
- **Tests:** review lists across midnight and the cutoff; deadline never changes on any move; week tasks after Sunday; undo; upgrade chain v1 → v4 and real-update upgrade from 0.2.x and 0.3.0.

### S4 — «Вечер»: evening review + Tomorrow's Summary (0.5.0)
- **Scope:** the «Вечер» screen (B5 + B); settings (on/off, time; default bedtime − 1 h); open-when-due once per planning day; manual button; morning review skips what the evening already decided.
- **No format change** (uses `settings.eveningPreview` and `task.review`).
- **Tests:** due/not due around the chosen time, midnight and the cutoff; nothing moves without a tap; «Всё на завтра» confirms; a task moved or kept in the evening is not asked again in the morning; kept tasks return the next evening.

### S5 — Smart quick entry (0.6.0)
- **Scope:** `parse.js` recognises Russian and English dates and times (сегодня, завтра, пт, 12.10, на неделе, в 14:00; today, tomorrow, fri, 12/10, at 2pm). «Сегодня»/«завтра» mean the planning day. Recognised parts show as chips you can tap away. A time triggers the quick **Task / Event** choice (decision 4).
- **Tests:** a table of phrases in both languages, including things that must **not** be read as dates.

### S6 — Waiting for Others (0.7.0)
- **Scope:** the section at the bottom of «Сегодня»; add / edit / resolve; follow-up actions when due; task ↔ waiting conversions.
- **Schema 5:** empty `waiting` collection.
- **Tests:** never shown as overdue; follow-up due by planning day; resolve and restore; upgrade chain.

### S7 — Lists and templates (0.8.0)
- **Scope:** list categories; edit / delete / move list items; `templates` with built-in Supermarket and Suitcase Packing (seeded once, in the interface language); new list from template; save list as template; edit templates.
- **Schema 6:** `templates: []`, `list.categories: []`, `item.categoryId: null`.
- **Tests:** a list from a template starts unticked and editing it never changes the template; deleted built-ins are not re-created; «Вернуть стандартные»; upgrade chain.

### S8 — Recurring tasks (0.9.0)
- **Scope:** `recurrence.js` rule engine; series create / edit / stop; lazy generation; completion-relative; history; occurrence moves and deletes.
- **Schema 7:** `series: []`, `task.seriesId` and `task.occurrenceDate` (null for existing tasks).
- **Tests:** rule calendars checked by hand (month ends, 29 Feb, 5th and last weekdays, intervals over several years); generating twice = once; no duplicates with two windows or after import; missed occurrences recorded, not piled up; completion-relative chains; history survives deleting occurrences; upgrade chain v1 → v7.

## For every release (release gate — DECISIONS.md E12)
- Unit tests (`tests.html`) in three time zones, and the full click-through suite (`e2e-test.py`) in both themes and both languages.
- `privacy-test.py`: two independent browser contexts; isolation, no data sent anywhere, CSP.
- `upgrade-test.py`: a real service-worker update from **every supported earlier version** with realistic data, two people side by side, compared field by field.
- A frozen sample of every earlier data version in the unit tests, upgraded and compared field by field.
- `TESTING.md`: results, the migration test report and the remaining data-loss risks; an updated on-iPhone checklist.
- `CHANGELOG.md` updated, and `DECISIONS.md` / `SECURITY.md` updated if a rule changes.
- **A failed migration or isolation test blocks the release.**
- The owner's approval before the next release starts.

## Questions
Settled for 0.3.0 (owner, 2026-10-09): deadlines stay on real dates; skipped onboarding = cutoff 00:00; the suggested cutoff is the bedtime; «Завершить день» is included. A cutoff from 12:00 on ends the day before midnight (evening people); a schedule where the person sleeps during the day is not covered.

Still open:
1. **A task kept in the evening review:** ask again the next evening, but not the next morning? (proposed: yes) — before S4.
2. **Missed recurring occurrences:** record them as «пропущено» rather than creating overdue copies? (proposed: yes) — before S8.
