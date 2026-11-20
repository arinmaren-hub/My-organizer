# CHANGESET — 0.9.0 → 0.9.2 (calmer editors, moving rows by holding them)

Baseline: the **0.9.0** package delivered on 2026-11-18. That is the version on the phone; 0.9.1 was delivered but can be skipped, and this changeset includes its changes. Target: 0.9.2, **same data format (schema 7)**: nothing is converted. Nothing is deployed by this package.

If your GitHub repository has an **older** version than 0.9.0, upload the **full** 0.9.2 package instead of the changed-files package.

## Added
None.

## Modified (18)
- `actions.js`: moving list items and goal steps into a new order (only the given unfinished records change places; a list changed meanwhile is refused)
- `app.js`: hold-to-move: a half-second hold lifts a row, moving changes the order, letting go saves it; the page does not scroll while a row is lifted; a tap still opens the row
- `app.css`: the lifted row and the rows making room for it; editors with one wide «Сохранить» and an even list of actions (0.9.1)
- `components.js`: task and event editors: one wide «Сохранить» (0.9.1)
- `view-sheets.js`: task and event actions as one even list, «Удалить» last in red (0.9.1)
- `view-lists.js`: unfinished list items can be held and moved
- `view-goals.js`: goal steps can be held and moved on the goal's own screen
- `i18n-v9.js`: new Russian texts for moving rows and the actions list
- `version.js`: 0.9.2
- `sw.js`: 0.9.2 (upload this one last)
- `tests-v9.js`: new tests for reordering
- `e2e-v9-test.py`: click-through test for moving rows with the mouse and with simulated touch
- `CHANGELOG.md`: 0.9.1 and 0.9.2
- `DECISIONS.md`: why moving by hand is allowed in lists and goal steps, but not in «Задачи»
- `README.md`: how to move rows
- `ROADMAP.md`: updated
- `TESTING.md`: 0.9.2 test results and new iPhone checks
- `CHANGESET.md`: this file

## Deleted
None.

## How to upload to GitHub (no programming needed)
1. **Save a backup first** in the installed app: ⚙ → «Копии и данные» → «Сохранить копию».
2. Unzip the package on a computer. The changed-files ZIP has only the files above; the full ZIP has everything. Either works if your repository has 0.9.0 or 0.9.1.
3. On github.com, open your repository → **Add file → Upload files**. Drag in the files **from inside the unzipped folder**, keeping the same names, in the repository root (next to `index.html`).
4. Upload everything **except `sw.js`** and press «Commit changes». Then upload **`sw.js` alone** in a second commit.
5. Wait 1–2 minutes, open the app and tap «Обновить». Do **not** delete the app from the Home Screen or clear Safari's website data.
6. ⚙ → «Копии и данные» should show 0.9.2.
