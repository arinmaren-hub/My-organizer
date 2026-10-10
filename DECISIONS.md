# DECISIONS.md — Мой органайзер

This file is the single list of rules for the app. Both AIs (ChatGPT and Claude) and the owner follow it.
A rule changes only when this file is edited on purpose, with the date and the reason.

Last updated: 2026-10-10 (app version 0.4.0: calendar, reviews, evening preview, waiting, templates, recurring tasks, quick entry; section B10 records what was built and where it differs from the earlier proposals)

---

## A. Confirmed product decisions (owner, 2026-10-09)

| # | Decision | Status in 0.2.0 |
|---|---|---|
| 1 | The week starts on **Monday**. | Implemented: a week is stored as the date of its Monday (`dates.js → weekKey`). |
| 2 | Quick entry supports **Russian and English**. | Planned (Phase 1, `parse.js`). Multi-line entry already works. |
| 3 | A task can be planned for a **specific day**, for a **week** (no day), or have **no date**. | Implemented (`task.plan.kind` = `day` / `week` / `none`). |
| 4 | When a typed entry contains a **time**, the app offers a **quick choice: Task or Event**, with no complicated form. | Planned (Phase 1 quick entry). Data model ready: tasks have an optional `time`, events have `start`. |
| 5 | Tasks can have an **optional time and an optional reminder**. | Data model ready (`task.time`, `task.reminder`). No UI yet. |
| 6 | **Planned date and deadline are separate.** Rescheduling never silently changes a deadline. | Implemented: `moveTask` changes only `plan` (and clears `time`/`reminder` when the task is no longer on a specific day). Covered by an automated test. |
| 7 | Unfinished tasks are **never automatically rescheduled**. The user decides during the morning review. | Implemented: nothing moves without a tap. |
| 8 | The app works **without AI, paid APIs, accounts or cloud sync**. | Implemented. No network requests except loading the app's own files (checked by tests; see `SECURITY.md`). |
| 9 | All data is stored **locally on one device**, with **safe backup and restore**. | Implemented: versioned store, automatic copies, export/import with preview, see section C. |

---

## A2. Confirmed requirements — second batch (owner, 2026-10-09)

| # | Requirement | Design | Planned release (see `ROADMAP.md`) |
|---|---|---|---|
| 10 | **Personal day boundary and onboarding**: wake-up time, bedtime, a personal planning-day cutoff; real dates stay accurate | B4 | **0.3.0 — implemented** |
| 11 | **Evening review of unfinished tasks** together with Tomorrow's Summary; never reschedule without confirmation; no repeated questions in the morning | B5 | S4 |
| 12 | **Recurring tasks**: daily, weekly, monthly, yearly and completion-relative; completion history; no duplicates | B6 | S8 |
| 13 | **Waiting for Others** («Ожидаю действия от других») at the very bottom of «Сегодня», with follow-up dates and «решено» | B7 | S6 |
| 14 | **Reusable list templates** with editable categories and items (Supermarket, Suitcase Packing, own templates) | B8 | S7 |
| 15 | **Interface language: Russian or English, chosen manually** | B9 | **0.3.0 — implemented** |
| 16 | Keep all existing data and functions; no AI or paid APIs; tests especially for overnight dates, recurrence and migration; **small releases, each approved before the next** | E9–E11 | all |
| 17 | **Privacy and data isolation** (owner, 2026-10-09): each person's records stay separate; nothing is shared automatically; the app creator cannot reach other people's records through the app; no personal data goes to GitHub or any server; importing someone else's backup always needs explicit confirmation. No accounts, sync, analytics or paid services. Documented in `SECURITY.md`, without claiming absolute security. | G | 0.3.0 and every later release |
| 18 | **Data preservation on every update** (owner, 2026-10-09): release rules R1–R12 — they block a release when they fail | F | 0.3.0 and every later release |

Items marked *(proposal — confirm)* below are design choices made by Claude that need the owner's yes or no.

---

## B. Evening Preview — «Сводка на завтра» (built in 0.4.0, see B10)

**Goal.** At a time the user chooses (e.g. 21:30), show a short overview of the next day, built locally without AI.

**Contents**, in this order:
1. Tomorrow's events and timetable (including repeating classes once Phase 2 adds them).
2. Tasks planned for tomorrow (timed tasks first, by time).
3. Approaching deadlines: unfinished tasks whose deadline is on or before **tomorrow + 3 days** *(the 3 days is a proposal — confirm or change)*.
4. Unfinished tasks that still need attention: unfinished day tasks planned before tomorrow (including today's) and unfinished week tasks from weeks that have already ended.
5. Quick actions on each task: done, edit, move (Today / Tomorrow / a weekday / This week / No date), and "add a task for tomorrow".

**When it appears.**
- Only while the app is open, or the first time it is opened after the chosen time. A local-only iOS web app cannot show it while closed (no scheduled background notifications without a server).
- At most once per evening: the app remembers which day it was last shown for.
- It can always be opened by hand (e.g. a «Завтра» button).

**Already prepared in 0.2.0** (tested, not shown in the UI):
- `settings.eveningPreview = { enabled: false, time: '21:30' }` in the data document (included in backups).
- `selectors.js → buildDaySummary(doc, day)` returns `{ events, tasks, weekTasks, deadlines, unfinished }`.
- `selectors.js → eveningPreviewDue(settings, now, lastShownFor)` returns the day to summarise, or `null`.
- Device key `organizer:device → lastEveningPreviewShownFor` is reserved for "already shown".

**Still to build:** settings UI (on/off + time), the summary screen, the open-on-launch check, the manual button. **Update (2026-10-09):** it becomes part of the «Вечер» screen together with the evening review (B5), uses the planning day (B4), and is planned for release S4.

---

## B2. Appearance (owner, 2026-10-09 — implemented in 0.2.2)

- Three modes in **«Настройки» → «Оформление»** (button in the header): **Светлое** (soft warm off-white, no bright white), **Тёмное** (muted warm dark greys, soft off-white text), **Как в системе** (follows the iPhone's light/dark setting live, without restarting). Default: «Как в системе».
- The choice is saved **on this device only**, under its own key `organizer:appearance`. It is **not** part of the data document or backups, and changing it never writes tasks, events, projects, lists, automatic copies or device info.
- It is applied by `boot.js` before the page is drawn, so a dark choice never flashes light on start.
- Readability rule: every text/background colour pair has a contrast ratio of at least **4.5:1** in both themes (checked automatically on every screen). Native controls (date and time pickers, selects, checkboxes) follow the theme via `color-scheme`.
- Limits: confirmation dialogs («Удалить?» etc.) are drawn by iOS and always follow the iPhone's own setting. The launch screen and status bar of the installed app are controlled by iOS; check them on the device.

## B3. Quarterly Cleanup — «Уборка» (confirmed future feature, not built yet)

**Goal.** Every three months, offer to review and remove old records that are no longer useful, so the organizer stays uncluttered. Saving storage space is not the goal. **Nothing is ever deleted without the user's explicit approval.**

**When it is offered**
- On opening the app (or returning to it) after the interval has passed: 3 months since the last finished or skipped cleanup, or since the data was first created (so new users are not asked on day one).
- As a calm card on «Сегодня» (not a pop-up): «Уборка: можно убрать N старых записей» with «Посмотреть» and «Позже».
- Shown only when there is at least one candidate. Can also be started by hand at any time (from «Данные»).
- **Postpone:** «через неделю», «через месяц», or «пропустить этот квартал» (counts as reviewed, deletes nothing).

**What can appear, and what is pre-selected**

| Category | Shown when | Pre-selected? |
|---|---|---|
| Completed tasks | done, completed more than 30 days ago | Yes |
| Past events | ended more than 30 days ago; a repeating series only after its last date | Yes |
| Completed lists | every item ticked, unchanged for 30 days | Yes |
| Ticked items in lists still in use | ticked, unchanged for 30 days (the list itself stays) | Yes |
| Completed projects | marked done by the user, no unfinished linked tasks, unchanged for 30 days | Yes |
| Projects that look finished but are not marked done | all milestones and the counter complete | **No** |
| Long-untouched unfinished tasks | unchanged for 6 months | **No** (shown collapsed, for review only) |

**Never selected automatically:** unfinished tasks, active projects, future or ongoing events.
**Never shown at all:** records marked «Хранить всегда», records already deleted, quarantined records, and projects that still have unfinished linked tasks.

The 30-day and 6-month ages are proposals — confirm or change.

**Preview and choice**
- Records are grouped by category, each with a count and a select-all checkbox. Each group expands to the individual records, each with its own checkbox.
- Any record can be marked **«Хранить всегда»** from the preview. Such records never appear in a cleanup again. This flag is saved in the record and in backups, and can be removed later.
- A running total: «Выбрано: N».

**Backup step (before deleting)**
- The preview offers «Сохранить резервную копию» (the normal export).
- If no external copy was saved during this cleanup, the app shows a clear warning before going on: «Внешняя копия не сохранена. Удалённое можно вернуть в течение 30 дней, но не позже — и не при потере телефона.» Continuing then needs a second, explicit confirmation.
- Honest limit: the app knows the share sheet or download finished, not that the file really reached iCloud Drive.

**Confirmation and deletion**
- Final step: «Удалить N записей? Их можно вернуть в течение 30 дней («Данные» → «Удалённые») или сразу кнопкой «Отменить уборку»». Buttons «Удалить» / «Назад».
- An automatic copy («перед уборкой») is taken first, as for import.
- Deletion is **all-or-nothing**, like import and restore. Success is reported only after the change is confirmed saved. If saving fails, nothing is deleted.

**How it works with soft deletion**
- Cleanup only **soft-deletes**: it sets `deletedAt` and marks each record with the cleanup's id, using the same 30-day restore window as normal deletes. It never removes anything permanently itself; the existing 30-day purge does that later. This is stated clearly in the confirmation.
- «Отменить уборку» restores the whole batch in one tap for 30 days. Single records can also be restored as today.
- Cleanup never touches records that are already deleted: their 30-day timer is not reset, and they are not restored.
- Deleting a project never deletes its linked tasks.
- Restoring an automatic copy or importing a backup made **before** a cleanup brings the cleaned records back. That is what restoring means, but the restore/import preview will say so: «в копии есть N записей, убранных при уборке …».
- Deleting a «Хранить всегда» record by hand asks for one extra confirmation.

**Data model changes (when built)**
- Records gain an optional `keep: true` flag («Хранить всегда»). Records soft-deleted by a cleanup carry `cleanupId`.
- `settings.cleanup = { lastReviewedAt, postponedUntil }`, included in backups.
- Projects need an explicit «завершён» status (planned with Phase 3). The «Удалённые» list needs to show and restore ticked list items and milestones.
- Schema version bump with an upgrade step and tests, as rule E6 requires.

**Timing:** after Phase 3, because it depends on project status and on restoring list items and milestones. No changes now.

## B4. Personal planning day and onboarding (requirement 10) — implemented in 0.3.0

**Two kinds of "day"**
- **Calendar date**: the real date on the clock.
- **Planning day**: the day the user is living in. It ends at the user's **cutoff** («День заканчивается в»).
  - Cutoff **before 12:00** (e.g. 03:00): the day ends after midnight, on the next calendar date. Saturday 02:30 still belongs to **Friday**.
  - Cutoff **from 12:00 on** (e.g. 23:00): the day ends before midnight, on the same date. Friday 23:30 already belongs to **Saturday**.
  - Cutoff **00:00**: planning day = calendar date, exactly the behaviour before 0.3.0.
- Computed from the real moment the cutoff happens on that date (`planday.js → cutoffInstant`). On a daylight-saving night the day changes exactly once and never goes back: when the clocks go back, the first 03:30 counts; when they jump over the cutoff, the day changes at the jump. It is never computed by subtracting hours.

| Uses the planning day | Uses the real calendar date and time |
|---|---|
| «Сегодня» (tasks, «На этой неделе», reviews) | Event times and all calendar screens |
| Morning review and overdue detection | Deadlines (shown with their real date) |
| Quick add and move buttons («на сегодня») | Timestamps (created, completed, deleted) |
| The moment the screen switches to the next day (at the cutoff, **not at midnight**) | The daily automatic copy, cleanup ages, backup file names |
| Later: evening review, recurring tasks, follow-up dates | |

- **No overdue at midnight.** A task planned for Friday becomes overdue only when Friday's planning day ends at the cutoff.
- **«Расписание» on «Сегодня»** shows the events inside the planning-day window. A 01:00 Saturday event appears under Friday on «Сегодня» with its real date («По календарю: сб, 10 окт»), and under Saturday in the calendar.
- When the planning day and the calendar date differ, «Сегодня» says so («По календарю: …») and shows «День заканчивается в …».
- Changing the cutoff never changes any stored date; it only changes which day the screens show.

**«Завершить день» (owner, 2026-10-09).** Optional button on «Сегодня». After a confirmation the app shows the next planning day straight away (e.g. go to bed early). It moves at most one day ahead, can be undone («Вернуть») until the cutoff, and stops mattering once the cutoff passes. It changes no data: it is stored on this device only (`organizer:device → dayFinishedThrough`).

**Onboarding (first launch).** One screen: interface language, usual wake-up time, usual bedtime, and «День заканчивается в».
- **The suggested cutoff is the bedtime** (owner's decision, 2026-10-09; replaces the earlier "middle of the sleep window" proposal). It follows the bedtime as it is typed until the user changes it by hand.
- **Skip** → cutoff 00:00 (owner's decision), i.e. the previous behaviour. Nothing is written until the user answers or skips.
- Existing users see the same screen once after updating to 0.3.0 (their data has `setupDone: false`).
- Editable any time in «Настройки» → «Мой день» (with «Взять время отхода ко сну»).
- Stored in the data document (included in backups): `settings.day = { wake, bed, cutoff, setupDone }`.
- Importing a backup or restoring a copy made **before 0.3.0** (no day settings) keeps the current day settings instead of asking again.
- Deferred: the bedtime suggesting the evening review time (S4). Not covered: schedules where the person sleeps during the day.

## B5. Evening review of unfinished tasks (requirement 11; extends B) — built in 0.4.0, see B10

**«Вечер» screen** = 1) review of unfinished tasks, then 2) Tomorrow's Summary (section B).
- It opens when due, at most once per planning day, and can also be opened by hand.
- **When due:** the chosen evening time within the planning day. Example: chosen 21:30, app opened at 01:30 with cutoff 04:00 → still Friday evening, so it shows.
- `eveningPreviewDue()` (prepared in 0.2.0) is rewritten to this planning-day rule.

**Which tasks**
- Unfinished day tasks planned for the current planning day or earlier.
- On the last day of the week: unfinished tasks for this week.
- Not tasks that were already reviewed for this planning day.

**Actions per task:**
- «На завтра»
- «Оставить дату» (keep the original planned date)
- «Другая дата…» (date picker, or «На эту неделю»)
- «Без даты»
- «Готово»

The deadline never changes (decision 6). Nothing moves without a tap. «Всё на завтра» exists but confirms first, with the count.

**No repeated questions**
- Each decision is recorded on the task: `review = { day, choice }`, where `day` is the planning day it was reviewed for.
- The morning review uses the same actions and the same record:
  - Tasks moved in the evening are not overdue, so they are not asked about.
  - Tasks kept in the evening are listed quietly («Оставлены вчера вечером: N», expandable) instead of being asked again.
- They come back to the next evening's review, at most once per day, so nothing is forgotten. *(proposal — confirm)*

## B6. Recurring tasks (requirement 12) — built in 0.4.0; the «missed» rules below are SUPERSEDED, see B10

**Rules**
- Every N days.
- Every N weeks on chosen weekdays.
- Monthly on day D. Day 31 falls on the last day of shorter months.
- Monthly on the Nth weekday, e.g. 2nd Tuesday or last Friday.
- Yearly on a date. 29 Feb falls on 28 Feb in common years.
- **Completion-relative:** N days, weeks or months after the previous occurrence was completed.
- Optional end: on a date, or after N times.

**Model**
- A **series** record holds the rule. Real tasks are **occurrences**, linked by `seriesId` + `occurrenceDate` (the date the rule produced).
- That pair is **unique** and enforced by validation, so duplicates are impossible, even with two windows open or after an import.
- **Generation is lazy and idempotent.** On opening and at each day change, every active series makes sure its current occurrence exists: the latest date on or before the planning day. The next date is also known for the evening summary. Running generation twice changes nothing.
- **No pile-ups.** After days without opening the app, only the latest due occurrence becomes a task. Earlier ones are recorded in the history as «пропущено» rather than created as a stack of overdue tasks. *(proposal — confirm)*
- **Completion-relative:** the next occurrence is created only when the current one is completed (completion's planning day + interval).
- **History:** each series keeps `history: [{ date, status: done │ skipped │ missed, at }]`. The completion record survives even if old occurrence tasks are deleted or cleaned up (B3).
- **Moving an occurrence** changes only its plan; its identity stays, so it is never generated again. Deleting an occurrence records «пропущено» and does not bring it back.
- **Editing a series** changes future occurrences. The current open one changes only if the user picks «и текущую».
- Occurrences follow the planning day (B4).
- The same rule engine (`recurrence.js`) will later drive repeating events (Phase 2). The weekly-only `event.repeat` field is migrated then.

## B7. Waiting for Others — «Ожидаю действия от других» (requirement 13) — built in 0.4.0, see B10

- A section at the **very bottom** of «Сегодня».
- **Item:** what is awaited; from whom (optional); since when (automatic); optional follow-up date; optional note; optional project.
- Waiting items are a separate collection `waiting`, not tasks, so they never count as tasks or become overdue.
- **When the follow-up date arrives** (planning day), the item appears as an action near the top of «Сегодня»: «Напомнить: …». The choices are:
  - «Напомнил(а) — проверить снова через …»
  - «Решено»
  - «Отложить до …»
- Without a due follow-up it stays quietly at the bottom.
- «Решено» marks it resolved: hidden and kept. It can later be a Quarterly Cleanup candidate (resolved more than 30 days ago, pre-selected).
- **Conversions:** a task can become a waiting item («Жду ответа»), and a waiting item a task («Нужно действие»).

## B8. Reusable list templates (requirement 14) — built in 0.4.0, see B10

- **Lists gain optional categories** (e.g. «Овощи», «Молочное»), with items grouped under them. Existing lists keep their items uncategorized.
- **List items can be edited and deleted.** Templates need this; it was bug 10 in the assessment.
- **Templates** are a separate collection `templates`: a name plus categories and items, with no checkmarks.
- **Built-in templates:** «Супермаркет» / Supermarket and «Чемодан» / Suitcase Packing.
  - They are created once, in the interface language active at that moment.
  - They are fully editable and deletable, and never re-created after deletion.
  - «Вернуть стандартные шаблоны» adds back any that are missing.
- **«Новый список из шаблона»** copies categories and items with new ids, all unticked. The template itself never changes, and later edits to the list never touch it.
- **Own templates:** «Сохранить как шаблон» from any list (copied without checkmarks), or create and edit a template from scratch.
- Templates are never Quarterly Cleanup candidates.

## B9. Interface language (requirement 15) — implemented in 0.3.0

- **Russian or English**, chosen manually in onboarding and in «Настройки». Default: Russian. **No automatic detection** from the device.
- It is a per-device preference with its own key, `organizer:language` (like appearance). It is read before the first draw and is not part of backups.
- **All interface text lives in one file, `i18n.js`** (key → Russian/English). It includes plural rules (1 задача / 2 задачи / 5 задач; 1 task / 2 tasks) and both languages' weekday and month names. Store messages are saved as keys with values, not finished sentences, so they also switch language.
- Text the user typed is never translated. Built-in templates use the language active when they were first created.
- Quick entry understands Russian and English dates in either interface language (decision 2).
- **Tests fail if** any key is missing in either language, if a raw key would show on screen, or if Russian interface text appears in code outside `i18n.js`.

## B10. What 0.4.0 built (owner's brief of 2026-10-09/10) — decisions and deviations

**Calendar** (`view-calendar.js`, `calendar.js`). Monday-first month grid; previous/next, month and year picker, optional 12-month year view; tapping a date opens its panel (events, tasks of the day, week tasks, repeats, deadlines) with a form to add a task or an event to that date. Indicators: tasks, events, deadline. The calendar shows **real calendar dates**; the personal planning day (B4) only decides what «today» means for tasks, reviews and repeats. Deadlines and events are never shifted by the planning day.

**Reviews (B5).** `task.review = { day, choice, part }`; `part` is `am` (morning review) or `pm` (evening). Rules as built:
- Nothing moves without a tap. Choices: today (morning only), tomorrow, another date, this week, no date, keep, done. «Всё на завтра» asks first, with the count, and moves only the tasks shown.
- Morning: unfinished day tasks of past days and week tasks of past weeks. A task decided today (morning or evening) or **kept yesterday evening** is not asked again; it stays listed under «Уже разобрано» so nothing is hidden.
- Evening: unfinished tasks planned for today or earlier, plus this week's week tasks on the last day (Sunday). A **morning** decision does not silence the evening question (decided after review: a task moved to «today» in the morning is still unfinished in the evening); an **evening** decision does for the rest of that planning day. Tasks kept in the evening come back the next evening. A task kept in the morning is asked again the next morning.
- Deadlines never change when a plan moves.

**Evening overview** (`view-evening.js`). Opens by hand at any time («Вечер»), and automatically once per planning day when the chosen time has passed (the evening time belongs to the planning day: 01:30 with cutoff 04:00 is still the previous evening). Automatic opening is evaluated only while the app is open (start, return to the app, a 30-second timer; never while typing). **No background notification is promised or sent.** Contents: review of unfinished tasks, then tomorrow's events (real dates), tasks, deadlines, waiting follow-ups and repeats, with quick edit/move.

**Waiting for others (B7).** Separate collection, section at the very bottom of «Сегодня». Optional «from whom» and follow-up date. When the follow-up date arrives (planning day) a card on «Сегодня» offers «проверить через 3 дня», «Нужно действие» (creates a task for today, links `taskId`, marks resolved) and «Решено». Resolved items stay under «Решено» and can be reopened, edited, deleted (soft). They are never tasks and never overdue.

**List templates (B8).** Built-in «Супермаркет» and «Чемодан» (Supermarket, Suitcase Packing) exist **in code**, so nothing is stored for a fresh organizer. Editing or deleting one stores an override/marker record with `base`. «Вернуть стандартные шаблоны» adds new copies. «Новый список из шаблона» copies categories and items with new ids, all unticked; the template never changes. «Сохранить как шаблон» copies a list without ticks. List items can be edited and deleted.

**Recurring tasks (B6 revised).** Daily/weekly/monthly/yearly with an interval ≥ 1. Two modes:
- *Completion-based:* exactly one open occurrence; the next date is the completion day + interval. If the latest occurrence was skipped or deleted instead, the next is counted from today.
- *Fixed rhythm:* dates counted from the start date (months and years from the original start, so no drift; 31st → last day of shorter months; 29 Feb → 28 Feb). At most 60 occurrences are created at once; if more were due, only the newest 60 are created and a notice says so.
- **Supersedes B6's «missed» rule:** the app never decides that an occurrence was missed or skipped because it was not opened. Past open occurrences are **unconfirmed** and shown on «Сегодня» in their own card (not in overdue, not in reviews) with «Сделано», «Сделано в тот день», «Пропустить», «Сегодня». Only the person's tap marks one skipped.
- Uniqueness: `(seriesId, occurrenceDate)` exists at most once; deleted/skipped ones still count, so nothing is created twice (also after import or with two windows). Deleting the open occurrence of a completion-based series counts as skipping it and the next one appears. Undoing a completion removes the next occurrence only if it is still exactly as the app made it (an app-made empty clone, removed outright so its date is free); a changed one stays. Restoring a deleted open occurrence of a completion-based series removes an untouched app-made open one; if the open one was changed, the restore is refused with a message. The calendar shows not-yet-created repeats only from the planning day on.
- Editing a series changes future occurrences; «и текущие» also changes open ones. Switching completion → fixed starts from today (no backfill); resuming a paused or restored series does not backfill the pause. History per series shows done / skipped / open. Deleting a series deletes its open occurrences (soft); finished ones stay.
- No end date or «Nth weekday» rule in 0.4.0 (see ROADMAP).

**Quick entry and editing.** Only a title is required. One line = one task; several lines = several tasks. Russian and English dates are recognised in either interface language: today/tomorrow/day after, «через N дней/in N days», weekdays, «в пятницу», «до пятницы / by Friday» (a **deadline**, the task gets no plan date), «15 октября / Oct 15», `15.10`, `15/10`, ISO dates, «на этой/следующей неделе». The recognised words are removed from the title and the app says which date it understood. A number with a dot or slash followed by a unit (`1.5 л`, `2/3 cup`, `10.5 euro`) is a quantity, not a date. When a clock time is typed, the app asks once: **Задача или Событие** (with «как текст» and «Отмена»); nothing is added before the answer and the text stays in the box. Every task and event can be edited (title, kind, date, time, deadline); moving the plan never changes the deadline.

**Rules that did not change:** all data stays in this browser; no AI, accounts, analytics or paid API; R1–R12 and P1–P8 apply to every new collection (they take part in the lost-records check, backups, imports, rollback copies and two-person isolation tests).

---

## B11. What 0.5.0 built (the calm redesign, owner's brief of 2026-10-10) — decisions and deviations

**Principle:** viewing and using is the default; editing and management appear only on request (a «···» menu, a tap on a title, or «＋»). Built on the 0.4.0 code: no rebuild, no rename of storage keys, schema stays 4, no migration.

1. **Navigation.** Four fixed bottom tabs: Сегодня, Календарь, Задачи, Списки. Secondary screens — Вечер, Настройки, Копии и данные, О приложении, Прогресс — are reached from «···» at the top right and have a back button. Language and appearance are also directly in that menu.
2. **Progress/Projects is hidden, not removed** (code, data, schema, backups all kept). «Прогресс» appears in «···» only while at least one active project exists. **Consequence to confirm:** the screen has no «create project» entry point any more, so a person who has no project cannot make the first one from the UI. Options: (a) leave it hidden until Phase 3 redesigns projects (current choice, consistent with the brief); (b) add «Новый проект» to «···»; (c) a Settings switch «Показать Прогресс».
3. **Tails.** Same morning/evening decisions and memory. «Оставить как есть» used to be a button on the row; it is now the first item of the task's «···» menu for tail rows (and in the long-press menu), so the row keeps four quiet actions. The remembered decision (`review`) is unchanged.
4. **Fast entry.** One multiline field; one non-empty line = one task; one «Добавить» saves all lines. Default date = the planning day (Home) or the selected real calendar date (Calendar); an explicit date in the text wins; a line with only a deadline («до пятницы») is planned for the default day; a line with a clock time asks Task / Event / Title only; the question is asked per line, edits of the text while it is open drop the question (nothing added, nothing erased).
5. **Rows.** checkbox + title + small date/time + one «···». A tap on the title edits; long press and right-click open the menu (never the only path). Reschedule never changes the deadline.
6. **Indent.** Optional `task.indent: true` (one level only). Pointer-event swipe (≥ 44 px, horizontal), right sets, left clears; rows keep `touch-action: pan-y`, so vertical scrolling, the checkbox and the menu button are unaffected. It is cleared when an unfinished task becomes a tail, is moved to another date/week/no date, or is edited to another plan. No handle, no drag-and-drop, no reorder control.
7. **Home inventory.** One ordinary list with `kind: 'home'` (created on the first «＋» in «Дом»), items carry `stock: 'have' | 'low' | 'out'`. Matching is by `kind`, never by name: a user's own list named «Купить» or «Дом» stays a separate list. «Купить» is generated from `stock === 'out'`; ticking an item there sets `have` (no delete, no duplicate). The Home list cannot be deleted from the UI. Adding a name that already exists (case-insensitive) does not duplicate it.
8. **Lists.** Index → list screen (back navigation, collapsible categories, per-item tap-to-edit, «＋» adds several items); management in the list's «···»; new list: blank / from template / manage templates; built-in templates are code, edits become a copy (`base`), built-in item ids are kept so a tapped item is found in the copy. Creating from a template never alters the template.
9. **Task ↔ event.** Atomic: the new record is created and the original soft-deleted in one update. Title, date, time are always kept. Losses — task→event: deadline, completion, remembered review, project link; event→task: end time, repeat, alerts, preparation items — are listed and need the confirmation tap (`confirmed`); recurring-series occurrences cannot be converted. A reminder moves to the event's alert (and a task copy keeps it). **Known:** restoring the soft-deleted original from «Данные → Удалённые» brings back the original next to its counterpart (a deliberate manual action; the app does not link them).
10. **Event preparation.** Optional `event.prep` array of items (same item shape, soft-deleted); shown collapsed in the event sheet («Добавить подготовку» until created), count «done/total» in the sheet header and next to the event in lists. Not shown under «Удалённые» (nested items are never listed there); the delete confirmation says so (`confirm.deleteItem`), the data stays 30 days and in every copy/export.
11. **Sheets.** Menus, forms and the «＋» field are bottom sheets (`ui.sheet`), rebuilt only when their HTML changes, so typing and the keyboard survive redraws. `shut()` closes the sheet before an action; if the action is refused, the sheet comes back **with what the person had typed**.
12. **Waiting for others.** «Ожидаю от других» from a task keeps the task's deadline as the follow-up date.
13. **Offline cache safety.** The service worker fetches each file as `file?v=<version>` and stores it under the plain address; it refuses to install if `version.js` does not show the version of `sw.js`. A half-uploaded site cannot become the offline copy.
14. **Language.** Russian is the primary design language (all layouts tuned in Russian first); English uses the same components and the same central dictionaries (no language-specific screens) and was re-checked for overflow, navigation, forms and workflows at 390 px and 320 px. The language is chosen by hand and never taken from the device.
15. **Not done / not decided.** Real iPhone/Safari testing; keyboard handling is implemented with `visualViewport` and only simulated; no drag reordering by design; restore of nested items; linking an event and the task made from it; an end date for events.

## C. Technical decisions (Phase 0, proposed by Claude — open to review)

### Code structure
- Plain JavaScript ES modules. **No framework, no npm, no build step, no external libraries.**
- **Flat folder** (every file at the top level), so the app can be uploaded to GitHub from any device, including an iPhone.
- One job per file:

| File | Job |
|---|---|
| `index.html`, `app.css`, `boot.js` | Page shell, styles (light/dark tokens), early theme and language + "app did not start" safety message |
| `appearance.js`, `view-settings.js` | Appearance preference and the «Настройки» screen (language, «Мой день», appearance) |
| `i18n.js` | Every interface text in Russian and English, plural rules, date words |
| `planday.js`, `view-onboarding.js` | Planning day maths; the first-launch screen |
| `app.js` | Starts the app, draws the current tab, routes every click/change/submit |
| `actions.js` | Every user change as a named operation (add task, move task, delete, …) |
| `store.js` | The only code that reads/writes app data: validation, saving, copies, recovery |
| `storage.js` | The only code that touches `localStorage` (swap point for IndexedDB/sync later) |
| `schema.js` | Data format, version number, validation, upgrade from the prototype |
| `selectors.js` | Read-only questions ("tasks for today", review list, evening summary) |
| `dates.js` | All date maths (no locale tricks) and Russian date formatting |
| `backup.js` | Backup file format and import parsing |
| `components.js`, `view-*.js` | HTML for each screen |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Installable app and offline cache |
| `version.js` | App version (must match `sw.js`) |
| `tests.html`, `tests.js`, `tests.css` | Automated tests (open in a browser) |
| `e2e-test.py`, `privacy-test.py`, `upgrade-test.py` | Click-through, two-person privacy, and real-update upgrade tests (for developers) |
| `SECURITY.md` | Privacy guarantees, their limits, and the evidence |

### Data safety rules (implemented in `store.js`)
1. **Validate before save.** Every change is made on a copy, validated, then saved. An invalid change is rejected whole and a message is shown.
2. **Never overwrite unreadable data.** If saved data cannot be read, its raw text is first copied to `organizer:rescue`; then the newest valid automatic copy is loaded. If the rescue copy cannot be written, the app becomes **read-only**.
3. **Quarantine, don't drop.** A record that fails validation on load or import goes into `doc.quarantine` (with its original content and the reason). Everything else loads. Quarantine is kept in every backup.
4. **Visible save errors (ordinary edits).** A failed save shows a red banner with «Повторить» and «Сохранить копию» and the status «⚠ Не сохранено»; the change stays visible in memory and is retried on the next change. If space runs out, old automatic copies are trimmed so the main data can be saved — and put back if the save still fails.
4a. **Import and restore are all-or-nothing** (since 0.2.1). They report success only after the new data is confirmed saved. If saving fails, the previous data stays both on screen and in storage, the import preview stays available to retry, and an error explains why. Any future operation that replaces the whole document (e.g. sync) must use the same `replaceDocument()` path.
4b. **A half-finished write is undone.** If a write cannot be confirmed by reading it back, the previously saved text is written back.
5. **Soft delete.** Deleting sets `deletedAt`. Deleted records can be restored in «Данные → Удалённые» for 30 days, then are purged on app start.
6. **Automatic copies — two kinds** (since 0.3.0, release rule R9):
   - **Daily copies** (`organizer:snapshots`): one per calendar day (before the first change of the day), the latest **5**.
   - **Rollback copies** (`organizer:rollback`): before every data-format upgrade, import and restore, the latest **5**. The newest pre-upgrade copy is never rotated out, and the copy being restored is never pushed out by the new «перед восстановлением» copy. A pre-upgrade copy holds the **exact original text** and never rotates anything out itself. A state that is already in a rollback copy is not copied again.
   - **Before an import or restore would rotate out a rollback copy whose data exists in no other copy**, the app asks first (with the copy's date), so the only copy of something is never removed silently.
   - **Nothing is removed to make room for another copy.** If a copy does not fit, it is not made: the user is told, and an import or restore asks before continuing without it.
   - When space runs out, only **daily** copies are trimmed (to the newest 2), and only to save the main data or the pre-upgrade copy; they are put back if that still fails, and a message says so. Rollback copies are never trimmed for space. A copies list whose write half-landed is put back.
   - 0.2.x kept import/restore copies in the daily list; on upgrade they are moved to the rollback list, none deleted.
   - Each copy has its own id. An unreadable copies area is moved to rescue before it is ever rewritten. Copies live on the same device, so they do **not** replace exported backups.
7. **Newer data is untouchable.** Data with a higher `schemaVersion` than the app knows makes the app read-only instead of guessing.
8. **Other windows.** If another window saves, this one reloads the data instead of overwriting it later — unless this window holds unsaved changes, which are kept and flagged instead of being discarded.
9. **Import is always previewed** (counts, quarantine) and confirmed; a rollback copy of the current data is taken first. A backup from a **different organizer** (its `dataId` differs) that would replace existing data shows a warning and needs a **second, separate confirmation** (enforced in `store.js`, not only in the screen).
10. **Guarded upgrade** (since 0.3.0, rules R3 and R12). Before data in an older format is rewritten: (a) the loader checks that every record of the old data is either loaded or in quarantine, with the same id, title and done state, and that the old quarantine is kept (`schema.js → findLostRecords`); (b) the exact original text is saved as a rollback copy (old daily copies are trimmed to make room if needed). If either fails, or the upgrade code itself crashes, **nothing is written**: the app opens read-only, shows the data it could read, explains why, and offers «Скачать исходные данные». When only the copy failed (storage full), «Продолжить обновление без копии» is offered after a confirmation.

### Storage keys (`localStorage`)
| Key | Contents |
|---|---|
| `organizer:data` | The main document (schema v4) |
| `organizer:snapshots` | Daily automatic copies (one per day, latest 5), newest first |
| `organizer:rollback` | Rollback copies before upgrades, imports and restores (latest 5; pre-upgrade copies keep the exact original text) |
| `organizer:rescue` | Raw text that could not be read (every distinct text is kept; nothing is dropped) |
| `organizer:device` | This device only: `lastBackupAt`, `lastDailySnapshot`, `dayFinishedThrough` («Завершить день»), `lastEveningPreviewShownFor` (the day the evening overview was last opened automatically) |
| `organizer:appearance` | This device only: `system`, `light` or `dark`. Read early by `boot.js` (read-only) |
| `organizer:language` | This device only: `ru` or `en`. Read early by `boot.js` (read-only). Not in backups |
| `arina-organizer-v1` | The prototype's data. **Read once, never written or deleted.** |

`localStorage` is enough for this data size (hundreds of KB). Only `storage.js` touches it — with one read-only exception: `boot.js` reads `organizer:appearance` and `organizer:language` before the app starts. The app writes only keys starting with `organizer:` (checked by a test).

### Dates and times
- Calendar dates are local date keys `YYYY-MM-DD`; times are `HH:MM`; event moments are local wall-clock `YYYY-MM-DDTHH:MM` (no time zone).
- Record timestamps (`createdAt`, `updatedAt`, `completedAt`, `deletedAt`) are ISO 8601 UTC.
- The app re-checks "today" every 30 seconds and when it returns to the foreground.
- *Sync note for later:* event times have no time zone; if devices in different zones ever sync, add one then.

### Tasks, events, reminders
- A **task** is something to do; an **event** happens at a time. They are separate collections.
- A task's `time` is allowed only on day tasks. A `reminder` is `{ minutesBefore }` relative to the task's time, so it moves with the task. Moving a task off a specific day clears its time and reminder; the deadline never changes.
- Reminders while the app is closed are not possible in a local-only iOS web app. Plan: in-app reminders while open, and an `.ics` export so Apple Calendar delivers alerts (Phase 2).

### Morning review
- Phase 0 keeps the prototype's behaviour: unfinished **day** tasks planned before today, with «Сегодня», «На неделю», «Без даты».
- Phase 1 adds unfinished **week** tasks from past weeks (`unfinishedBefore` is ready), plus «Завтра» and weekday choices.

### Screens and security
- Interface language: **Russian or English, chosen manually** (requirement 15, built in 0.3.0, see B9).
- No inline event-handler attributes. Elements carry `data-action` / `data-form`; one listener in `app.js` routes them (this removed the cause of the "create event/project/list does nothing" bug).
- Every value placed into HTML passes through `esc()`. Ids must match `[A-Za-z0-9_.:-]`.
- A Content-Security-Policy in `index.html` allows only the app's own scripts and blocks requests to any other address (`default-src 'self'; connect-src 'self'`). See `SECURITY.md`.
- Text from data files is treated as data: dictionary lookups use own keys only (a title such as `constructor` is shown as typed), and odd values in an imported file cannot break a screen.

### Installed app and updates
- `sw.js` caches all app files (cache-first), so the app opens offline.
- **Release rule:** after changing any file, bump `APP_VERSION` in `version.js` **and** `VERSION` in `sw.js` to the same new value; add new files to `ASSETS`. `tests.html` checks both.
- A new version is installed in the background and waits. The app shows «Доступна новая версия · Обновить»; it never reloads on its own. (As in every browser, a waiting version also starts once every window of the app has been closed.)
- An update replaces only the app's files. It never clears or rewrites saved data; a data-format upgrade, when needed, happens on the next start under the guarded-upgrade rule (C, rule 10).

### Backups
- «Сохранить копию» opens the iPhone share sheet (choose «Сохранить в Файлы»); if sharing is unavailable it downloads a file; a third fallback shows the backup text to copy.
- File name: `organizer-backup-YYYY-MM-DD-HHMM.json`. Format: `{ app: 'organizer', kind: 'backup', appVersion, schemaVersion, exportedAt, data }`.
- Import accepts this format, a bare document, and the prototype's format.
- The Today screen reminds about a backup when none was made from this device, or the last one is 7+ days old.

---

## D. Data model (schema version 4)

Document: `{ schemaVersion: 4, dataId, createdAt, updatedAt, tasks, events, projects, lists, series, waiting, templates, settings, quarantine }`

Version history: 1 = prototype (no number), 2 = 0.2.0–0.2.2, 3 = 0.3.0 (adds `settings.day` and `dataId`), 4 = 0.4.0 (adds the collections `series`, `waiting`, `templates`; task fields `review`, `seriesId`, `occurrenceDate`, `skipped`, `doneDay`; optional list `categories` and item `category`). Every upgrade only ADDS fields with empty defaults; no existing value is changed.

**dataId:** a random id of this organizer, made on first start. It is not personal data. An import compares it to tell «my own backup» from «a backup from another organizer» (another device or another person). An old backup without it continues the current organizer; a backup moved to a new, empty device brings its id along.

**Task**
| Field | Type | Notes |
|---|---|---|
| `id` | string | random UUID |
| `title` | string | |
| `plan` | `{ kind: 'day'│'week'│'none', date }` | `date` = day, or the Monday of the week, or `null` |
| `time` | `'HH:MM'` or null | day tasks only |
| `reminder` | `{ minutesBefore }` or null | needs `time` |
| `deadline` | `'YYYY-MM-DD'` or null | never changed by rescheduling |
| `projectId` | string or null | link to a project (Phase 3) |
| `done`, `completedAt` | boolean, ISO or null | |
| `doneDay` | `'YYYY-MM-DD'` or null | planning day of completion (recurring tasks count from it) |
| `review` | `{ day, choice: 'moved'│'kept'│'done', part: 'am'│'pm' }` or null | last morning/evening decision |
| `seriesId`, `occurrenceDate` | string, date key (or null) | recurring-task link; the pair is unique |
| `skipped` | boolean | an occurrence skipped on purpose (kept in the history, hidden from lists) |
| `createdAt`, `updatedAt`, `deletedAt` | ISO, ISO, ISO or null | |

**Event:** `id, title, start ('YYYY-MM-DDTHH:MM'), end (same or null), allDay, repeat (null or { freq: 'weekly', days: [1..7], until, skip: [dates] }), alerts ([{ minutesBefore }]), createdAt, updatedAt, deletedAt`. `repeat` and `alerts` are validated now and used from Phase 2.

**Project:** `id, name, milestones ([{ id, title, done, createdAt, updatedAt, deletedAt }]), quantity ({ current, total, unit }), createdAt, updatedAt, deletedAt`. Milestone progress and quantity progress are shown separately.

**List:** `id, name, items ([{ id, title, done, createdAt, updatedAt, deletedAt }]), createdAt, updatedAt, deletedAt`.

**Settings:** `{ eveningPreview: { enabled, time }, day: { wake, bed, cutoff, setupDone } }` — `wake`/`bed` are `'HH:MM'` or null, `cutoff` is `'HH:MM'` (default `'00:00'`). Each field is validated on its own, so one bad value never resets the others.

**Series** (`series`): `id, title, freq (daily│weekly│monthly│yearly), interval, mode (completion│fixed), startDate, time, paused, generatedThrough, projectId, createdAt, updatedAt, deletedAt`.

**Waiting** (`waiting`): `id, title, from, followUp (date or null), note, resolved, resolvedAt, taskId, createdAt, updatedAt, deletedAt`.

**Template** (`templates`): `id, name, base (id of the built-in it overrides, or null), items [{ id, title, category }], categories [names], createdAt, updatedAt, deletedAt`. Built-in templates live in code (`i18n-v4.js`); a record with `base` is the person's edited copy of a built-in, or (with `deletedAt`) a marker that it was deleted. Markers are never purged.

**Added in 0.5.0 (all optional, schema stays 4, validated leniently — a wrong value is dropped, the record is kept):** task `indent` (`true` or absent); list `kind` (`'home'` only, the home inventory) and list-item `stock` (`'have'│'low'│'out'`); event `prep` (absent, or an array of items `{ id, title, done, createdAt, updatedAt, deletedAt }`; absent = no preparation created). 0.4.0 code that opens such data keeps these fields (tested).

**Quarantine entry:** `{ at, source: 'load'│'import'│'legacy'│…, collection, parentId, reason, record }`.

Unknown extra fields on records are preserved. Changing the format means: bump `SCHEMA_VERSION`, add an upgrade step in `schema.js`, add a test.

---

## F. Release rules for data preservation (owner, 2026-10-09) — release-blocking

A version **must not be published** if a critical migration or data-isolation test fails. Each rule, how it is met, and how it is tested:

| # | Rule | How it is met (0.3.0) | Tested by |
|---|---|---|---|
| R1 | Never reset, erase or overwrite user data during an update. | The service worker caches only app files and never touches storage; data is changed only through `store.js`. | `upgrade-test.py`; unit test on `sw.js` |
| R2 | Every schema change has a backward-compatible upgrade from every supported earlier version. (0.5.0: no schema change; additive optional fields only.) | `schema.js → normalizeDoc` upgrades v1 → v3 and v2 → v3 in one chain. Supported: prototype (v1), 0.2.0–0.2.2 (v2). | unit tests «Перенос данных», «Сохранность данных при обновлении» |
| R3 | Before an upgrade: validate, keep a recoverable copy; if it fails, don't overwrite the original, explain, offer recovery. | Guarded upgrade (section C, rule 10): record check + exact-text rollback copy first; otherwise read-only + «Скачать исходные данные» (+ «Продолжить без копии» when only space was missing). | unit tests (copy failure, crash, six kinds of lost record) |
| R4 | Test upgrades with realistic saved data from all previous supported versions. | 0.2.0, 0.2.1 and 0.2.2 builds, real data (80 tasks, 15 events, projects, lists, quarantine) and copies made by the old code itself. | `upgrade-test.py` × 3 versions; e2e (prototype) |
| R5 | Completed tasks, deadlines, recurring history, projects, list items, settings and all other records intact. | Upgrade compares every collection field by field. (Recurring tasks do not exist yet; the event repeat rule is checked.) | `upgrade-test.py`, unit tests |
| R6 | Test updates in two independent browser contexts; no mixing. | Two people upgraded side by side. | `upgrade-test.py`, `privacy-test.py` |
| R7 | Service-worker updates must not clear `localStorage` or reset data. | `sw.js` has no storage code; only old `organizer-*` caches of app files are deleted. | unit test on `sw.js`; `upgrade-test.py` (no key removed) |
| R8 | Never silently replace unreadable or newer data with an empty organizer. | Newer data → read-only. Unreadable data → raw text kept in rescue first, newest valid copy loaded, red banner. Failed upgrade → read-only with the data shown. | unit tests; `upgrade-test.py` (old window cannot overwrite) |
| R9 | Daily copies: one per day, latest 5. Separate safe rollback for upgrades, imports, restores, never silently destroying the only recoverable copy. | Section C, rule 6: separate lists; no removal to make room; the user is asked before a unique rollback copy is rotated out. | unit tests «Хранилище», «Сбои записи», «Сохранность…» |
| R10 | Don't change the URL, origin or storage identity without a tested data-transfer plan. | Storage keys unchanged since 0.2.0. Moving to a new address = export at the old address, import at the new one (README, SECURITY.md). | manual; documented |
| R11 | Before each release: a migration test report and the remaining data-loss risks. | `TESTING.md`, section 2. | — |
| R12 | If a version cannot safely read or upgrade data, stop instead of risking deletion. | Same as R3: nothing is written. | unit tests |

These rules never promise that data cannot be lost: device loss, browser storage being cleared, and deleting the Home Screen app remain risks (see `TESTING.md` and `SECURITY.md`). Exported backups are the protection against them.

## G. Privacy and data isolation (owner, 2026-10-09)

Details, limits and evidence are in `SECURITY.md`. Rules every future update must keep:

| # | Rule |
|---|---|
| P1 | Data is stored only in the browser storage of the device it was entered on, under `organizer:*` keys. No cookies, no IndexedDB, no `sessionStorage` (unless this file and `SECURITY.md` are changed on purpose). |
| P2 | The app makes **no network requests** other than loading its own files. App code contains no `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource` or third-party addresses (only `sw.js` fetches the app's own files). A unit test fails otherwise. |
| P3 | No analytics, trackers, third-party scripts, fonts or CDNs. The CSP stays `default-src 'self'` with `connect-src 'self'`; a unit test checks it. |
| P4 | Data leaves the device only when the user does it: export (share sheet or download) or «Скопировать текст». |
| P5 | Every import is previewed and confirmed; a backup from another organizer that replaces data needs a second confirmation. |
| P6 | Any future sync must be opt-in, documented, and covered by new isolation tests. It is never added silently. |
| P7 | The app's address (origin) must not be shared with other websites. Before the app is shared with other people it is published on its own origin (see `README.md`, «Publish»). |
| P8 | Each release passes `privacy-test.py` (two independent browser contexts) before it is published. |

## E. Working rules for development

1. **One source of truth:** the GitHub repository. Never merge two different copies by hand.
2. **One AI changes code at a time.** Each change lists the files it touched.
3. **Small changes.** Before a release: run `tests.html` (all green) and the manual checklist in `TESTING.md`.
4. **Data is changed only** through `actions.js` → `store.update()` (or `replaceDocument()` inside `store.js` for whole-document replacement). Nothing else writes to `localStorage`. A storage operation may report success only after the write is confirmed.
5. **No inline handlers, always `esc()`** for anything placed into HTML.
6. **Format changes** need a schema version bump, an upgrade step and a test. Never remove a field without an upgrade step.
7. **Release:** bump both version numbers, update `CHANGELOG.md`, and update this file when a rule changes.
8. **Phases:** Phase 1 does not start until Phase 0 is reviewed (owner, 2026-10-09).
9. **Release order** is in `ROADMAP.md`. Each release is small, is approved by the owner before work starts, and is reviewed before the next one begins.
10. **Existing data is never lost.** Every format change keeps a frozen sample document for each earlier schema version in the tests, and checks the whole upgrade chain (prototype → current) field by field.
11. **Required tests:** overnight dates (cutoff × time-of-day × month/year end × daylight-saving nights × several time zones), recurrence (rule calendars, idempotent generation, no duplicates with two windows or after import) and data migration. The full click-through suite runs in both themes and in both languages.
12. **Release gate (owner, 2026-10-09):** a version is published only when `tests.html`, `e2e-test.py`, `privacy-test.py` and `upgrade-test.py` (from every supported earlier version) all pass, and `TESTING.md` holds the migration report with the remaining data-loss risks. A failed migration or isolation test blocks the release.
13. **Future updates preserve data isolation** (section G) and the release rules (section F).

### B12. Restoring a converted original (0.5.0)
- Task ↔ event conversion records `convertedFrom` (on the new record) and `convertedTo` (on the original) — plain ids, optional, dropped by validation if malformed (never quarantined).
- **Rule:** among all records connected by conversions (any chain length, either direction) **at most one is active**. Restoring a deleted member while another is active needs an explicit confirmation; on confirm the active one is soft-deleted (restorable for 30 days) and the restored one becomes active. Without confirmation nothing changes. If the other side is already deleted or purged, restoring needs no question.
- Nothing is merged: edits made to either record stay in that record.
- Known limit: «Ожидаю от других» made from a task is **not** linked this way, so restoring that task from «Удалённые» while the waiting item is active gives both. Nothing is lost.
- Known limit: importing a backup that already has both sides active is not corrected.
