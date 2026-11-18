# CHANGESET — 0.8.1 → 0.9.0 (repeat in words, delete all at once)

Baseline: the 0.8.1 package delivered on 2026-11-18. Target: 0.9.0, **same data format (schema 7)**: nothing is converted. Same storage keys, same app address. Nothing is deployed by this package.

If your GitHub repository has an **older** version than 0.8.1, upload the **full** 0.9.0 package instead of the changed-files package.

## Added (4)
- `parserepeat.js`: reads repeat words in a fast-entry line
- `i18n-v9.js`: new texts and the repeat words (Russian only)
- `tests-v9.js`: new unit tests
- `e2e-v9-test.py`: new browser test (Russian)

## Modified (15)
- **App code:** `actions.js`, `app.js`, `i18n.js`, `sw.js`, `version.js`, `view-sheets.js`
- **Tests:** `tests.js`, `e2e-v6-test.py` (deleting a repeating event now asks «Только это / Это и все следующие»), `upgrade-test.py` (starts the rollback step from «Сегодня», since after 21:00 the evening overview opens by itself)
- **Docs:** `CHANGELOG.md`, `CHANGESET.md`, `DECISIONS.md`, `README.md`, `ROADMAP.md`, `TESTING.md`

## Deleted
None.

## How to upload to GitHub (no programming needed)
1. **Save a backup first** in the installed app: ⚙ → «Копии и данные» → «Сохранить копию».
2. Unzip the package on a computer. The changed-files ZIP has only the files above; the full ZIP has everything. Either works if your repository has 0.8.1.
3. On github.com, open your repository → **Add file → Upload files**. Drag in the files **from inside the unzipped folder**, not the folder itself. Keep the same names, in the repository root (next to `index.html`).
4. Upload everything **except `sw.js`** and press «Commit changes». Then upload **`sw.js` alone** in a second commit.
5. Wait 1–2 minutes. Open the installed app and tap «Обновить» when it is offered. Do **not** delete the app from the Home Screen, and do not clear Safari's website data.
6. After the update, ⚙ → «Копии и данные» should show 0.9.0.
