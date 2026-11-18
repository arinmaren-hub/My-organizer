# CHANGESET — 0.8.0 → 0.8.1 (no «↻»)

Baseline: the 0.8.0 package delivered on 2026-11-18. Target: 0.8.1, **same data format (schema 7)**: nothing is converted. Same storage keys, same app address. Nothing is deployed by this package.

If your GitHub repository has an **older** version than 0.8.0, upload the **full** 0.8.1 package instead of the changed-files package. It contains everything.

## Added
None.

## Modified (20)
- **App code:** `components.js`, `i18n-v8.js`, `sw.js`, `version.js`, `view-calendar.js`, `view-evening.js`, `view-search.js`, `view-sheets.js` (a comment only), `view-tasks.js`, `view-today.js`
- **Tests:** `e2e-v4-test.py`, `e2e-v5-test.py` (they found the «Повторы ждут ответа» card by its «↻»), `e2e-v8-test.py` (a new check that no «↻» is shown), `upgrade-test.py` (it now works out from `schema.js` whether the data format changed)
- **Docs:** `CHANGELOG.md`, `CHANGESET.md`, `DECISIONS.md`, `README.md`, `ROADMAP.md`, `TESTING.md`

## Deleted
None.

## How to upload to GitHub (no programming needed)
1. **Save a backup first** in the installed app: ⚙ → «Копии и данные» → «Сохранить копию».
2. Unzip the package on a computer. The changed-files ZIP has only the files above; the full ZIP has everything. Either works if your repository has 0.8.0.
3. On github.com, open your repository → **Add file → Upload files**. Drag in the files **from inside the unzipped folder**, not the folder itself. Keep the same names, in the repository root (next to `index.html`).
4. Upload everything **except `sw.js`** and press «Commit changes». Then upload **`sw.js` alone** in a second commit.
5. Wait 1–2 minutes. Open the installed app and tap «Обновить» when it is offered. Do **not** delete the app from the Home Screen, and do not clear Safari's website data.
6. After the update, ⚙ → «Копии и данные» should show 0.8.1.
