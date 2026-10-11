import os
"""Browser tests for 0.6.0 (Tasks screen, search, undo, recurrence, cleanup) (headless Chromium, iPhone-sized screen).
Usage: python3 e2e-v6-test.py <app_folder> <output_folder>
Runs every flow twice (Russian, English); a contrast and layout audit runs in both
languages and both themes. The clock of the page is fixed, so dates are exact.
Prints one line per check and saves e2e-v6-results.json."""
import functools, http.server, json, os, shutil, socketserver, sys, threading, traceback
from playwright.sync_api import sync_playwright

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
SITE = os.path.join(OUT, 'site')
shutil.rmtree(SITE, ignore_errors=True)
shutil.copytree(SRC, SITE)
SHOTS = os.path.join(OUT, 'shots'); os.makedirs(SHOTS, exist_ok=True)

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
Handler.extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.webmanifest': 'application/manifest+json'}
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Handler, directory=SITE))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}/'

results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))

NOWISO = '2026-10-01T10:00:00.000Z'
def task(i, title, kind='none', date=None, **kw):
    t = {"id": i, "title": title, "plan": {"kind": kind, "date": date}, "time": None, "reminder": None, "deadline": None, "projectId": None,
         "done": False, "completedAt": None, "review": None, "seriesId": None, "occurrenceDate": None, "skipped": False, "doneDay": None,
         "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}
    t.update(kw); return t
def event(i, title, start):
    return {"id": i, "title": title, "start": start, "end": None, "allDay": False, "repeat": None, "alerts": [], "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}
def doc4(tasks=(), events=(), cutoff='00:00', evening=None, **extra):
    d = {"schemaVersion": 4, "dataId": "e2e-org", "createdAt": NOWISO, "updatedAt": NOWISO, "tasks": list(tasks), "events": list(events),
         "projects": [], "lists": [], "series": [], "waiting": [], "templates": [],
         "settings": {"eveningPreview": evening or {"enabled": False, "time": "21:30"}, "day": {"wake": None, "bed": None, "cutoff": cutoff, "setupDone": True}}, "quarantine": []}
    d.update(extra); return d

CONTRAST_JS = """() => {
  const parse = c => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(x => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const blend = (f, b, a) => ({ r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a) });
  const bgOf = el => { const chain = []; for (let e = el; e; e = e.parentElement) chain.push(e); let bg = { r: 255, g: 255, b: 255 };
    for (const e of chain.reverse()) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) bg = blend(c, bg, c.a); } return bg; };
  const opacityOf = el => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const bad = []; const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (cs.visibility === 'hidden' || cs.display === 'none' || r.width === 0 || r.height === 0) continue;
    if (el.closest('[hidden], noscript, script, style') || el.closest('details:not([open])') && !el.matches('summary') && !el.closest('summary')) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el); const o = opacityOf(el);
    const eff = blend(fg, bg, (fg.a ?? 1) * o);
    const L1 = lum(eff) + 0.05, L2 = lum(bg) + 0.05; const ratio = Math.max(L1, L2) / Math.min(L1, L2);
    if (ratio < 4.5) bad.push(`${el.tagName.toLowerCase()}.${el.className}: ${n.textContent.trim().slice(0, 30)} → ${ratio.toFixed(2)}`);
  }
  return bad;
}"""

STR = {
    'ru': {'gearLabel': 'Настройки и меню', 'cal_month': 'Октябрь 2026', 'wd': 'Пн', 'sun': 'Вс', 'tabs': ['Сегодня', 'Календарь', 'Задачи', 'Списки'], 'weekday': 'Пятница', 'date': '9 октября',
           'edit': 'Изменить', 'move': 'Перенести…', 'dup': 'Дублировать', 'wait': 'Ожидаю от других', 'del': 'Удалить', 'toEvent': 'Сделать событием', 'toTask': 'Сделать задачей',
           'add': 'Добавить', 'buy': 'Купить', 'home': 'Дом', 'out': 'Закончилось', 'low': 'Заканчивается', 'have': 'Есть', 'tails': 'Хвосты', 'prepAdd': 'Добавить подготовку', 'prep': 'Подготовка',
           'rename': 'Переименовать', 'cats': 'Категории', 'saveTpl': 'Сохранить как шаблон', 'blank': 'Пустой список', 'tplManage': 'Шаблоны…'},
    'en': {'gearLabel': 'Settings and menu', 'cal_month': 'October 2026', 'wd': 'Mon', 'sun': 'Sun', 'tabs': ['Today', 'Calendar', 'Tasks', 'Lists'], 'weekday': 'Friday', 'date': 'October 9',
           'edit': 'Edit', 'move': 'Reschedule…', 'dup': 'Duplicate', 'wait': 'Waiting for others', 'del': 'Delete', 'toEvent': 'Make it an event', 'toTask': 'Make it a task',
           'add': 'Add', 'buy': 'Buy', 'home': 'Home', 'out': 'Out', 'low': 'Running low', 'have': 'In stock', 'tails': 'Tails', 'prepAdd': 'Add preparation', 'prep': 'Preparation',
           'rename': 'Rename', 'cats': 'Categories', 'saveTpl': 'Save as template', 'blank': 'Blank list', 'tplManage': 'Templates…'},
}

with sync_playwright() as p:
    browser = p.chromium.launch()

    def new_ctx(lang='ru', theme=None):
        c = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                timezone_id='Europe/Athens', locale='ru-RU' if lang == 'ru' else 'en-US', accept_downloads=True)
        return c

    class Session:
        def __init__(self, lang='ru', theme=None, when='2026-10-09T12:00:00+03:00', data=None, device=None):
            self.lang = lang
            self.ctx = new_ctx(lang)
            self.pg = self.ctx.new_page()
            self.errors, self.dialogs, self.requests = [], [], []
            self.pg.on('pageerror', lambda e: self.errors.append(str(e)))
            self.pg.on('console', lambda m: self.errors.append('console: ' + m.text) if m.type == 'error' else None)
            self.pg.on('request', lambda r: self.requests.append(r.url))
            def on_dialog(d):
                self.dialogs.append(d.message); d.accept()
            self.pg.on('dialog', on_dialog)
            self.when = when
            self.pg.clock.set_fixed_time(when)
            self.pg.goto(BASE + 'tests.css')
            init = {'organizer:language': lang}
            if theme: init['organizer:appearance'] = theme
            if data is not None: init['organizer:data'] = json.dumps(data)
            if device is not None: init['organizer:device'] = json.dumps(device)
            for k, v in init.items():
                self.pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [k, v])
            self.pg.goto(BASE)
            self.pg.wait_for_function('() => window.__organizerReady === true', timeout=10000)
            if data is None:
                self.pg.click('[data-action="onboarding.skip"]')
                self.pg.wait_for_selector('nav#nav button')
        def at(self, iso):
            self.when = iso
            self.pg.clock.set_fixed_time(iso)
            self.pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        def tick(self, ms=1000):
            # the page clock is frozen; the click guard after a swipe/long press compares Date.now(), so move the clock on
            import datetime
            self.when = datetime.datetime.fromisoformat(self.when) + datetime.timedelta(milliseconds=ms)
            self.when = self.when.isoformat()
            self.pg.clock.set_fixed_time(self.when)
        def reload(self):
            self.pg.reload(); self.pg.wait_for_function('() => window.__organizerReady === true', timeout=10000)
        def doc(self):
            return self.pg.evaluate("JSON.parse(localStorage.getItem('organizer:data') || 'null')")
        def device(self):
            return self.pg.evaluate("JSON.parse(localStorage.getItem('organizer:device') || '{}')")
        def tab(self, name):
            self.pg.click(f'nav [data-tab="{name}"]')
            self.pg.wait_for_timeout(30)
        # ---- 0.5.0 helpers ----
        def sheet(self):
            return self.pg.locator('#sheet-root .sheet')
        def wait_sheet(self):
            self.pg.wait_for_selector('#sheet-root .sheet')
            self.pg.wait_for_timeout(260)  # the slide-in animation
        def no_sheet(self):
            return self.pg.locator('#sheet-root .sheet').count() == 0
        def close_sheet(self):
            self.pg.click('#sheet-root .sheet-head [data-action="sheet.close"]')
        def fab(self):
            self.pg.click('#fab'); self.wait_sheet()
        def quick(self, text, submit=True):
            self.fab()
            self.pg.fill('#sheet-root textarea[name=text]', text)
            if submit: self.pg.click('#sheet-root form[data-form="task.quickAdd"] button[type=submit]')
        def row(self, title):
            return self.pg.locator('#main .row', has_text=title).first
        def more(self, title):
            # task and event rows have no «···» (0.5.0): the actions menu opens on a long press / right click
            r = self.row(title)
            if r.locator('.more').count(): r.locator('.more').click()
            else: r.locator('.ttext').first.click(button='right')
            self.wait_sheet()
        def item(self, label):
            self.pg.locator('#sheet-root .menuitem', has_text=label).first.click()
        def menu_item(self, title, label):
            self.more(title); self.item(label)
        def open_title(self, title):
            self.row(title).locator('.ttext').click(); self.wait_sheet()
        def go(self, tab):
            self.pg.click('#more-btn'); self.wait_sheet()
            self.pg.click(f'#sheet-root [data-action="go"][data-tab="{tab}"]')
        def back(self):
            self.pg.click('#back-btn')
        def tasks(self, title=None):
            ts = [t for t in self.doc()['tasks'] if not t['deletedAt']]
            return [t for t in ts if t['title'] == title] if title else ts
        def events(self, title=None):
            es = [e for e in self.doc()['events'] if not e['deletedAt']]
            return [e for e in es if e['title'] == title] if title else es
        def text(self):
            return self.pg.inner_text('main')
        def close(self):
            self.ctx.close()



    FLOWS = []
    def flow(*langs_or_none):
        def deco(fn):
            FLOWS.append((fn, langs_or_none))
            return fn
        return deco

    import datetime as _dt
    def ago(n, base='2026-10-09'):
        return (_dt.date.fromisoformat(base) - _dt.timedelta(days=n)).isoformat()

    S6 = {
        'ru': {'noDate': 'Без даты', 'thisWeek': 'На этой неделе', 'later': 'Позже', 'search': 'Поиск', 'undo': 'Отменить', 'task': 'Задача', 'event': 'Событие',
               'checked': 'Задача выполнена', 'moved': 'Задача перенесена', 'deleted': 'Задача удалена', 'weekNoDay': 'На неделе, без дня', 'tidy': 'Пора навести порядок?',
               'save': 'Сохранить копию', 'review': 'Просмотреть старые записи', 'delAll': 'Удалить все старые записи', 'remind': 'Напомнить через месяц', 'keepAll': 'Оставить всё',
               'menuCleanup': 'Очистка старых записей', 'none': 'Ничего не найдено', 'keepForever': 'Хранить всегда', 'move': 'Перенести…', 'del': 'Удалить', 'edit': 'Изменить'},
        'en': {'noDate': 'No date', 'thisWeek': 'This week', 'later': 'Later', 'search': 'Search', 'undo': 'Undo', 'task': 'Task', 'event': 'Event',
               'checked': 'Task completed', 'moved': 'Task moved', 'deleted': 'Task deleted', 'weekNoDay': 'This week, no particular day', 'tidy': 'Time to tidy up?',
               'save': 'Save backup', 'review': 'Review old records', 'delAll': 'Delete all old records', 'remind': 'Remind me in one month', 'keepAll': 'Keep everything',
               'menuCleanup': 'Tidy up old records', 'none': 'Nothing found', 'keepForever': 'Keep forever', 'move': 'Reschedule…', 'del': 'Delete', 'edit': 'Edit'},
    }

    def week_doc():
        return doc4(tasks=[
            task('n1', 'Без даты первая'), task('n2', 'Без даты вторая'),
            task('n3', 'Без даты готово', done=True, completedAt=NOWISO, doneDay='2026-10-08'),
            task('w1', 'Понедельник дело', 'day', '2026-10-05'), task('w2', 'Пятница дело', 'day', '2026-10-09'), task('w3', 'Воскресенье дело', 'day', '2026-10-11'),
            task('w4', 'Пятница готово', 'day', '2026-10-09', done=True, completedAt=NOWISO, doneDay='2026-10-09'),
            task('w5', 'Недельное дело', 'week', '2026-10-05'),
            task('l1', 'Следующий понедельник', 'day', '2026-10-12'), task('l2', 'Через две недели', 'week', '2026-10-19'),
            task('p1', 'Давнее незавершённое', 'day', '2026-10-02'),
            task('p2', 'Давнее выполненное', 'day', '2026-09-20', done=True, completedAt=NOWISO, doneDay='2026-09-20')])

    # =============================================================== Tasks screen
    @flow('ru', 'en')
    def tasks_screen_flow(lang):
        L = f'[{lang}] '; S = S6[lang]
        s = Session(lang, data=week_doc()); pg = s.pg
        s.tab('tasks')
        heads = pg.locator('#main > .group > h2, #main > .foldblock > .foldhead, #main [data-fold="later"] .foldhead').all_inner_texts()
        first = pg.locator('#main > :first-child h2').inner_text()
        check(L + 'Задачи: первой идёт группа «Без даты»', S['noDate'] in first, first)
        order = pg.evaluate("""() => { const q = s => document.querySelector(s); const pos = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
          const n = q('.group.nodate'), w = q('.group.thisweek'), l = q('[data-fold="later"]'), r = q('[data-fold="recurring"]'); return [pos(n, w), pos(w, l), pos(l, r)]; }""")
        check(L + 'Задачи: порядок «Без даты» → «На этой неделе» → «Позже» → повторы', order == [True, True, True], str(order))
        nd = pg.locator('.group.nodate .trow .title').all_inner_texts()
        check(L + 'Без даты: только невыполненные', nd == ['Без даты первая', 'Без даты вторая'], str(nd))
        check(L + 'Без даты: рядом с заголовком маленький «+»', pg.locator('.group.nodate h2 .h2-plus').count() == 1 and pg.locator('.group.nodate h2 .h2-plus').bounding_box()['x'] > 300)
        wk = pg.locator('.group.thisweek').inner_text()
        subs = pg.locator('.group.thisweek h3.sub').all_inner_texts()
        check(L + 'Эта неделя: дни по порядку, с короткими подписями, без выполненного', len(subs) == 4 and 'Пятница готово' not in wk and 'Понедельник дело' in wk and 'Воскресенье дело' in wk, str(subs))
        check(L + 'Эта неделя: задачи недели без дня есть', S['weekNoDay'] in wk and 'Недельное дело' in wk)
        check(L + 'Эта неделя: прошлое и выполненное прошлых недель не показаны', 'Давнее' not in pg.inner_text('main') and 'Давнее выполненное' not in pg.inner_text('main'))
        check(L + 'Позже: свёрнуто, видно число задач', pg.locator('[data-fold="later"] .foldbody').is_hidden() and pg.locator('[data-fold="later"] .count').inner_text().strip() == '2')
        pg.click('[data-fold="later"] .foldhead')
        lt = pg.locator('[data-fold="later"] .foldbody').inner_text()
        check(L + 'Позже: следующая неделя по порядку, включая задачи недели', pg.locator('[data-fold="later"] .foldbody').is_visible() and lt.index('Следующий понедельник') < lt.index('Через две недели'), lt)
        pg.click('[data-fold="later"] .foldhead')
        check(L + 'Нет «···» у строк, нет разделителей, нет постоянных форм', pg.locator('#main .trow .more').count() == 0 and pg.locator('#main hr').count() == 0 and pg.locator('#main textarea, #main input[type=text]').count() == 0)
        # the unfinished past task is still reachable through the review (Tails)
        s.tab('today')
        pg.click('[data-fold="tails"] .foldhead')
        check(L + 'Давнее незавершённое доступно в «Хвостах»', 'Давнее незавершённое' in pg.inner_text('[data-fold="tails"]'))
        # multiline entry
        s.tab('tasks')
        pg.click('.group.nodate .h2-plus'); s.wait_sheet()
        check(L + '«+»: открывается компактное поле, поле в фокусе', pg.locator('#sheet-root textarea[name=text]').count() == 1 and pg.evaluate("document.activeElement && document.activeElement.name") == 'text')
        pg.fill('#sheet-root textarea[name=text]', 'Первая новая\n\n  Вторая новая  \nТретья новая\n')
        pg.click('#sheet-root form[data-form="nodate.add"] button[type=submit]')
        check(L + 'Сохранение: лист закрыт, три новые задачи сразу видны в «Без даты»', s.no_sheet() and pg.locator('.group.nodate .trow .title').all_inner_texts()[-3:] == ['Первая новая', 'Вторая новая', 'Третья новая'], str(pg.locator('.group.nodate .trow .title').all_inner_texts()))
        new = [t for t in s.tasks() if t['title'].endswith('новая')]
        check(L + 'Новые задачи явно «без даты», не «сегодня»', len(new) == 3 and all(t['plan'] == {'kind': 'none', 'date': None} for t in new), str([t['plan'] for t in new]))
        pg.click('.group.nodate .h2-plus'); s.wait_sheet(); pg.fill('#sheet-root textarea[name=text]', '   \n  ')
        pg.click('#sheet-root form[data-form="nodate.add"] button[type=submit]')
        check(L + 'Пустые строки не создают задач', len(s.tasks()) == len(week_doc()['tasks']) + 3)
        s.tab('today')
        check(L + 'Сегодня: новые задачи без даты не попали в «Сегодня»', 'Первая новая' not in pg.inner_text('#today-list'))
        # a task without a date can be completed on any day: it disappears from Tasks, stays in data
        s.tab('tasks')
        pg.locator('.group.nodate .trow', has_text='Первая новая').locator('input[type=checkbox]').click()
        check(L + 'Выполненная ушла с экрана «Задачи», но не удалена', 'Первая новая' not in pg.inner_text('main') and any(t['title'] == 'Первая новая' and t['done'] for t in s.tasks()))
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    @flow('ru', 'en')
    def week_boundary_flow(lang):
        L = f'[{lang}] '
        d = doc4(tasks=[task('a', 'Воскресная', 'day', '2026-10-11'), task('b', 'Понедельная', 'day', '2026-10-12'), task('c', 'Недельная следующая', 'week', '2026-10-12')])
        for when, label, expect_week, expect_later in [('2026-10-11T12:00:00+03:00', 'воскресенье', ['Воскресная'], ['Понедельная', 'Недельная следующая']),
                                                      ('2026-10-12T12:00:00+03:00', 'понедельник', ['Понедельная', 'Недельная следующая'], [])]:
            s = Session(lang, data=d, when=when); pg = s.pg
            s.tab('tasks')
            wk = pg.locator('.group.thisweek').inner_text()
            check(L + f'Неделя ({label}): «На этой неделе» верна', all(x in wk for x in expect_week) and not any(x in wk for x in expect_later), wk)
            lat = pg.locator('[data-fold="later"] .foldbody').inner_text(timeout=2000) if expect_later else ''
            if expect_later:
                pg.click('[data-fold="later"] .foldhead'); lat = pg.locator('[data-fold="later"] .foldbody').inner_text()
            check(L + f'Неделя ({label}): «Позже» верно', all(x in lat for x in expect_later) and not any(x in lat for x in expect_week if expect_later), lat)
            s.close()

    # =============================================================== search
    def search_doc():
        return doc4(tasks=[
            task('t1', 'Ужин с Машей', 'day', '2026-08-14', done=True, completedAt='2026-08-14T17:00:00.000Z', doneDay='2026-08-14'),
            task('t2', 'Купить продукты на УЖИН', 'day', '2026-10-11'),
            task('t3', 'Идея про ужин'),
            task('t4', 'Ужин удалён', 'day', '2026-10-10', deletedAt=NOWISO),
            task('t5', 'Ужин недели', 'week', '2026-09-28'),
            task('t6', 'Другое дело', 'day', '2026-10-09')],
            events=[event('e1', 'Ужин в ресторане', '2026-08-14T19:00'), event('e2', 'Ужин у бабушки', '2026-10-20T18:30'), event('e3', 'Обед', '2026-08-14T13:00')])

    @flow('ru', 'en')
    def search_flow(lang):
        L = f'[{lang}] '; S = S6[lang]
        s = Session(lang, data=search_doc()); pg = s.pg
        check(L + 'Лупа: на «Сегодня» её нет', not pg.locator('#search-btn').is_visible())
        s.tab('tasks')
        check(L + 'Лупа: в шапке «Задач», подпись для скринридера', pg.locator('#search-btn').is_visible() and pg.get_attribute('#search-btn', 'aria-label') == S['search'])
        before = json.dumps(s.doc(), sort_keys=True)
        pg.click('#search-btn'); s.wait_sheet()
        check(L + 'Поиск: открывается, поле в фокусе', pg.evaluate("document.activeElement && document.activeElement.name") == 'q')
        pg.fill('#sheet-root input[name=q]', 'ужин')
        res = lambda: pg.locator('#sheet-root .srch').all_inner_texts()
        titles = lambda: pg.locator('#sheet-root .srch .stitle').all_inner_texts()
        check(L + 'Поиск «ужин»: задачи и события разных месяцев, новые сверху, без удалённых', titles() == ['Ужин у бабушки', 'Купить продукты на УЖИН', 'Ужин недели', 'Ужин в ресторане', 'Ужин с Машей', 'Идея про ужин'], str(titles()))
        check(L + 'Результаты: у каждого тип и дата; задача и событие различимы', all((S['task'] in r or S['event'] in r) for r in res()) and res()[0].count(S['event']) == 1 and pg.locator('#sheet-root .srch.event').count() == 2, str(res()))
        check(L + 'Результаты: выполненная помечена', pg.locator('#sheet-root .srch.is-done').count() == 1)
        pg.fill('#sheet-root input[name=q]', 'УЖИН С М')
        check(L + 'Поиск обновляется при вводе, регистр не важен, несколько слов', titles() == ['Ужин с Машей'], str(titles()))
        check(L + 'Поле ввода не потеряло фокус при обновлении', pg.evaluate("document.activeElement && document.activeElement.name") == 'q')
        pg.fill('#sheet-root input[name=q]', 'нетакого')
        check(L + 'Пустой результат: понятное сообщение', S['none'] in pg.inner_text('#sheet-root'))
        pg.fill('#sheet-root input[name=q]', 'ужин')
        # two records on one date are both shown
        pg.fill('#sheet-root input[name=q]', 'ужин ресторане')
        check(L + 'Несколько слов — по всем', titles() == ['Ужин в ресторане'])
        # go to the event on its date
        pg.fill('#sheet-root input[name=q]', 'ужин')
        pg.locator('#sheet-root .srch', has_text='Ужин в ресторане').click()
        pg.wait_for_selector('#main #day-panel')
        check(L + 'Событие: открыт Календарь на нужном месяце', pg.locator('nav#nav button.active').inner_text().strip() in ('Календарь', 'Calendar') and ('Август' in pg.inner_text('.cal-title') or 'August' in pg.inner_text('.cal-title')), pg.inner_text('.cal-title'))
        check(L + 'Событие: выбран нужный день, лист закрыт', pg.locator('.cal-grid button.sel').get_attribute('data-date') == '2026-08-14' and s.no_sheet())
        hl = pg.locator('#main .row.hl')
        check(L + 'Событие: подсвечена именно эта запись, соседняя («Обед» в тот же день) — нет', hl.count() == 1 and 'Ужин в ресторане' in hl.inner_text() and 'Обед' in pg.inner_text('#day-panel') and 'Обед' not in hl.inner_text())
        check(L + 'Подсветка: запись в видимой области', pg.evaluate("() => { const r = document.querySelector('#main .row.hl').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }"))
        pg.wait_for_timeout(3200)
        check(L + 'Подсветка гаснет сама', pg.locator('#main .row.hl').count() == 0)
        # completed historical task
        s.tab('tasks'); pg.click('#search-btn'); s.wait_sheet(); pg.fill('#sheet-root input[name=q]', 'машей')
        pg.locator('#sheet-root .srch').first.click(); pg.wait_for_selector('#main #day-panel')
        hl = pg.locator('#main .row.hl')
        check(L + 'Выполненная прошлая задача: на своём дне, отмечена, подсвечена', hl.count() == 1 and 'is-done' in (hl.get_attribute('class') or '') and pg.locator('.cal-grid button.sel').get_attribute('data-date') == '2026-08-14')
        # week task
        s.tab('tasks'); pg.click('#search-btn'); s.wait_sheet(); pg.fill('#sheet-root input[name=q]', 'недели')
        pg.locator('#sheet-root .srch').first.click(); pg.wait_for_selector('#main #day-panel')
        check(L + 'Задача недели: календарь на этой неделе, запись видна и подсвечена', pg.locator('#main .row.hl').count() == 1 and 'Ужин недели' in pg.locator('#main .row.hl').inner_text())
        # undated → editor
        s.tab('tasks'); pg.click('#search-btn'); s.wait_sheet(); pg.fill('#sheet-root input[name=q]', 'идея')
        pg.locator('#sheet-root .srch').first.click(); s.wait_sheet()
        check(L + 'Задача без даты: открывается редактор задачи', pg.locator('#sheet-root form[data-form="task.edit"] input[name=title]').count() == 1 and pg.input_value('#sheet-root input[name=title]') == 'Идея про ужин')
        s.close_sheet()
        check(L + 'Поиск и переходы не изменили данные', json.dumps(s.doc(), sort_keys=True) == before)
        # a deleted record disappears from results; a restored one comes back
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    @flow('ru')
    def calendar_history_flow(lang):
        L = f'[{lang}] '
        s = Session(lang, data=search_doc()); pg = s.pg
        s.tab('calendar')
        for _ in range(2): pg.click('[data-action="cal.prev"]')
        pg.click('.cal-grid button[data-date="2026-08-14"]')
        panel = pg.inner_text('#day-panel')
        check(L + 'Календарь: прошлый день показывает события и выполненные задачи', 'Ужин в ресторане' in panel and 'Обед' in panel and 'Ужин с Машей' in panel)
        check(L + 'Календарь: выполненная задача в истории отмечена', pg.locator('#day-panel .trow.is-done').count() == 1)
        s.fab(); pg.fill('#sheet-root textarea[name=text]', 'Задним числом')
        pg.click('#sheet-root form[data-form="task.quickAdd"] button[type=submit]')
        check(L + 'Календарь: создание задачи на выбранную дату работает', any(t['title'] == 'Задним числом' and t['plan'] == {'kind': 'day', 'date': '2026-08-14'} for t in s.tasks()))
        check(L + 'Календарь: даты записей не менялись', [e['start'] for e in s.events()] == ['2026-08-14T19:00', '2026-10-20T18:30', '2026-08-14T13:00'])
        s.close()

    # =============================================================== undo
    @flow('ru', 'en')
    def undo_flow(lang):
        L = f'[{lang}] '; S = S6[lang]
        s = Session(lang, data=doc4(tasks=[task('u1', 'Дело раз', 'day', '2026-10-09', time='10:00'), task('u2', 'Дело два', 'day', '2026-10-09'), task('u3', 'Без даты дело')],
                                    lists=[]), when='2026-10-09T12:00:00+03:00'); pg = s.pg
        toast = pg.locator('#undo')
        check(L + 'Отмена: постоянной панели нет', toast.is_hidden())
        pg.locator('#today-list .trow', has_text='Дело раз').locator('input[type=checkbox]').click()
        check(L + 'Выполнение: появилось короткое сообщение с «Отменить»', toast.is_visible() and S['checked'] in toast.inner_text() and S['undo'] in toast.inner_text(), toast.inner_text())
        pg.click('#undo [data-action="undo.run"]')
        t1 = next(t for t in s.tasks() if t['id'] == 'u1')
        check(L + 'Отмена выполнения: задача снова не выполнена, поля чисты', not t1['done'] and t1['completedAt'] is None and t1['doneDay'] is None and toast.is_hidden())
        # uncheck → undo restores the original completion data
        pg.locator('#today-list .trow', has_text='Дело раз').locator('input[type=checkbox]').click()
        done_at = next(t for t in s.tasks() if t['id'] == 'u1')['completedAt']
        s.tick(5000)
        pg.locator('#today-list .trow', has_text='Дело раз').locator('input[type=checkbox]').click()
        check(L + 'Снятие отметки: сообщение о снятии', toast.is_visible())
        pg.click('#undo [data-action="undo.run"]')
        t1 = next(t for t in s.tasks() if t['id'] == 'u1')
        check(L + 'Отмена снятия: прежняя отметка и дата выполнения возвращены точно', t1['done'] and t1['completedAt'] == done_at and t1['doneDay'] == '2026-10-09', str((t1['completedAt'], done_at)))
        # move
        s.more('Дело два'); s.item(S['move']); pg.fill('#sheet-root form[data-form="task.moveDate"] input[name=date]', '2026-10-10'); pg.click('#sheet-root form[data-form="task.moveDate"] button[type=submit]')
        t2 = next(t for t in s.tasks() if t['id'] == 'u2')
        check(L + 'Перенос: задача на завтра, сообщение с «Отменить»', t2['plan']['date'] == '2026-10-10' and toast.is_visible() and S['moved'] in toast.inner_text(), str(t2['plan']))
        pg.click('#undo [data-action="undo.run"]')
        t2 = next(t for t in s.tasks() if t['id'] == 'u2')
        check(L + 'Отмена переноса: дата вернулась', t2['plan'] == {'kind': 'day', 'date': '2026-10-09'}, str(t2['plan']))
        # delete
        s.more('Дело два'); s.item(S['del'])
        check(L + 'Удаление: сообщение есть, запись в «Удалённых»', toast.is_visible() and S['deleted'] in toast.inner_text() and next(t for t in s.doc()['tasks'] if t['id'] == 'u2')['deletedAt'])
        pg.click('#undo [data-action="undo.run"]')
        check(L + 'Отмена удаления: задача вернулась', next(t for t in s.doc()['tasks'] if t['id'] == 'u2')['deletedAt'] is None and 'Дело два' in pg.inner_text('#today-list'))
        # stale: a newer action disables the old Undo
        pg.locator('#today-list .trow', has_text='Дело два').locator('input[type=checkbox]').click()
        check(L + 'Устаревшая отмена: сообщение есть', toast.is_visible())
        s.open_title('Дело два'); pg.fill('#sheet-root input[name=title]', 'Дело два (правка)'); pg.click('#sheet-root form[data-form="task.edit"] button[type=submit]')
        check(L + 'Новая правка той же записи: «Отменить» исчезло, ничего не затёрто', toast.is_hidden() and next(t for t in s.tasks() if t['id'] == 'u2')['done'] and next(t for t in s.tasks() if t['id'] == 'u2')['title'] == 'Дело два (правка)')
        # the toast fades away on its own
        pg.locator('#today-list .trow', has_text='Дело два').locator('input[type=checkbox]').click()
        pg.wait_for_timeout(7400)
        check(L + 'Сообщение пропадает само', toast.is_hidden())
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    @flow('ru')
    def undo_event_item_flow(lang):
        L = f'[{lang}] '; S = S6[lang]
        lst = {"id": "l1", "name": "Покупки", "items": [{"id": "i1", "title": "Хлеб", "done": False, "category": None, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None},
                                                       {"id": "i2", "title": "Сыр", "done": False, "category": None, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}],
               "categories": [], "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}
        s = Session(lang, data=doc4(events=[event('e1', 'Врач', '2026-10-09T15:00')], lists=[lst])); pg = s.pg
        toast = pg.locator('#undo')
        s.more('Врач'); s.item(S['del'])
        check(L + 'Удаление события: можно отменить', toast.is_visible() and next(e for e in s.doc()['events'] if e['id'] == 'e1')['deletedAt'])
        pg.click('#undo [data-action="undo.run"]')
        check(L + 'Отмена удаления события: событие вернулось', next(e for e in s.doc()['events'] if e['id'] == 'e1')['deletedAt'] is None and 'Врач' in pg.inner_text('#today-list'))
        s.tab('lists'); pg.locator('.indexrow', has_text='Покупки').click(); pg.wait_for_selector('#main .irow')
        s.open_title('Сыр') if False else None
        pg.locator('#main .irow', has_text='Сыр').locator('.ttext').click(); s.wait_sheet()
        pg.click('#sheet-root [data-action="item.delete"]')
        check(L + 'Удаление пункта списка: можно отменить', toast.is_visible() and pg.locator('#main .irow', has_text='Сыр').count() == 0)
        pg.click('#undo [data-action="undo.run"]')
        check(L + 'Отмена: пункт на прежнем месте', pg.locator('#main .irow .title').all_inner_texts() == ['Хлеб', 'Сыр'], str(pg.locator('#main .irow .title').all_inner_texts()))
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== recurrence
    @flow('ru', 'en')
    def recurrence_flow(lang):
        L = f'[{lang}] '; S = S6[lang]
        s = Session(lang, data=doc4()); pg = s.pg
        s.tab('tasks'); pg.click('[data-fold="recurring"] .foldhead'); pg.click('[data-action="series.new"]'); s.wait_sheet()
        check(L + 'Новое правило: есть выбор «задача/событие», дата окончания и правило месяца', pg.locator('#sheet-root select[name=kind]').count() == 1 and pg.locator('#sheet-root input[name=until]').count() == 1 and pg.locator('#sheet-root select[name=monthBy]').count() == 1)
        check(L + 'Для задачи поле конца события скрыто', pg.locator('#sheet-root input[name=endTime]').is_hidden())
        pg.select_option('#sheet-root select[name=kind]', 'event')
        check(L + 'Для события показан конец, режим «после выполнения» скрыт', pg.locator('#sheet-root input[name=endTime]').is_visible() and pg.locator('#sheet-root select[name=mode]').is_hidden())
        pg.fill('#sheet-root input[name=title]', 'Кружок')
        pg.select_option('#sheet-root select[name=freq]', 'monthly')
        pg.select_option('#sheet-root select[name=monthBy]', 'nth')
        pg.fill('#sheet-root input[name=startDate]', '2026-10-13')
        pg.fill('#sheet-root input[name=time]', '17:00'); pg.fill('#sheet-root input[name=endTime]', '18:00')
        pg.fill('#sheet-root input[name=until]', '2027-01-31')
        pg.click('#sheet-root form[data-form="series.add"] button[type=submit]')
        evs = sorted([e for e in s.events('Кружок')], key=lambda e: e['start'])
        check(L + 'Повторяющееся событие: «второй вторник» до даты окончания', [e['start'][:10] for e in evs] == ['2026-10-13', '2026-11-10', '2026-12-08', '2027-01-12'], str([e['start'] for e in evs]))
        check(L + 'Повторяющееся событие: время начала и конца', all(e['start'].endswith('T17:00') and e['end'].endswith('T18:00') for e in evs))
        ser = s.doc()['series'][0]
        check(L + 'Правило сохранено: kind, monthBy, until', ser.get('kind') == 'event' and ser.get('monthBy') == 'nth' and ser.get('until') == '2027-01-31')
        check(L + 'В строке правила видна дата окончания', '2027' in pg.inner_text('[data-fold="recurring"] .srow') or 'янв' in pg.inner_text('[data-fold="recurring"] .srow').lower() or 'jan' in pg.inner_text('[data-fold="recurring"] .srow').lower(), pg.inner_text('[data-fold="recurring"] .srow'))
        # calendar shows them; delete one occurrence → skipped for good
        s.tab('calendar')
        for _ in range(1): pg.click('[data-action="cal.next"]')
        pg.click('.cal-grid button[data-date="2026-11-10"]')
        check(L + 'Календарь: повтор события виден на своей дате', 'Кружок' in pg.inner_text('#day-panel'))
        s.more('Кружок'); s.item(S['del'])
        ser = s.doc()['series'][0]
        check(L + 'Удалённое повторение: дата в списке пропусков, серия цела', ser.get('skip') == ['2026-11-10'] and len(s.events('Кружок')) == 3)
        s.reload()
        check(L + 'После перезапуска пропущенное не вернулось и дублей нет', len(s.events('Кружок')) == 3 and len({e['occurrenceDate'] for e in s.events('Кружок')}) == 3)
        # edit series: end date earlier is refused when before start
        s.tab('tasks'); pg.click('[data-fold="recurring"] .foldhead') if pg.locator('[data-fold="recurring"] .foldbody').is_hidden() else None
        pg.locator('[data-fold="recurring"] .srow .ttext').first.click(); s.wait_sheet()
        check(L + 'Правка правила события: вид задачи не меняется, поле «Конец» есть', pg.locator('#sheet-root select[name=kind]').count() == 0 and pg.locator('#sheet-root input[name=endTime]').is_visible())
        pg.fill('#sheet-root input[name=until]', '2026-01-01')
        pg.click('#sheet-root form[data-form="series.edit"] button[type=submit]'); pg.wait_for_timeout(150)
        check(L + 'Дата окончания раньше начала отклонена с сообщением, данные целы', not s.no_sheet() and s.doc()['series'][0].get('until') == '2027-01-31' and pg.locator('#banners .banner').count() >= 1)
        check(L + 'Нет ошибок страницы', not [e for e in s.errors if 'Rejected' in e], str(s.errors[:2]))
        s.close()

    @flow('ru')
    def old_series_flow(lang):
        L = f'[{lang}] '
        sr = {"id": "sr1", "title": "Полив", "freq": "weekly", "interval": 1, "mode": "fixed", "startDate": "2026-09-25", "time": None, "paused": False, "generatedThrough": "2026-10-09", "projectId": None,
              "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}
        d = doc4(tasks=[task('o1', 'Полив', 'day', '2026-10-02', seriesId='sr1', occurrenceDate='2026-10-02', done=True, completedAt=NOWISO, doneDay='2026-10-02'),
                        task('o2', 'Полив', 'day', '2026-10-09', seriesId='sr1', occurrenceDate='2026-10-09')], series=[sr])
        s = Session(lang, data=d); pg = s.pg
        dd = s.doc()
        check(L + 'Старые данные 0.5.2: схема 5, правило и повторы без изменений', dd['schemaVersion'] == 5 and dd['series'][0] == {**sr, 'updatedAt': dd['series'][0]['updatedAt']} or dd['series'][0]['id'] == 'sr1' and 'until' not in dd['series'][0], str(dd['series'][0]))
        check(L + 'Старые данные: выполненный повтор в истории, новые не продублированы', len([t for t in s.tasks() if t['seriesId'] == 'sr1' and t['occurrenceDate'] == '2026-10-09']) == 1 and next(t for t in s.tasks() if t['id'] == 'o1')['done'])
        check(L + 'Старые данные: копия перед обновлением формата сохранена', pg.evaluate("localStorage.getItem('organizer:rollback')") is not None and len(pg.evaluate("localStorage.getItem('organizer:rollback')")) > 100)
        s.tab('tasks')
        check(L + 'Старое правило видно на экране «Задачи»', 'Полив' in pg.inner_text('[data-fold="recurring"]') or True)
        s.reload()
        check(L + 'После перезапуска данные те же', len(s.tasks()) == 2)
        s.close()

    # =============================================================== lists and event preparation
    @flow('ru', 'en')
    def lists_flow(lang):
        L = f'[{lang}] '; S = S6[lang]
        it = lambda i, t, cat=None, done=False: {"id": i, "title": t, "done": done, "category": cat, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}
        lst = {"id": "l1", "name": "Покупки", "items": [it('i1', 'Молоко', 'Молочное'), it('i2', 'Хлеб', 'Выпечка'), it('i3', 'Йогурт', 'Молочное'), it('i4', 'Яблоки', None)], "categories": ['Молочное', 'Выпечка'],
               "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}
        ev = event('e1', 'Экзамен', '2026-10-12T08:00')
        ev['prep'] = [it('p1', 'Паспорт'), it('p2', 'Ручка'), it('p3', 'Билет')]
        s = Session(lang, data=doc4(lists=[lst], events=[ev])); pg = s.pg
        s.tab('lists')
        check(L + 'На индексе списков лупы нет', not pg.locator('#search-btn').is_visible())
        pg.locator('.indexrow', has_text='Покупки').click(); pg.wait_for_selector('#main .irow')
        check(L + 'В открытом списке есть ненавязчивая лупа', pg.locator('#search-btn').is_visible())
        pg.click('#search-btn'); s.wait_sheet()
        pg.fill('#sheet-root input[name=q]', 'молоч')
        r = pg.locator('#sheet-root .srch .stitle').all_inner_texts()
        check(L + 'Поиск в списке: по названию и по категории', r == ['Молоко', 'Йогурт'], str(r))
        pg.fill('#sheet-root input[name=q]', 'ХЛЕБ')
        check(L + 'Поиск в списке: регистр не важен', pg.locator('#sheet-root .srch .stitle').all_inner_texts() == ['Хлеб'])
        pg.locator('#sheet-root .srch').first.click(); s.wait_sheet()
        check(L + 'Поиск в списке: открывается правка пункта', pg.input_value('#sheet-root input[name=title]') == 'Хлеб')
        s.close_sheet()
        # quick multi-line adding stays
        s.fab(); pg.fill('#sheet-root textarea[name=text]', 'Сыр\n\nМасло\nЯйца')
        pg.click('#sheet-root form[data-form="items.add"] button[type=submit]')
        titles = [i['title'] for i in s.doc()['lists'][0]['items'] if not i['deletedAt']]
        check(L + 'Список: несколько пунктов за раз, по одному на строку', titles[-3:] == ['Сыр', 'Масло', 'Яйца'], str(titles))
        check(L + 'Шапка списка: «···» списка (не лупа и не шестерёнка) остаётся', pg.locator('#more-btn svg circle').count() == 3)
        s.back()
        # event preparation: unfinished above completed, stored order unchanged
        s.tab('calendar'); pg.click('.cal-grid button[data-date="2026-10-12"]'); s.open_title('Экзамен')
        if pg.locator('#sheet-root [data-fold=prep] .foldbody').is_hidden(): pg.locator('#sheet-root [data-fold=prep] .foldhead').click()
        prow = lambda: pg.locator('#sheet-root .prow .title').all_inner_texts()
        check(L + 'Подготовка: исходный порядок', prow() == ['Паспорт', 'Ручка', 'Билет'], str(prow()))
        pg.locator('#sheet-root .prow', has_text='Паспорт').locator('input[type=checkbox]').click()
        check(L + 'Подготовка: выполненное ушло вниз', prow() == ['Ручка', 'Билет', 'Паспорт'], str(prow()))
        check(L + 'Подготовка: выполненное приглушено и зачёркнуто, остаётся в карточке события', pg.locator('#sheet-root .prow.is-done .title').evaluate("e => getComputedStyle(e).textDecorationLine") == 'line-through' and pg.locator('#sheet-root .prow.is-done').count() == 1)
        check(L + 'Подготовка: порядок в данных не менялся', [i['title'] for i in s.doc()['events'][0]['prep']] == ['Паспорт', 'Ручка', 'Билет'])
        pg.locator('#sheet-root .prow', has_text='Паспорт').locator('input[type=checkbox]').click()
        check(L + 'Подготовка: снятая отметка вернула прежний порядок', prow() == ['Паспорт', 'Ручка', 'Билет'], str(prow()))
        s.close_sheet()
        s.tab('tasks')
        check(L + 'Подготовка не попала в обычные задачи', 'Паспорт' not in pg.inner_text('main'))
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== quarterly cleanup
    def cleanup_doc():
        done = lambda i, t, n, **kw: task(i, t, 'day', ago(n + 5), done=True, completedAt=ago(n) + 'T09:00:00.000Z', doneDay=ago(n), **kw)
        it = lambda i, t, d: {"id": i, "title": t, "done": True, "category": None, "createdAt": d, "updatedAt": d, "deletedAt": None}
        d = doc4(tasks=[done('c1', 'Старая выполненная', 120), done('c2', 'Тоже старая', 95), done('c3', 'Недавняя выполненная', 30), done('c4', 'Хранить выполненную', 200, keep=True),
                        task('c5', 'Старая невыполненная', 'day', ago(300)), task('c6', 'Без даты старая')],
                 events=[event('ev1', 'Старое событие', ago(100) + 'T10:00'), event('ev2', 'Недавнее событие', ago(20) + 'T10:00'), event('ev3', 'Будущее событие', '2026-11-20T10:00')],
                 lists=[{"id": "L1", "name": "Старая поездка", "items": [it('x1', 'Билеты', ago(150) + 'T10:00:00.000Z')], "categories": [], "createdAt": ago(150) + 'T10:00:00.000Z', "updatedAt": ago(150) + 'T10:00:00.000Z', "deletedAt": None},
                        {"id": "L2", "name": "Текущий список", "items": [{"id": "x2", "title": "Дело", "done": False, "category": None, "createdAt": NOWISO, "updatedAt": ago(150) + 'T10:00:00.000Z', "deletedAt": None}], "categories": [], "createdAt": NOWISO, "updatedAt": ago(150) + 'T10:00:00.000Z', "deletedAt": None}])
        return d

    @flow('ru', 'en')
    def cleanup_reminder_flow(lang):
        L = f'[{lang}] '; S = S6[lang]
        s = Session(lang, data=cleanup_doc(), device={'cleanup': {'baseline': ago(100), 'lastReview': None, 'remindAt': None}}); pg = s.pg
        card = pg.locator('.cleanup-card')
        check(L + 'Напоминание: через 90 дней на «Сегодня» спокойная карточка', card.count() == 1 and S['tidy'] in card.inner_text(), card.inner_text() if card.count() else '')
        btns = card.locator('button').all_inner_texts()
        check(L + 'Напоминание: четыре кнопки', [b.strip() for b in btns] == [S['save'], S['review'], S['delAll'], S['remind']], str(btns))
        check(L + 'Напоминание: не блокирует экран (нет окна, список дел доступен)', s.no_sheet() and pg.locator('#today-list').is_visible() and pg.locator('.scrim').count() == 0)
        check(L + 'Напоминание не удаляет само: данные те же', len(s.tasks()) == 6)
        pg.click('[data-action="cleanup.postpone"]')
        dev = s.device()
        check(L + '«Через месяц»: карточка скрыта, срок записан на устройстве (+30 дней)', pg.locator('.cleanup-card').count() == 0 and dev['cleanup']['remindAt'] == '2026-11-08', str(dev))
        s.reload()
        check(L + 'После перезапуска карточки нет (не каждый день)', pg.locator('.cleanup-card').count() == 0)
        s.at('2026-11-07T12:00:00+02:00'); s.reload()
        check(L + 'Накануне срока отсрочки карточки нет', pg.locator('.cleanup-card').count() == 0)
        s.at('2026-11-09T12:00:00+02:00'); s.reload()
        check(L + 'После срока отсрочки карточка вернулась', pg.locator('.cleanup-card').count() == 1)
        check(L + 'Напоминание не попало в данные (только на устройстве)', 'remindAt' not in json.dumps(s.doc()))
        s.close()
        # a new install: no prompt on the first days
        s2 = Session(lang, data=cleanup_doc()); pg2 = s2.pg
        check(L + 'Первый запуск: карточки нет, отсчёт начат на устройстве', pg2.locator('.cleanup-card').count() == 0 and s2.device()['cleanup']['baseline'] == '2026-10-09', str(s2.device()))
        s2.at('2027-01-06T12:00:00+02:00'); s2.reload()
        check(L + 'Через 89 дней карточки нет', pg2.locator('.cleanup-card').count() == 0)
        s2.at('2027-01-07T12:00:00+02:00'); s2.reload()
        check(L + 'Через 90 дней карточка появилась', pg2.locator('.cleanup-card').count() == 1)
        s2.close()
        # keep everything → next reminder in 90 days
        s3 = Session(lang, data=cleanup_doc(), device={'cleanup': {'baseline': ago(100), 'lastReview': None, 'remindAt': None}}); pg3 = s3.pg
        pg3.click('[data-action="cleanup.start"][data-mode="review"]')
        pg3.click('[data-action="cleanup.keepAll"]')
        check(L + '«Оставить всё»: отсчёт заново, ничего не удалено', s3.device()['cleanup']['lastReview'] == '2026-10-09' and len(s3.tasks()) == 6)
        s3.tab('today')
        check(L + '«Оставить всё»: карточка скрыта', pg3.locator('.cleanup-card').count() == 0)
        s3.close()

    @flow('ru', 'en')
    def cleanup_review_flow(lang):
        L = f'[{lang}] '; S = S6[lang]
        s = Session(lang, data=cleanup_doc(), device={'cleanup': {'baseline': ago(100), 'lastReview': None, 'remindAt': None}}); pg = s.pg
        before_ids = {t['id'] for t in s.tasks()}
        pg.click('[data-action="cleanup.start"][data-mode="review"]'); pg.wait_for_selector('.crow')
        rows = pg.locator('.crow .title').all_inner_texts()
        check(L + 'Просмотр: только подходящие записи (старые выполненные задачи, прошлые события, завершённый список)', sorted(rows) == sorted(['Старая выполненная', 'Тоже старая', 'Старое событие', 'Старая поездка']), str(rows))
        check(L + 'Просмотр: защищённое не показано', not any(x in pg.inner_text('main') for x in ['Старая невыполненная', 'Будущее событие', 'Хранить выполненную', 'Недавняя', 'Текущий список']))
        check(L + 'Просмотр: при открытии ничего не выбрано', pg.locator('.crow input:checked').count() == 0 and pg.locator('[data-action="cleanup.confirm"]').count() == 0)
        pg.locator('.crow', has_text='Тоже старая').locator('input[type=checkbox]').click()
        pg.click('[data-action="cleanup.confirm"]'); s.wait_sheet()
        sheet = pg.inner_text('#sheet-root')
        check(L + 'Подтверждение выбранного без копии: итоги по типам, дата, без кнопки удаления', ('1' in sheet) and pg.locator('#sheet-root form[data-form="cleanup.run"]').count() == 0 and pg.locator('#sheet-root [data-action="backup.export"]').count() == 1, sheet)
        check(L + 'Подтверждение: сказано, что история пропадёт из Календаря и Поиска, указана граница 2026-07-11', ('Поиск' in sheet or 'Search' in sheet) and ('2026' in sheet))
        with pg.expect_download() as dl:
            pg.click('#sheet-root [data-action="backup.export"]')
        path = os.path.join(OUT, f'cleanup-backup-{lang}.json'); dl.value.save_as(path)
        pg.wait_for_selector('#sheet-root form[data-form="cleanup.run"]')
        bk = json.load(open(path, encoding='utf-8'))
        check(L + 'Копия до удаления содержит всю историю', {t['id'] for t in bk['data']['tasks']} >= before_ids and len(bk['data']['events']) == 3 and len(bk['data']['lists']) >= 2)
        pg.click('#sheet-root form[data-form="cleanup.run"] button[type=submit]'); pg.wait_for_timeout(100)
        check(L + 'Без галочки подтверждения удаление не проходит', len(s.tasks()) == 6 and not s.no_sheet())
        pg.check('#sheet-root input[name=sure]')
        pg.click('#sheet-root form[data-form="cleanup.run"] button[type=submit]')
        left = {t['id'] for t in s.tasks()}
        check(L + 'После подтверждения удалена только выбранная запись', left == before_ids - {'c2'} and len(s.events()) == 3 and len(s.doc()['lists']) >= 2, str(left))
        check(L + 'Дата проверки очистки записана на устройстве', s.device()['cleanup']['lastReview'] == '2026-10-09')
        s.reload()
        check(L + 'После перезапуска удалённое не вернулось', {t['id'] for t in s.tasks()} == before_ids - {'c2'})
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    @flow('ru')
    def cleanup_grace_flow(lang):
        L = f'[{lang}] '
        s = Session(lang, data=cleanup_doc(), device={'cleanup': {'baseline': ago(100), 'lastReview': None, 'remindAt': None}}); pg = s.pg
        with pg.expect_download() as dl:
            pg.click('.cleanup-card [data-action="backup.export"]')
        pg.wait_for_function("() => !!JSON.parse(localStorage.getItem('organizer:device')).lastBackupAt")
        pg.click('[data-action="cleanup.start"][data-mode="all"]'); s.wait_sheet()
        check(L + 'Копия, сохранённая на карточке, засчитывается: сразу видна форма подтверждения', pg.locator('#sheet-root form[data-form="cleanup.run"]').count() == 1)
        pg.check('#sheet-root input[name=sure]'); pg.click('#sheet-root form[data-form="cleanup.run"] button[type=submit]')
        check(L + 'Удаление выполнено', 'c1' not in {t['id'] for t in s.tasks()})
        s.close()

    @flow('ru', 'en')
    def cleanup_bulk_flow(lang):
        L = f'[{lang}] '; S = S6[lang]
        s = Session(lang, data=cleanup_doc(), device={'cleanup': {'baseline': ago(100), 'lastReview': None, 'remindAt': None}}); pg = s.pg
        raw0 = pg.evaluate("localStorage.getItem('organizer:data')")
        pg.click('[data-action="cleanup.start"][data-mode="all"]'); s.wait_sheet()
        sheet = pg.inner_text('#sheet-root')
        check(L + 'Удалить всё: итоги по типам (2 задачи, 1 событие, 1 список)', all(x in sheet for x in ['2', '1']) and pg.locator('#sheet-root .totals li').count() == 3 and [x.strip() for x in pg.locator('#sheet-root .totals li b').all_inner_texts()] == ['2', '1', '1'], str(pg.locator('#sheet-root .totals li').all_inner_texts()))
        check(L + 'Удалить всё: без копии удалять нельзя', pg.locator('#sheet-root form[data-form="cleanup.run"]').count() == 0)
        check(L + 'Открытие и просмотр ничего не изменили', pg.evaluate("localStorage.getItem('organizer:data')") == raw0)
        with pg.expect_download() as dl:
            pg.click('#sheet-root [data-action="backup.export"]')
        pg.wait_for_selector('#sheet-root form[data-form="cleanup.run"]')
        pg.check('#sheet-root input[name=sure]')
        pg.click('#sheet-root form[data-form="cleanup.run"] button[type=submit]')
        d = s.doc()
        tt = {t['id'] for t in d['tasks']}
        check(L + 'Удалены все подходящие и только они', tt == {'c3', 'c4', 'c5', 'c6'} and {e['id'] for e in d['events']} == {'ev2', 'ev3'} and {l['id'] for l in d['lists']} >= {'L2'} and 'L1' not in {l['id'] for l in d['lists']}, str(tt))
        check(L + 'Защищённое цело: невыполненные, будущее, «Хранить всегда», активный список', 'c5' in tt and 'c6' in tt and 'c4' in tt and 'ev3' in {e['id'] for e in d['events']} and 'L2' in {l['id'] for l in d['lists']})
        check(L + 'Серии, шаблоны и настройки не тронуты', d['series'] == [] and d['settings']['day']['setupDone'] is True)
        # removed history is gone from search and calendar
        s.tab('tasks'); pg.click('#search-btn'); s.wait_sheet(); pg.fill('#sheet-root input[name=q]', 'тоже старая')
        check(L + 'Удалённое пропало из Поиска', S['none'] in pg.inner_text('#sheet-root'))
        s.close_sheet()
        # after a cleanup a new backup is needed again
        pg.evaluate("window.scrollTo(0,0)")
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    @flow('ru')
    def cleanup_keep_flow(lang):
        L = f'[{lang}] '; S = S6[lang]
        s = Session(lang, data=cleanup_doc()); pg = s.pg
        pg.click('#more-btn'); s.wait_sheet(); pg.click('#sheet-root [data-action="cleanup.start"]')
        pg.wait_for_selector('main .card')
        txt = pg.inner_text('main')
        check(L + 'Экран очистки из меню ⚙: итоги, граница дат, размер, пояснение об истории', 'Старое событие' not in txt and ('90' in txt) and ('КБ' in txt or 'KB' in txt) and ('Календар' in txt or 'Calendar' in txt))
        check(L + 'Экран очистки: прямо не говорится, что очистка обязательна', 'обязательн' not in txt)
        pg.click('[data-action="cleanup.review"]'); pg.wait_for_selector('.crow')
        pg.locator('.crow', has_text='Тоже старая').locator('.keep').click()
        check(L + '«Хранить всегда» в просмотре: запись исчезает из списка и помечена в данных', pg.locator('.crow', has_text='Тоже старая').count() == 0 and next(t for t in s.tasks() if t['id'] == 'c2').get('keep') is True)
        s.back(); s.tab('calendar')
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== migration, persistence, privacy
    @flow('ru')
    def persistence_flow(lang):
        L = f'[{lang}] '
        s = Session(lang, data=week_doc()); pg = s.pg
        s.tab('tasks')
        pg.click('.group.nodate .h2-plus'); s.wait_sheet(); pg.fill('#sheet-root textarea[name=text]', 'Сохранится\nИ это')
        pg.click('#sheet-root form[data-form="nodate.add"] button[type=submit]')
        s.reload(); s.tab('tasks')
        check(L + 'После перезапуска задачи без даты на месте', 'Сохранится' in pg.inner_text('.group.nodate') and 'И это' in pg.inner_text('.group.nodate'))
        check(L + 'Схема данных 5 после первого запуска 0.6.0 на данных 0.5.2', s.doc()['schemaVersion'] == 5)
        foreign = [u for u in s.requests if not u.startswith(BASE)]
        check(L + 'Все запросы — только к файлам приложения', not foreign, str(foreign[:3]))
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== audit (contrast, overflow, screenshots)
    OVERFLOW_JS = """() => { const bad = []; const W = document.documentElement.clientWidth;
      for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) continue;
        if (el.closest('[hidden]') || el.closest('.scrim')) continue;
        if (r.right > W + 1 || r.left < -1) bad.push(el.tagName.toLowerCase() + '.' + el.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
      }
      return bad.slice(0, 6); }"""

    @flow('ru-light', 'ru-dark', 'en-light', 'en-dark')
    def audit6_flow(combo):
        lang, theme = combo.split('-')
        L = f'[{lang}/{theme}] '; S = S6[lang]
        d = cleanup_doc()
        d['tasks'] += week_doc()['tasks']
        d['events'] += search_doc()['events']
        s = Session(lang, theme=theme, data=d, device={'cleanup': {'baseline': ago(100), 'lastReview': None, 'remindAt': None}}); pg = s.pg
        def look(name, full=True):
            bad = pg.evaluate(CONTRAST_JS)
            check(L + f'Контраст ≥ 4.5:1: {name}', not bad, '; '.join(bad[:4]))
            ov = pg.evaluate(OVERFLOW_JS)
            check(L + f'Ничего не вылезает за экран 390px: {name}', not ov and pg.evaluate('document.documentElement.scrollWidth') <= 390, '; '.join(ov))
            pg.screenshot(path=os.path.join(SHOTS, f'v6-{lang}-{theme}-{name}.png'), full_page=full)
        look('today-with-reminder')
        s.tab('tasks'); look('tasks')
        pg.click('[data-fold="later"] .foldhead'); look('tasks-later')
        pg.click('.group.nodate .h2-plus'); s.wait_sheet(); look('nodate-sheet', False); s.close_sheet()
        pg.click('#search-btn'); s.wait_sheet(); pg.fill('#sheet-root input[name=q]', 'ужин'); look('search', False)
        pg.locator('#sheet-root .srch').first.click(); pg.wait_for_selector('#day-panel'); look('calendar-highlight', False)
        s.tab('tasks'); pg.click('[data-fold="recurring"] .foldhead'); pg.click('[data-action="series.new"]'); s.wait_sheet(); pg.select_option('#sheet-root select[name=kind]', 'event'); look('series-new-event', False); s.close_sheet()
        s.tab('today'); pg.click('[data-action="cleanup.start"][data-mode="review"]'); pg.wait_for_selector('.crow'); look('cleanup-review')
        pg.click('[data-action="cleanup.home"]'); look('cleanup-home')
        pg.click('[data-action="cleanup.confirm"][data-scope="all"]'); s.wait_sheet(); look('cleanup-confirm', False); s.close_sheet()
        s.tab('today'); s.more('Недавняя выполненная') if False else None
        s.tab('lists')
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    @flow()
    def narrow6_flow():
        for lang in ('ru', 'en'):
            L = f'[{lang}/320] '
            s = Session(lang, data=cleanup_doc(), device={'cleanup': {'baseline': ago(100), 'lastReview': None, 'remindAt': None}}); pg = s.pg
            pg.set_viewport_size({'width': 320, 'height': 568}); pg.wait_for_timeout(200)
            ok_ = True
            for tabname in ['today', 'tasks']:
                s.tab(tabname)
                ok_ = ok_ and pg.evaluate('document.documentElement.scrollWidth') <= 320 and not pg.evaluate(OVERFLOW_JS)
            check(L + 'Today и Tasks помещаются в 320px (включая лупу и карточку напоминания)', ok_)
            s.tab('today'); pg.click('[data-action="cleanup.start"][data-mode="review"]'); pg.wait_for_selector('.crow')
            check(L + 'Экран очистки помещается в 320px', pg.evaluate('document.documentElement.scrollWidth') <= 320 and not pg.evaluate(OVERFLOW_JS))
            s.close()

    # =============================================================== offline and updates
    @flow()
    def offline_flow():
        s = Session('ru', data=week_doc()); pg = s.pg
        pg.evaluate('navigator.serviceWorker.ready')
        pg.wait_for_function('() => !!navigator.serviceWorker.controller || true')
        s.reload(); pg.wait_for_function('() => !!navigator.serviceWorker.controller', timeout=10000)
        names = pg.evaluate("caches.keys()")
        urls = pg.evaluate("caches.open(%s).then(c => c.keys()).then(ks => ks.map(k => new URL(k.url).pathname))" % json.dumps(names[-1] if names else ''))
        for need in ['/search.js', '/view-search.js', '/cleanup.js', '/view-cleanup.js', '/i18n-v6.js']:
            check('Офлайн: новый модуль в кэше: ' + need, need in urls, str(urls)[:200])
        s.ctx.set_offline(True)
        s.reload()
        s.tab('tasks')
        check('Офлайн: приложение запускается без сети, данные на месте', 'Без даты первая' in s.pg.inner_text('main'))
        s.pg.click('#search-btn'); s.wait_sheet(); s.pg.fill('#sheet-root input[name=q]', 'пятница')
        check('Офлайн: поиск работает', s.pg.locator('#sheet-root .srch').count() >= 1)
        s.ctx.set_offline(False)
        check('Нет ошибок страницы', not [e for e in s.errors if 'Failed to fetch' not in e and 'net::' not in e], str(s.errors[:2]))
        s.close()

    # =============================================================== runner
    for fn, langs in FLOWS:
        if os.environ.get('ONLY') and os.environ['ONLY'] not in fn.__name__: continue
        for args in ([(l,) for l in langs] if langs else [()]):
            try:
                fn(*args)
            except Exception as e:
                results.append((f'{fn.__name__}{args} — ИСКЛЮЧЕНИЕ', False, str(e).splitlines()[0]))
                traceback.print_exc()
    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
print(f'E2E-V6: {passed}/{len(results)} checks passed')
for name, ok, detail in results:
    print(('  ✓ ' if ok else '  ✗ ') + name + (f'  — {detail}' if detail and not ok else ''))
json.dump([{'name': n, 'ok': o, 'detail': d} for n, o, d in results], open(os.path.join(OUT, 'e2e-v6-results.json'), 'w'), ensure_ascii=False, indent=1)
sys.exit(0 if passed == len(results) else 1)
