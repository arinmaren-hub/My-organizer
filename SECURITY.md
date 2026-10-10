# SECURITY.md — privacy, data isolation and their limits (version 0.5.0)

This file says what the app does to keep each person's data private, what it **cannot** protect against, and how this was tested. It does not claim the app is perfectly secure: every guarantee below comes with its evidence, and every known gap is listed.

Rules that keep these guarantees in future versions: `DECISIONS.md`, sections F (data preservation, R1–R12) and G (privacy, P1–P8).

---

## 1. In plain words

- The organizer is a set of files that your browser downloads from the web address. After that, everything happens **on your device**. Your tasks, events, projects and lists are saved in your browser's storage on that device and are **never sent anywhere**: not to GitHub, not to the app creator, not to any other server.
- Each person who installs the app has their **own, separate** organizer on their own device. Nothing is shared or synchronised between devices or people.
- Data leaves the device **only when you do it yourself**: «Сохранить копию» (a file you choose where to put) or «Скопировать текст».
- Importing a backup always asks first. A backup that came from **another organizer** (another device or another person) gets a clear warning and a **second** confirmation, and your current data is kept as a rollback copy before anything is replaced.
- The app creator, as the owner of the GitHub repository, **cannot see anyone's records through the app**: the app has no way to send them, and the web host only ever receives requests for the app's own files.
- What could still expose data is listed honestly in section 3 — mainly: whoever controls the published code could publish a harmful update; other websites on the **same web address** share browser storage; backup files are not encrypted; anyone who can use your unlocked device can open the app.

---

## 2. Guarantees and the evidence for each

| # | Requirement (owner, 2026-10-09) | How the app meets it | Evidence |
|---|---|---|---|
| 1 | Each person's tasks, events, lists and projects remain completely separate. | All data lives in the browser storage (`localStorage`) of the device and browser where it was entered. Browsers keep this storage separate for each device and each browser profile. The app has no accounts, no server and no shared database, so there is no place where two people's data could meet. | `privacy-test.py`: two independent browsers («A» and «B») use the same published app at the same address; each sees only its own records on every tab, before and after restarting; neither storage contains a single record of the other. Unit test «два хранилища не видят данных друг друга». |
| 2 | No personal data is automatically shared with another device. | There is no sync and no network code. The only ways out are user actions: export (share sheet / download) and «Скопировать текст». | Unit test: the code of every app file is scanned for network functions (`fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `importScripts`, `window.open`, `RTCPeerConnection`) and for third-party addresses — none found. Only `sw.js` fetches, and only the app's own files (checked). |
| 3 | The app creator / GitHub repository owner cannot access other people's personal records through the application. | The app never sends records anywhere, so nothing reaches the repository, GitHub Pages or the owner. No analytics, no error reporting, no cookies, no tracking. | `privacy-test.py` runs the app behind a logging web server (standing in for GitHub Pages): it received **only `GET` requests for the app's own files**, none with a body, and no record text in any address or header. The browsers kept no cookies, no `sessionStorage`, no IndexedDB. The offline cache holds only app files and no record text. |
| 4 | No personal data is uploaded to GitHub or external servers. | Same as 2 and 3, plus a Content-Security-Policy (`default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; script-src 'self'`) that makes the browser refuse to contact any other address, even if such code were added by mistake. | `privacy-test.py` tried, from inside the app page, to send stored data to another site with `fetch`, an image address, `sendBeacon` and a script: the browser blocked every attempt **before** it reached the network (`blocked by CSP`). A unit test checks the CSP keeps these settings. |
| 5 | Importing someone else's backup always requires explicit confirmation. | Every import shows a preview (what the file contains) and asks before replacing. Each organizer has a random id (`dataId`, not personal). A backup from a different organizer that would replace existing data shows a red warning and needs a **second, separate confirmation**; the store refuses it otherwise (not only the screen). Your current data is saved as a rollback copy first. | Unit tests (store refuses without the second confirmation; nothing is written, not even a copy). `e2e-test.py` and `privacy-test.py`: B's backup imported into A → warning shown; refusing the second question leaves A's data byte-for-byte unchanged; accepting replaces it and A's own data is in the rollback copy. |
| — | Odd or hostile backup files cannot break the app. | Imported values are validated; only plain text is shown from file headers and quarantine entries; text such as `constructor` or `__proto__` is treated as text; HTML in titles is shown as text. | Unit test and `privacy-test.py` with a crafted file (`__proto__`, `constructor`, `{"toString":1}`, `<img onerror>`): no error, no script run, «Данные» still opens, the shared object prototype is unchanged, previous data kept in a rollback copy. |

---

## 3. Limitations — what this does NOT protect against

1. **You trust whoever publishes the code.** The protections above are part of the app's own code. Whoever can change the files in the GitHub repository (the owner, or anyone who gets into the owner's GitHub account) could publish a new version that reads data and sends it somewhere — and could also remove the CSP, because it is in `index.html`. A new version is downloaded automatically and starts when the user taps «Обновить» **or** once every window of the app has been closed. The app cannot defend against its own publisher. What helps: two-factor authentication on the GitHub account; nobody else given write access; every release reviewed and passing `privacy-test.py` (release rule P8).
2. **Shared web address (origin) — important before sharing the app.** Browsers separate storage by *origin* (`https://name.github.io`), not by folder. All GitHub Pages project sites of one account share one origin: `https://USERNAME.github.io/organizer/` and `https://USERNAME.github.io/anything-else/` can read each other's browser storage on a visitor's device. If the owner ever publishes another page under the same account (or someone gets that ability), that page could read the organizer data of anyone who opens it in the same browser. **Fix before sharing:** publish the organizer on an origin used by nothing else — e.g. a free GitHub organization with a repository named `ORGNAME.github.io` and no other Pages sites in it, or a dedicated custom domain (steps in `README.md`). This is a hosting step; app code cannot fix it. Moving the app changes its storage, so existing data must be moved by export and import (rule R10). «Данные → О приложении» shows the address the data belongs to.
3. **Anyone who can use your unlocked device or browser profile can open the app** and see everything. There is no app password and no app-level encryption. On iPhone and iPad, the device passcode and Apple's data protection are what protect the data at rest. Two people sharing one browser profile share one organizer.
4. **Backup files are plain text (JSON), not encrypted.** They are as private as the place you keep them (Files, iCloud Drive, email, messages). Sending a backup to someone gives them all of its contents.
5. **«Скопировать текст»** puts all your data on the clipboard. Other apps can read the clipboard when you paste, and Apple's Universal Clipboard can pass it to your other Apple devices.
6. **The share sheet** gives the file to whichever app you choose.
7. **Browser extensions** with access to websites (on a computer, or Safari extensions on iOS) can read web pages, including this one.
8. **The web host sees normal visit information**, like for any website: IP address, time, device/browser type, and which app files were downloaded — never record content. As far as we know, GitHub does not show Pages visitor logs to repository owners; that is GitHub's policy and not something the app controls.
9. **Not verified on a real iPhone, iPad, Safari or WebKit.** All automated tests ran in Chromium. Storage separation by origin is a standard rule that Safari also follows, but it was not tested here.
10. **Data loss is a separate risk from privacy** and is not fully preventable by the app: losing the device; the browser deleting website data (Safari can delete data of websites that were not added to the Home Screen and were not used for a while, and «Очистить историю и данные сайтов» deletes it); deleting the Home Screen app (on iOS this deletes its data); a full device. Automatic copies live on the same device, so only **exported backups kept elsewhere** protect against these. See `TESTING.md`, «Remaining data-loss risks».

---

## 4. Tests performed for 0.5.0 (results: `TESTING.md`)

All on the final files, in headless Chromium 141 (Playwright 1.56), served over local http. Not tested on Safari/WebKit or a real iPhone.

| Test | What it covers | Result |
|---|---|---|
| `tests.html` (unit) | 306 tests, incl. «Приватность» and «Сохранность данных при обновлении»; four time zones | 306 / 306 |
| `privacy-test.py` | two independent browser contexts, logging server, storage surfaces, offline cache, CSP blocking, foreign backup, crafted backup | 38 / 38 checks |
| `upgrade-test.py` | real service-worker update 0.2.0, 0.2.1, 0.2.2, 0.3.0, 0.4.0 → 0.5.0 with two people side by side | 47 / 47 (0.2.x), 46 / 46 (0.3.0), 45 / 45 (0.4.0) |
| `e2e-test.py`, `e2e-v5-test.py` | the whole app clicked through in both languages | 125 / 125 and 677 / 677 checks |
| Independent code review | a separate agent reviewed storage, conversion, Home, lists and the service worker | no data-loss or privacy defects; 3 wrong-behavior findings fixed, 2 limits documented (`TESTING.md`) |

**Service-worker install (0.5.0):** each file is fetched as `file?v=VERSION` (bypassing HTTP cache), fully read, the downloaded `version.js` must contain the expected version, and only then is everything stored. A half-uploaded site or a stale CDN copy therefore cannot produce a mixed offline cache; the install fails and the previous version keeps working. Limit: it does not prove that every other file is the new one (see `TESTING.md`). No network code touches personal data.

How to run them yourself: `TESTING.md`, section 6.

---

## 5. Keeping it this way

Every future version must keep `DECISIONS.md` section G (P1–P8): no network code, no third-party resources, the CSP unchanged, data only under `organizer:*` keys, imports always confirmed, no silent sync, the app on its own origin before it is shared, and `privacy-test.py` passing before release. A change to any of these needs an explicit decision recorded in `DECISIONS.md` and an update of this file.

## 6. Reporting a problem

If you notice anything that could expose someone's data, stop sharing the app's address, write down what you saw, and report it to the app owner. Do not post other people's data when reporting.
