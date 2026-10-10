import os
"""Browser tests for 0.5.0 (the calm redesign) (headless Chromium, iPhone-sized screen).
Usage: python3 e2e-v4-test.py <app_folder> <output_folder>
Runs every flow twice (Russian, English); a contrast and layout audit runs in both
languages and both themes. The clock of the page is fixed, so dates are exact.
Prints one line per check and saves e2e-v4-results.json."""
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
    'ru': {'cal_month': 'Октябрь 2026', 'wd': 'Пн', 'sun': 'Вс', 'tabs': ['Сегодня', 'Календарь', 'Задачи', 'Списки'], 'weekday': 'Пятница', 'date': '9 октября',
           'edit': 'Изменить', 'move': 'Перенести…', 'dup': 'Дублировать', 'wait': 'Ожидаю от других', 'del': 'Удалить', 'toEvent': 'Сделать событием', 'toTask': 'Сделать задачей',
           'add': 'Добавить', 'buy': 'Купить', 'home': 'Дом', 'out': 'Закончилось', 'low': 'Заканчивается', 'have': 'Есть', 'tails': 'Хвосты', 'prepAdd': 'Добавить подготовку', 'prep': 'Подготовка',
           'rename': 'Переименовать', 'cats': 'Категории', 'saveTpl': 'Сохранить как шаблон', 'blank': 'Пустой список', 'tplManage': 'Шаблоны…'},
    'en': {'cal_month': 'October 2026', 'wd': 'Mon', 'sun': 'Sun', 'tabs': ['Today', 'Calendar', 'Tasks', 'Lists'], 'weekday': 'Friday', 'date': 'October 9',
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
            self.row(title).locator('.more').click(); self.wait_sheet()
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

    def many_tasks(n=30):
        return [task(f'm{i}', f'Дело номер {i}', 'day', '2026-10-09') for i in range(n)]

    BASE_DOC = lambda: doc4(tasks=[task('t1', 'Позвонить маме', 'day', '2026-10-09'), task('t2', 'Купить хлеб', 'day', '2026-10-09'), task('t3', 'Старое дело', 'day', '2026-10-05'),
                                   task('t4', 'Без даты дело'), task('t5', 'Недельное дело', 'week', '2026-10-05')],
                            events=[event('e1', 'Врач', '2026-10-09T15:00')])

    # =============================================================== shell: header, bottom tabs, «+», menu
    @flow('ru', 'en')
    def shell_flow(lang):
        L = f'[{lang}] '; S = STR[lang]
        s = Session(lang, data=BASE_DOC()); pg = s.pg
        navs = pg.locator('nav#nav button')
        check(L + 'Нижняя панель: ровно 4 вкладки с подписями', navs.count() == 4 and [x.strip() for x in navs.all_inner_texts()] == S['tabs'], str(navs.all_inner_texts()))
        check(L + 'Нижняя панель: у каждой вкладки есть значок', all(navs.nth(i).locator('svg').count() == 1 for i in range(4)))
        check(L + 'Нижняя панель: вкладок «Прогресс» и «Данные» нет', pg.locator('nav#nav [data-tab="projects"], nav#nav [data-tab="data"]').count() == 0)
        nb = pg.locator('nav#nav').bounding_box()
        check(L + 'Нижняя панель: прижата к низу экрана и компактна (≤ 70px)', abs(nb['y'] + nb['height'] - 844) < 1.5 and nb['height'] <= 70, str(nb))
        check(L + 'Верхних больших кнопок навигации нет', pg.locator('header button:not(#more-btn):not(#back-btn)').count() == 0)
        check(L + 'Сегодня: слева сверху день недели и плановая дата', pg.inner_text('#app-title') == S['weekday'] and pg.inner_text('#subtitle') == S['date'], pg.inner_text('#top'))
        check(L + 'Сегодня: справа сверху маленькая кнопка «···»', pg.locator('#more-btn').is_visible() and pg.locator('#more-btn svg').count() == 1)
        # order on Today: checklist, tails, waiting
        order = pg.evaluate("""() => { const q = s => document.querySelector(s); const pos = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
          const list = q('#today-list'), tails = q('[data-fold="tails"]'), wait = q('#waiting-section'); return [pos(list, tails), pos(tails, wait), !!list && !!tails && !!wait]; }""")
        check(L + 'Сегодня: сначала список дел, ниже «Хвосты», в самом низу «Ожидаю от других»', order == [True, True, True], str(order))
        body = pg.inner_text('main')
        check(L + 'Сегодня: нет постоянных форм, полей и выпадающих списков', pg.locator('main textarea, main select, main input[type=text], main input:not([type=checkbox])').count() == 0)
        check(L + 'Сегодня: нет слов «Быстро добавить» и подсказок', 'Быстро добавить' not in body and 'Quick add' not in body)
        check(L + 'Сегодня: «Хвосты» свёрнуты, внутри строк не видно', pg.locator('[data-fold="tails"] .foldbody').is_hidden() and pg.locator('[data-fold="tails"] .count').inner_text() == '1')
        pg.click('[data-fold="tails"] .foldhead')
        check(L + 'Хвосты разворачиваются и сворачиваются', pg.locator('[data-fold="tails"] .foldbody').is_visible() and 'Старое дело' in pg.inner_text('[data-fold="tails"]'))
        pg.click('[data-fold="tails"] .foldhead')
        check(L + 'Хвосты сворачиваются обратно', pg.locator('[data-fold="tails"] .foldbody').is_hidden())
        # evening link is compact
        link = pg.locator('.linkrow[data-action="evening.open"]')
        check(L + 'Вечерний обзор: компактная ссылка ниже списка (не заголовок и не карточка)', link.count() == 1 and link.bounding_box()['height'] < 60 and pg.locator('main > section.card').count() == 0)
        # menu
        pg.click('#more-btn'); s.wait_sheet()
        acts = pg.locator('#sheet-root [data-action]').evaluate_all('els => els.map(e => e.dataset.action + ":" + (e.dataset.tab || e.dataset.mode || ""))')
        for need in ['go:settings', 'go:data', 'go:about', 'go:evening', 'day.finish:', 'language.set:ru', 'language.set:en', 'appearance.set:light', 'appearance.set:dark', 'appearance.set:system']:
            check(L + f'Меню «···»: есть {need}', need in acts, str(acts))
        check(L + 'Меню «···»: вкладки «Прогресс» нет, пока нет проектов', 'go:projects' not in acts)
        pg.keyboard.press('Escape')
        check(L + 'Меню закрывается клавишей Escape', s.no_sheet())
        pg.click('#more-btn'); s.wait_sheet()
        pg.mouse.click(195, 60)
        check(L + 'Меню закрывается нажатием на затемнение', s.no_sheet())
        # tabs
        for i, name in enumerate(S['tabs']):
            s.tab(['today', 'calendar', 'tasks', 'lists'][i])
            check(L + f'Вкладка «{name}»: открывается, подсвечена', pg.locator('nav#nav button.active').inner_text().strip() == name and pg.locator('nav#nav button[aria-current="page"]').count() == 1)
        s.tab('today')
        # FAB geometry
        fb = pg.locator('#fab').bounding_box(); nb = pg.locator('nav#nav').bounding_box()
        check(L + '«＋»: справа внизу, над нижней панелью', fb['y'] + fb['height'] <= nb['y'] - 8 and fb['x'] + fb['width'] >= 390 - 24 and fb['width'] >= 44, f'{fb} {nb}')
        check(L + 'Нет горизонтальной прокрутки', pg.evaluate('document.documentElement.scrollWidth') <= 390)
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    @flow('ru', 'en')
    def scroll_flow(lang):
        L = f'[{lang}] '
        s = Session(lang, data=doc4(tasks=many_tasks(40))); pg = s.pg
        fb0 = pg.locator('#fab').bounding_box(); nb0 = pg.locator('nav#nav').bounding_box()
        pg.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        pg.wait_for_timeout(100)
        fb1 = pg.locator('#fab').bounding_box(); nb1 = pg.locator('nav#nav').bounding_box()
        check(L + 'Длинная прокрутка: «＋» и панель остаются на месте', abs(fb0['y'] - fb1['y']) < 1 and abs(nb0['y'] - nb1['y']) < 1 and pg.evaluate('window.scrollY') > 500, f'{fb0} {fb1}')
        last = pg.locator('#waiting-section').bounding_box()
        check(L + 'Длинная прокрутка: низ контента не закрыт «＋» и панелью', last['y'] + last['height'] <= nb1['y'] and last['y'] + last['height'] <= fb1['y'] + 4, f'{last} {fb1}')
        pg.click('#fab'); s.wait_sheet()
        check(L + 'Лист открывается посреди прокрутки; страница под ним не прокручивается', pg.evaluate("getComputedStyle(document.body).overflow") == 'hidden')
        pg.keyboard.press('Escape')
        check(L + 'После закрытия листа прокрутка на месте', pg.evaluate('window.scrollY') > 500)
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== fast entry
    @flow('ru', 'en')
    def quick_flow(lang):
        L = f'[{lang}] '
        s = Session(lang); pg = s.pg
        s.fab()
        foc = pg.evaluate("document.activeElement && document.activeElement.tagName + ':' + document.activeElement.name")
        check(L + '«＋» открывает компактное поле, курсор уже в нём', foc == 'TEXTAREA:text', foc)
        check(L + 'Лист ввода: нет выбора даты и лишних полей', pg.locator('#sheet-root select, #sheet-root input').count() == 0 and pg.locator('#sheet-root textarea').count() == 1)
        check(L + 'Лист ввода: показано, на какой день пойдут дела', ('9 окт' in pg.inner_text('#sheet-root') if lang == 'ru' else '9 Oct' in pg.inner_text('#sheet-root')), pg.inner_text('#sheet-root'))
        text = ('купить молоко завтра\nсдать отчёт до пятницы\n\n   просто дело  \n' if lang == 'ru' else 'buy milk tomorrow\nsubmit report by friday\n\n   plain thing  \n')
        pg.fill('#sheet-root textarea', text)
        pg.click('#sheet-root button[type=submit]')
        d = s.doc(); by = {t['title']: t for t in d['tasks']}; titles = list(by)
        check(L + 'Одно «Добавить» сохраняет все строки: 3 строки → 3 задачи, пустые игнорируются', len(d['tasks']) == 3, str(titles))
        check(L + 'Порядок строк сохранён', titles == (['купить молоко', 'сдать отчёт', 'просто дело'] if lang == 'ru' else ['buy milk', 'submit report', 'plain thing']), str(titles))
        milk = by.get('купить молоко') or by.get('buy milk'); rep = by.get('сдать отчёт') or by.get('submit report'); plain = by.get('просто дело') or by.get('plain thing')
        check(L + '«завтра» → день 2026-10-10', milk['plan'] == {'kind': 'day', 'date': '2026-10-10'}, str(milk['plan']))
        check(L + '«до пятницы» → дедлайн 2026-10-16, плановый день — сегодня', rep['deadline'] == '2026-10-16' and rep['plan'] == {'kind': 'day', 'date': '2026-10-09'}, str(rep))
        check(L + 'Без даты в тексте → плановый день (сегодня), а не «Без даты»', plain['plan'] == {'kind': 'day', 'date': '2026-10-09'} and plain['deadline'] is None, str(plain))
        check(L + 'После добавления лист закрыт, задачи видны на «Сегодня»', s.no_sheet() and 'просто дело' in s.text() + ' plain thing' or 'plain thing' in s.text())
        check(L + 'Сообщение о добавлении показано (и само исчезает)', pg.locator('.banner.info').count() >= 1)
        pg.wait_for_timeout(5600)
        check(L + 'Короткое сообщение исчезло само', pg.locator('.banner.info').count() == 0)
        # one line
        s.quick('одна строка' if lang == 'ru' else 'one line')
        check(L + 'Одна строка → одна задача на сегодня', len(s.tasks('одна строка' if lang == 'ru' else 'one line')) == 1 and s.tasks('одна строка' if lang == 'ru' else 'one line')[0]['plan']['date'] == '2026-10-09')
        # empty submit does nothing
        n = len(s.doc()['tasks'])
        s.fab(); pg.fill('#sheet-root textarea', '  \n \n'); pg.click('#sheet-root button[type=submit]')
        check(L + 'Пустой ввод ничего не добавляет', len(s.doc()['tasks']) == n)
        # draft survives closing
        pg.fill('#sheet-root textarea', 'черновик')
        s.close_sheet(); s.fab()
        check(L + 'Недописанный текст не теряется при закрытии листа', pg.input_value('#sheet-root textarea') == 'черновик')
        pg.keyboard.press('Escape')
        # ask for time
        s.quick('встреча завтра в 15:30\nвторая строка' if lang == 'ru' else 'meeting tomorrow at 3:30pm\nsecond line')
        check(L + 'Время в строке → вопрос «задача или событие»', pg.locator('[data-action="quick.asEvent"]').count() == 1 and pg.locator('[data-action="quick.asTask"]').count() == 1)
        check(L + 'Вопрос: текст не потерян', 'втор' in pg.input_value('#sheet-root textarea') or 'second' in pg.input_value('#sheet-root textarea'))
        n_t = len(s.doc()['tasks'])
        pg.click('[data-action="quick.asEvent"]')
        d = s.doc()
        check(L + 'Ответ «Событие»: событие на завтра 15:30', len(d['events']) == 1 and d['events'][0]['start'] == '2026-10-10T15:30', str(d['events']))
        check(L + 'Остальные строки добавлены после ответа, лист закрыт', len(d['tasks']) == n_t + 1 and s.no_sheet())
        s.quick('позвонить в 9:00' if lang == 'ru' else 'call at 9:00')
        pg.click('[data-action="quick.asTask"]')
        t9 = [t for t in s.tasks() if t['time'] == '09:00']
        check(L + 'Ответ «Задача»: задача со временем на сегодня', len(t9) == 1 and t9[0]['plan'] == {'kind': 'day', 'date': '2026-10-09'}, str(t9))
        # no lost / duplicated lines when the text is edited while the question is open
        ev0, tk0 = len(s.events()), len(s.tasks())
        dinner = 'ужин в 19:00\nпервая обычная' if lang == 'ru' else 'dinner at 7pm\nfirst plain'
        s.quick(dinner)
        check(L + 'Правка текста: вопрос появился', pg.locator('[data-action="quick.asEvent"]').count() == 1)
        pg.fill('#sheet-root textarea', ('сначала новая\n' if lang == 'ru' else 'brand new first\n') + dinner)
        check(L + 'Правка текста: вопрос снят, ничего не добавлено и не стёрто', pg.locator('[data-action="quick.asEvent"]').count() == 0 and len(s.events()) == ev0 and len(s.tasks()) == tk0)
        pg.click('#sheet-root button[type=submit]'); pg.click('[data-action="quick.asEvent"]')
        titles = [t['title'] for t in s.tasks()]
        check(L + 'Все три строки обработаны: ни одна не потеряна и не задвоена', len(s.events()) == ev0 + 1 and len(s.tasks()) == tk0 + 2 and sum(('нов' in x or 'brand' in x) for x in titles) == 1 and sum(('первая' in x or 'first plain' in x) for x in titles) == 1, str(titles))
        s.quick('ужин в 19:00'); pg.click('[data-action="quick.askCancel"]')
        check(L + 'Отмена вопроса: ничего не добавлено, текст остался', pg.input_value('#sheet-root textarea') == 'ужин в 19:00' and not [t for t in s.tasks() if 'ужин' in t['title']])
        pg.click('#sheet-root button[type=submit]'); pg.click('[data-action="quick.asText"]')
        check(L + '«Только название»: строка добавлена как есть', [t for t in s.tasks() if t['title'] == 'ужин в 19:00'] != [] and s.no_sheet())
        # typing survives a background redraw
        s.fab(); pg.fill('#sheet-root textarea', 'недопи')
        pg.evaluate("window.dispatchEvent(new StorageEvent('storage', { key: 'organizer:appearance' }))")
        st = pg.evaluate("(() => { const el = document.activeElement; return { n: el && el.name, v: el && el.value }; })()")
        check(L + 'Фоновая перерисовка не сбивает ввод', st == {'n': 'text', 'v': 'недопи'}, str(st))
        pg.keyboard.type('сано'); pg.click('#sheet-root button[type=submit]')
        check(L + 'После фоновой перерисовки ввод продолжается и сохраняется целиком', len(s.tasks('недописано')) == 1, str([t['title'] for t in s.tasks()][-3:]))
        # HTML is text
        s.quick('<img src=x onerror="alert(1)">')
        check(L + 'Название с HTML показывается как текст', pg.locator('main img').count() == 0 and '<img src=x' in s.text() and not any(m == '1' for m in s.dialogs))
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    @flow()
    def quick_planday_flow():
        d = doc4(cutoff='04:00', tasks=[task('p1', 'На пятницу', 'day', '2026-10-09')])
        s = Session('ru', data=d, when='2026-10-10T01:30:00+03:00'); pg = s.pg
        check('[ru] Плановый день: в 01:30 субботы заголовок — «Пятница», рядом пометка даты по календарю', pg.inner_text('#app-title') == 'Пятница' and '9 октября' in pg.inner_text('#subtitle') and 'Вс, 11' not in pg.inner_text('#subtitle') and 'сб, 10 окт' in pg.inner_text('#subtitle'), pg.inner_text('#top'))
        s.quick('ночная мысль')
        t = s.tasks('ночная мысль')[0]
        check('[ru] Задача, созданная ночью с «Сегодня», получает плановый день (пятница), а не календарный', t['plan'] == {'kind': 'day', 'date': '2026-10-09'}, str(t['plan']))
        s.tab('calendar')
        pg.click('.cal-grid button[data-date="2026-10-10"]')
        s.quick('на субботу')
        t = s.tasks('на субботу')[0]
        check('[ru] Из календаря: выбранная настоящая дата (суббота), а не плановый день', t['plan'] == {'kind': 'day', 'date': '2026-10-10'}, str(t['plan']))
        s.quick('позвонить маме 11 октября')
        t = [x for x in s.tasks() if x['plan'].get('date') == '2026-10-11']
        check('[ru] Явная дата в тексте важнее выбранной в календаре', len(t) == 1, str([(x['title'], x['plan']) for x in s.tasks()][-3:]))
        check('[ru] Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()
    # =============================================================== tasks
    @flow('ru', 'en')
    def tasks_flow(lang):
        L = f'[{lang}] '; S = STR[lang]
        d = doc4(tasks=[task('t1', 'Позвонить маме', 'day', '2026-10-09', deadline='2026-10-20'), task('t2', 'Купить хлеб', 'day', '2026-10-10', time='09:30'),
                        task('t4', 'Без даты дело'), task('t5', 'Недельное дело', 'week', '2026-10-05')],
                 series=[], events=[])
        s = Session(lang, data=d); pg = s.pg
        s.tab('tasks')
        heads = pg.locator('#main h2').all_inner_texts()
        check(L + 'Задачи: три группы (по дням / по неделям / без даты)', len(heads) >= 3, str(heads))
        r = s.row('Позвонить маме')
        check(L + 'Строка: чекбокс, название, ровно одна «···»', r.locator('input[type=checkbox]').count() == 1 and r.locator('.more').count() == 1 and r.locator('button:not(.more)').count() == 0)
        check(L + 'Строка: мелкая дата/срок под названием', 'до' in r.locator('.meta').inner_text() or '20' in r.locator('.meta').inner_text(), r.locator('.meta').inner_text())
        check(L + 'Строка: время видно у задачи со временем', '09:30' in s.row('Купить хлеб').inner_text())
        check(L + 'Нет постоянных кнопок и форм в группах (кроме «···» и чекбоксов)', pg.locator('#main .group button:not(.more)').count() == 0 and pg.locator('#main .group input:not([type=checkbox])').count() == 0)
        # recurring at the bottom, folded
        last = pg.evaluate("() => { const f = document.querySelector('[data-fold=recurring]'); return !!f && !f.nextElementSibling && f.querySelector('.foldbody').hidden; }")
        check(L + 'Повторяющиеся: в самом низу и свёрнуты', last)
        pg.click('[data-fold=recurring] .foldhead')
        check(L + 'Повторяющиеся: формы создания на экране нет (только строка «Добавить повтор»), постоянной инструкции нет', pg.locator('[data-fold=recurring] form, [data-fold=recurring] details').count() == 0 and pg.locator('[data-fold=recurring] [data-action="series.new"]').count() == 1)
        pg.click('[data-fold=recurring] .foldhead')
        # menu content
        s.more('Позвонить маме')
        labels = [x.strip() for x in pg.locator('#sheet-root .menuitem').all_inner_texts()]
        for k in ['edit', 'move', 'dup', 'wait', 'del']:
            check(L + f'Меню «···»: есть «{S[k]}»', any(S[k].rstrip('…') in x for x in labels), str(labels))
        s.close_sheet()
        # tap on title opens edit
        s.open_title('Позвонить маме')
        check(L + 'Нажатие на название открывает правку', pg.locator('#sheet-root form[data-form="task.edit"]').count() == 1)
        pg.fill('#sheet-root input[name=title]', 'Позвонить бабушке'); pg.click('#sheet-root button[type=submit]')
        check(L + 'Правка сохраняется, дедлайн цел', [x['deadline'] for x in s.tasks('Позвонить бабушке')] == ['2026-10-20'] and s.no_sheet())
        # long press opens the menu
        box = s.row('Купить хлеб').locator('.ttext').bounding_box()
        pg.mouse.move(box['x'] + 20, box['y'] + 10); pg.mouse.down(); pg.wait_for_timeout(700); pg.mouse.up(); pg.wait_for_timeout(100); s.tick(1000)
        check(L + 'Долгое нажатие открывает то же меню (не единственный путь)', pg.locator('#sheet-root .menuitem').count() >= 5)
        s.close_sheet(); pg.wait_for_timeout(300)
        check(L + 'Долгое нажатие: после закрытия меню лист не открывается заново', s.no_sheet(), pg.evaluate("document.querySelector('#sheet-root').innerHTML.slice(0,300)"))
        # reschedule: today / week / none / custom — deadline stays
        s.menu_item('Позвонить бабушке', S['move'].rstrip('…')); s.wait_sheet()
        pg.click('#sheet-root [data-action="task.move"][data-kind="none"]')
        t1 = s.tasks('Позвонить бабушке')[0]
        check(L + 'Перенос «без даты»: план снят, дедлайн не тронут', t1['plan']['kind'] == 'none' and t1['deadline'] == '2026-10-20', str(t1['plan']))
        s.menu_item('Позвонить бабушке', S['move'].rstrip('…')); s.wait_sheet()
        pg.click('#sheet-root [data-action="task.move"][data-kind="day"]')
        t1 = s.tasks('Позвонить бабушке')[0]
        check(L + 'Перенос «сегодня»: плановый день, дедлайн цел', t1['plan'] == {'kind': 'day', 'date': '2026-10-09'} and t1['deadline'] == '2026-10-20', str(t1['plan']))
        s.menu_item('Позвонить бабушке', S['move'].rstrip('…')); s.wait_sheet()
        pg.click('#sheet-root [data-action="task.move"][data-kind="week"]')
        check(L + 'Перенос «на неделю»', s.tasks('Позвонить бабушке')[0]['plan']['kind'] == 'week')
        s.menu_item('Позвонить бабушке', S['move'].rstrip('…')); s.wait_sheet()
        pg.fill('#sheet-root input[name=date]', '2026-10-15'); pg.click('#sheet-root form[data-form="task.moveDate"] button')
        t1 = s.tasks('Позвонить бабушке')[0]
        check(L + 'Перенос на свою дату', t1['plan'] == {'kind': 'day', 'date': '2026-10-15'} and t1['deadline'] == '2026-10-20', str(t1['plan']))
        # duplicate
        n0 = len(s.tasks())
        s.menu_item('Позвонить бабушке', S['dup'])
        check(L + 'Дублировать: ровно одна копия', len(s.tasks()) == n0 + 1 and len(s.tasks('Позвонить бабушке')) == 2 and s.no_sheet())
        # waiting
        s.menu_item('Без даты дело', S['wait'])
        d2 = s.doc()
        check(L + 'В «Ожидаю от других»: задача снята, запись создана', not s.tasks('Без даты дело') and any(w['title'] == 'Без даты дело' and not w.get('deletedAt') for w in d2['waiting']), str(d2['waiting']))
        # delete + restore from the notice or data
        s.menu_item('Недельное дело', S['del'])
        d3 = s.doc()
        check(L + 'Удаление мягкое: запись осталась с меткой deletedAt', any(x['title'] == 'Недельное дело' and x['deletedAt'] for x in d3['tasks']))
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== indent
    @flow('ru')
    def indent_flow(lang):
        L = f'[{lang}] '
        d = doc4(tasks=[task('a', 'Раз', 'day', '2026-10-09'), task('b', 'Два', 'day', '2026-10-09'), task('c', 'Три', 'day', '2026-10-09'), task('o', 'Вчера', 'day', '2026-10-08')])
        s = Session(lang, data=d); pg = s.pg
        def swipe(title, dx, dy=0, steps=8):
            b = s.row(title).locator('.ttext').bounding_box()
            x, y = b['x'] + 40, b['y'] + b['height'] / 2
            pg.mouse.move(x, y); pg.mouse.down()
            for i in range(1, steps + 1): pg.mouse.move(x + dx * i / steps, y + dy * i / steps)
            pg.mouse.up(); pg.wait_for_timeout(60); s.tick(1000)
        ind = lambda i: next(t for t in s.doc()['tasks'] if t['id'] == i).get('indent')
        swipe('Два', 90)
        check(L + 'Свайп вправо: задача с отступом, сохранено', ind('b') is True and pg.locator('.trow.indent', has_text='Два').count() == 1)
        check(L + 'Свайп вправо: после него лист/меню не открылись', s.no_sheet())
        swipe('Три', 90); swipe('Раз', 90)
        check(L + 'Несколько задач с отступом одновременно', all(ind(i) is True for i in 'abc'))
        check(L + 'Отступ один уровень: повторный свайп не углубляет', (swipe('Два', 90), ind('b'))[1] is True and pg.locator('.trow.indent').count() == 3)
        check(L + 'Нет ручек и значков перетаскивания', pg.locator('.handle, [draggable=true], [data-drag]').count() == 0)
        s.reload()
        check(L + 'Отступ сохраняется после перезапуска', pg.locator('.trow.indent').count() == 3)
        swipe('Два', -90)
        check(L + 'Свайп влево снимает отступ', ind('b') in (None, False) and ind('a') is True)
        swipe('Раз', 20)
        check(L + 'Маленький жест отступ не меняет', ind('a') is True)  # already indented: still true
        swipe('Два', 15)
        check(L + 'Маленький жест не создаёт отступ', ind('b') in (None, False))
        swipe('Два', 30, 90)
        check(L + 'Вертикальный жест (прокрутка) отступ не создаёт', ind('b') in (None, False))
        s.row('Два').locator('input[type=checkbox]').click()
        check(L + 'Чекбокс по-прежнему работает рядом со свайпом', next(t for t in s.doc()['tasks'] if t['id'] == 'b')['done'] is True)
        s.more('Три'); check(L + '«···» по-прежнему открывает меню', pg.locator('#sheet-root .menuitem').count() >= 5); s.close_sheet()
        # a day change turns the indented unfinished task into a tail -> cleared
        s.at('2026-10-10T12:00:00+03:00'); pg.wait_for_timeout(300)
        s.reload()
        check(L + 'Невыполненная задача с отступом, ставшая хвостом, сбрасывает отступ', ind('a') in (None, False) and ind('c') in (None, False), str((ind('a'), ind('c'))))
        # moved to another date -> cleared
        s.close()

    # =============================================================== lists
    LISTS_DOC = lambda: doc4(lists=[
        {"id": "l1", "name": "Поездка", "categories": ["Одежда", "Документы"], "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None, "items": [
            {"id": "i1", "title": "Паспорт", "done": True, "category": "Документы", "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None},
            {"id": "i2", "title": "Куртка", "done": False, "category": "Одежда", "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}]},
        {"id": "l2", "name": "Купить", "categories": [], "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None, "items": [
            {"id": "i3", "title": "Мой пункт", "done": False, "category": None, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}]},
        {"id": "h1", "name": "Дом", "kind": "home", "categories": [], "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None, "items": [
            {"id": "h_a", "title": "Мыло", "done": False, "stock": "out", "category": None, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None},
            {"id": "h_b", "title": "Соль", "done": False, "stock": "low", "category": None, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None},
            {"id": "h_c", "title": "Чай", "done": False, "stock": "have", "category": None, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}]},
    ])

    @flow('ru', 'en')
    def lists_flow(lang):
        L = f'[{lang}] '; S = STR[lang]
        s = Session(lang, data=LISTS_DOC()); pg = s.pg
        s.tab('lists')
        rows = pg.locator('#main .indexrow')
        texts = [x.strip().replace('\n', ' ') for x in rows.all_inner_texts()]
        check(L + 'Индекс: «Купить», «Дом», затем обычные списки с числом', len(texts) >= 4 and S['buy'] in texts[0] and S['home'] in texts[1], str(texts))
        check(L + 'Индекс: свой список «Купить» отдельно от созданного «Купить»', sum(1 for x in texts if x.startswith('Купить') or x.startswith('Buy')) >= 2, str(texts))
        pg.locator('#main .indexrow', has_text='Поездка').click()
        check(L + 'Список открывается своим экраном с кнопкой «назад»', pg.locator('#back-btn').is_visible() and pg.inner_text('#app-title') == 'Поездка')
        heads = pg.locator('#main .foldhead').all_inner_texts()
        check(L + 'Категории — сворачиваемые заголовки', len(heads) == 2 and pg.locator('#main .foldbody:visible').count() == 2, str(heads))
        pg.locator('#main .foldhead', has_text='Документы').click()
        check(L + 'Категория сворачивается', pg.locator('#main .foldbody:visible').count() == 1)
        pg.locator('#main .foldhead', has_text='Документы').click()
        # check
        pg.locator('#main .row', has_text='Куртка').locator('input[type=checkbox]').click()
        l1 = next(l for l in s.doc()['lists'] if l['id'] == 'l1')
        check(L + 'Отметка пункта сохраняется', next(i for i in l1['items'] if i['id'] == 'i2')['done'] is True)
        # item edit by tap
        pg.locator('#main .row', has_text='Куртка').locator('.ttext').click(); s.wait_sheet()
        pg.fill('#sheet-root input[name=title]', 'Тёплая куртка'); pg.click('#sheet-root button[type=submit]')
        check(L + 'Нажатие на пункт открывает правку; название сохранено', 'Тёплая куртка' in pg.inner_text('#main') and s.no_sheet())
        # contextual +
        s.fab(); pg.fill('#sheet-root textarea[name=text]', 'Шарф\nПерчатки'); pg.click('#sheet-root form button[type=submit]')
        l1 = next(l for l in s.doc()['lists'] if l['id'] == 'l1')
        check(L + '«＋» внутри списка добавляет сразу несколько пунктов', {'Шарф', 'Перчатки'} <= {i['title'] for i in l1['items'] if not i['deletedAt']})
        # management in ···
        pg.click('#more-btn'); s.wait_sheet()
        labs = [x.strip() for x in pg.locator('#sheet-root .menuitem').all_inner_texts()]
        check(L + 'Меню «···» списка: переименовать, категории, шаблон, удалить', len(labs) == 4, str(labs))
        pg.click('#sheet-root [data-action="sheet.rename"]'); s.wait_sheet()
        pg.fill('#sheet-root input[name=name]', 'Отпуск'); pg.click('#sheet-root button[type=submit]')
        check(L + 'Переименование', next(l for l in s.doc()['lists'] if l['id'] == 'l1')['name'] == 'Отпуск')
        pg.click('#more-btn'); s.wait_sheet(); pg.click('#sheet-root [data-action="list.saveTemplate"]')
        d = s.doc()
        check(L + 'Сохранить как шаблон: шаблон создан, список цел', any(t['name'] == 'Отпуск' for t in d['templates']) and any(l['id'] == 'l1' and not l['deletedAt'] for l in d['lists']), str([t['name'] for t in d['templates']]))
        pg.click('#more-btn'); s.wait_sheet(); pg.click('#sheet-root [data-action="sheet.cats"]'); s.wait_sheet()
        pg.fill('#sheet-root form[data-form="cat.add"] input[name=name]', 'Обувь'); pg.click('#sheet-root form[data-form="cat.add"] button')
        check(L + 'Новая категория', 'Обувь' in next(l for l in s.doc()['lists'] if l['id'] == 'l1')['categories'])
        s.close_sheet()
        s.back()
        check(L + 'Назад возвращает в индекс', pg.locator('#main .indexrow').count() >= 4)
        # new-list sheet
        s.fab()
        check(L + 'Новый список: пустой / из шаблона / шаблоны', pg.locator('#sheet-root form[data-form="list.add"]').count() == 1 and pg.locator('#sheet-root [data-action="tpl.use"]').count() >= 3 and pg.locator('#sheet-root [data-action="tpl.manage"]').count() == 1)
        before = json.dumps(s.doc()['templates'], sort_keys=True)
        pg.locator('#sheet-root [data-action="tpl.use"]').first.click()
        d = s.doc()
        check(L + 'Из шаблона: создан новый список, шаблоны не изменены', len([l for l in d['lists'] if not l['deletedAt']]) >= 4 and json.dumps(d['templates'], sort_keys=True) == before)
        s.back()
        s.fab(); pg.fill('#sheet-root input[name=name]', 'Пустой'); pg.click('#sheet-root form[data-form="list.add"] button')
        check(L + 'Пустой список создаётся', any(l['name'] == 'Пустой' for l in s.doc()['lists']))
        s.back(); s.fab(); pg.click('#sheet-root [data-action="tpl.manage"]')
        check(L + 'Управление шаблонами: открывается экран шаблонов', pg.locator('#main [data-action="tpl.edit"]').count() >= 2, pg.inner_text('#app-title'))
        names = pg.inner_text('#main')
        check(L + 'Встроенные шаблоны «Супермаркет» и «Чемодан» на месте', ('Супермаркет' in names and 'Чемодан' in names) or ('Supermarket' in names and 'Suitcase' in names), names[:200])
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    @flow('ru', 'en')
    def home_flow(lang):
        L = f'[{lang}] '; S = STR[lang]
        s = Session(lang, data=LISTS_DOC()); pg = s.pg
        s.tab('lists')
        pg.locator('#main .indexrow').nth(1).click()
        txt = pg.inner_text('#main')
        check(L + 'Дом: три состояния', all(S[k] in txt for k in ['have', 'low', 'out']), txt[:200])
        pg.locator('#main .row', has_text='Чай').locator('.ttext').click(); s.wait_sheet()
        check(L + 'Состояние: ровно три кнопки', pg.locator('#sheet-root .stockbtn').count() == 3)
        pg.locator('#sheet-root .stockbtn').nth(2).click()
        h = next(l for l in s.doc()['lists'] if l['id'] == 'h1')
        check(L + 'Смена состояния сохраняется', next(i for i in h['items'] if i['id'] == 'h_c')['stock'] == 'out', str(h['items']))
        s.back()
        pg.locator('#main .indexrow').nth(0).click()
        buy = pg.inner_text('#main')
        check(L + 'Купить: только «закончилось» (Мыло, Чай), нет «Соль»', 'Мыло' in buy and 'Чай' in buy and 'Соль' not in buy, buy[:200])
        check(L + 'Купить: пункты своего списка «Купить» не подмешаны', 'Мой пункт' not in buy)
        n_items = len(next(l for l in s.doc()['lists'] if l['id'] == 'h1')['items'])
        pg.locator('#main .row', has_text='Мыло').locator('input[type=checkbox]').click()
        h = next(l for l in s.doc()['lists'] if l['id'] == 'h1')
        check(L + 'Отметка в «Купить» возвращает «Есть»: без удаления и дублей', next(i for i in h['items'] if i['id'] == 'h_a')['stock'] == 'have' and len(h['items']) == n_items and not any(i['deletedAt'] for i in h['items']))
        check(L + 'Купленное исчезло из «Купить»', 'Мыло' not in pg.inner_text('#main'))
        s.back(); pg.locator('#main .indexrow', has_text='Мой' if False else 'Купить').last.click() if False else None
        d = s.doc()
        check(L + 'Свой список «Купить» цел и отдельный', any(l['id'] == 'l2' and l['name'] == 'Купить' and len(l['items']) == 1 for l in d['lists']))
        # add to Home via +
        pg.locator('#main .indexrow').nth(1).click(); s.fab()
        pg.fill('#sheet-root textarea[name=text]', 'Сахар\nМука\nсахар'); pg.click('#sheet-root form button[type=submit]')
        h = next(l for l in s.doc()['lists'] if l['id'] == 'h1')
        names = [i['title'].lower() for i in h['items'] if not i['deletedAt']]
        check(L + 'Добавление в «Дом»: сахар не задвоен (повтор без учёта регистра)', names.count('сахар') == 1 and 'мука' in names, str(names))
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()


    # =============================================================== calendar
    @flow('ru', 'en')
    def calendar_flow(lang):
        L = f'[{lang}] '; S = STR[lang]
        d = doc4(tasks=[task('c1', 'План на воскресенье', 'day', '2026-10-11'), task('c2', 'Срочное', 'day', '2026-10-11', deadline='2026-10-20'),
                        task('c3', 'Сделано', 'day', '2026-10-11', done=True, completedAt=NOWISO, doneDay='2026-10-11')],
                 events=[event('e1', 'Врач', '2026-10-11T15:00'), event('e2', 'Концерт', '2026-11-03T20:00')])
        s = Session(lang, data=d); pg = s.pg
        s.tab('calendar')
        check(L + 'Календарь: сетка месяца и заголовок месяца', pg.locator('.cal-grid').count() == 1 and S['cal_month'] in pg.inner_text('.cal-title'))
        pg.click('.cal-grid button[data-date="2026-10-11"]')
        panel = pg.locator('#day-panel')
        check(L + 'День: события и задачи одним компактным списком', panel.locator('.erow').count() == 1 and panel.locator('.trow').count() >= 2)
        check(L + 'День: нет форм, полей, постоянных кнопок дат и карандашей/крестиков', panel.locator('form, input:not([type=checkbox]), select, textarea').count() == 0 and panel.locator('button:not(.more):not(.foldhead)').count() == 0, panel.inner_html()[:100])
        check(L + 'День: у события нет чекбокса выполнения', panel.locator('.erow input[type=checkbox]').count() == 0)
        check(L + 'У каждой строки одна «···»', all(panel.locator('.row').nth(i).locator('.more').count() == 1 for i in range(panel.locator('.row').count())))
        # FAB uses the selected real date
        s.quick('позвонить врачу')
        t = s.tasks('позвонить врачу')[0]
        check(L + '«＋» в календаре: задача на выбранную настоящую дату', t['plan'] == {'kind': 'day', 'date': '2026-10-11'}, str(t['plan']))
        # month / year
        pg.click('[data-action="cal.next"]')
        check(L + 'Месяц: переход вперёд', pg.locator('.cal-title').inner_text() != S['cal_month'])
        pg.click('[data-action="cal.mode"]')
        check(L + 'Год: показаны 12 месяцев', pg.locator('.mini-month').count() == 12)
        pg.locator('.mini-month').nth(10).click()
        pg.locator('.cal-grid button[data-date="2026-11-03"]').click()
        check(L + 'Выбор дня в другом месяце показывает событие', 'Концерт' in pg.inner_text('#day-panel'))
        pg.click('[data-action="cal.today"]'); 
        pg.click('.cal-grid button[data-date="2026-10-11"]')
        # task -> event with deadline loss
        s.menu_item('Срочное', S['toEvent']); s.wait_sheet()
        check(L + 'Задача → событие: показано, что будет потеряно (дедлайн), кнопка подтверждения', pg.locator('#sheet-root .banner.warn').count() == 1)
        pg.fill('#sheet-root input[name=time]', '10:30')
        nt, ne = len(s.tasks()), len(s.events())
        pg.click('#sheet-root form[data-form="convert.go"] button[type=submit]')
        check(L + 'Подтверждено: создано одно событие, задача удалена мягко, без дублей', len(s.events()) == ne + 1 and len(s.tasks()) == nt - 1 and len(s.events('Срочное')) == 1 and s.events('Срочное')[0]['start'] == '2026-10-11T10:30', str(s.events('Срочное')))
        d2 = s.doc()
        check(L + 'Исходная задача осталась в данных с deletedAt (можно вернуть)', any(x['title'] == 'Срочное' and x['deletedAt'] for x in d2['tasks']))
        # plain task -> event keeps notes-free fields; no warning
        s.menu_item('План на воскресенье', S['toEvent']); s.wait_sheet()
        check(L + 'Без потерь: предупреждения нет', pg.locator('#sheet-root .banner.warn').count() == 0)
        pg.fill('#sheet-root input[name=time]', '12:00'); pg.click('#sheet-root form[data-form="convert.go"] button[type=submit]')
        check(L + 'Задача → событие без потерь', len(s.events('План на воскресенье')) == 1)
        # event -> task
        s.menu_item('Врач', S['toTask']); s.wait_sheet()
        pg.click('#sheet-root form[data-form="convert.go"] button[type=submit]')
        tt = s.tasks('Врач')
        check(L + 'Событие → задача: задача на ту же дату со временем, событие убрано', len(tt) == 1 and tt[0]['plan'] == {'kind': 'day', 'date': '2026-10-11'} and tt[0]['time'] == '15:00' and not s.events('Врач'), str(tt))
        # restoring the originals: never two active copies; the user is asked first
        def restore_via_ui(kind_title):
            if pg.locator('#more-btn').is_visible(): s.go('data')
            n = len(s.dialogs)
            pg.locator('#main .row', has_text=kind_title).locator('[data-action="restore"]').first.click()
            pg.wait_for_timeout(120)
            return len(s.dialogs) - n
        asked = restore_via_ui('Врач')
        alive_v = len(s.tasks('Врач')) + len(s.events('Врач'))
        check(L + 'Возврат исходного события: вопрос задан один раз, активна одна запись', asked == 1 and alive_v == 1 and len(s.events('Врач')) == 1, f'{asked} {alive_v}')
        check(L + 'Копия-задача не пропала: лежит в «Удалённых»', any(x['title'] == 'Врач' and x['deletedAt'] for x in s.doc()['tasks']))
        asked = restore_via_ui('Срочное')
        check(L + 'Возврат исходной задачи: вопрос задан, событие-копия убрано в «Удалённые», активна одна запись', asked == 1 and len(s.tasks('Срочное')) == 1 and not s.events('Срочное') and any(x['title'] == 'Срочное' and x['deletedAt'] for x in s.doc()['events']))
        s.reload()
        check(L + 'После перезагрузки то же: дублей нет', len(s.tasks('Срочное')) + len(s.events('Срочное')) == 1 and len(s.tasks('Врач')) + len(s.events('Врач')) == 1)
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== preparation
    @flow('ru', 'en')
    def prep_flow(lang):
        L = f'[{lang}] '; S = STR[lang]
        d = doc4(events=[event('e1', 'Врач', '2026-10-09T15:00'), event('e2', 'Поездка', '2026-10-12T08:00')])
        d['events'][1]['prep'] = [{"id": "p1", "title": "Паспорт", "done": True, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None},
                                  {"id": "p2", "title": "Билеты", "done": False, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}]
        s = Session(lang, data=d); pg = s.pg
        s.open_title('Врач') if pg.locator('#main .row', has_text='Врач').count() else None
        if s.no_sheet():
            s.tab('calendar'); pg.click('.cal-grid button[data-date="2026-10-09"]'); s.open_title('Врач')
        check(L + 'Событие без подготовки: «Добавить подготовку», списка нет', pg.locator('#sheet-root [data-action="prep.create"]').count() == 1 and pg.locator('#sheet-root .prow').count() == 0)
        pg.click('#sheet-root [data-action="prep.create"]')
        check(L + 'Создана пустая подготовка (сворачиваемый блок с формой добавления)', pg.locator('#sheet-root [data-fold=prep]').count() == 1 and isinstance(s.events('Врач')[0].get('prep'), list))
        pg.locator('#sheet-root [data-fold=prep] .foldhead').click() if pg.locator('#sheet-root [data-fold=prep] .foldbody').is_hidden() else None
        pg.fill('#sheet-root form[data-form="prep.add"] input[name=title]', 'Полис'); pg.click('#sheet-root form[data-form="prep.add"] button')
        pg.fill('#sheet-root form[data-form="prep.add"] input[name=title]', 'Анализы'); pg.click('#sheet-root form[data-form="prep.add"] button')
        items = [i['title'] for i in s.events('Врач')[0]['prep'] if not i['deletedAt']]
        check(L + 'Пункты добавляются и сохраняются', items == ['Полис', 'Анализы'], str(items))
        check(L + 'Счётчик «сделано/всего» виден', '0/2' in pg.inner_text('#sheet-root [data-fold=prep] .foldhead'), pg.inner_text('#sheet-root [data-fold=prep] .foldhead'))
        pg.locator('#sheet-root .prow', has_text='Полис').locator('input[type=checkbox]').click()
        check(L + 'Отметка пункта сохраняется, счётчик 1/2', next(i for i in s.events('Врач')[0]['prep'] if i['title'] == 'Полис')['done'] and '1/2' in pg.inner_text('#sheet-root [data-fold=prep] .foldhead'))
        pg.locator('#sheet-root .prow', has_text='Анализы').locator('.ttext').click(); s.wait_sheet()
        pg.fill('#sheet-root input[name=title]', 'Анализы крови'); pg.click('#sheet-root form[data-form="prep.edit"] button[type=submit]')
        check(L + 'Правка пункта сохраняется, возврат в событие', 'Анализы крови' in pg.inner_text('#sheet-root') and pg.locator('#sheet-root [data-fold=prep]').count() == 1)
        pg.locator('#sheet-root .prow', has_text='Анализы крови').locator('.ttext').click(); s.wait_sheet()
        pg.click('#sheet-root [data-action="prep.delete"]')
        live = [i['title'] for i in s.events('Врач')[0]['prep'] if not i['deletedAt']]
        check(L + 'Удаление пункта: остальные на месте, внутри события', live == ['Полис'], str(live))
        s.close_sheet()
        check(L + 'Подготовка не создаёт задач и списков', not s.tasks() and not s.doc()['lists'])
        s.reload()
        s.tab('calendar'); pg.click('.cal-grid button[data-date="2026-10-09"]'); s.open_title('Врач')
        check(L + 'После перезапуска подготовка на месте', 'Полис' in pg.text_content('#sheet-root') and '1/1' in pg.inner_text('#sheet-root [data-fold=prep] .foldhead'))
        s.close_sheet()
        pg.click('.cal-grid button[data-date="2026-10-12"]')
        check(L + 'В строке события виден счётчик подготовки', ('1 из 2' in pg.inner_text('#day-panel') or '1 of 2' in pg.inner_text('#day-panel')), pg.inner_text('#day-panel'))
        # event -> task with prep: confirmation
        s.menu_item('Поездка', S['toTask']); s.wait_sheet()
        check(L + 'Событие с подготовкой → задача: предупреждение о потере', pg.locator('#sheet-root .banner.warn').count() == 1)
        s.close_sheet()
        check(L + 'Отмена: ничего не изменилось', len(s.events('Поездка')) == 1 and not s.tasks('Поездка'))
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== reviews (tails) & evening
    @flow('ru', 'en')
    def review_flow(lang):
        L = f'[{lang}] '; S = STR[lang]
        d = doc4(tasks=[task('r1', 'Вчерашняя', 'day', '2026-10-08', deadline='2026-10-30'), task('r2', 'Давняя', 'day', '2026-10-07'),
                        task('r3', 'Прошлая неделя', 'week', '2026-09-28'), task('r4', 'Сегодняшняя', 'day', '2026-10-09')],
                 evening={"enabled": True, "time": "21:30"})
        s = Session(lang, data=d, when='2026-10-09T09:00:00+03:00'); pg = s.pg
        fold = '[data-fold="tails"]'
        check(L + 'Утро: «Хвосты» свёрнуты со счётчиком 3', pg.locator(fold + ' .count').inner_text() == '3' and pg.locator(fold + ' .foldbody').is_hidden())
        pg.click(fold + ' .foldhead')
        check(L + 'Утро: в хвостах три задачи прошлого, сегодняшней там нет', pg.locator(fold + ' .tailrow').count() == 3 and 'Сегодняшняя' not in pg.inner_text(fold))
        snap = json.dumps(s.doc()['tasks']); pg.wait_for_timeout(300)
        check(L + 'Ничего не перенеслось само', json.dumps(s.doc()['tasks']) == snap)
        row = lambda title: pg.locator(fold + ' .tailrow', has_text=title)
        row('Вчерашняя').locator('[data-choice="today"]').click()
        t = next(x for x in s.doc()['tasks'] if x['id'] == 'r1')
        check(L + 'Утро «Сегодня»: перенос, дедлайн цел, решение запомнено', t['plan']['date'] == '2026-10-09' and t['deadline'] == '2026-10-30' and t['review'] == {'day': '2026-10-09', 'choice': 'moved', 'part': 'am'}, str(t))
        # keep lives in «···»
        s.more('Давняя'); s.item(next(x for x in ['Оставить', 'Keep'] if pg.locator('#sheet-root .menuitem', has_text=x).count()))
        t = next(x for x in s.doc()['tasks'] if x['id'] == 'r2')
        check(L + 'Утро «Оставить» (в «···»): запомнено, дата не тронута', t['review'] and t['review']['choice'] == 'kept' and t['plan']['date'] == '2026-10-07', str(t['review']))
        row('Прошлая неделя').locator('[data-action="tail.pick"]').click(); s.wait_sheet()
        pg.fill('#sheet-root input[name=date]', '2026-10-12'); pg.click('#sheet-root form button[type=submit]')
        t = next(x for x in s.doc()['tasks'] if x['id'] == 'r3')
        check(L + '«Выбрать дату»: перенос на выбранный день', t['plan'] == {'kind': 'day', 'date': '2026-10-12'}, str(t['plan']))
        # evening
        s.at('2026-10-09T21:00:00+03:00')
        pg.click('[data-action="evening.open"]')
        check(L + 'Вечер открывается вручную, есть кнопка «назад»', pg.locator('[data-action="evening.close"]').count() == 1 and pg.locator('#back-btn').is_visible())
        ev = pg.inner_text('main')
        check(L + 'Вечер: сегодняшняя и оставленная задачи в списке', 'Сегодняшняя' in ev and 'Давняя' in ev, ev[:200])
        pg.locator('.tailrow', has_text='Сегодняшняя').locator('[data-choice="tomorrow"]').click()
        t = {x['id']: x for x in s.doc()['tasks']}
        check(L + 'Вечер «На завтра»: 10 октября', t['r4']['plan']['date'] == '2026-10-10')
        s.more('Давняя'); s.item(next(x for x in ['Оставить', 'Keep'] if pg.locator('#sheet-root .menuitem', has_text=x).count()))
        t = {x['id']: x for x in s.doc()['tasks']}
        check(L + 'Вечер «Оставить»: запомнено как вечернее решение', t['r2']['review'] == {'day': '2026-10-09', 'choice': 'kept', 'part': 'pm'}, str(t['r2']['review']))
        pg.click('[data-action="evening.close"]')
        s.at('2026-10-10T08:00:00+03:00'); s.reload()
        pg.click(fold + ' .foldhead')
        check(L + 'Утро следующего дня: вечернее «Оставить» не спрашивают заново (в «уже разобрано»)', pg.locator(fold + ' .sub').count() == 1 or 'Давняя' in pg.inner_text(fold), pg.inner_text(fold)[:200])
        # all to tomorrow
        d2 = s.doc(); d2['tasks'] += [task('r5', 'A', 'day', '2026-10-05'), task('r6', 'B', 'day', '2026-10-06')]
        pg.evaluate("d => localStorage.setItem('organizer:data', JSON.stringify(d))", d2); s.reload()
        pg.click(fold + ' .foldhead'); n = len(s.dialogs)
        pg.click('[data-action="review.all"]')
        tt = {x['id']: x for x in s.doc()['tasks']}
        check(L + '«Всё на завтра» просит подтверждения с числом', len(s.dialogs) == n + 1 and '3' in s.dialogs[-1], str(s.dialogs[-1:]))
        check(L + '«Всё на завтра»: перенесены только показанные в вопросе', tt['r5']['plan']['date'] == '2026-10-11' and tt['r6']['plan']['date'] == '2026-10-11' and tt['r2']['plan']['date'] == '2026-10-07', str({k: tt[k]['plan'] for k in ('r5', 'r6', 'r2')}))
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    @flow('ru', 'en')
    def evening_flow(lang):
        L = f'[{lang}] '
        d = doc4(tasks=[task('e1', 'Сегодня не сделано', 'day', '2026-10-09'), task('e2', 'Завтрашняя', 'day', '2026-10-10', time='09:00', deadline='2026-10-12')],
                 events=[event('ee1', 'Лекция', '2026-10-10T10:00')], evening={"enabled": True, "time": "21:30"})
        s = Session(lang, data=d, when='2026-10-09T20:00:00+03:00'); pg = s.pg
        check(L + 'До выбранного времени вечер сам не открывается', pg.locator('[data-action="evening.close"]').count() == 0)
        s.at('2026-10-09T21:45:00+03:00')
        check(L + 'После выбранного времени вечер открывается сам (при открытом приложении)', pg.locator('[data-action="evening.close"]').count() == 1)
        txt = pg.inner_text('main')
        check(L + 'Вечер: события, задачи и дедлайны завтрашнего дня', 'Лекция' in txt and 'Завтрашняя' in txt and '09:00' in txt)
        check(L + 'Вечер: незавершённое за сегодня', 'Сегодня не сделано' in txt)
        check(L + 'Вечер: показан раз за день (память на устройстве)', s.device().get('lastEveningPreviewShownFor') == '2026-10-10', str(s.device()))
        pg.click('[data-action="evening.close"]')
        s.at('2026-10-09T22:30:00+03:00')
        check(L + 'Второй раз за вечер не открывается', pg.locator('[data-action="evening.close"]').count() == 0)
        s.reload()
        check(L + 'После перезапуска в тот же вечер — тоже нет', pg.locator('[data-action="evening.close"]').count() == 0)
        pg.click('[data-action="evening.open"]')
        pg.fill('form[data-form="evening.add"] input[name=title]', 'Добавлено вечером'); pg.click('form[data-form="evening.add"] button[type=submit]')
        t = s.tasks('Добавлено вечером')
        check(L + 'Вечер: быстрое добавление на завтра', len(t) == 1 and t[0]['plan'] == {'kind': 'day', 'date': '2026-10-10'})
        s.open_title('Добавлено вечером')
        check(L + 'Вечер: задачи завтрашнего дня можно править', pg.locator('form[data-form="task.edit"]').count() == 1)
        s.close_sheet(); pg.click('[data-action="evening.close"]')
        s.go('settings')
        pg.fill('form[data-form="evening.save"] input[name=time]', '20:15'); pg.click('form[data-form="evening.save"] button[type=submit]')
        check(L + 'Настройки: время вечернего обзора сохраняется', s.doc()['settings']['eveningPreview'] == {'enabled': True, 'time': '20:15'}, str(s.doc()['settings']['eveningPreview']))
        pg.uncheck('form[data-form="evening.save"] input[name=enabled]'); pg.click('form[data-form="evening.save"] button[type=submit]')
        check(L + 'Настройки: обзор можно выключить', s.doc()['settings']['eveningPreview']['enabled'] is False)
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    @flow()
    def evening_planday_flow():
        d = doc4(cutoff='04:00', tasks=[task('x1', 'Пятничная', 'day', '2026-10-09')], evening={"enabled": True, "time": "21:30"})
        s = Session('ru', data=d, when='2026-10-10T01:30:00+03:00')
        check('[ru] Вечер по личному дню: в 01:30 субботы (отбой 04:00) обзор открывается', s.pg.locator('[data-action="evening.close"]').count() == 1)
        check('[ru] Вечер по личному дню: речь о пятнице', 'пт' in s.pg.inner_text('main section:first-of-type h2') or '9' in s.pg.inner_text('main section:first-of-type h2'), s.pg.inner_text('main section:first-of-type h2'))
        s.close()

    # =============================================================== waiting
    @flow('ru', 'en')
    def waiting_flow(lang):
        L = f'[{lang}] '
        s = Session(lang); pg = s.pg
        sec = '#waiting-section'
        check(L + 'Ожидание: раздел самый нижний на «Сегодня»', pg.evaluate("() => { const w = document.querySelector('#waiting-section'); return !!w && !w.nextElementSibling; }"))
        def add(title, frm=None, fu=None):
            pg.click(sec + ' [data-action="wait.new"]'); s.wait_sheet()
            pg.fill('#sheet-root input[name=title]', title)
            if frm: pg.fill('#sheet-root input[name=from]', frm)
            if fu: pg.fill('#sheet-root input[name=followUp]', fu)
            pg.click('#sheet-root form button[type=submit]')
        add('Ответ от декана', 'Иванов', '2026-10-09')
        w = s.doc()['waiting']
        check(L + 'Ожидание: добавлено с «от кого» и датой', len(w) == 1 and w[0]['from'] == 'Иванов' and w[0]['followUp'] == '2026-10-09', str(w))
        add('Посылка')
        check(L + 'Ожидание: достаточно названия', len(s.doc()['waiting']) == 2 and s.doc()['waiting'][1]['followUp'] is None)
        check(L + 'Напоминание: карточка наверху, когда срок наступил', pg.locator('main > section.card.review').count() == 1 and 'Ответ от декана' in pg.inner_text('main > section.card.review'))
        check(L + 'Ожидание не превратилось в задачу', len(s.doc()['tasks']) == 0)
        pg.click('main > section.card.review [data-action="wait.again"][data-days="3"]')
        check(L + '«Проверить через 3 дня»: напоминание ушло, дата сдвинута', pg.locator('main > section.card.review').count() == 0 and s.doc()['waiting'][0]['followUp'] == '2026-10-12', str(s.doc()['waiting'][0]))
        s.at('2026-10-13T09:00:00+03:00')
        check(L + 'Через несколько дней напоминание появляется снова', pg.locator('main > section.card.review').count() == 1)
        pg.locator('main > section.card.review [data-action="wait.toTask"]').click()
        d = s.doc()
        check(L + '«Нужно действие»: задача на сегодня, ожидание решено и связано', len(d['tasks']) == 1 and d['tasks'][0]['plan']['date'] == '2026-10-13' and d['waiting'][0]['resolved'] and d['waiting'][0]['taskId'] == d['tasks'][0]['id'], str(d['waiting'][0]))
        s.more('Посылка'); pg.click('#sheet-root [data-action="wait.resolve"]')
        check(L + '«Решено»: скрыто из активных, но сохранено', s.doc()['waiting'][1]['resolved'] is True and pg.locator(sec + ' [data-fold=waitDone]').count() == 1)
        pg.click(sec + ' [data-fold=waitDone] .foldhead')
        s.more('Посылка'); pg.click('#sheet-root [data-action="wait.reopen"]')
        check(L + 'Решённое можно вернуть в ожидание', s.doc()['waiting'][1]['resolved'] is False)
        s.open_title('Посылка')
        pg.fill('#sheet-root form[data-form="waiting.edit"] input[name=note]', 'заметка'); pg.click('#sheet-root form[data-form="waiting.edit"] button[type=submit]')
        check(L + 'Ожидание можно править', next(x for x in s.doc()['waiting'] if x['title'] == 'Посылка')['note'] == 'заметка')
        s.more('Посылка'); pg.click('#sheet-root [data-action="wait.delete"]')
        check(L + 'Удаление ожидания мягкое', next(x for x in s.doc()['waiting'] if x['title'] == 'Посылка').get('deletedAt'))
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== recurring
    @flow('ru', 'en')
    def recurring_flow(lang):
        L = f'[{lang}] '
        s = Session(lang); pg = s.pg
        s.tab('tasks')
        pg.click('[data-fold=recurring] .foldhead')
        pg.click('[data-fold=recurring] [data-action="series.new"]'); s.wait_sheet()
        f = 'form[data-form="series.add"]'
        pg.fill(f + ' input[name=title]', 'Зал')
        pg.fill(f + ' input[name=interval]', '1'); pg.select_option(f + ' select[name=freq]', 'weekly'); pg.select_option(f + ' select[name=mode]', 'fixed')
        pg.fill(f + ' input[name=startDate]', '2026-09-25')
        pg.click(f + ' button[type=submit]')
        occ = [x for x in s.doc()['tasks'] if x['seriesId']]
        check(L + 'Повтор по расписанию: серия создана, повторы 25.09, 02.10, 09.10', len(s.doc()['series']) == 1 and sorted(x['occurrenceDate'] for x in occ) == ['2026-09-25', '2026-10-02', '2026-10-09'], str(sorted(x['occurrenceDate'] for x in occ)))
        check(L + 'Повторы не отмечены сделанными или пропущенными сами', all(not x['done'] and not x['skipped'] for x in occ))
        s.tab('today')
        card = pg.locator('main > section.card.review', has_text='↻')
        check(L + 'Сегодня: карточка подтверждения повторов (2 шт.)', card.locator('.row').count() == 2 and 'Зал' in card.inner_text())
        card.locator('.row').first.locator('[data-how="doneThen"]').click()
        t0 = next(x for x in s.doc()['tasks'] if x['occurrenceDate'] == '2026-09-25')
        check(L + '«Сделано в тот день»: день выполнения = день повтора', t0['done'] and t0['doneDay'] == '2026-09-25')
        pg.locator('main > section.card.review .row').first.locator('[data-how="skip"]').click()
        t1 = next(x for x in s.doc()['tasks'] if x['occurrenceDate'] == '2026-10-02')
        check(L + '«Пропустить»: только по нажатию, запись сохранена', t1['skipped'] and not t1['done'])
        check(L + 'Карточка подтверждения исчезла, сегодняшний повтор остался задачей', pg.locator('main > section.card.review', has_text='↻').count() == 0 and 'Зал' in pg.inner_text('main'))
        s.at('2026-10-30T09:00:00+03:00')
        occ = sorted(x['occurrenceDate'] for x in s.doc()['tasks'] if x['seriesId'] and not x['done'] and not x['skipped'])
        check(L + 'Приложение было закрыто: новые повторы ждут подтверждения', occ == ['2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30'], str(occ))
        s.at('2026-10-30T09:00:30+03:00')
        check(L + 'Повторный запуск не создаёт дублей', len([x for x in s.doc()['tasks'] if x['seriesId']]) == 6)
        s.reload()
        check(L + 'Перезапуск не создаёт дублей', len([x for x in s.doc()['tasks'] if x['seriesId']]) == 6)
        s.tab('tasks'); pg.click('[data-fold=recurring] .foldhead') if pg.locator('[data-fold=recurring] .foldbody').is_hidden() else None
        pg.click('[data-fold=recurring] [data-action="series.new"]'); s.wait_sheet()
        pg.fill(f + ' input[name=title]', 'Полить цветы')
        pg.fill(f + ' input[name=interval]', '3'); pg.select_option(f + ' select[name=freq]', 'daily'); pg.select_option(f + ' select[name=mode]', 'completion')
        pg.fill(f + ' input[name=startDate]', '2026-10-30')
        pg.click(f + ' button[type=submit]')
        pg.locator('#main .trow', has_text='Полить цветы').first.locator('input[type=checkbox]').check()
        o = sorted((x['occurrenceDate'], x['done']) for x in s.doc()['tasks'] if x['title'] == 'Полить цветы')
        check(L + 'Повтор по выполнению: следующий через 3 дня после выполнения (02.11)', o == [('2026-10-30', True), ('2026-11-02', False)], str(o))
        pg.click('[data-fold=recurring] .foldhead') if pg.locator('[data-fold=recurring] .foldbody').is_hidden() else None
        pg.locator('#main .srow', has_text='Полить цветы').locator('.ttext').click(); s.wait_sheet()
        check(L + 'Правка серии: видна история', pg.locator('#sheet-root h3.sub').count() >= 1)
        pg.fill('#sheet-root form[data-form="series.edit"] input[name=interval]', '5'); pg.click('#sheet-root form[data-form="series.edit"] button[type=submit]')
        check(L + 'Правка серии: интервал 5', next(x for x in s.doc()['series'] if x['title'] == 'Полить цветы')['interval'] == 5)
        pg.click('[data-fold=recurring] .foldhead') if pg.locator('[data-fold=recurring] .foldbody').is_hidden() else None
        pg.locator('#main .srow', has_text='Полить цветы').locator('.more').click(); s.wait_sheet(); pg.click('#sheet-root [data-action="series.pause"]')
        check(L + 'Пауза серии', next(x for x in s.doc()['series'] if x['title'] == 'Полить цветы')['paused'] is True)
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== templates
    @flow('ru', 'en')
    def templates_flow(lang):
        L = f'[{lang}] '
        s = Session(lang); pg = s.pg
        s.tab('lists')
        s.fab()
        names = pg.locator('#sheet-root [data-action="tpl.use"]').all_inner_texts()
        check(L + 'Шаблоны: есть Супермаркет и Чемодан', len(names) == 2 and any(('Супермаркет' if lang == 'ru' else 'Supermarket') in n for n in names) and any(('Чемодан' if lang == 'ru' else 'Suitcase') in n for n in names), str(names))
        check(L + 'Шаблоны: в данных ничего не сохраняется, пока их не меняют', s.doc()['templates'] == [])
        pg.locator('#sheet-root [data-action="tpl.use"]').first.click()
        lists = [l for l in s.doc()['lists'] if not l.get('kind')]
        check(L + 'Список из шаблона создан, все пункты без отметок', len(lists) == 1 and len(lists[0]['items']) > 10 and all(not i['done'] for i in lists[0]['items']))
        pg.wait_for_selector('#main .foldhead'); 
        check(L + 'Он сразу открыт; категории — сворачиваемые заголовки', pg.locator('#main .foldhead').count() >= 5, str(pg.locator('#main .foldhead').count()))
        pg.locator('#main .foldbody:visible .row').nth(0).locator('input[type=checkbox]').check()
        pg.locator('#main .foldbody:visible .row').nth(1).locator('input[type=checkbox]').check()
        check(L + 'Отметки в списке ставятся', sum(i['done'] for i in s.doc()['lists'][-1]['items']) == 2)
        check(L + 'Шаблон при этом не изменился', s.doc()['templates'] == [])
        s.back(); s.fab(); pg.locator('#sheet-root [data-action="tpl.use"]').first.click()
        l2 = [l for l in s.doc()['lists'] if not l.get('kind')][1]
        check(L + 'Второй список из шаблона снова без отметок', all(not i['done'] for i in l2['items']))
        # edit and delete an item
        pg.locator('#main .foldbody:visible .row').first.locator('.ttext').click(); s.wait_sheet()
        pg.fill('#sheet-root input[name=title]', 'Изменённый пункт'); pg.click('#sheet-root form button[type=submit]')
        check(L + 'Пункт списка можно править', any(i['title'] == 'Изменённый пункт' for l in s.doc()['lists'] for i in l['items']))
        pg.locator('#main .row', has_text='Изменённый пункт').locator('.ttext').click(); s.wait_sheet()
        pg.click('#sheet-root [data-action="item.delete"]')
        it = [i for l in s.doc()['lists'] for i in l['items'] if i['title'] == 'Изменённый пункт'][0]
        check(L + 'Пункт можно удалить (обратимо: запись остаётся с deletedAt)', it['deletedAt'])
        # templates management
        s.back(); s.fab(); pg.click('#sheet-root [data-action="tpl.manage"]')
        pg.locator('#main .row', has_text='Чемодан' if lang == 'ru' else 'Suitcase').locator('.ttext').click()
        check(L + 'Шаблон открывается как список для правки', pg.locator('#back-btn').is_visible() and pg.locator('#main .foldhead').count() >= 3)
        s.fab(); pg.fill('#sheet-root textarea[name=text]', 'Зонт'); pg.select_option('#sheet-root select[name=category]', index=1) if pg.locator('#sheet-root select[name=category]').count() else None
        pg.click('#sheet-root form button[type=submit]')
        tpls = s.doc()['templates']
        check(L + 'Правка стандартного шаблона создаёт свою запись с основой', len(tpls) == 1 and tpls[0]['base'] == 'suitcase' and any(i['title'] == 'Зонт' for i in tpls[0]['items']), str([x['base'] for x in tpls]))
        s.back()
        check(L + 'Стандартный Чемодан не дублируется', pg.locator('#main .row .ttext').filter(has_text='Чемодан' if lang == 'ru' else 'Suitcase').count() == 1, pg.inner_text('#main')[:200])
        # own template
        s.back() if pg.locator('#back-btn').is_visible() else None
        s.fab(); pg.click('#sheet-root [data-action="tpl.manage"]')
        s.fab(); pg.fill('#sheet-root input[name=name]', 'Дача'); pg.click('#sheet-root form button[type=submit]')
        check(L + 'Свой шаблон создаётся', any(x['name'] == 'Дача' for x in s.doc()['templates']))
        # delete a built-in, it must not return after restart; restore button
        s.back()
        pg.locator('#main .row', has_text='Супермаркет' if lang == 'ru' else 'Supermarket').locator('.more').click(); s.wait_sheet()
        pg.click('#sheet-root [data-action="tpl.delete"]')
        s.reload(); s.tab('lists'); s.fab()
        check(L + 'Удалённый стандартный шаблон не возвращается после перезапуска', not any(('Супермаркет' if lang == 'ru' else 'Supermarket') in n for n in pg.locator('#sheet-root [data-action="tpl.use"]').all_inner_texts()))
        check(L + 'Есть кнопка «вернуть стандартные»', pg.locator('#sheet-root [data-action="tpl.restoreBuiltin"]').count() == 1)
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== upgrade from 0.4.0 data (through the UI)
    V4_DOC = lambda: doc4(
        tasks=[task('o1', 'Старая задача', 'day', '2026-10-08', deadline='2026-10-20'), task('o2', 'Сегодняшняя', 'day', '2026-10-09', time='11:00'), task('o3', 'Без даты', 'none')],
        events=[event('oe1', 'Старое событие', '2026-10-09T10:00')],
        lists=[{"id": "ol1", "name": "Старый список", "categories": ["А"], "items": [{"id": "oi1", "title": "Пункт", "done": True, "category": "А", "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}], "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None},
               {"id": "ol2", "name": "Купить", "categories": [], "items": [{"id": "oi2", "title": "Мой пункт", "done": False, "category": None, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}], "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}],
        templates=[{"id": "ot1", "name": "Мой шаблон", "base": None, "categories": [], "items": [{"id": "oti1", "title": "Вещь", "done": False, "category": None, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}], "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}],
        waiting=[{"id": "ow1", "title": "Ответ", "from": "Иван", "followUp": None, "note": "", "resolved": False, "resolvedAt": None, "taskId": None, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}])

    @flow('ru', 'en')
    def upgrade_flow(lang):
        L = f'[{lang}] '; S = STR[lang]
        v4 = V4_DOC()
        raw = json.dumps(v4, ensure_ascii=False, separators=(',', ':'))
        s = Session(lang, data=v4); pg = s.pg
        d = s.doc()
        keep = {k: d[k] for k in ('tasks', 'events', 'lists', 'templates', 'waiting')}
        check(L + 'Данные 0.4.0 открываются без миграции схемы (по-прежнему формат 4, тот же dataId)', d['schemaVersion'] == 4 and d['dataId'] == 'e2e-org')
        check(L + 'Ничего не потеряно: задачи, события, списки, шаблоны, ожидания идентичны', json.dumps(keep, sort_keys=True) == json.dumps({k: v4[k] for k in keep}, sort_keys=True))
        check(L + 'Свой список «Купить» цел и отдельный от созданного «Купить»', any(l['id'] == 'ol2' and l['name'] == 'Купить' for l in d['lists']) and not any(l.get('kind') == 'home' for l in d['lists']))
        s.tab('lists')
        texts = [x.replace('\n', ' ') for x in pg.locator('#main .indexrow').all_inner_texts()]
        check(L + 'Списки: «Купить» (из «Дом»), «Дом», затем старые списки', len(texts) == 4 and S['buy'] in texts[0] and S['home'] in texts[1] and any('Старый список' in x for x in texts) and sum('Купить' in x or 'Buy' in x for x in texts) >= 2, str(texts))
        s.fab(); check(L + 'Шаблоны: встроенные и свой «Мой шаблон»', 'Мой шаблон' in pg.inner_text('#sheet-root') and pg.locator('#sheet-root [data-action="tpl.use"]').count() == 3); s.close_sheet()
        s.tab('today')
        check(L + 'Сегодня: свежая задача на месте, хвост — в «Хвостах»', 'Сегодняшняя' in pg.inner_text('#today-list') and pg.locator('[data-fold="tails"] .count').inner_text() == '1')
        check(L + 'Ожидание на месте', 'Ответ' in pg.inner_text('#waiting-section'))
        rb = pg.evaluate("localStorage.getItem('organizer:rollback')")
        check(L + 'Данные на диске после открытия не изменены (кроме служебных полей)', s.doc()['tasks'] == v4['tasks'])
        s.close()

    # =============================================================== audit
    def audit_doc():
        d = doc4(tasks=[task('a1', 'Вчерашняя', 'day', '2026-10-08', deadline='2026-10-30'), task('a2', 'Сегодняшняя', 'day', '2026-10-09', time='10:00', indent=True), task('a3', 'Неделя', 'week', '2026-10-05'),
                        task('a5', 'Выполненная', 'day', '2026-10-09', done=True, completedAt=NOWISO, doneDay='2026-10-09'), task('a6', 'Без даты', 'none'),
                        task('a4', 'Повтор', 'day', '2026-10-02', seriesId='sr1', occurrenceDate='2026-10-02')],
                 events=[event('ae1', 'Лекция', '2026-10-09T10:00'), event('ae2', 'Экзамен', '2026-10-12T08:00')],
                 series=[{"id": "sr1", "title": "Повтор", "freq": "weekly", "interval": 1, "mode": "fixed", "startDate": "2026-09-25", "time": None, "paused": False, "generatedThrough": "2026-10-02", "projectId": None, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}],
                 waiting=[{"id": "w1", "title": "Ответ", "from": "Иван", "followUp": "2026-10-09", "note": "", "resolved": False, "resolvedAt": None, "taskId": None, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}],
                 lists=LISTS_DOC()['lists'], evening={"enabled": True, "time": "21:30"})
        d['events'][1]['prep'] = [{"id": "p1", "title": "Паспорт", "done": True, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}, {"id": "p2", "title": "Билеты", "done": False, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}]
        d['projects'] = [{"id": "pr1", "name": "Диплом", "milestones": [], "quantity": {"current": 3, "total": 12, "unit": "глав"}, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}]
        return d

    OVERFLOW_JS = """() => { const bad = []; const W = document.documentElement.clientWidth;
      for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) continue;
        if (el.closest('[hidden]') || el.closest('.scrim')) continue;
        if (r.right > W + 1 || r.left < -1) bad.push(el.tagName.toLowerCase() + '.' + el.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
        if (el.scrollWidth > el.clientWidth + 2 && ['hidden', 'clip'].includes(cs.overflowX) && el.clientWidth > 0 && !el.matches('.foldbody, .seg, .sheet, input[type=file]')) bad.push('clipped:' + el.tagName.toLowerCase() + '.' + el.className); }
      return bad.slice(0, 6); }"""

    @flow('ru-light', 'ru-dark', 'en-light', 'en-dark')
    def audit_flow(combo):
        lang, theme = combo.split('-')
        L = f'[{lang}/{theme}] '
        s = Session(lang, theme=theme, data=audit_doc(), when='2026-10-09T09:00:00+03:00'); pg = s.pg
        def look(name, full=True):
            bad = pg.evaluate(CONTRAST_JS)
            check(L + f'Контраст ≥ 4.5:1: {name}', not bad, '; '.join(bad[:4]))
            ov = pg.evaluate(OVERFLOW_JS)
            check(L + f'Ничего не вылезает за экран 390px: {name}', not ov and pg.evaluate('document.documentElement.scrollWidth') <= 390, '; '.join(ov))
            pg.screenshot(path=os.path.join(SHOTS, f'{lang}-{theme}-{name}.png'), full_page=full)
        look('today')
        pg.click('[data-fold="tails"] .foldhead'); look('today-tails')
        for tabname in ['calendar', 'tasks', 'lists']:
            s.tab(tabname)
            if tabname == 'tasks': pg.click('[data-fold=recurring] .foldhead')
            if tabname == 'calendar': pg.click('.cal-grid button[data-date="2026-10-12"]')
            look(tabname)
        pg.click('[data-action="cal.mode"]') if False else None
        s.tab('lists'); pg.locator('#main .indexrow').nth(2).click(); look('list')
        s.back(); pg.locator('#main .indexrow').nth(0).click(); look('buy')
        s.back(); pg.locator('#main .indexrow').nth(1).click(); look('home'); 
        pg.locator('#main .row').first.locator('.ttext').click(); s.wait_sheet(); look('stock-sheet', False); s.close_sheet()
        s.back()
        # sheets
        s.tab('today'); s.fab(); look('quick-sheet', False); s.close_sheet()
        s.more('Сегодняшняя'); look('task-menu', False); s.close_sheet()
        s.open_title('Сегодняшняя'); look('edit-sheet', False); s.close_sheet()
        s.tab('calendar'); pg.click('.cal-grid button[data-date="2026-10-12"]'); s.open_title('Экзамен'); look('event-sheet', False)
        pg.locator('#sheet-root [data-fold=prep] .foldhead').click(); look('event-prep-open', False); s.close_sheet()
        s.tab('today'); pg.click('#more-btn'); s.wait_sheet(); look('app-menu', False); s.close_sheet()
        for name in ['settings', 'data', 'about', 'projects']:
            s.go(name); look(name); s.back()
        pg.click('[data-action="evening.open"]'); look('evening')
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        foreign = [u for u in s.requests if not u.startswith(BASE)]
        check(L + 'Все запросы — только к файлам приложения', not foreign, str(foreign[:3]))
        s.close()

    @flow()
    def narrow_flow():
        # 320px (iPhone SE class): bottom bar, FAB, headers, sheets in both languages
        for lang in ('ru', 'en'):
            L = f'[{lang}/320] '
            s = Session(lang, data=audit_doc(), when='2026-10-09T09:00:00+03:00'); pg = s.pg
            pg.set_viewport_size({'width': 320, 'height': 568})
            pg.wait_for_timeout(200)
            check(L + 'Нижняя панель: 4 вкладки помещаются, подписи не обрезаны', pg.evaluate("""() => [...document.querySelectorAll('nav#nav button')].every(b => b.scrollWidth <= b.clientWidth + 1 && b.getBoundingClientRect().right <= 321)"""))
            for tabname in ['today', 'calendar', 'tasks', 'lists']:
                s.tab(tabname)
                check(L + f'{tabname}: нет горизонтальной прокрутки и вылезаний', pg.evaluate('document.documentElement.scrollWidth') <= 320 and not pg.evaluate(OVERFLOW_JS), str(pg.evaluate(OVERFLOW_JS)))
            s.tab('today'); s.fab()
            check(L + 'Лист «＋» помещается в экран, кнопка «Добавить» видна', pg.evaluate("""() => { const b = document.querySelector('#sheet-root button[type=submit]').getBoundingClientRect(); return b.bottom <= innerHeight && b.right <= innerWidth; }"""))
            s.close_sheet()
            s.more('Сегодняшняя')
            check(L + 'Меню строки: все пункты видны или прокручиваются внутри листа, лист не выше экрана', pg.evaluate("document.querySelector('#sheet-root .sheet').getBoundingClientRect().height <= innerHeight"))
            s.close_sheet()
            pg.click('#more-btn'); s.wait_sheet()
            check(L + 'Меню «···»: лист помещается', pg.evaluate("document.querySelector('#sheet-root .sheet').getBoundingClientRect().height <= innerHeight"))
            s.close()

    @flow()
    def keyboard_flow():
        # The on-screen keyboard cannot be produced in Chromium; its handling is simulated through visualViewport.
        s = Session('ru', data=audit_doc(), when='2026-10-09T09:00:00+03:00'); pg = s.pg
        s.fab()
        pg.evaluate("""() => { const vv = window.visualViewport; Object.defineProperty(vv, 'height', { configurable: true, get: () => 500 });
          vv.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('resize')); }""")
        pg.wait_for_timeout(200)
        kb = pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--kb')")
        check('Клавиатура (имитация visualViewport): сдвиг --kb установлен', kb.strip() not in ('', '0px', '0'), kb)
        b = pg.evaluate("(() => { const r = document.querySelector('#sheet-root button[type=submit]').getBoundingClientRect(); return r.bottom; })()")
        check('Клавиатура (имитация): кнопка «Добавить» выше верхней границы клавиатуры (500px)', b <= 500 + 1, str(b))
        check('Клавиатура (имитация): «＋» и панель скрыты, не мешают', pg.evaluate("getComputedStyle(document.querySelector('#fab')).display") == 'none' or pg.evaluate("document.body.classList.contains('kb-open') || document.documentElement.classList.contains('kb-open')"))
        s.close()

    # =============================================================== fixes after the independent review
    @flow('ru', 'en')
    def fixes_flow(lang):
        L = f'[{lang}] '; S = STR[lang]
        d = doc4(events=[event('e1', 'Врач', '2026-10-09T15:00')], tasks=[task('t1', 'Задача', 'day', '2026-10-09')])
        s = Session(lang, data=d); pg = s.pg
        s.tab('calendar'); pg.click('.cal-grid button[data-date="2026-10-09"]')
        s.menu_item('Врач', S['edit'])
        pg.fill('#sheet-root input[name=title]', 'Врач-новое')
        pg.fill('#sheet-root input[name=end]', '2026-10-09T10:00')   # before the start: refused
        pg.click('#sheet-root form[data-form="event.edit"] button[type=submit]'); pg.wait_for_timeout(150)
        check(L + 'Отказ при сохранении: лист остался, набранный текст не потерян', not s.no_sheet() and pg.input_value('#sheet-root input[name=title]') == 'Врач-новое' and pg.input_value('#sheet-root input[name=end]') == '2026-10-09T10:00')
        check(L + 'Отказ при сохранении: понятное сообщение об ошибке, данные не тронуты', pg.locator('#banners .banner').count() >= 1 and s.events('Врач') != [])
        pg.fill('#sheet-root input[name=end]', '2026-10-09T16:00')
        pg.click('#sheet-root form[data-form="event.edit"] button[type=submit]')
        check(L + 'Исправил и сохранил: событие обновлено', len(s.events('Врач-новое')) == 1 and s.no_sheet())
        # built-in template item edit through the screens
        s.tab('lists'); s.fab(); pg.click('#sheet-root [data-action="tpl.manage"]')
        pg.locator('#main .row', has_text='Супермаркет' if lang == 'ru' else 'Supermarket').locator('.ttext').click()
        pg.locator('#main .foldbody:visible .row').first.locator('.ttext').click(); s.wait_sheet()
        pg.fill('#sheet-root input[name=title]', 'Мой пункт'); pg.click('#sheet-root form button[type=submit]')
        tp = [x for x in s.doc()['templates'] if x['base'] == 'supermarket']
        check(L + 'Правка пункта встроенного шаблона проходит сразу, копия одна', len(tp) == 1 and any(i['title'] == 'Мой пункт' for i in tp[0]['items']), str([x['base'] for x in s.doc()['templates']]))
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()
