import os
"""Browser tests for 0.9.0 (repeat in words, deleting «only this / this and all later», direct «Удалить») — Russian only (headless Chromium, iPhone-sized screen).
Usage: python3 e2e-v9-test.py <app_folder> <output_folder>
Runs every flow twice (Russian, English); a contrast and layout audit runs in both
languages and both themes. The clock of the page is fixed, so dates are exact.
Prints one line per check and saves e2e-v9-results.json."""
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
    'ru': {'gearLabel': 'Настройки и меню', 'cal_month': 'Октябрь 2026', 'wd': 'Пн', 'sun': 'Вс', 'tabs': ['Сегодня', 'Календарь', 'Задачи', 'Списки', 'Цели'], 'weekday': 'Пятница', 'date': '9 октября',
           'edit': 'Изменить', 'move': 'Перенести…', 'dup': 'Дублировать', 'wait': 'Ожидаю от других', 'del': 'Удалить', 'toEvent': 'Сделать событием', 'toTask': 'Сделать задачей',
           'add': 'Добавить', 'buy': 'Купить', 'home': 'Дом', 'out': 'Закончилось', 'low': 'Заканчивается', 'have': 'Есть', 'tails': 'Хвосты', 'prepAdd': 'Добавить подготовку', 'prep': 'Подготовка',
           'rename': 'Переименовать', 'cats': 'Категории', 'saveTpl': 'Сохранить как шаблон', 'blank': 'Пустой список', 'tplManage': 'Шаблоны…'},
    'en': {'gearLabel': 'Settings and menu', 'cal_month': 'October 2026', 'wd': 'Mon', 'sun': 'Sun', 'tabs': ['Today', 'Calendar', 'Tasks', 'Lists', 'Goals'], 'weekday': 'Friday', 'date': 'October 9',
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


    # 0.9.0 — Russian only (English is paused). The page clock is Friday 9 October 2026, 12:00.
    def d9(**kw):
        d = doc4(**kw); d['schemaVersion'] = 7; d.setdefault('goals', [])
        return d
    def banners(pg):
        return pg.inner_text('#banners')
    def cal_day(s, date):
        s.pg.click(f'#main [data-action="cal.select"][data-date="{date}"]'); s.pg.wait_for_timeout(40)
    def day_titles(s):
        return s.pg.locator('#main .erow .title').all_inner_texts()
    def open_event(s, date, title):
        cal_day(s, date)
        s.pg.locator('#main .erow .ttext', has_text=title).first.click(); s.wait_sheet()
    def add_training(s):
        # «Тренировка в зале» as a repeating EVENT (Tue, Thu, Sat at 20:44, until 21 December), made by typing
        s.quick('Тренировка в зале каждый вторник, четверг и субботу в 20:44 до 21/12')
        s.pg.wait_for_selector('#sheet-root [data-action="quick.asEvent"]')
        s.pg.click('#sheet-root [data-action="quick.asEvent"]'); s.pg.wait_for_timeout(100)
    def rule(s):
        return next(x for x in s.doc()['series'] if not x['deletedAt'])

    # =============================================================== repeat in words
    @flow('ru')
    def quick_repeat_flow(lang):
        L = '[ru] '
        s = Session(lang, data=d9()); pg = s.pg
        s.quick('Тренировка в зале каждый вторник, четверг и субботу до 21/12\nКупить хлеб'); pg.wait_for_timeout(100)
        check(L + 'Окно закрылось — обе строки приняты', s.no_sheet())
        check(L + 'Сообщение называет правило и окончание', '«Тренировка в зале»: каждую неделю: вт, чт, сб, до' in banners(pg) and '21 дек' in banners(pg), banners(pg)[:200])
        sr = s.doc()['series']
        check(L + 'Создано правило задачи: вт, чт, сб до 21 декабря', len(sr) == 1 and sr[0]['days'] == [2, 4, 6] and sr[0]['until'] == '2026-12-21' and sr[0]['mode'] == 'fixed' and not sr[0].get('kind'), json.dumps(sr, ensure_ascii=False)[:300])
        check(L + 'Название без слов повтора', sr[0]['title'] == 'Тренировка в зале')
        check(L + '«Купить хлеб» — обычная задача на сегодня', [t['plan']['date'] for t in s.tasks('Купить хлеб')] == ['2026-10-09'])
        check(L + 'Сегодня пятница — тренировки в задачах ещё нет', not s.tasks('Тренировка в зале'))
        s.tab('calendar'); cal_day(s, '2026-10-13')
        check(L + 'В календаре во вторник она уже видна заранее', 'Тренировка в зале' in s.text())
        cal_day(s, '2026-10-14')
        check(L + 'В среду её нет', 'Тренировка в зале' not in s.text())
        s.at('2026-10-10T09:00:00+03:00'); s.reload()
        check(L + 'В субботу она появилась в «Сегодня»', 'Тренировка в зале' in s.text())
        s.at('2026-12-22T09:00:00+03:00'); s.reload()
        check(L + 'После 21 декабря новых не появляется', all(t['plan']['date'] <= '2026-12-21' for t in s.tasks('Тренировка в зале')), str([t['plan']['date'] for t in s.tasks('Тренировка в зале')][-3:]))
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()
        # with a time: «задача или событие?» names the rule
        s = Session(lang, data=d9()); pg = s.pg
        s.quick('Английский каждый понедельник и среду в 19:00 до 21 декабря'); pg.wait_for_selector('#sheet-root .banner')
        b = pg.inner_text('#sheet-root .banner')
        check(L + 'Строка со временем: вопрос называет правило и время', 'каждую неделю: пн, ср' in b and '19:00' in b, b)
        pg.click('#sheet-root [data-action="quick.asEvent"]'); pg.wait_for_timeout(100)
        ev = sorted(e['start'] for e in s.events('Английский'))
        check(L + '«Событие» — повторяющееся событие пн и ср в 19:00', ev[:3] == ['2026-10-12T19:00', '2026-10-14T19:00', '2026-10-19T19:00'] and ev[-1] <= '2026-12-21T19:00', str(ev[:3] + ev[-1:]))
        s.tab('calendar'); cal_day(s, '2026-10-12')
        check(L + 'В календаре в понедельник', 'Английский' in s.text())
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== deleting a repeating event
    @flow('ru')
    def delete_repeat_event_flow(lang):
        L = '[ru] '
        s = Session(lang, data=d9()); pg = s.pg
        add_training(s)
        n0 = len(s.events('Тренировка в зале'))
        check(L + 'Повторяющееся событие создано', n0 > 10 and rule(s)['kind'] == 'event', str(n0))
        s.tab('calendar'); open_event(s, '2026-10-17', 'Тренировка в зале')
        btns = [b.strip() for b in pg.locator('#sheet-root .sheet .menuitem').all_inner_texts()]
        check(L + 'В карточке одним списком: «Изменить», «Изменить повтор», «Удалить»; «Сделать задачей» нет', btns == ['Изменить', 'Изменить повтор', 'Удалить'], str(btns))
        check(L + 'В карточке нет кнопок разного размера: только строки списка', pg.locator('#sheet-root .sheet .line button').count() == 0)
        pg.click('#sheet-root [data-action="event.delete"]'); s.wait_sheet()
        opts = pg.locator('#sheet-root .menuitem').all_inner_texts()
        check(L + 'Выбор: «Только это» / «Это и все следующие»', len(opts) == 2 and opts[0].startswith('Только это') and opts[1].startswith('Это и все следующие'), str(opts))
        check(L + 'Диалог подтверждения не нужен — выбор и есть подтверждение', len(s.dialogs) == 0)
        pg.click('#sheet-root [data-action="delrep.following"]'); pg.wait_for_timeout(100)
        check(L + 'Сообщение «удалено: этот раз и все следующие»', 'этот раз и все следующие' in banners(pg), banners(pg)[:200])
        left = sorted(e['start'][:10] for e in s.events('Тренировка в зале'))
        check(L + 'Остались только 10, 13 и 15 октября', left == ['2026-10-10', '2026-10-13', '2026-10-15'], str(left))
        check(L + 'Повтор закончен накануне', rule(s)['until'] == '2026-10-16')
        cal_day(s, '2026-10-24')
        check(L + 'В календаре дальше пусто', 'Тренировка в зале' not in s.text())
        open_event(s, '2026-10-15', 'Тренировка в зале'); pg.click('#sheet-root [data-action="event.delete"]'); s.wait_sheet()
        pg.click('#sheet-root [data-action="delrep.one"]'); pg.wait_for_timeout(80)
        check(L + '«Только это»: удалено одно, можно отменить', sorted(e['start'][:10] for e in s.events('Тренировка в зале')) == ['2026-10-10', '2026-10-13'] and 'Отменить' in pg.inner_text('#undo'))
        pg.click('#undo button'); pg.wait_for_timeout(60)
        check(L + 'Отмена вернула его', sorted(e['start'][:10] for e in s.events('Тренировка в зале')) == ['2026-10-10', '2026-10-13', '2026-10-15'])
        open_event(s, '2026-10-10', 'Тренировка в зале'); pg.click('#sheet-root [data-action="event.delete"]'); s.wait_sheet()
        check(L + 'С первого раза — «Весь повтор»', pg.locator('#sheet-root [data-action="delrep.following"]').inner_text().startswith('Весь повтор'))
        pg.click('#sheet-root [data-action="delrep.following"]'); pg.wait_for_timeout(80)
        check(L + 'Весь повтор удалён', not s.events('Тренировка в зале') and all(x['deletedAt'] for x in s.doc()['series']))
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== menus, task editor, ordinary events
    @flow('ru')
    def delete_buttons_flow(lang):
        L = '[ru] '
        s = Session(lang, data=d9(events=[event('e1', 'Ужин', '2026-10-12T19:00')], tasks=[task('n1', 'Купить хлеб')])); pg = s.pg
        s.tab('calendar'); open_event(s, '2026-10-12', 'Ужин')
        btns = [b.strip() for b in pg.locator('#sheet-root .sheet .menuitem').all_inner_texts()]
        check(L + 'Обычное событие: список «Изменить, Повторять, Сделать задачей, Удалить»', btns == ['Изменить', 'Повторять', 'Сделать задачей', 'Удалить'], str(btns))
        pg.click('#sheet-root [data-action="event.delete"]'); pg.wait_for_timeout(80)
        check(L + 'Обычное: спрашивает подтверждение и удаляет', len(s.dialogs) == 1 and not s.events('Ужин'))
        s.tab('tasks'); s.open_title('Купить хлеб')
        check(L + 'В задаче «Удалить» прямо в окне', pg.locator('#sheet-root [data-action="task.delete"]').count() == 1)
        rows = [b.strip() for b in pg.locator('#sheet-root .sheet .menuitem').all_inner_texts()]
        check(L + 'Окно задачи: одна широкая «Сохранить», затем список «Повторять, Сделать событием, Другие действия, Удалить»',
              pg.locator('#sheet-root form[data-form="task.edit"] button').count() == 1 and rows == ['Повторять', 'Сделать событием', 'Другие действия', 'Удалить'], str(rows))
        check(L + 'Строки списка одной высоты', len(set(round(b['height']) for b in pg.evaluate("[...document.querySelectorAll('#sheet-root .menuitem')].map(e => e.getBoundingClientRect().toJSON())"))) == 1)
        pg.click('#sheet-root [data-action="task.delete"]'); pg.wait_for_timeout(80)
        check(L + 'Задача удалена (с подтверждением)', not s.tasks('Купить хлеб') and len(s.dialogs) == 2)
        add_training(s)
        s.tab('calendar'); cal_day(s, '2026-10-13')
        pg.locator('#main .erow .ttext', has_text='Тренировка в зале').first.click(button='right'); s.wait_sheet()
        items = pg.locator('#sheet-root .menuitem').all_inner_texts()
        check(L + 'Меню повторяющегося события: без «Сделать задачей»', 'Сделать задачей' not in items and 'Удалить' in items, str(items))
        s.item('Удалить'); s.wait_sheet()
        check(L + 'Из меню тоже выбор «только это / все следующие»', pg.locator('#sheet-root [data-action="delrep.following"]').count() == 1)
        s.close_sheet()
        # a repeating task made by typing: «Удалить» in its editor asks the same
        s.tab('today'); s.quick('Зарядка каждый день'); pg.wait_for_timeout(100)
        s.tab('tasks'); s.open_title('Зарядка')
        pg.click('#sheet-root [data-action="task.delete"]'); s.wait_sheet()
        check(L + 'Повторяющаяся задача: тот же выбор', pg.locator('#sheet-root .sheet-head', has_text='Удалить повторяющуюся задачу').count() == 1)
        pg.click('#sheet-root [data-action="delrep.following"]'); pg.wait_for_timeout(80)
        check(L + 'С первого раза — правило удалено целиком', not s.tasks('Зарядка') and all(x['deletedAt'] for x in s.doc()['series'] if x['title'] == 'Зарядка'))
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== audit (Russian, light and dark, 390 and 320)
    OVERFLOW_JS = """() => { const bad = []; const W = document.documentElement.clientWidth;
      for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) continue;
        if (el.closest('[hidden]') || el.closest('.scrim')) continue;
        if (el.matches('.wday input')) continue;
        if (r.right > W + 1 || r.left < -1) bad.push(el.tagName.toLowerCase() + '.' + el.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
      }
      return bad.slice(0, 6); }"""

    @flow('light', 'dark')
    def audit9_flow(theme):
        for W in (390, 320):
            L = f'[ru/{theme}/{W}] '
            s = Session('ru', theme=theme, data=d9(events=[event('e1', 'Ужин', '2026-10-12T19:00')])); pg = s.pg
            if W != 390: pg.set_viewport_size({'width': W, 'height': 640}); pg.wait_for_timeout(150)
            def look(name):
                check(L + f'Нет значка ↻: {name}', '↻' not in pg.inner_text('body'))
                bad = pg.evaluate(CONTRAST_JS)
                check(L + f'Контраст ≥ 4.5:1: {name}', not bad, '; '.join(bad[:4]))
                ov = pg.evaluate(OVERFLOW_JS)
                check(L + f'Ничего не вылезает за экран: {name}', not ov and pg.evaluate('document.documentElement.scrollWidth') <= W, '; '.join(ov))
                pg.screenshot(path=os.path.join(SHOTS, f'v9-{theme}-{W}-{name}.png'), full_page=False)
            s.quick('Тренировка в зале каждый вторник, четверг и субботу в 20:44 до 21/12'); pg.wait_for_selector('#sheet-root .banner'); pg.wait_for_timeout(260); look('quick-ask-repeat')
            pg.click('#sheet-root [data-action="quick.asEvent"]'); pg.wait_for_timeout(100); look('repeat-notice')
            s.tab('calendar'); open_event(s, '2026-10-13', 'Тренировка в зале'); look('repeating-event-card')
            pg.click('#sheet-root [data-action="event.delete"]'); s.wait_sheet(); look('delete-choice')
            s.close_sheet(); open_event(s, '2026-10-12', 'Ужин'); look('event-card')
            s.close_sheet(); s.tab('today'); s.fab(); pg.fill('#sheet-root textarea[name=text]', 'Купить хлеб'); pg.click('#sheet-root form[data-form="task.quickAdd"] button[type=submit]'); pg.wait_for_timeout(80)
            s.tab('tasks'); s.open_title('Купить хлеб'); look('task-editor')
            s.close_sheet()
            check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
            s.close()

    # =============================================================== offline
    @flow()
    def offline9_flow():
        s = Session('ru', data=d9()); pg = s.pg
        pg.evaluate('navigator.serviceWorker.ready')
        s.reload(); pg.wait_for_function('() => !!navigator.serviceWorker.controller', timeout=10000)
        names = pg.evaluate("caches.keys()")
        urls = pg.evaluate("caches.open(%s).then(c => c.keys()).then(ks => ks.map(k => new URL(k.url).pathname))" % json.dumps(names[-1] if names else ''))
        for need in ['/parserepeat.js', '/i18n-v9.js']:
            check('Офлайн: в кэше ' + need, need in urls, str(urls)[:200])
        ver = pg.evaluate("import('./version.js').then(m => m.APP_VERSION)")
        check('Офлайн: в кэше текущая версия приложения', any(ver in n for n in names), f'{ver} {names}')
        s.ctx.set_offline(True)
        s.reload(); s.quick('Йога по вторникам'); pg.wait_for_timeout(100)
        check('Офлайн: повтор словами работает без сети', any(x['title'] == 'Йога' and x['days'] == [2] or (x['title'] == 'Йога' and x['freq'] == 'weekly') for x in s.doc()['series']))
        s.ctx.set_offline(False)
        s.close()


    # =============================================================== 0.9.2: moving rows by long press
    def titles_in(pg, sel='#main .irow'):
        return [x.strip() for x in pg.locator(sel + ' .title').all_inner_texts()]
    def mouse_drag(s, row, target, after=True, hold=650, shot=None):
        pg = s.pg
        b = row.bounding_box(); t = target.bounding_box()
        x = b['x'] + b['width'] * 0.6; y = b['y'] + b['height'] / 2
        ty = t['y'] + t['height'] * (0.85 if after else 0.15)
        pg.mouse.move(x, y); pg.mouse.down(); pg.wait_for_timeout(hold)
        lifted = pg.locator('.lifted').count() == 1
        for i in range(1, 13):
            pg.mouse.move(x, y + (ty - y) * i / 12); pg.wait_for_timeout(16)
            if i == 7 and shot: pg.wait_for_timeout(200); pg.screenshot(path=os.path.join(SHOTS, shot))
        pg.mouse.up(); pg.wait_for_timeout(120); s.tick(1000)
        return lifted
    def touch_drag(s, row, target, after=True, hold=650):
        pg = s.pg
        cdp = pg.context.new_cdp_session(pg)
        b = row.bounding_box(); t = target.bounding_box()
        x = b['x'] + b['width'] * 0.6; y = b['y'] + b['height'] / 2
        ty = t['y'] + t['height'] * (0.85 if after else 0.15)
        sy = pg.evaluate('scrollY')
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
        pg.wait_for_timeout(hold)
        lifted = pg.locator('.lifted').count() == 1
        for i in range(1, 13):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y + (ty - y) * i / 12}]}); pg.wait_for_timeout(16)
        no_scroll = pg.evaluate('scrollY') == sy
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); pg.wait_for_timeout(120); s.tick(1000)
        return lifted, no_scroll

    @flow('ru')
    def reorder_list_flow(lang):
        L = '[ru] '
        items = ['Хочу белую юбку', 'Розовый кардиган', 'Голубые перчатки', 'Голубую косынку', 'Лама мех шарф']
        lst = {"id": "l1", "name": "Шоппинг одежда", "kind": None, "categories": [], "items": [
            {"id": f"i{k}", "title": tt, "done": False, "category": None, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None} for k, tt in enumerate(items)],
            "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}
        lst['items'][4]['done'] = True
        s = Session(lang, data=d9(lists=[lst])); pg = s.pg
        s.tab('lists'); pg.locator('#main [data-action="list.open"]', has_text='Шоппинг одежда').first.click(); pg.wait_for_timeout(60)
        check(L + 'Список открыт', titles_in(pg)[:4] == items[:4], str(titles_in(pg)))
        check(L + 'Перетаскивать можно только несделанные', pg.locator('#main .irow[data-drag]').count() == 4 and pg.locator('#main .irow.is-done[data-drag]').count() == 0)
        rows = lambda: pg.locator('#main .irow[data-drag]')
        lifted = mouse_drag(s, rows().nth(3), rows().nth(0), after=False, shot='v92-list-dragging.png')
        check(L + 'Долгое нажатие поднимает строку', lifted)
        check(L + 'Мышью: «косынка» стала первой', titles_in(pg)[:4] == ['Голубую косынку', 'Хочу белую юбку', 'Розовый кардиган', 'Голубые перчатки'], str(titles_in(pg)))
        check(L + 'После перестановки не открылось окно пункта', s.no_sheet())
        check(L + 'Порядок сохранён в данных', [i['title'] for i in s.doc()['lists'][0]['items']] == ['Голубую косынку', 'Хочу белую юбку', 'Розовый кардиган', 'Голубые перчатки', 'Лама мех шарф'])
        lifted, no_scroll = touch_drag(s, rows().nth(0), rows().nth(2), after=True)
        check(L + 'Пальцем: строка поднимается, страница не прокручивается', lifted and no_scroll, str((lifted, no_scroll)))
        check(L + 'Пальцем: «косынка» встала после «кардигана»', titles_in(pg)[:4] == ['Хочу белую юбку', 'Розовый кардиган', 'Голубую косынку', 'Голубые перчатки'], str(titles_in(pg)))
        # a quick tap still opens the item; a short drag (scroll) moves nothing
        rows().nth(0).locator('.ttext').click(); s.wait_sheet()
        check(L + 'Обычный тап по пункту по-прежнему открывает его', pg.locator('#sheet-root form[data-form="item.edit"]').count() == 1)
        s.close_sheet()
        b = rows().nth(1).bounding_box()
        pg.mouse.move(b['x'] + 100, b['y'] + 10); pg.mouse.down(); pg.mouse.move(b['x'] + 100, b['y'] + 80, steps=5); pg.wait_for_timeout(700); pg.mouse.up(); s.tick(1000)
        check(L + 'Движение без удержания ничего не переставляет', titles_in(pg)[:4] == ['Хочу белую юбку', 'Розовый кардиган', 'Голубую косынку', 'Голубые перчатки'] and pg.locator('.lifted').count() == 0)
        s.reload(); s.tab('lists'); pg.locator('#main [data-action="list.open"]', has_text='Шоппинг одежда').first.click(); pg.wait_for_timeout(60)
        check(L + 'После перезапуска порядок тот же', titles_in(pg)[:4] == ['Хочу белую юбку', 'Розовый кардиган', 'Голубую косынку', 'Голубые перчатки'])
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    @flow('ru')
    def reorder_steps_flow(lang):
        L = '[ru] '
        st = lambda i, tt, done=False: {"id": i, "title": tt, "done": done, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None, **({"doneAt": NOWISO} if done else {})}
        goal = {"id": "g1", "title": "Раскопки агоры", "note": "", "steps": [st('a', 'Написать поллали'), st('b', 'Заполнить анкету'), st('c', 'Купить билеты')],
                "doneAt": None, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}
        s = Session(lang, data=d9(goals=[goal])); pg = s.pg
        s.tab('tasks')
        check(L + 'В «Задачах» шаги целей не перетаскиваются', pg.locator('#main .gsrow[data-drag]').count() == 0)
        s.tab('goals'); pg.locator('#main .goalrow', has_text='Раскопки агоры').click(); pg.wait_for_timeout(60)
        rows = lambda: pg.locator('#main .gsrow[data-drag]')
        check(L + 'В цели шаги можно перетаскивать', rows().count() == 3)
        lifted = mouse_drag(s, rows().nth(2), rows().nth(0), after=False, shot='v92-steps-dragging.png')
        check(L + 'Шаг поднят и переставлен в начало', lifted and titles_in(pg, '#main .gsrow') == ['Купить билеты', 'Написать поллали', 'Заполнить анкету'], str(titles_in(pg, '#main .gsrow')))
        check(L + '«Следующий шаг» — теперь первый', 'next' in rows().nth(0).get_attribute('class'))
        check(L + 'Окно шага не открылось', s.no_sheet())
        lifted, no_scroll = touch_drag(s, rows().nth(0), rows().nth(2), after=True)
        check(L + 'Пальцем: шаг переставлен в конец', titles_in(pg, '#main .gsrow') == ['Написать поллали', 'Заполнить анкету', 'Купить билеты'] and no_scroll)
        check(L + 'Порядок в данных', [x['title'] for x in s.doc()['goals'][0]['steps']] == ['Написать поллали', 'Заполнить анкету', 'Купить билеты'])
        rows().nth(1).locator('.ttext').click(); s.wait_sheet()
        check(L + 'Тап по шагу открывает его окно (с «Выше / Ниже»)', pg.locator('#sheet-root [data-action="step.move"]').count() >= 1)
        s.close_sheet()
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
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
print(f'E2E-V9: {passed}/{len(results)} checks passed')
for name, ok, detail in results:
    print(('  ✓ ' if ok else '  ✗ ') + name + (f'  — {detail}' if detail and not ok else ''))
json.dump([{'name': n, 'ok': o, 'detail': d} for n, o, d in results], open(os.path.join(OUT, 'e2e-v9-results.json'), 'w'), ensure_ascii=False, indent=1)
sys.exit(0 if passed == len(results) else 1)
