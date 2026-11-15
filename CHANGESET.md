# CHANGESET — 0.6.0 → 0.7.0 («Цели»)

Baseline: the 0.6.0 package delivered on 2026-10-11 (`version.js` and `sw.js` = 0.6.0). Target: 0.7.0, storage schema **6** (was 5): one new collection, `goals`. Same storage keys, same app address. Nothing is deployed by this package.

If your GitHub repository still has **0.5.2** (0.6.0 was never uploaded), upload the **full** 0.7.0 package instead of the changed-files package. It contains everything from 0.6.0 as well.

## Added (5)
- `goals.js`: reading helpers for goals (next step, progress, note links)
- `view-goals.js`: the «Цели» tab, goal screen and its sheets
- `i18n-v7.js`: new Russian/English texts
- `tests-v7.js`: new unit tests
- `e2e-v7-test.py`: new browser test

## Modified (29)
- **App code:** `actions.js`, `app.css`, `app.js`, `i18n.js`, `icons.js`, `schema.js`, `search.js`, `selectors.js`, `store.js`, `sw.js`, `version.js`, `view-search.js`, `view-sheets.js`, `view-tasks.js`
- **Tests:** `tests.js`, `tests-v4.js`, `tests-v5.js`, `tests-v6.js`, `e2e-test.py`, `e2e-v5-test.py`, `e2e-v6-test.py`, `upgrade-test.py`
- **Docs:** `CHANGELOG.md`, `CHANGESET.md`, `DECISIONS.md`, `README.md`, `ROADMAP.md`, `SECURITY.md`, `TESTING.md`

## Deleted
None.

## How to upload to GitHub (no programming needed)
1. **Save a backup first** in the installed app: ⚙ → «Копии и данные» → «Сохранить копию». Keep the file in Files or iCloud.
2. Unzip the package on a computer. The changed-files ZIP has only the 34 files above; the full ZIP has everything. Either works if your repository has 0.6.0.
3. On github.com, open your repository → **Add file → Upload files**. Drag in the files **from inside the unzipped folder**, not the folder itself. Keep the same names, in the repository root (next to `index.html`).
4. Upload everything **except `sw.js`** and press «Commit changes». Then upload **`sw.js` alone** in a second commit. The app offers the update only after `sw.js` changes, so by then all other files are in place.
5. Wait 1–2 minutes. Open the installed app and tap «Обновить» when it is offered. Do **not** delete the app from the Home Screen, and do not clear Safari's website data.
6. After the update: ⚙ → «Копии и данные» should show 0.7.0 and a copy «перед обновлением формата данных». If anything looks wrong, that copy (or your backup file) brings back the exact previous data.

Before relying on it, go through at least the first items of the iPhone checklist in `TESTING.md` §5: the update itself, the five tabs, one goal with steps, «Шаги к целям» in Задачи, and one search.
