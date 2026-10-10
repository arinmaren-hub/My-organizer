# Мой органайзер — version 0.5.0

A personal organizer that runs entirely on your iPhone or iPad: tasks, events, projects and lists.
No account, no cloud, no AI. Your data stays on the device; you keep backups yourself.
Interface in Russian or English; «Сегодня» follows your own day, not midnight.

Other documents in this folder:
- `DECISIONS.md` — every confirmed requirement and technical rule (incl. release rules R1–R12 and privacy rules P1–P8)
- `SECURITY.md` — privacy guarantees, their limits, and how they were tested
- `ROADMAP.md` — release order
- `TESTING.md` — what was tested, the migration report, and the checklists
- `CHANGELOG.md` — what changed in each version

---

## 1. Publish the app (one time, about 15 minutes)

The app must be opened from an **https:// address** to be installable and to work offline.
Opening `index.html` as a file does **not** work. GitHub Pages hosts it for free.

The code becomes public on GitHub; **your data does not** — it never leaves the device.

**Give the app its own address.** Browsers keep saved data per *site address* (origin). All ordinary GitHub Pages sites of one account share one address (`https://USERNAME.github.io`), so any other page you ever publish there could read the organizer's data in a visitor's browser. Before you share the app with anyone, publish it as the **only** site of a separate free GitHub organization (steps below). Details: `SECURITY.md`, limitation 2.

Every step also works in Safari on an iPhone (all files are in one folder, no sub-folders).

1. Create a free account at **github.com** (Sign up) if you do not have one. Turn on two-factor authentication (Settings → Password and authentication): whoever controls this account controls the app's code.
2. Click **+** (top right) → **New organization** → choose the **Free** plan. Pick a name, e.g. `moi-organizer` — it becomes the address. Skip inviting members.
3. In the organization, click **New repository**.
   - Repository name: exactly `ORGNAME.github.io` (e.g. `moi-organizer.github.io`)
   - Visibility: **Public** (GitHub Pages is free only for public repositories)
   - Click **Create repository**.
4. On the new repository page click **uploading an existing file** (or **Add file → Upload files**).
5. Unzip the ZIP. Select **all files inside** the `organizer` folder (not the folder itself) and drag them onto the page (on iPhone: **choose your files** and select them all in the Files app).
6. Scroll down, click **Commit changes**. Wait until the upload finishes.
7. Open **Settings** (tab at the top of the repository) → **Pages** (left menu).
   - Under **Build and deployment → Source** choose **Deploy from a branch**.
   - Branch: **main**, folder: **/(root)** → **Save**.
8. Wait 1–3 minutes and refresh the Pages settings page. It shows **"Your site is live at"**
   `https://ORGNAME.github.io/` — that is your app's address.
9. Check it works: open `https://ORGNAME.github.io/tests.html` — every line must be green.
10. **Never publish any other page in this organization**, and do not give anyone else write access.

**Already using the app at the old address** (`https://USERNAME.github.io/organizer/`)? The new address starts with an empty organizer — data does not move by itself:
1. Open the app at the **old** address (its Home Screen icon) → **«···» → Копии и данные → Сохранить копию** → save the file to Files.
2. Install the app from the **new** address (section 2), open it from the new icon → **«···» → Копии и данные → Выбрать файл копии…** → pick that file → check the counts → **Заменить данные**.
3. Check that everything is there. Only then delete the old Home Screen icon (deleting it deletes the data stored with it) and, later, the old repository.

## 2. Install on the iPhone

1. Open your app address in **Safari** (not Chrome or another browser).
2. Tap **⋯** (to the right of the address bar) → **Share**. On older iOS versions, tap the Share button (square with an arrow) directly.
3. Scroll down → **Add to Home Screen**.
4. If you see **Open as Web App**, keep it **on**. Tap **Add**.
5. From now on, **open the organizer only from its Home Screen icon.**
   Safari and the installed app keep **separate** data. Anything typed in a Safari tab will not appear in the app.
6. Open the app from the icon. The first time, it asks for the language and your usual day (you can skip). Then go to **Данные** and check «О приложении»:
   - «Запущено с экрана «Домой»: **да**»
   - «Офлайн-режим: **готов**…» (may need a few seconds and a second launch)
7. Turn on Airplane Mode, close the app fully, open it from the icon: it must still open. Turn Airplane Mode off.

Same steps on the iPad. Note: the iPhone and the iPad will have **separate data** (no sync in this version).

## 3. Move data from the old prototype (only if you entered real data there)

1. Open the old prototype exactly the way you used it before.
2. Tab **Данные** → **Экспорт JSON** → save the file to Files / iCloud Drive.
3. Open the new app from its icon → **Данные** → **Выбрать файл копии…** → pick that file.
4. Check the preview counts → **Заменить данные**.

If the new app is ever opened at the same address where the prototype stored data, it moves that data automatically and leaves the old copy untouched.

## 4. Everyday use

Looking and ticking are the default; changing things appears only when you ask (tap a title, a row's «···», or «＋»).

- **Four tabs at the bottom:** Сегодня, Календарь, Задачи, Списки.
- **«＋» (bottom right)** adds things. On Сегодня and Задачи it opens a multi-line field: **one line = one task**, one «Добавить» saves them all. A task gets today (your planning day) — or, from the Calendar, the selected date — unless the text names a date («завтра», «в пятницу», «до пятницы», «Oct 15» …). A clock time asks «Задача / Событие / Только название». Inside a list it adds items; on Списки it creates a list (blank, from a template, or manage templates).
- **Сегодня** — the weekday and your planning date at the top left, today's checklist, a folded **Хвосты** section (unfinished tasks from earlier days: «Сегодня», «Завтра», «Выбрать дату», «Готово»; «Оставить как есть» is in the task's «···»; nothing moves by itself), a link to **Вечер**, and **Ожидаю от других** at the very bottom. «Сегодня» is **your** day: it changes at the time set in «День заканчивается в», not at midnight.
- **Rows** show a checkbox, the title, a small date/time and «···». Tap the title to edit; «···» (or a long press) offers Изменить, Перенести, Дублировать, Ожидаю от других, Сделать событием, Удалить. **Swipe a task to the right** to indent it one level (left to undo).
- **Календарь** — a month grid (Monday first) and a year view. Tap a date for its events and tasks; «＋» adds to that date. An event's details hold an optional collapsed **Подготовка** checklist.
- **Задачи** — all tasks by day / week / no date; **recurring tasks** are folded at the bottom.
- **Списки** — **Купить** (made automatically from home items that ran out), **Дом** (what you have at home: Есть / Заканчивается / Закончилось), and your lists with categories and templates (Supermarket, Suitcase Packing, your own). Management is in a list's «···».
- **«···» at the top right of Сегодня** — Вечер, Настройки (your day, evening overview), Копии и данные (backups, restore, automatic copies, deleted items), О приложении, «Завершить день», language (Русский / English) and appearance (Светлое / Тёмное / Как в системе). Language is chosen by hand and never follows the phone's language. «Прогресс» (projects) is hidden; it shows up here only if you already have projects.

**Backups — the one habit that matters.** Data lives only on this device. At least once a week:
**«···» → Копии и данные → Сохранить копию → Сохранить в Файлы** (choose iCloud Drive). The Today screen reminds you after 7 days.
If saving a file does not work, use **Показать текст копии → Скопировать текст** and paste it into Notes.

Deleted something by mistake? **«···» → Копии и данные → Удалённые** (kept 30 days; items inside a list or an event's preparation are not listed there).
Something went wrong after an import or an update? **«···» → Копии и данные → Автокопии → Восстановить**. There are daily copies (one per day, the latest 5) and copies taken before every update of the data format, import and restore (the latest 5). They are on the same device, so they do not replace backups.

## 5. Publishing a new version (for whoever changes the code)

0. **Updating an existing installation (0.4.0 → 0.5.0, and older):** first save a backup («···» → «Копии и данные» → «Сохранить копию»). Upload the files to the **same repository, same names** (do not change the address) — see `CHANGESET.md` for the exact list, for the *changed-only* package, and for what to delete. **Upload `sw.js` last** (or all files in one commit): installed copies update when they see the new `sw.js`. Open the installed app → «Доступна новая версия» → «Обновить». From 0.4.0 there is **no data migration** (the format is the same); older versions are upgraded automatically with a copy kept in «Копии и данные → Автокопии».
1. Change the files. Follow `DECISIONS.md` sections E, F (data preservation) and G (privacy).
2. Set the same new version in `version.js` (`APP_VERSION`) and `sw.js` (`VERSION`). New file? Add it to `ASSETS` in `sw.js`.
3. Run the release gate (`TESTING.md`, section 6): `tests.html` all green, and `e2e-v5-test.py`, `e2e-test.py`, `privacy-test.py`, `upgrade-test.py` (from every earlier version) all passing. **If a migration or isolation test fails, do not publish.**
4. Upload the changed files to GitHub (**Add file → Upload files**, same names overwrite) → **Commit changes**.
5. Within a few minutes, the installed app shows **«Доступна новая версия · Обновить»**. Tap it. Data is not affected.
6. Run the short manual checklist in `TESTING.md`.

Testing on a computer before uploading: in the unzipped folder run `python3 -m http.server 8000` and open `http://localhost:8000/` and `http://localhost:8000/tests.html`.

## 6. Troubleshooting

| What you see | What to do |
|---|---|
| A message that the app did not start | Make sure you opened the https address, not a file. Refresh. If it stays, send the message text. |
| Red banner «Не удалось сохранить» | Tap «Сохранить копию» immediately, then «Повторить». Usually means the phone's storage is full. |
| «Основные данные не читаются» | The app loaded the newest automatic copy and kept the damaged text («···» → «Копии и данные» → «Повреждённые данные»). Import your latest backup if anything is missing. |
| «Только чтение» | The app refuses to write so nothing gets lost. Read the reason in the banner; usually: update the app, or download the raw data from «···» → «Копии и данные». |
| «…обновление данных остановлено» | The new version could not safely upgrade your saved data, so it changed nothing. Tap «···» → «Копии и данные» → «Скачать исходные данные» and keep the file; then report the problem. If the reason is lack of space, after downloading you may tap «Продолжить обновление без копии». |
| «Данные переведены в новый формат» | Normal after an update. A copy of the previous data is in «···» → «Копии и данные» → «Автокопии» («перед обновлением формата данных»). |
| «Эта копия сделана в другом органайзере» | The backup comes from another device or another person. Replace your data with it only if you are sure; the app asks twice and keeps your current data as a copy. |
| The update banner never appears | The version in `sw.js` was not changed. Bump it (see section 5). |
| Data looks empty after installing | You may have used Safari before installing. Safari's data is separate; export it there and import it in the app. |
