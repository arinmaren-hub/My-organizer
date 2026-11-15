import os
"""Browser tests for 0.7.0 (the Goals tab: goals with steps, next step in Tasks, search, undo) (headless Chromium, iPhone-sized screen).
Usage: python3 e2e-v7-test.py <app_folder> <output_folder>
Runs every flow twice (Russian, English); a contrast and layout audit runs in both
languages and both themes. The clock of the page is fixed, so dates are exact.
Prints one line per check and saves e2e-v7-results.json."""
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


    S7 = {
        'ru': {'goals': 'Цели', 'tabs': ['Сегодня', 'Календарь', 'Задачи', 'Списки', 'Цели'], 'newGoal': 'Новая цель', 'addSteps': 'Добавить шаги',
               'next': 'следующий шаг', 'stepChecked': 'Шаг сделан', 'stepDeleted': 'Шаг удалён', 'goalDeleted': 'Цель удалена',
               'goalSteps': 'Шаги к целям', 'goalMeta': 'Цель: ', 'allDone': 'Все шаги сделаны', 'reached': 'Достигнутые', 'markReached': 'Цель достигнута',
               'reopen': 'Вернуть в работу', 'empty': 'Здесь живут большие цели', 'prog': '{d} из {t}', 'nextMeta': 'дальше: ', 'del': 'Удалить',
               'searchGoal': 'Цель', 'searchStep': 'Шаг цели', 'readOnly': 'только чтение', 'kind': 'Цель: ',
               'pause': 'Поставить на паузу', 'resume': 'Снять с паузы', 'pausedMeta': 'на паузе', 'pausedBanner': 'Цель на паузе', 'hint': 'Без дат и сроков'},
        'en': {'goals': 'Goals', 'tabs': ['Today', 'Calendar', 'Tasks', 'Lists', 'Goals'], 'newGoal': 'New goal', 'addSteps': 'Add steps',
               'next': 'next step', 'stepChecked': 'Step done', 'stepDeleted': 'Step removed', 'goalDeleted': 'Goal deleted',
               'goalSteps': 'Steps towards goals', 'goalMeta': 'Goal: ', 'allDone': 'All steps are done', 'reached': 'Reached', 'markReached': 'Goal reached',
               'reopen': 'Back to work', 'empty': 'Big goals and the steps towards them', 'prog': '{d} of {t}', 'nextMeta': 'next: ', 'del': 'Delete',
               'searchGoal': 'Goal', 'searchStep': 'Step of', 'readOnly': 'read-only', 'kind': 'Goal: ',
               'pause': 'Pause', 'resume': 'Resume', 'pausedMeta': 'paused', 'pausedBanner': 'This goal is paused', 'hint': 'No dates, no deadlines'},
    }

    def step(i, title, done=False):
        x = {"id": i, "title": title, "done": done, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}
        if done: x["doneAt"] = NOWISO
        return x
    def goal(i, title, steps=(), note='', doneAt=None):
        return {"id": i, "title": title, "note": note, "steps": list(steps), "doneAt": doneAt, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}
    def goal_doc():
        d = doc4(tasks=[task('n1', 'Без даты первая'), task('w2', 'Пятница дело', 'day', '2026-10-09')],
                 events=[event('e1', 'Ужин с Аней', '2026-09-01T19:00')],
                 goals=[goal('g1', 'Записать аудиокнигу', [step('s1', 'Сделать тестовое задание'), step('s2', 'Записать пробную главу'), step('s3', 'Отправить')]),
                        goal('g2', 'Раскопки агоры', [step('a1', 'Написать поллали', True), step('a2', 'Заполнить анкету')], note='Спросить про ужин после раскопок'),
                        goal('g3', 'Прочитать «Риторику»', [step('r1', 'Обсудить книгу за ужином', True)], doneAt='2026-10-05T10:00:00.000Z'),
                        goal('g4', 'Ужин для друзей', [], note='Рецепты: https://example.org/soup')])
        d['schemaVersion'] = 6
        return d
    def prog(S, d, t): return S['prog'].replace('{d}', str(d)).replace('{t}', str(t))
    def step_titles(pg, scope='#main'): return pg.locator(f'{scope} .gsrow .title').all_inner_texts()
    def undo_text(pg): return pg.inner_text('#undo') if pg.is_visible('#undo') else ''
    def open_goal(s, title):
        s.pg.locator('#main .goalrow', has_text=title).first.click(); s.pg.wait_for_timeout(40)

    # =============================================================== creating a goal and working inside it
    @flow('ru', 'en')
    def goals_basic_flow(lang):
        L = f'[{lang}] '; S = S7[lang]
        s = Session(lang); pg = s.pg
        labels = pg.locator('nav#nav button span').all_inner_texts()
        check(L + 'Внизу пять вкладок, «Цели» последняя', labels == S['tabs'], str(labels))
        s.tab('goals')
        check(L + 'Цели: заголовок экрана', pg.inner_text('#app-title') == S['goals'])
        check(L + 'Пустой экран целей объясняет, что делать', S['empty'] in s.text(), s.text()[:120])
        check(L + 'Лупа поиска есть на экране целей', pg.is_visible('#search-btn'))
        check(L + 'Шестерёнка на месте', pg.is_visible('#more-btn') and pg.get_attribute('#more-btn', 'data-action') == 'menu.app')
        check(L + '«＋» на экране целей: «Новая цель»', pg.get_attribute('#fab', 'aria-label') == S['newGoal'])
        s.fab()
        pg.fill('#sheet-root input[name=title]', 'Записать аудиокнигу')
        pg.fill('#sheet-root textarea[name=steps]', 'Сделать тестовое задание\nЗаписать пробную главу\n\n  Отправить  ')
        pg.click('#sheet-root form[data-form="goal.add"] button[type=submit]')
        pg.wait_for_selector('#main .gsrow')
        check(L + 'После создания открывается сама цель', pg.inner_text('#app-title') == 'Записать аудиокнигу')
        check(L + 'Кнопка назад ведёт к «Цели»', pg.is_visible('#back-btn') and S['goals'] in pg.inner_text('#back-btn'))
        check(L + 'Подзаголовок: сколько шагов сделано', pg.inner_text('#subtitle') == prog(S, 0, 3), pg.inner_text('#subtitle'))
        check(L + 'Шаги по порядку, пустая строка пропущена', step_titles(pg) == ['Сделать тестовое задание', 'Записать пробную главу', 'Отправить'], str(step_titles(pg)))
        rows = pg.locator('#main .gsrow')
        check(L + 'Первый шаг помечен «следующий шаг»', 'next' in rows.nth(0).get_attribute('class') and S['next'] in rows.nth(0).inner_text())
        check(L + 'Чекбоксы круглые, как у задач', pg.evaluate("getComputedStyle(document.querySelector('#main .gsrow input')).borderRadius") in ('50%', '999px', '9999px', '12px') or pg.evaluate("parseFloat(getComputedStyle(document.querySelector('#main .gsrow input')).borderRadius) >= 11"))
        rows.nth(0).locator('input[type=checkbox]').click(); pg.wait_for_timeout(60)
        check(L + 'Отметка шага: появляется «Отменить»', S['stepChecked'] in undo_text(pg), undo_text(pg))
        check(L + 'Следующим становится второй шаг', 'next' in rows.nth(1).get_attribute('class') and 'is-done' in rows.nth(0).get_attribute('class'))
        check(L + 'Выполненный шаг остаётся на своём месте', step_titles(pg)[0] == 'Сделать тестовое задание')
        check(L + 'Подзаголовок обновился', pg.inner_text('#subtitle') == prog(S, 1, 3))
        pg.click('#undo button'); pg.wait_for_timeout(60)
        check(L + '«Отменить» снимает отметку шага', not rows.nth(0).locator('input').is_checked() and 'next' in rows.nth(0).get_attribute('class'))
        rows.nth(0).locator('input[type=checkbox]').click(); pg.wait_for_timeout(40)
        # note
        pg.click('#main [data-action="goal.noteOpen"]'); s.wait_sheet()
        pg.fill('#sheet-root textarea[name=note]', '<b>не жирный</b>\nКнига: https://example.org/book')
        pg.click('#sheet-root form[data-form="goal.note"] button[type=submit]'); pg.wait_for_timeout(60)
        a = pg.locator('.goalnote .note a')
        check(L + 'Заметка: адрес стал ссылкой, открывается отдельно', a.count() == 1 and a.get_attribute('href') == 'https://example.org/book' and a.get_attribute('target') == '_blank' and 'noopener' in (a.get_attribute('rel') or ''))
        check(L + 'Заметка: разметка показана как текст', '<b>не жирный</b>' in pg.inner_text('.goalnote .note') and pg.locator('.goalnote .note b').count() == 0)
        # add steps with «＋»
        check(L + '«＋» внутри цели: «Добавить шаги»', pg.get_attribute('#fab', 'aria-label') == S['addSteps'])
        s.fab(); pg.fill('#sheet-root textarea[name=text]', 'Найти студию\nПодписать договор')
        pg.click('#sheet-root form[data-form="steps.add"] button[type=submit]'); pg.wait_for_timeout(60)
        check(L + 'Новые шаги добавлены в конец', step_titles(pg) == ['Сделать тестовое задание', 'Записать пробную главу', 'Отправить', 'Найти студию', 'Подписать договор'], str(step_titles(pg)))
        check(L + 'Лист закрылся после добавления', s.no_sheet())
        # step sheet: move, rename, delete
        s.open_title('Найти студию')
        check(L + 'Тап по шагу открывает его лист', pg.locator('#sheet-root form[data-form="step.edit"]').count() == 1)
        pg.click('#sheet-root [data-action="step.move"][data-dir="1"]'); pg.wait_for_timeout(60)
        check(L + '«Ниже» переставляет шаг', step_titles(pg)[3:] == ['Подписать договор', 'Найти студию'], str(step_titles(pg)))
        pg.click('#sheet-root [data-action="step.move"][data-dir="-1"]'); pg.wait_for_timeout(60)
        check(L + '«Выше» возвращает его', step_titles(pg)[3:] == ['Найти студию', 'Подписать договор'])
        s.close_sheet()
        s.open_title('Отправить'); pg.fill('#sheet-root input[name=title]', 'Отправить в издательство')
        pg.click('#sheet-root form[data-form="step.edit"] button[type=submit]'); pg.wait_for_timeout(60)
        check(L + 'Шаг переименован', 'Отправить в издательство' in step_titles(pg))
        s.open_title('Подписать договор'); pg.click('#sheet-root [data-action="step.delete"]'); pg.wait_for_timeout(80)
        check(L + 'Удаление шага спрашивает подтверждение', len(s.dialogs) >= 1)
        check(L + 'Шаг удалён, предложено «Отменить»', 'Подписать договор' not in step_titles(pg) and S['stepDeleted'] in undo_text(pg))
        pg.click('#undo button'); pg.wait_for_timeout(60)
        check(L + '«Отменить» возвращает шаг на место', step_titles(pg)[-1] == 'Подписать договор')
        s.row('Записать пробную главу').locator('.ttext').click(button='right'); s.wait_sheet()
        check(L + 'Долгое нажатие на шаг открывает его лист', pg.locator('#sheet-root form[data-form="step.edit"]').count() == 1)
        s.close_sheet()
        s.back(); pg.wait_for_timeout(40)
        meta = pg.inner_text('#main .goalrow .meta')
        check(L + 'Список целей: прогресс и следующий шаг', prog(S, 1, 5) in meta and S['nextMeta'] + 'Записать пробную главу' in meta, meta)
        check(L + 'Список целей: шестерёнка снова в заголовке', pg.get_attribute('#more-btn', 'data-action') == 'menu.app')
        s.reload(); s.tab('goals')
        check(L + 'После перезапуска цель на месте', 'Записать аудиокнигу' in s.text())
        d = s.doc()
        g = d['goals'][0]
        check(L + 'В данных схема 6 и цель со всеми шагами и заметкой', d['schemaVersion'] == 6 and len([x for x in g['steps'] if not x['deletedAt']]) == 5 and 'example.org/book' in g['note'])
        check(L + 'Цели не создают задач', len([t for t in d['tasks'] if not t['deletedAt']]) == 0)
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== the next step in «Задачи»
    @flow('ru', 'en')
    def goals_in_tasks_flow(lang):
        L = f'[{lang}] '; S = S7[lang]
        s = Session(lang, data=goal_doc()); pg = s.pg
        s.tab('tasks')
        order = pg.evaluate("""() => { const q = s => document.querySelector(s); const pos = (a, b) => !!(a && b && a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
          return [pos(q('.group.nodate'), q('.group.thisweek')), pos(q('.group.thisweek'), q('[data-fold="goalsteps"]')), pos(q('[data-fold="goalsteps"]'), q('[data-fold="later"]'))]; }""")
        check(L + 'Задачи: «Без даты» → «На этой неделе» → «Шаги к целям» → «Позже»', order == [True, True, True], str(order))
        head = pg.locator('[data-fold="goalsteps"] .foldhead')
        check(L + '«Шаги к целям» свёрнуты по умолчанию: одна спокойная строка с числом', head.get_attribute('aria-expanded') == 'false' and S['goalSteps'] in head.inner_text() and '2' in head.inner_text() and not pg.is_visible('[data-fold="goalsteps"] .gsrow'))
        head.click()
        check(L + 'Внутри пояснение: без дат и сроков', S['hint'] in pg.inner_text('[data-fold="goalsteps"] .foldbody'))
        check(L + 'По одному следующему шагу на цель в работе (достигнутые и без шагов не показаны)', step_titles(pg, '[data-fold="goalsteps"]') == ['Сделать тестовое задание', 'Заполнить анкету'], str(step_titles(pg, '[data-fold="goalsteps"]')))
        metas = pg.locator('[data-fold="goalsteps"] .gsrow .meta').all_inner_texts()
        check(L + 'Под шагом — название цели', metas == [S['goalMeta'] + 'Записать аудиокнигу', S['goalMeta'] + 'Раскопки агоры'], str(metas))
        ntasks = len(s.tasks())
        pg.locator('[data-fold="goalsteps"] .gsrow', has_text='Сделать тестовое задание').locator('input').click(); pg.wait_for_timeout(80)
        check(L + 'Отметка в «Задачах»: появляется следующий шаг этой цели', step_titles(pg, '[data-fold="goalsteps"]') == ['Записать пробную главу', 'Заполнить анкету'], str(step_titles(pg, '[data-fold="goalsteps"]')))
        check(L + 'Отметка в «Задачах»: можно отменить', S['stepChecked'] in undo_text(pg))
        pg.click('#undo button'); pg.wait_for_timeout(60)
        check(L + 'После отмены снова первый шаг', step_titles(pg, '[data-fold="goalsteps"]') == ['Сделать тестовое задание', 'Заполнить анкету'])
        check(L + 'Задачи при этом не создаются и не меняются', len(s.tasks()) == ntasks)
        pg.locator('[data-fold="goalsteps"] .gsrow .ttext', has_text='Заполнить анкету').click()
        pg.wait_for_selector('#main .gsrow.hl', timeout=3000)
        check(L + 'Тап по шагу открывает его цель', pg.inner_text('#app-title') == 'Раскопки агоры')
        check(L + 'Нужный шаг подсвечен', 'Заполнить анкету' in pg.inner_text('#main .gsrow.hl'))
        check(L + 'Активна вкладка «Цели»', pg.get_attribute('nav [data-tab="goals"]', 'aria-current') == 'page')
        # pause: the goal stays, its step leaves «Задачи»
        pg.click('#more-btn'); s.wait_sheet(); s.item(S['pause']); pg.wait_for_timeout(60)
        check(L + 'Пауза: в цели спокойное пояснение и «Снять с паузы»', S['pausedBanner'] in s.text() and S['resume'] in s.text())
        s.tab('tasks')
        check(L + 'Пауза: шаг этой цели не показывается в «Задачах»', step_titles(pg, '[data-fold="goalsteps"]') == ['Сделать тестовое задание'], str(step_titles(pg, '[data-fold="goalsteps"]')))
        s.tab('goals'); s.tab('goals')
        check(L + 'Пауза: в списке целей пометка «на паузе»', S['pausedMeta'] in pg.locator('#main .goalrow', has_text='Раскопки агоры').inner_text())
        open_goal(s, 'Раскопки агоры'); pg.click('#main [data-action="goal.pause"]'); pg.wait_for_timeout(60)
        s.tab('tasks')
        check(L + 'Снятие паузы возвращает шаг в «Задачи»', step_titles(pg, '[data-fold="goalsteps"]') == ['Сделать тестовое задание', 'Заполнить анкету'])
        g2 = next(g for g in s.doc()['goals'] if g['id'] == 'g2')
        check(L + 'Пауза не меняет шаги', [x['done'] for x in g2['steps']] == [True, False] and 'pausedAt' not in g2)
        pg.locator('[data-fold="goalsteps"] .gsrow .ttext', has_text='Сделать тестовое задание').click(button='right'); s.wait_sheet()
        check(L + 'Долгое нажатие на шаг в «Задачах» открывает лист шага', pg.locator('#sheet-root form[data-form="step.edit"]').count() == 1)
        s.close_sheet()
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()
        s = Session(lang, data=doc4(tasks=[task('n1', 'Без даты первая')])); pg = s.pg
        s.tab('tasks')
        check(L + 'Без целей группы «Шаги к целям» нет', pg.locator('[data-fold="goalsteps"]').count() == 0)
        s.close()

    # =============================================================== a goal is reached
    @flow('ru', 'en')
    def goal_reached_flow(lang):
        L = f'[{lang}] '; S = S7[lang]
        s = Session(lang, data=goal_doc()); pg = s.pg
        s.tab('goals')
        active = pg.locator('#main > .list .goalrow .title').all_inner_texts()
        check(L + 'В работе — три цели, по порядку добавления', active == ['Записать аудиокнигу', 'Раскопки агоры', 'Ужин для друзей'], str(active))
        fold = pg.locator('[data-fold="goals.reached"] .foldhead')
        check(L + '«Достигнутые» свёрнуты внизу', fold.count() == 1 and S['reached'] in fold.inner_text() and fold.get_attribute('aria-expanded') == 'false')
        open_goal(s, 'Раскопки агоры')
        pg.locator('#main .gsrow', has_text='Заполнить анкету').locator('input').click(); pg.wait_for_timeout(60)
        check(L + 'Все шаги сделаны: спокойное предложение отметить цель', S['allDone'] in s.text())
        pg.click('#main [data-action="goal.reached"][data-on="1"]'); pg.wait_for_timeout(60)
        check(L + 'Цель отмечена достигнутой: можно вернуть в работу', S['reopen'] in s.text())
        s.back(); pg.wait_for_timeout(40)
        check(L + 'Достигнутая цель ушла из списка в работе', 'Раскопки агоры' not in pg.locator('#main > .list').inner_text())
        fold.click()
        check(L + 'Она в «Достигнутых»', 'Раскопки агоры' in pg.inner_text('[data-fold="goals.reached"] .foldbody'))
        s.tab('tasks'); pg.click('[data-fold="goalsteps"] .foldhead')
        check(L + 'В «Задачах» её шага больше нет', step_titles(pg, '[data-fold="goalsteps"]') == ['Сделать тестовое задание'])
        s.tab('goals'); pg.locator('[data-fold="goals.reached"] .goalrow', has_text='Раскопки агоры').click(); pg.wait_for_timeout(40)
        pg.click('#more-btn'); s.wait_sheet(); s.item(S['reopen']); pg.wait_for_timeout(60)
        s.back()
        check(L + 'Через меню цель возвращается в работу', 'Раскопки агоры' in pg.locator('#main > .list').inner_text())
        check(L + 'Шаги не изменились', [x['done'] for x in next(g for g in s.doc()['goals'] if g['id'] == 'g2')['steps']] == [True, True])
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== deleting and restoring a goal
    @flow('ru', 'en')
    def goal_delete_flow(lang):
        L = f'[{lang}] '; S = S7[lang]
        s = Session(lang, data=goal_doc()); pg = s.pg
        s.tab('goals'); open_goal(s, 'Ужин для друзей')
        check(L + 'Цель без шагов объясняет, как начать', pg.locator('#main .gsrow').count() == 0 and pg.locator('#main .empty').count() == 1)
        pg.click('#more-btn'); s.wait_sheet(); s.item(S['del']); pg.wait_for_timeout(80)
        check(L + 'Удаление цели спрашивает подтверждение', len(s.dialogs) >= 1)
        check(L + 'После удаления — список целей', pg.inner_text('#app-title') == S['goals'] and 'Ужин для друзей' not in s.text())
        check(L + 'Удаление можно отменить', S['goalDeleted'] in undo_text(pg))
        pg.click('#undo button'); pg.wait_for_timeout(60)
        check(L + '«Отменить» возвращает цель', 'Ужин для друзей' in s.text())
        open_goal(s, 'Ужин для друзей'); pg.click('#more-btn'); s.wait_sheet(); s.item(S['del']); pg.wait_for_timeout(80)
        s.go('data'); pg.wait_for_timeout(60)
        check(L + 'Удалённая цель видна в «Удалённых»', S['kind'] + 'Ужин для друзей' in s.text())
        pg.click('[data-action="restore"][data-collection="goals"]'); pg.wait_for_timeout(60)
        s.tab('goals')
        check(L + 'Восстановленная цель снова в списке, с заметкой', 'Ужин для друзей' in s.text() and 'example.org' in next(g for g in s.doc()['goals'] if g['id'] == 'g4')['note'])
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== search finds goals and steps
    @flow('ru', 'en')
    def goals_search_flow(lang):
        L = f'[{lang}] '; S = S7[lang]
        s = Session(lang, data=goal_doc()); pg = s.pg
        s.tab('tasks'); pg.click('#search-btn'); s.wait_sheet()
        pg.fill('#sheet-root input[name=q]', 'ужин'); pg.wait_for_timeout(60)
        kinds = pg.evaluate("[...document.querySelectorAll('#sheet-root .srch')].map(b => b.classList[1])")
        names = pg.locator('#sheet-root .srch .stitle').all_inner_texts()
        check(L + 'Поиск: событие, цели (по названию и в заметке), шаг', kinds == ['event', 'goal', 'goal', 'step'], str(kinds))
        check(L + 'Поиск: цель по названию раньше цели по заметке', names[1:3] == ['Ужин для друзей', 'Раскопки агоры'], str(names))
        metas = pg.locator('#sheet-root .srch .meta').all_inner_texts()
        check(L + 'Поиск: видно, что это цель и шаг какой цели', metas[1].startswith(S['searchGoal']) and S['searchStep'] in metas[3] and 'Прочитать «Риторику»' in metas[3], str(metas))
        check(L + 'Поле поиска не теряет фокус при вводе', pg.evaluate("document.activeElement && document.activeElement.name") == 'q')
        pg.locator('#sheet-root .srch.goal').first.click(); pg.wait_for_timeout(60)
        check(L + 'Тап по цели открывает её', pg.inner_text('#app-title') == 'Ужин для друзей' and s.no_sheet())
        check(L + 'Внутри цели лупы нет', not pg.is_visible('#search-btn'))
        s.tab('goals')
        check(L + 'Повторный тап по вкладке возвращает к списку целей', pg.inner_text('#app-title') == S['goals'])
        pg.click('#search-btn'); s.wait_sheet(); pg.fill('#sheet-root input[name=q]', 'обсудить'); pg.wait_for_timeout(60)
        pg.locator('#sheet-root .srch.step').first.click()
        pg.wait_for_selector('#main .gsrow.hl', timeout=3000)
        check(L + 'Тап по шагу открывает цель и подсвечивает шаг', pg.inner_text('#app-title') == 'Прочитать «Риторику»' and 'Обсудить книгу за ужином' in pg.inner_text('#main .gsrow.hl'))
        before = json.dumps(s.doc(), sort_keys=True)
        s.tab('tasks'); pg.click('#search-btn'); s.wait_sheet(); pg.fill('#sheet-root input[name=q]', 'анкет'); pg.wait_for_timeout(60); s.close_sheet()
        check(L + 'Поиск ничего не меняет в данных', json.dumps(s.doc(), sort_keys=True) == before)
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== newer data: read-only, nothing written
    @flow('ru')
    def goals_readonly_flow(lang):
        L = f'[{lang}] '
        d = goal_doc(); d['schemaVersion'] = 7
        s = Session(lang, data=d); pg = s.pg
        raw = pg.evaluate("localStorage.getItem('organizer:data')")
        s.tab('goals')
        check(L + 'Данные новее: режим только чтения, «＋» скрыт', pg.locator('.banner.error').count() >= 1 and not pg.is_visible('#fab'))
        check(L + 'Данные новее: ничего не записано', pg.evaluate("localStorage.getItem('organizer:data')") == raw)
        s.close()

    # =============================================================== audit (contrast, overflow, screenshots)
    OVERFLOW_JS = """() => { const bad = []; const W = document.documentElement.clientWidth;
      for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) continue;
        if (el.closest('[hidden]') || el.closest('.scrim')) continue;
        if (r.right > W + 1 || r.left < -1) bad.push(el.tagName.toLowerCase() + '.' + el.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
      }
      return bad.slice(0, 6); }"""
    NAV_JS = "[...document.querySelectorAll('nav#nav button span')].filter(s => s.scrollWidth > s.clientWidth + 1).map(s => s.textContent)"

    @flow('ru-light', 'ru-dark', 'en-light', 'en-dark')
    def audit7_flow(combo):
        lang, theme = combo.split('-')
        L = f'[{lang}/{theme}] '
        s = Session(lang, theme=theme, data=goal_doc()); pg = s.pg
        W = 390
        def look(name, full=True):
            bad = pg.evaluate(CONTRAST_JS)
            check(L + f'Контраст ≥ 4.5:1: {name}', not bad, '; '.join(bad[:4]))
            ov = pg.evaluate(OVERFLOW_JS)
            check(L + f'Ничего не вылезает за экран {W}px: {name}', not ov and pg.evaluate('document.documentElement.scrollWidth') <= W, '; '.join(ov))
            pg.screenshot(path=os.path.join(SHOTS, f'v7-{lang}-{theme}-{name}.png'), full_page=full)
        check(L + 'Подписи пяти вкладок не обрезаны', not pg.evaluate(NAV_JS), str(pg.evaluate(NAV_JS)))
        s.tab('goals'); pg.click('[data-fold="goals.reached"] .foldhead'); look('goals-index')
        open_goal(s, 'Записать аудиокнигу'); look('goal-steps')
        s.open_title('Записать пробную главу'); look('step-sheet', False); s.close_sheet()
        pg.click('#more-btn'); s.wait_sheet(); look('goal-menu', False); s.close_sheet()
        s.back(); open_goal(s, 'Ужин для друзей'); look('goal-note')
        pg.click('#main [data-action="goal.noteOpen"]'); s.wait_sheet(); look('note-sheet', False); s.close_sheet()
        s.back(); open_goal(s, 'Раскопки агоры')
        pg.locator('#main .gsrow', has_text='Заполнить анкету').locator('input').click(); pg.wait_for_timeout(60); look('goal-all-done')
        pg.click('#main [data-action="goal.reached"][data-on="1"]'); pg.wait_for_timeout(60); look('goal-reached')
        s.back(); s.fab(); look('new-goal-sheet', False); s.close_sheet()
        open_goal(s, 'Записать аудиокнигу'); pg.click('#more-btn'); s.wait_sheet(); s.item(S7[lang]['pause']); pg.wait_for_timeout(60); look('goal-paused')
        pg.click('#main [data-action="goal.pause"]'); pg.wait_for_timeout(40)
        s.tab('tasks'); pg.click('[data-fold="goalsteps"] .foldhead'); look('tasks-with-steps')
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    @flow()
    def narrow7_flow():
        for lang in ('ru', 'en'):
            L = f'[{lang}/320] '
            s = Session(lang, data=goal_doc()); pg = s.pg
            pg.set_viewport_size({'width': 320, 'height': 568}); pg.wait_for_timeout(200)
            check(L + 'Подписи пяти вкладок помещаются', not pg.evaluate(NAV_JS), str(pg.evaluate(NAV_JS)))
            fits = lambda: pg.evaluate('document.documentElement.scrollWidth') <= 320 and not pg.evaluate(OVERFLOW_JS)
            s.tab('goals'); a = fits()
            open_goal(s, 'Записать аудиокнигу'); b = fits()
            s.back(); open_goal(s, 'Ужин для друзей'); c = fits()
            s.tab('tasks'); pg.click('[data-fold="goalsteps"] .foldhead'); d = fits()
            check(L + 'Цели, цель, заметка и задачи помещаются в 320px', a and b and c and d, str([a, b, c, d, pg.evaluate(OVERFLOW_JS)]))
            pg.screenshot(path=os.path.join(SHOTS, f'v7-{lang}-320-tasks.png'), full_page=True)
            s.close()

    # =============================================================== offline
    @flow()
    def offline7_flow():
        s = Session('ru', data=goal_doc()); pg = s.pg
        pg.evaluate('navigator.serviceWorker.ready')
        s.reload(); pg.wait_for_function('() => !!navigator.serviceWorker.controller', timeout=10000)
        names = pg.evaluate("caches.keys()")
        urls = pg.evaluate("caches.open(%s).then(c => c.keys()).then(ks => ks.map(k => new URL(k.url).pathname))" % json.dumps(names[-1] if names else ''))
        for need in ['/goals.js', '/view-goals.js', '/i18n-v7.js']:
            check('Офлайн: новый модуль в кэше: ' + need, need in urls, str(urls)[:200])
        check('Офлайн: в кэше версия 0.7.0', any('0.7.0' in n for n in names), str(names))
        s.ctx.set_offline(True)
        s.reload(); s.tab('goals')
        check('Офлайн: «Цели» открываются без сети', 'Записать аудиокнигу' in s.text())
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
print(f'E2E-V7: {passed}/{len(results)} checks passed')
for name, ok, detail in results:
    print(('  ✓ ' if ok else '  ✗ ') + name + (f'  — {detail}' if detail and not ok else ''))
json.dump([{'name': n, 'ok': o, 'detail': d} for n, o, d in results], open(os.path.join(OUT, 'e2e-v7-results.json'), 'w'), ensure_ascii=False, indent=1)
sys.exit(0 if passed == len(results) else 1)
