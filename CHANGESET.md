# CHANGESET — 0.5.2 → 0.6.0

Baseline: the repository ZIP downloaded from GitHub (version.js and sw.js = 0.5.2). Target: 0.6.0, storage schema **5** (was 4), same storage keys, same app address. Nothing is deployed by this package.

## Added (7)
- `i18n-v6.js` — new Russian/English texts
- `search.js` — search logic (read-only)
- `view-search.js` — search screen
- `cleanup.js` — cleanup rules (eligibility, protection, removal, reminder timing)
- `view-cleanup.js` — cleanup screens
- `tests-v6.js` — new unit tests
- `e2e-v6-test.py` — new browser test

## Modified (29)
App code: `actions.js`, `app.css`, `app.js`, `calendar.js`, `components.js`, `i18n.js`, `icons.js`, `index.html`, `recur.js`, `schema.js`, `selectors.js`, `sw.js`, `version.js`, `view-sheets.js`, `view-tasks.js`, `view-today.js`
Tests: `tests.js`, `tests-v4.js`, `tests-v5.js`, `e2e-test.py`, `e2e-v5-test.py`, `upgrade-test.py`
Docs: `CHANGELOG.md`, `CHANGESET.md`, `DECISIONS.md`, `README.md`, `ROADMAP.md`, `SECURITY.md`, `TESTING.md`

## Deleted
None. (`RECOVERY_0.5.2.md` is kept; it is only history.)

## How to upload to GitHub (no programming needed)
1. **Save a backup first** in the installed app: ⚙ → «Копии и данные» → «Сохранить копию», keep the file in Files/iCloud.
2. Unzip the full 0.6.0 ZIP on a computer (or use the changed-files ZIP — same result, fewer files).
3. Open your repository on github.com → **Add file → Upload files**. Drag in the files **from inside the unzipped folder** (not the folder itself), keeping the same names, in the repository root.
4. Upload everything **except `sw.js`**, press «Commit changes». Then upload **`sw.js` last** in a second commit. (The app only offers the update after `sw.js` changes, so all other files are already in place.)
5. Wait 1–2 minutes. Open the app, tap «Обновить» when offered. Do **not** delete the app from the Home Screen and do not clear Safari data.
6. If something looks wrong: do not panic; your pre-update data is kept in «Копии и данные», and your backup file can be imported.

Do not publish until you have gone through the iPhone checklist in `TESTING.md` section 5 for at least the basics: update, Tasks screen, one search, one undo.
