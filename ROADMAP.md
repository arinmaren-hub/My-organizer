# ROADMAP.md — release order

Updated 2026-10-10. **Current version: 0.5.0** (calm redesign over 0.4.0, built as one release at the owner's request; waiting for the owner's review). 0.4.0 is released and installed.
Designs are in `DECISIONS.md` (sections B–B9). Release rules for data (R1–R12) are in `DECISIONS.md` section F; privacy rules (P1–P8) in section G and `SECURITY.md`.
Each release is small, changes the data format at most once, keeps all existing data, and must be approved before work starts and reviewed before the next one begins. **The next release does not start until 0.5.0 is reviewed.**

| Step | Version | Release | Data format change | Status |
|---|---|---|---|---|
| S1 + S2 | 0.3.0 | Interface language RU / EN; planning day and onboarding; data-preservation safeguards; privacy checks | schema 3 | **released** (installed) |
| S3–S8 + calendar | 0.4.0 | Task editing; morning/evening reviews with memory; evening overview; smart quick entry; waiting for others; list templates and categories; recurring tasks; interactive calendar | schema 4: `series`, `waiting`, `templates`, task and list fields | **released** (installed) |
| UX | 0.5.0 | Calm redesign: 4 bottom tabs, «···» menus, «＋» multi-line entry, sheets instead of inline forms, indent by swipe, Lists index + Дом/Купить inventory, compact calendar, task ↔ event conversion, event preparation | none (schema 4; optional fields only) | **built and tested in Chromium, waiting for the owner's review and a real-iPhone check** |
| next | — | Repeating events on the same engine (and the `.ics`/alerts work), recurrence end dates and «2nd Tuesday» rules, Phase 3 projects, Quarterly Cleanup (B3) | as designed | not started |


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

### 0.5.0 — the calm redesign (see `DECISIONS.md` B11)
- Viewing/using by default; editing only on request. Four tabs; header menu; «＋» multi-line entry; row menus; sheets; swipe indent; Lists index with Купить and Дом; compact calendar with conversion and preparation lists. Russian is the primary design language; English is the same components and dictionaries.
- **Open decisions** (owner): how to create the first project now that Прогресс is hidden (B11 item 2); whether to link an event and the task made from it (B11 item 9); whether nested items (list, preparation, home) should get a «Deleted» restore; real-iPhone findings.

### 0.4.0 — S3 to S8 and the calendar, built as one release (see `DECISIONS.md` B10)
- Task editing, morning and evening reviews with memory, evening overview, smart quick entry (RU/EN), waiting for others, list categories and templates, recurring tasks, interactive calendar. One schema change (4), only additive.
- **Differences from the original proposals:** recurring tasks never record «missed» by themselves (unconfirmed occurrences wait for the person); the first release has daily/weekly/monthly/yearly rules with an interval, in two modes — no end dates, no multiple weekdays, no «2nd Tuesday» yet; built-in templates are stored in code and only overrides are saved.
- **Left for later:** repeating events, `.ics` alerts, end dates and weekday rules for recurrence, projects (Phase 3), Quarterly Cleanup (B3).

## For every release (release gate — DECISIONS.md E12)
- Unit tests (`tests.html`) in three time zones, and the full click-through suite (`e2e-v5-test.py`, `e2e-test.py`) in both themes and both languages, at 390 px and 320 px.
- `privacy-test.py`: two independent browser contexts; isolation, no data sent anywhere, CSP.
- `upgrade-test.py`: a real service-worker update from **every supported earlier version** with realistic data, two people side by side, compared field by field.
- A frozen sample of every earlier data version in the unit tests, upgraded and compared field by field.
- `TESTING.md`: results, the migration test report and the remaining data-loss risks; an updated on-iPhone checklist.
- `CHANGELOG.md` updated, and `DECISIONS.md` / `SECURITY.md` updated if a rule changes.
- **A failed migration or isolation test blocks the release.**
- The owner's approval before the next release starts.

## Questions
Settled for 0.3.0 (owner, 2026-10-09): deadlines stay on real dates; skipped onboarding = cutoff 00:00; the suggested cutoff is the bedtime; «Завершить день» is included. A cutoff from 12:00 on ends the day before midnight (evening people); a schedule where the person sleeps during the day is not covered.

Settled for 0.4.0 (built as proposed unless noted in `DECISIONS.md` B10): a task kept in the evening is listed quietly next morning and asked again the next evening; missed recurring occurrences are never recorded automatically.

Still open:
1. Should recurring tasks get end dates and «every Tuesday and Thursday» / «2nd Tuesday» rules, and should events use the same engine?
