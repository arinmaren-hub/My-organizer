# CHANGESET — My Organizer 0.5.0 → 0.5.1

A small interface update based on the user's real iPhone feedback. **No changed storage schema, no deleted files, no removed user data, no changed website URL.**

## Files to update (18, including this document)

- `CHANGELOG.md`
- `DECISIONS.md`
- `README.md`
- `TESTING.md`
- `app.css`
- `app.js`
- `components.js`
- `e2e-test.py`
- `e2e-v5-test.py`
- `icons.js`
- `sw.js`
- `tests-v5.js`
- `version.js`
- `view-calendar.js`
- `view-lists.js`
- `view-tasks.js`
- `view-today.js`
- `CHANGESET.md`

No new application modules or removed files. 41 other files in the project do not need to be uploaded again.

## Visible changes

- Top application menu uses a settings gear rather than ellipsis.
- Task and event rows show no extra `···` actions; short tap on text edits, long press shows the contextual menu. In browsers with a keyboard, Shift+F10 or context-menu key opens the menu on a focused row.
- Ordinary task and list checkboxes are circular, and lines between these rows are removed.
- Checked tasks move to the bottom *of their current day/week/group*; checked items in ordinary lists move to the bottom **inside their existing category**. Unchecking restores the original relative position. The underlying saved order is not changed.
- Event preparation checklist remains unchanged. No manual drag/reorder was added.

## Installation (from already installed 0.5.0)

1. Open your installed iPhone organizer and use the settings gear → «Копии и данные» → «Сохранить копию». Save the JSON file **outside the app** (e.g. Files/iCloud Drive) and check it exists.
2. Unpack `organizer-0.5.1-changed-only.zip` and upload **the files inside, not the ZIP**, to the root of the **same** GitHub repository (do not create a new subfolder).
3. Include all 18 files in **one** GitHub commit. There are no files to delete.
4. Wait for GitHub Pages publication; then open the installed PWA and accept «Обновить» when prompted. Do **not** uninstall the PWA or clear Safari data.
5. Check existing tasks and lists, the settings gear, tap/long press, rounded checkboxes, completed-to-bottom behaviour, languages, and offline availability.

If in doubt, instead upload all files from `organizer-0.5.1-full.zip` (the `organizer` folder's **contents**) in one commit. Keep the old 0.5.0 ZIP and your exported data backup for recovery.

## Tests / limitations

- 310/310 JavaScript tests passed with Node.js test harness in four time zones (Athens, Los Angeles, Tokyo and Kiritimati); four additional tests specifically cover the new sorting and row markup.
- Browser UI regression tests were adapted to the new no-ellipsis behaviour but **could not be run** in this environment (local browser navigation was blocked). Their previous 0.5.0 results do not prove 0.5.1 behaviour.
- Real iPhone/Safari interactions (especially long press, checkmark appearance and retaining focus) must be verified manually after update.
- Service worker and app version are both **0.5.1**, so the installed app can recognize an update. The rare mixed-cache limitation of v0.5.0 still exists; publishing in a single commit reduces the risk but does not eliminate it.
