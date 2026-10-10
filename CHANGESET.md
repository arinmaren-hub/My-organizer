# CHANGESET.md — 0.4.0 → 0.5.0

Same repository, same file names, same app address. **Nothing is deleted or renamed.** Schema stays 4; storage keys are unchanged, so existing data opens as it is.

## Files

**Added (6)** — `e2e-v5-test.py`, `home.js`, `i18n-v5.js`, `icons.js`, `tests-v5.js`, `view-sheets.js`

**Modified (30)**
- App code: `actions.js`, `app.css`, `app.js`, `components.js`, `i18n-v4.js`, `i18n.js`, `index.html`, `schema.js`, `selectors.js`, `store.js`, `sw.js`, `version.js`, `view-calendar.js`, `view-data.js`, `view-evening.js`, `view-lists.js`, `view-tasks.js`, `view-today.js`, `view-waiting.js`
- Tests: `tests.js`, `e2e-test.py`, `e2e-v4-test.py` (only an «obsolete» note at the top), `privacy-test.py`, `upgrade-test.py`
- Docs: `CHANGELOG.md`, `DECISIONS.md`, `README.md`, `ROADMAP.md`, `SECURITY.md`, `TESTING.md`

**Deleted: none.** (`CHANGESET.md` itself is also new in the changed-only ZIP, 7 added files in total, 37 files in the changed-only ZIP.)

## How to upload to GitHub

Use the **same repository** you publish from. Back up first: «···» → «Копии и данные» → save a copy on your phone, and keep your current ZIP.

1. Open the repository on github.com → **Add file → Upload files**.
2. Unpack `organizer-0.5.0-changed-only.zip` on your computer and drag its **files** (not the zip, and not an extra outer folder) into the page. All names are at the top level of the repository, as before.
3. Make it **one commit** («0.5.0») with all files together. Do not split into several commits.
4. Wait for GitHub Pages to finish (the Actions/Pages tab turns green; a few minutes). Reload the app twice; «Доступна новая версия» → «Обновить».

If you upload the full `organizer-0.5.0.zip` instead, unpack it and upload its files the same way; the result is identical.

## Safety analysis of the changed-only upload

- **Uploading never deletes.** GitHub's upload only adds and overwrites files; it does not remove files that are missing from your upload. This release has **no obsolete files**, so nothing needs removing. If the repository holds extra files from earlier experiments they are harmless: the service worker caches only the files listed in its own list.
- **Everything must be present.** The new `home.js`, `icons.js`, `i18n-v5.js`, `view-sheets.js` and `tests-v5.js` are required by the app; the changed-only ZIP contains them. If any is missing the app will not start for new visitors, so check the upload list shows all 7 added and 30 modified files (37 in total, including this file).
- **Partial upload.** If a visitor's phone loads while only some files are online: the new service worker downloads every file with `?v=0.5.0`, reads it fully, and checks that the downloaded `version.js` says 0.5.0. If anything is missing, old, or served from a stale CDN copy, the install **fails and the old version keeps running** from its cache; the next check retries. Your data is not touched by a failed install. (Verified: install succeeds on the full set; failure paths are logic only, not simulated end-to-end.) **Residual risk:** the check proves `version.js` is new and every file downloads, not that each file is new. If a CDN edge serves a stale copy of just one other file, a mixed set could be cached until the version is bumped again. GitHub Pages publishes one commit as a unit, so upload as **one commit** and, if the app misbehaves right after an update, bump `APP_VERSION`/`VERSION` and re-upload.
- **Offline cache.** The cache name contains the version. After a successful install and tapping «Обновить», the old cache is dropped and the new one is used offline. Tested in Chromium (upgrade tests include «opens offline with the same data»).
- **Old copies of the app** (a window left open on 0.4.0) go read-only when the new one takes over, as in earlier versions; data is never overwritten.
- **GitHub Pages delay.** The site may serve old files for a few minutes after the commit. Mixed states are covered by the point above; just wait and reload.
- **Rollback.** Re-upload the 0.4.0 files (and `sw.js`) to go back. Data written by 0.5.0 uses optional fields only; 0.4.0 keeps them untouched but does not show them (home stock states, event preparation lists, indent). Export a backup before rolling back.

## Changes in this revision (after the first 0.5.0 delivery)
Same files as before (no file added or removed); contents changed in `actions.js`, `app.js`, `schema.js`, `view-sheets.js`, `i18n-v5.js`, `tests-v5.js`, `e2e-v5-test.py` and the docs. Data format: two optional fields (`convertedFrom`, `convertedTo`) on tasks/events, ignored by 0.4.0 and kept by it.
- Restoring a converted original can no longer produce two active records (asks first; the other goes to «Удалённые»).
- Review fixes: built-in template restore, reminder on conversion, duplicate «Дом» rename.

## Checked on the final ZIPs

See the delivery message; the numbers in `TESTING.md` are from the code in these ZIPs.
