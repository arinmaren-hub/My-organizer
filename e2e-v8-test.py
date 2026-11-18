import os
"""Browser tests for 0.8.0 (Сегодня / Завтра in fast entry, «Повторять», several weekdays) — Russian only (headless Chromium, iPhone-sized screen).
Usage: python3 e2e-v8-test.py <app_folder> <output_folder>
Runs every flow twice (Russian, English); a contrast and layout audit runs in both
languages and both themes. The clock of the page is fixed, so dates are exact.
Prints one line per check and saves e2e-v8-results.json."""
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


    # 0.8.0 — Russian only (English is paused). The page clock is Friday 9 October 2026, 12:00.
    def ev(i, title, start, end=None):
        e = event(i, title, start); e['end'] = end; return e
    def d8(**kw):
        d = doc4(**kw); d['schemaVersion'] = 6; d['goals'] = []
        return d
    def seg(pg):
        return pg.locator('#sheet-root .seg button').all_inner_texts()
    def seg_on(pg):
        return pg.locator('#sheet-root .seg button.on').inner_text() if pg.locator('#sheet-root .seg button.on').count() else ''
    def label(pg):
        return pg.inner_text('#sheet-root form[data-form="task.quickAdd"] .quick-to')
    def cal_day(s, date):
        s.pg.click(f'#main [data-action="cal.select"][data-date="{date}"]'); s.pg.wait_for_timeout(40)
    def open_event(s, date, title):
        cal_day(s, date)
        s.pg.locator('#main .erow .ttext', has_text=title).first.click(); s.wait_sheet()
    def notice_text(pg):
        return ' '.join(pg.locator('#notices, .notice, [role=status]').all_inner_texts())

    # =============================================================== «Сегодня / Завтра»
    @flow('ru')
    def quick_tomorrow_flow(lang):
        L = '[ru] '
        s = Session(lang, data=d8()); pg = s.pg
        s.fab()
        check(L + 'В «Новых делах» есть «Сегодня / Завтра»', seg(pg) == ['Сегодня', 'Завтра'], str(seg(pg)))
        check(L + 'По умолчанию «Сегодня»', seg_on(pg) == 'Сегодня' and 'пт, 9 окт' in label(pg), label(pg))
        pg.fill('#sheet-root textarea[name=text]', 'Купить хлеб\nПозвонить маме\nЗаписаться к врачу в понедельник')
        pg.click('#sheet-root [data-action="quick.day"][data-v="1"]'); pg.wait_for_timeout(60)
        check(L + '«Завтра»: подпись показывает завтрашний день', seg_on(pg) == 'Завтра' and 'сб, 10 окт' in label(pg), label(pg))
        check(L + 'Набранный текст не пропал', 'Позвонить маме' in pg.input_value('#sheet-root textarea[name=text]'))
        check(L + 'Поле снова в фокусе', pg.evaluate("document.activeElement && document.activeElement.name") == 'text')
        pg.click('#sheet-root form[data-form="task.quickAdd"] button[type=submit]'); pg.wait_for_timeout(80)
        plan = {t['title']: t['plan'].get('date') for t in s.tasks()}
        check(L + 'Строки без даты ушли на завтра', plan.get('Купить хлеб') == '2026-10-10' and plan.get('Позвонить маме') == '2026-10-10', str(plan))
        check(L + 'Дата в самой строке важнее переключателя', plan.get('Записаться к врачу') == '2026-10-12', str(plan))
        check(L + 'Окно закрылось', s.no_sheet())
        s.fab()
        check(L + 'Следующий раз снова начинается с «Сегодня»', seg_on(pg) == 'Сегодня')
        pg.fill('#sheet-root textarea[name=text]', 'Вынести мусор')
        pg.click('#sheet-root form[data-form="task.quickAdd"] button[type=submit]'); pg.wait_for_timeout(60)
        check(L + 'С «Сегодня» — на сегодня', s.tasks('Вынести мусор')[0]['plan']['date'] == '2026-10-09')
        # a line with a time asks «задача или событие?» — on the chosen day
        s.fab(); pg.fill('#sheet-root textarea[name=text]', 'Созвон 15:00')
        pg.click('#sheet-root [data-action="quick.day"][data-v="1"]'); pg.wait_for_timeout(40)
        pg.click('#sheet-root form[data-form="task.quickAdd"] button[type=submit]'); pg.wait_for_timeout(60)
        check(L + 'Строка со временем спрашивает, на завтра', 'сб, 10 окт' in pg.inner_text('#sheet-root .banner'), pg.inner_text('#sheet-root .banner') if pg.locator('#sheet-root .banner').count() else '')
        pg.click('#sheet-root [data-action="quick.asEvent"]'); pg.wait_for_timeout(60)
        check(L + 'Событие на завтра в 15:00', any(e['start'] == '2026-10-10T15:00' for e in s.events('Созвон')), str(s.events('Созвон')))
        # Calendar: another date → no switch; today → switch
        s.tab('calendar'); cal_day(s, '2026-10-14'); s.fab()
        check(L + 'Из календаря на другой день переключателя нет', pg.locator('#sheet-root .seg').count() == 0 and 'ср, 14 окт' in label(pg))
        s.close_sheet(); cal_day(s, '2026-10-09'); s.fab()
        check(L + 'Из календаря на сегодня переключатель есть', pg.locator('#sheet-root .seg').count() == 1)
        s.close_sheet()
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== «Повторять» from an event
    @flow('ru')
    def repeat_event_flow(lang):
        L = '[ru] '
        s = Session(lang, data=d8(events=[ev('e1', 'Иконопись урок', '2026-10-12T18:00', '2026-10-12T20:00')])); pg = s.pg
        s.tab('calendar'); open_event(s, '2026-10-12', 'Иконопись урок')
        check(L + 'В карточке события есть «Повторять»', pg.locator('#sheet-root [data-action="repeat.open"]').count() == 1)
        pg.click('#sheet-root [data-action="repeat.open"]'); s.wait_sheet()
        radios = pg.locator('#sheet-root .ropt').all_inner_texts()
        check(L + 'Варианты повтора', [r.strip() for r in radios] == ['Каждый день', 'Каждую неделю, по понедельникам', 'По дням недели', 'Каждые 2 недели, по понедельникам', 'Каждый месяц, 12-го числа', 'Каждый год, 12 октября'], str(radios))
        check(L + 'По умолчанию «каждую неделю»', pg.locator('#sheet-root input[name=preset][value=weekly]').is_checked())
        mon = pg.locator('#sheet-root .wday input[value="1"]')
        check(L + 'Понедельник (день события) отмечен и не снимается', mon.is_checked() and mon.is_disabled())
        pg.locator('#sheet-root .wday', has_text='Чт').click(); pg.wait_for_timeout(30)
        check(L + 'Отметка дня выбирает «По дням недели»', pg.locator('#sheet-root input[name=preset][value=days]').is_checked())
        pg.click('#sheet-root form[data-form="repeat.save"] button[type=submit]'); pg.wait_for_timeout(100)
        check(L + 'После сохранения снова карточка события с правилом', pg.locator('#sheet-root .sheet-head', has_text='Иконопись урок').count() == 1 and '↻ Повторяется: каждую неделю: пн, чт' in pg.inner_text('#sheet-root .sheet'))
        check(L + 'Вместо «Повторять» — «Изменить повтор»', pg.locator('#sheet-root [data-action="repeat.open"]').count() == 0 and pg.locator('#sheet-root [data-action="edit.open"][data-kind="series"]').count() == 1)
        d = s.doc()
        mine = [e for e in d['events'] if not e['deletedAt'] and e['title'] == 'Иконопись урок']
        check(L + 'На 12-е одно событие (оно само), четверги и понедельники дальше', len([e for e in mine if e['start'].startswith('2026-10-12')]) == 1
              and any(e['start'] == '2026-10-15T18:00' and e['end'] == '2026-10-15T20:00' for e in mine) and any(e['start'].startswith('2026-10-19') for e in mine))
        e1 = next(e for e in d['events'] if e['id'] == 'e1')
        check(L + 'Исходное событие стало первым в правиле', e1.get('seriesOrigin') is True and e1.get('occurrenceDate') == '2026-10-12')
        check(L + 'Схема данных 7', d['schemaVersion'] == 7)
        # the rule editor: chips
        pg.click('#sheet-root [data-action="edit.open"][data-kind="series"]'); s.wait_sheet()
        checked = pg.evaluate("[...document.querySelectorAll('#sheet-root .wday input:checked')].map(i => i.value)")
        check(L + 'В правиле отмечены пн и чт', checked == ['1', '4'], str(checked))
        pg.select_option('#sheet-root select[name=freq]', 'daily'); pg.wait_for_timeout(30)
        check(L + 'Для «дней» дни недели скрыты', not pg.is_visible('#sheet-root .wdays'))
        pg.select_option('#sheet-root select[name=freq]', 'weekly'); pg.wait_for_timeout(30)
        check(L + 'Для «недель» снова видны', pg.is_visible('#sheet-root .wdays'))
        s.close_sheet()
        cal_day(s, '2026-10-15')
        check(L + 'В календаре четверг с событием', 'Иконопись урок' in s.text())
        s.reload(); s.tab('calendar'); cal_day(s, '2026-10-22')
        check(L + 'После перезапуска всё на месте', 'Иконопись урок' in s.text())
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== «Повторять» from a task, menus, deleting the rule
    @flow('ru')
    def repeat_task_flow(lang):
        L = '[ru] '
        s = Session(lang, data=d8(tasks=[task('n1', 'Полить цветы'), task('w1', 'Йога', 'day', '2026-10-09')])); pg = s.pg
        s.tab('tasks'); s.open_title('Полить цветы')
        check(L + 'В задаче есть «Повторять»', pg.locator('#sheet-root [data-action="repeat.open"][data-coll="tasks"]').count() == 1)
        pg.click('#sheet-root [data-action="repeat.open"]'); s.wait_sheet()
        check(L + 'Для задачи без даты: первый раз сегодня', 'Первый раз: пт, 9 окт' in pg.inner_text('#sheet-root .sheet'), pg.inner_text('#sheet-root .sheet')[-300:])
        pg.check('#sheet-root input[name=preset][value=daily]')
        pg.click('#sheet-root form[data-form="repeat.save"] button[type=submit]'); pg.wait_for_timeout(100)
        t1 = next(t for t in s.doc()['tasks'] if t['id'] == 'n1')
        check(L + 'Задача стала первой в правиле «каждый день»', t1['seriesId'] and t1['plan'] == {'kind': 'day', 'date': '2026-10-09'} and t1.get('seriesOrigin') is True)
        check(L + 'Лист закрылся, есть сообщение', s.no_sheet())
        check(L + 'Задач-копий нет', len(s.tasks('Полить цветы')) == 1)
        s.more('Йога')
        check(L + 'В меню задачи (долгое нажатие) есть «Повторять»', pg.locator('#sheet-root .menuitem', has_text='Повторять').count() == 1)
        s.item('Повторять'); s.wait_sheet()
        pg.click('#sheet-root form[data-form="repeat.save"] button[type=submit]'); pg.wait_for_timeout(100)
        sid = next(t for t in s.doc()['tasks'] if t['id'] == 'w1')['seriesId']
        check(L + '«Йога» повторяется каждую неделю', any(x['id'] == sid and x['freq'] == 'weekly' for x in s.doc()['series']))
        pg.click('[data-fold="recurring"] .foldhead') if pg.locator('[data-fold="recurring"] .foldhead').count() else None
        check(L + 'Правила видны в «Повторяющихся задачах»', 'Полить цветы' in s.text() and 'Йога' in s.text())
        # delete the rule: the task itself stays
        rid = sid
        pg.click(f'#main [data-action="menu.series"][data-id="{rid}"]'); s.wait_sheet()
        pg.click('#sheet-root [data-action="series.delete"]'); pg.wait_for_timeout(80)
        w1 = next(t for t in s.doc()['tasks'] if t['id'] == 'w1')
        check(L + 'Удаление правила оставляет саму задачу обычной', not w1['deletedAt'] and w1['seriesId'] is None and 'seriesOrigin' not in w1)
        check(L + '«Йога» по-прежнему в задачах', 'Йога' in s.text())
        s.open_title('Полить цветы')
        check(L + 'В задаче с правилом — «↻ Повторяется» и «Изменить повтор»', '↻ Повторяется: каждый день' in pg.inner_text('#sheet-root .sheet') and pg.locator('#sheet-root [data-action="edit.open"][data-kind="series"]').count() == 1)
        s.close_sheet()
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== a new rule from «Задачи» with weekdays
    @flow('ru')
    def rule_weekdays_flow(lang):
        L = '[ru] '
        s = Session(lang, data=d8()); pg = s.pg
        s.tab('tasks')
        pg.click('[data-fold="recurring"] .foldhead') if pg.locator('[data-fold="recurring"] .foldhead').count() else None
        pg.click('#main [data-action="series.new"]'); s.wait_sheet()
        check(L + 'Новое правило: дни недели видны для «недель», ни один не отмечен', pg.is_visible('#sheet-root .wdays') and pg.locator('#sheet-root .wday input:checked').count() == 0)
        pg.fill('#sheet-root input[name=title]', 'Бассейн')
        pg.select_option('#sheet-root select[name=kind]', 'event')
        pg.fill('#sheet-root input[name=startDate]', '2026-10-13')
        pg.fill('#sheet-root input[name=time]', '07:30')
        pg.locator('#sheet-root .wday', has_text='Вт').click(); pg.locator('#sheet-root .wday', has_text='Пт').click()
        pg.click('#sheet-root form[data-form="series.add"] button[type=submit]'); pg.wait_for_timeout(100)
        d = s.doc(); sr = d['series'][0]
        check(L + 'Правило: события по вт и пт', sr.get('kind') == 'event' and sr.get('days') == [2, 5], json.dumps(sr, ensure_ascii=False)[:200])
        starts = sorted(e['start'] for e in d['events'] if not e['deletedAt'] and e['title'] == 'Бассейн')[:4]
        check(L + 'Первые события: вт 13, пт 16, вт 20, пт 23', starts == ['2026-10-13T07:30', '2026-10-16T07:30', '2026-10-20T07:30', '2026-10-23T07:30'], str(starts))
        check(L + 'В списке правил: «каждую неделю: вт, пт»', 'каждую неделю: вт, пт' in s.text())
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== audit (Russian, light and dark)
    OVERFLOW_JS = """() => { const bad = []; const W = document.documentElement.clientWidth;
      for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) continue;
        if (el.closest('[hidden]') || el.closest('.scrim')) continue;
        if (el.matches('.wday input')) continue;
        if (r.right > W + 1 || r.left < -1) bad.push(el.tagName.toLowerCase() + '.' + el.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
      }
      return bad.slice(0, 6); }"""

    @flow('light', 'dark')
    def audit8_flow(theme):
        for W in (390, 320):
            L = f'[ru/{theme}/{W}] '
            s = Session('ru', theme=theme, data=d8(events=[ev('e1', 'Иконопись урок', '2026-10-12T18:00', '2026-10-12T20:00')], tasks=[task('n1', 'Полить цветы')])); pg = s.pg
            if W != 390: pg.set_viewport_size({'width': W, 'height': 640}); pg.wait_for_timeout(150)
            def look(name):
                bad = pg.evaluate(CONTRAST_JS)
                check(L + f'Контраст ≥ 4.5:1: {name}', not bad, '; '.join(bad[:4]))
                ov = pg.evaluate(OVERFLOW_JS)
                check(L + f'Ничего не вылезает за экран: {name}', not ov and pg.evaluate('document.documentElement.scrollWidth') <= W, '; '.join(ov))
                pg.screenshot(path=os.path.join(SHOTS, f'v8-{theme}-{W}-{name}.png'), full_page=False)
            s.fab(); look('quick-today')
            pg.click('#sheet-root [data-action="quick.day"][data-v="1"]'); pg.wait_for_timeout(60); look('quick-tomorrow'); s.close_sheet()
            s.tab('calendar'); open_event(s, '2026-10-12', 'Иконопись урок'); look('event-sheet')
            pg.click('#sheet-root [data-action="repeat.open"]'); s.wait_sheet(); look('repeat-sheet')
            pg.locator('#sheet-root .wday', has_text='Чт').click()
            pg.click('#sheet-root form[data-form="repeat.save"] button[type=submit]'); pg.wait_for_timeout(100); look('event-repeats')
            pg.click('#sheet-root [data-action="edit.open"][data-kind="series"]'); s.wait_sheet(); look('rule-editor')
            s.close_sheet(); s.tab('tasks'); s.open_title('Полить цветы'); look('task-edit')
            s.close_sheet()
            check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
            s.close()

    # =============================================================== offline: the new module is cached
    @flow()
    def offline8_flow():
        s = Session('ru', data=d8()); pg = s.pg
        pg.evaluate('navigator.serviceWorker.ready')
        s.reload(); pg.wait_for_function('() => !!navigator.serviceWorker.controller', timeout=10000)
        names = pg.evaluate("caches.keys()")
        urls = pg.evaluate("caches.open(%s).then(c => c.keys()).then(ks => ks.map(k => new URL(k.url).pathname))" % json.dumps(names[-1] if names else ''))
        check('Офлайн: i18n-v8.js в кэше', '/i18n-v8.js' in urls, str(urls)[:200])
        ver = pg.evaluate("import('./version.js').then(m => m.APP_VERSION)")
        check('Офлайн: в кэше текущая версия приложения', any(ver in n for n in names), f'{ver} {names}')
        s.ctx.set_offline(True)
        s.reload(); s.fab()
        check('Офлайн: «Новые дела» с «Завтра» открываются без сети', pg.locator('#sheet-root .seg').count() == 1)
        s.ctx.set_offline(False)
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
print(f'E2E-V8: {passed}/{len(results)} checks passed')
for name, ok, detail in results:
    print(('  ✓ ' if ok else '  ✗ ') + name + (f'  — {detail}' if detail and not ok else ''))
json.dump([{'name': n, 'ok': o, 'detail': d} for n, o, d in results], open(os.path.join(OUT, 'e2e-v8-results.json'), 'w'), ensure_ascii=False, indent=1)
sys.exit(0 if passed == len(results) else 1)
