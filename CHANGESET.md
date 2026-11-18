# CHANGESET — 0.7.0 → 0.8.0 («Завтра» and «Повторять»)

Baseline: the 0.7.0 package delivered on 2026-11-15 (`version.js` and `sw.js` = 0.7.0). Target: 0.8.0, storage schema **7** (was 6): two optional fields. Same storage keys, same app address. Nothing is deployed by this package.

If your GitHub repository has an **older** version than 0.7.0, upload the **full** 0.8.0 package instead of the changed-files package. It contains everything.

## Added (3)
- `i18n-v8.js`: new texts (Russian only; English is paused)
- `tests-v8.js`: new unit tests
- `e2e-v8-test.py`: new browser test (Russian)

## Modified (26)
- **App code:** `actions.js`, `app.css`, `app.js`, `i18n.js`, `recur.js`, `schema.js`, `sw.js`, `version.js`, `view-sheets.js`, `view-tasks.js`
- **Tests:** `tests.js`, `tests-v4.js`, `tests-v5.js`, `tests-v6.js`, `tests-v7.js`, `e2e-test.py`, `e2e-v5-test.py`, `e2e-v6-test.py`, `e2e-v7-test.py`, `upgrade-test.py`
- **Docs:** `CHANGELOG.md`, `CHANGESET.md`, `DECISIONS.md`, `README.md`, `ROADMAP.md`, `TESTING.md`

## Deleted
None.

## How to upload to GitHub (no programming needed)
1. **Save a backup first** in the installed app: ⚙ → «Копии и данные» → «Сохранить копию». Keep the file in Files or iCloud.
2. Unzip the package on a computer. The changed-files ZIP has only the files above; the full ZIP has everything. Either works if your repository has 0.7.0.
3. On github.com, open your repository → **Add file → Upload files**. Drag in the files **from inside the unzipped folder**, not the folder itself. Keep the same names, in the repository root (next to `index.html`).
4. Upload everything **except `sw.js`** and press «Commit changes». Then upload **`sw.js` alone** in a second commit.
5. Wait 1–2 minutes. Open the installed app and tap «Обновить» when it is offered. Do **not** delete the app from the Home Screen, and do not clear Safari's website data.
6. After the update, ⚙ → «Копии и данные» should show 0.8.0 and a copy «перед обновлением формата данных». That copy, or your backup file, brings back the exact previous data if anything looks wrong.

Before relying on it, go through the first items of the iPhone checklist in `TESTING.md` §5: the update itself, «Завтра» in «Новые дела», and «Повторять» on one event.
