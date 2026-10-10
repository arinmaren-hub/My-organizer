"""OBSOLETE since 0.5.0: this suite drives the 0.4.0 screens (six tabs, inline forms). Run it only against a 0.4.0 copy of the app;
for 0.5.0 use e2e-v5-test.py (and e2e-test.py, privacy-test.py, upgrade-test.py)."""
import os
"""Browser tests for the features added in 0.4.0 (headless Chromium, iPhone-sized screen).
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
    'ru': {'cal_month': 'Октябрь 2026', 'wd': 'Пн', 'sun': 'Вс'},
    'en': {'cal_month': 'October 2026', 'wd': 'Mon', 'sun': 'Sun'},
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
            self.pg.clock.set_fixed_time(when)
            self.pg.goto(BASE + 'tests.css')
            init = {'organizer:language': lang}
            if theme: init['organizer:appearance'] = theme
            if data is not None: init['organizer:data'] = json.dumps(data)
            if device is not None: init['organizer:device'] = json.dumps(device)
            for k, v in init.items():
                self.pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [k, v])
            self.pg.goto(BASE)
            self.pg.wait_for_function('window.__organizerReady === true', timeout=10000)
            if data is None:
                self.pg.click('[data-action="onboarding.skip"]')
                self.pg.wait_for_selector('nav button')
        def at(self, iso):
            self.pg.clock.set_fixed_time(iso)
            self.pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        def reload(self):
            self.pg.reload(); self.pg.wait_for_function('window.__organizerReady === true', timeout=10000)
        def doc(self):
            return self.pg.evaluate("JSON.parse(localStorage.getItem('organizer:data') || 'null')")
        def device(self):
            return self.pg.evaluate("JSON.parse(localStorage.getItem('organizer:device') || '{}')")
        def tab(self, name):
            self.pg.click(f'nav [data-tab="{name}"]')
        def text(self):
            return self.pg.inner_text('main')
        def close(self):
            self.ctx.close()

    def flow(name):
        def deco(fn):
            def run():
                try:
                    fn()
                except Exception as e:
                    results.append((name + ' — ИСКЛЮЧЕНИЕ', False, str(e).splitlines()[0]))
                    traceback.print_exc()
            return run
        return deco

    # =============================================================== quick entry & editing
    def quick_flow(lang):
        L = f'[{lang}] '
        s = Session(lang)
        pg = s.pg
        form = 'form[data-form="task.quickAdd"]'
        if lang == 'ru':
            pg.fill(form + ' textarea', 'купить молоко завтра\nсдать отчёт до пятницы\nпросто дело')
        else:
            pg.fill(form + ' textarea', 'buy milk tomorrow\nsubmit report by friday\nplain thing')
        pg.click(form + ' button[type=submit]')
        d = s.doc()
        by = {t['title']: t for t in d['tasks']}
        titles = list(by)
        check(L + 'Быстрый ввод: 3 строки → 3 задачи, даты из текста убраны из названий', len(d['tasks']) == 3 and ('купить молоко' in titles or 'buy milk' in titles), str(titles))
        milk = by.get('купить молоко') or by.get('buy milk')
        rep = by.get('сдать отчёт') or by.get('submit report')
        check(L + 'Быстрый ввод: «завтра» → день 2026-10-10', milk and milk['plan'] == {'kind': 'day', 'date': '2026-10-10'}, str(milk and milk['plan']))
        check(L + 'Быстрый ввод: «до пятницы» → дедлайн 2026-10-16, задача без даты', rep and rep['deadline'] == '2026-10-16' and rep['plan']['kind'] == 'none', str(rep))
        check(L + 'Быстрый ввод: только название достаточно', by.get('просто дело') or by.get('plain thing'))
        check(L + 'Быстрый ввод: сообщение о распознанной дате', pg.locator('.banner.info').count() >= 1)
        # a time → ask
        pg.fill(form + ' textarea', 'встреча завтра в 15:30\nвторая строка' if lang == 'ru' else 'meeting tomorrow at 3:30pm\nsecond line')
        pg.click(form + ' button[type=submit]')
        check(L + 'Время → вопрос «задача или событие»', pg.locator('[data-action="quick.asEvent"]').count() == 1 and pg.locator('[data-action="quick.asTask"]').count() == 1)
        check(L + 'Вопрос: текст не потерян, пока нет ответа', 'втор' in pg.input_value(form + ' textarea') or 'second' in pg.input_value(form + ' textarea'))
        n_before = len(s.doc()['tasks'])
        pg.click('[data-action="quick.asEvent"]')
        d = s.doc()
        ev = d['events']
        check(L + 'Событие создано на завтра в 15:30', len(ev) == 1 and ev[0]['start'] == '2026-10-10T15:30', str(ev))
        check(L + 'Остальные строки добавлены после ответа', len(d['tasks']) == n_before + 1 and pg.input_value(form + ' textarea') == '')
        pg.fill(form + ' textarea', 'позвонить в 9:00' if lang == 'ru' else 'call at 9:00')
        pg.click(form + ' button[type=submit]')
        pg.click('[data-action="quick.asTask"]')
        t9 = [t for t in s.doc()['tasks'] if t['time'] == '09:00']
        check(L + 'Ответ «Задача»: задача со временем на сегодня', len(t9) == 1 and t9[0]['plan'] == {'kind': 'day', 'date': '2026-10-09'}, str(t9))
        # regression: editing the text while the question is open must not remove the wrong line
        ev0, tk0 = len(s.doc()['events']), len(s.doc()['tasks'])
        pg.fill(form + ' textarea', 'ужин в 19:00\nпервая обычная' if lang == 'ru' else 'dinner at 7pm\nfirst plain')
        pg.click(form + ' button[type=submit]')
        check(L + 'Правка текста: вопрос появился', pg.locator('[data-action="quick.asEvent"]').count() == 1)
        pg.fill(form + ' textarea', ('сначала новая\n' if lang == 'ru' else 'brand new first\n') + ('ужин в 19:00\nпервая обычная' if lang == 'ru' else 'dinner at 7pm\nfirst plain'))
        check(L + 'Правка текста: вопрос снят, ничего не добавлено и не стёрто', pg.locator('[data-action="quick.asEvent"]').count() == 0 and len(s.doc()['events']) == ev0 and len(s.doc()['tasks']) == tk0)
        pg.click(form + ' button[type=submit]')
        pg.click('[data-action="quick.asEvent"]')
        d = s.doc()
        titles = [t['title'] for t in d['tasks']]
        check(L + 'Правка текста: все три строки обработаны, ни одна не потеряна и не задвоена',
              len(d['events']) == ev0 + 1 and len(d['tasks']) == tk0 + 2 and sum(('нов' in x or 'brand' in x) for x in titles) == 1 and sum(('первая' in x or 'first plain' in x) for x in titles) == 1 and pg.input_value(form + ' textarea') == '', str(titles))
        pg.fill(form + ' textarea', 'ужин в 19:00')
        pg.click(form + ' button[type=submit]')
        pg.click('[data-action="quick.askCancel"]')
        check(L + 'Отмена вопроса: ничего не добавлено, текст остался', pg.input_value(form + ' textarea') == 'ужин в 19:00' and not [t for t in s.doc()['tasks'] if 'ужин' in t['title']])
        # editing a task
        pg.fill(form + ' textarea', '')
        s.tab('tasks')
        row = pg.locator('.row', has_text='просто дело' if lang == 'ru' else 'plain thing').first
        row.locator('[data-action="edit.open"]').click()
        ef = 'form[data-form="task.edit"]'
        pg.fill(ef + ' input[name=title]', 'Изменённое дело')
        pg.select_option(ef + ' select[name=kind]', 'day')
        check(L + 'Правка: поле даты и времени появляются для «На день»', pg.is_visible(ef + ' input[name=date]') and pg.is_visible(ef + ' input[name=time]'))
        pg.fill(ef + ' input[name=date]', '2026-10-20'); pg.fill(ef + ' input[name=time]', '08:45'); pg.fill(ef + ' input[name=deadline]', '2026-10-25')
        pg.click(ef + ' button[type=submit]')
        t = [t for t in s.doc()['tasks'] if t['title'] == 'Изменённое дело']
        check(L + 'Правка: название, день, время и дедлайн сохранены', len(t) == 1 and t[0]['plan']['date'] == '2026-10-20' and t[0]['time'] == '08:45' and t[0]['deadline'] == '2026-10-25', str(t))
        check(L + 'Правка: форма закрылась', pg.locator(ef).count() == 0)
        # moving keeps the deadline
        pg.click('.row:has-text("Изменённое дело") details.datepick summary')
        pg.fill('.row:has-text("Изменённое дело") form[data-form="task.moveDate"] input[name=date]', '2026-11-02')
        pg.click('.row:has-text("Изменённое дело") form[data-form="task.moveDate"] button')
        t = [t for t in s.doc()['tasks'] if t['title'] == 'Изменённое дело'][0]
        check(L + 'Перенос на другую дату не меняет дедлайн', t['plan']['date'] == '2026-11-02' and t['deadline'] == '2026-10-25', str(t))
        # cancel edit
        pg.locator('.row', has_text='Изменённое дело').locator('[data-action="edit.open"]').click()
        pg.fill(ef + ' input[name=title]', 'не сохранять')
        pg.click('[data-action="edit.cancel"]')
        check(L + 'Отмена правки ничего не меняет', 'не сохранять' not in s.text() and 'Изменённое дело' in s.text())
        # empty title rejected
        pg.locator('.row', has_text='Изменённое дело').locator('[data-action="edit.open"]').click()
        pg.fill(ef + ' input[name=title]', '   ')
        pg.evaluate("document.querySelector('form[data-form=\"task.edit\"] input[name=title]').removeAttribute('required')")
        pg.click(ef + ' button[type=submit]')
        check(L + 'Правка: пустое название отклонено с сообщением, данные целы', pg.locator('.banner.error').count() >= 1 and [t for t in s.doc()['tasks'] if t['title'] == 'Изменённое дело'])
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== calendar
    def calendar_flow(lang):
        L = f'[{lang}] '
        d = doc4(tasks=[task('c1', 'Задача 10-го', 'day', '2026-10-10', deadline='2026-10-14'), task('c2', 'Задача недели', 'week', '2026-10-05')],
                 events=[event('ce1', 'Лекция', '2026-10-10T10:00'), event('ce2', 'Экзамен', '2026-10-14T09:00')])
        s = Session(lang, data=d)
        pg = s.pg
        s.tab('calendar')
        S = STR[lang]
        check(L + 'Календарь: заголовок месяца', S['cal_month'] in pg.inner_text('.cal-title'), pg.inner_text('.cal-title'))
        heads = pg.locator('.cal-grid .wd').all_inner_texts()
        check(L + 'Календарь: неделя начинается с понедельника', heads[0] == S['wd'] and heads[6] == S['sun'], str(heads))
        days = pg.locator('.cal-grid button.day')
        check(L + 'Календарь: сетка из целых недель (35 клеток для октября 2026)', days.count() == 35, str(days.count()))
        first = pg.locator('.cal-grid button.day').first.get_attribute('data-date')
        check(L + 'Календарь: первая клетка — понедельник 28 сентября', first == '2026-09-28', first)
        check(L + 'Календарь: сегодня отмечено', pg.locator('.cal-grid button.day.today').get_attribute('data-date') == '2026-10-09')
        check(L + 'Календарь: выбран сегодняшний день', pg.locator('.cal-grid button.day.sel').get_attribute('data-date') == '2026-10-09')
        c10 = pg.locator('.cal-grid button[data-date="2026-10-10"]')
        check(L + 'Календарь: значки у дня с событием и задачей', c10.locator('.mk.ev').count() == 1 and c10.locator('.mk.tk').count() == 1)
        check(L + 'Календарь: значок дедлайна 14-го', pg.locator('.cal-grid button[data-date="2026-10-14"] .mk.dl').count() == 1)
        check(L + 'Календарь: у пустого дня нет значков', pg.locator('.cal-grid button[data-date="2026-10-20"] .mk').count() == 0)
        check(L + 'Календарь: подпись клетки для экрана чтения содержит число задач и событий', '1' in (c10.get_attribute('aria-label') or ''), c10.get_attribute('aria-label'))
        c10.click()
        panel = pg.inner_text('#day-panel')
        check(L + 'День: показаны событие и задача выбранной даты', 'Лекция' in panel and 'Задача 10-го' in panel, panel[:120])
        check(L + 'День: задачи недели доступны', pg.locator('#day-panel details summary').count() >= 1)
        pg.locator('.cal-grid button[data-date="2026-10-14"]').click()
        check(L + 'День: дедлайн и событие 14-го', 'Задача 10-го' in pg.inner_text('#day-panel') and 'Экзамен' in pg.inner_text('#day-panel'))
        # add task / event to selected date
        pg.locator('.cal-grid button[data-date="2026-10-16"]').click()
        pg.fill('form[data-form="cal.add"] input[name=title]', 'Новая задача 16')
        pg.click('form[data-form="cal.add"] button[value=task]')
        t = [t for t in s.doc()['tasks'] if t['title'] == 'Новая задача 16']
        check(L + 'Календарь: задача добавлена на выбранную дату', len(t) == 1 and t[0]['plan'] == {'kind': 'day', 'date': '2026-10-16'}, str(t))
        check(L + 'Календарь: после добавления выбранная дата осталась', pg.locator('.cal-grid button.day.sel').get_attribute('data-date') == '2026-10-16')
        pg.fill('form[data-form="cal.add"] input[name=title]', 'Приём у врача')
        pg.click('form[data-form="cal.add"] button[value=event]')
        check(L + 'Календарь: событие без времени отклонено с сообщением', pg.locator('.banner.error').count() >= 1 and not [e for e in s.doc()['events'] if e['title'] == 'Приём у врача'])
        pg.fill('form[data-form="cal.add"] input[name=title]', 'Приём у врача')
        pg.fill('form[data-form="cal.add"] input[name=time]', '11:20')
        pg.click('form[data-form="cal.add"] button[value=event]')
        ev = [e for e in s.doc()['events'] if e['title'] == 'Приём у врача']
        check(L + 'Календарь: событие со временем добавлено', len(ev) == 1 and ev[0]['start'] == '2026-10-16T11:20', str(ev))
        check(L + 'Календарь: у 16-го появились значки', pg.locator('.cal-grid button[data-date="2026-10-16"] .mk.ev').count() == 1 and pg.locator('.cal-grid button[data-date="2026-10-16"] .mk.tk').count() == 1)
        # navigation
        pg.click('[data-action="cal.next"]')
        check(L + 'Календарь: следующий месяц — ноябрь', ('Ноябрь 2026' if lang == 'ru' else 'November 2026') in pg.inner_text('.cal-title'))
        check(L + 'Календарь: выбранная дата перешла на 16 ноября', pg.locator('.cal-grid button.day.sel').get_attribute('data-date') == '2026-11-16')
        pg.click('[data-action="cal.prev"]'); pg.click('[data-action="cal.prev"]')
        check(L + 'Календарь: предыдущий месяц — сентябрь', ('Сентябрь 2026' if lang == 'ru' else 'September 2026') in pg.inner_text('.cal-title'))
        # picker: Feb 2028 (leap year)
        pg.click('[data-action="cal.pickToggle"]')
        pg.select_option('form[data-form="cal.go"] select[name=m]', '2'); pg.fill('form[data-form="cal.go"] input[name=y]', '2028')
        pg.click('form[data-form="cal.go"] button[type=submit]')
        check(L + 'Быстрый выбор: февраль 2028', ('Февраль 2028' if lang == 'ru' else 'February 2028') in pg.inner_text('.cal-title'))
        check(L + 'Февраль 2028 (високосный): есть 29 февраля', pg.locator('.cal-grid button[data-date="2028-02-29"]').count() == 1 and pg.locator('.cal-grid button[data-date="2028-03-01"]').count() == 1)
        pg.fill('form[data-form="cal.go"] input[name=y]', '2027') if pg.locator('form[data-form="cal.go"]').count() else None
        # year view
        pg.click('[data-action="cal.today"]')
        check(L + 'Кнопка «Сегодня» возвращает к октябрю 2026', S['cal_month'] in pg.inner_text('.cal-title'))
        pg.click('[data-action="cal.mode"][data-mode="year"]')
        check(L + 'Годовой вид: 12 месяцев', pg.locator('.mini-month').count() == 12)
        check(L + 'Годовой вид: заполненные дни выделены', pg.locator('.mini-month[data-m="10"] .mini.has').count() >= 3)
        pg.click('[data-action="cal.nextYear"]')
        check(L + 'Годовой вид: следующий год', '2027' in pg.inner_text('.cal-title'))
        pg.click('[data-action="cal.prevYear"]')
        pg.click('.mini-month[data-m="10"]')
        check(L + 'Нажатие на месяц в годовом виде открывает месяц', S['cal_month'] in pg.inner_text('.cal-title') and pg.locator('.cal-grid').count() == 1)
        check(L + 'Нет горизонтальной прокрутки', pg.evaluate('document.documentElement.scrollWidth') <= 390)
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== calendar date vs planning day
    def planday_flow():
        d = doc4(cutoff='04:00', tasks=[task('p1', 'На пятницу', 'day', '2026-10-09')])
        s = Session('ru', data=d, when='2026-10-10T01:30:00+03:00')
        pg = s.pg
        check('[ru] Плановый день: в 01:30 субботы «Сегодня» — ещё пятница', 'Сегодня · пт, 9 окт' in s.text(), s.text()[:200])
        s.tab('calendar')
        check('[ru] Календарь по настоящим датам: сегодня — суббота 10 октября', pg.locator('.cal-grid button.day.today').get_attribute('data-date') == '2026-10-10')
        check('[ru] Календарь: плановый день (пятница) отмечен отдельно', pg.locator('.cal-grid button.day.planning').get_attribute('data-date') == '2026-10-09')
        pg.click('.cal-grid button[data-date="2026-10-09"]')
        check('[ru] Календарь: подпись «ваш плановый день»', 'плановый день' in pg.inner_text('#day-panel'))
        s.close()

    # =============================================================== reviews & evening
    def review_flow(lang):
        L = f'[{lang}] '
        d = doc4(tasks=[task('r1', 'Вчерашняя', 'day', '2026-10-08', deadline='2026-10-30'), task('r2', 'Давняя', 'day', '2026-10-07'),
                        task('r3', 'Прошлая неделя', 'week', '2026-09-28'), task('r4', 'Сегодняшняя', 'day', '2026-10-09')],
                 evening={"enabled": True, "time": "21:30"})
        s = Session(lang, data=d, when='2026-10-09T09:00:00+03:00')
        pg = s.pg
        card = 'section.review'
        check(L + 'Утро: разбор показывает дневные и недельные задачи прошлого', pg.locator(card + ' .row').count() == 3, str(pg.locator(card + ' .row').count()))
        check(L + 'Утро: сегодняшняя задача в разбор не попала', 'Сегодняшняя' not in pg.inner_text(card))
        snap = json.dumps(s.doc()['tasks'])
        pg.wait_for_timeout(300)
        check(L + 'Ничего не перенеслось само', json.dumps(s.doc()['tasks']) == snap)
        row = lambda title: pg.locator(card + ' .row', has_text=title)
        row('Вчерашняя').locator('[data-choice="today"]').click()
        t = [t for t in s.doc()['tasks'] if t['id'] == 'r1'][0]
        check(L + 'Утро «Сегодня»: перенос, дедлайн цел, решение запомнено', t['plan']['date'] == '2026-10-09' and t['deadline'] == '2026-10-30' and t['review'] == {'day': '2026-10-09', 'choice': 'moved', 'part': 'am'}, str(t))
        row('Давняя').locator('[data-choice="keep"]').click()
        check(L + 'Утро «Оставить»: задача осталась видимой (в «Уже разобрано»)', 'Давняя' in pg.inner_text('main') and 'Давняя' not in (pg.inner_text(card) if pg.locator(card).count() else ''))
        row('Прошлая неделя').locator('[data-choice="none"]').click()
        t = [t for t in s.doc()['tasks'] if t['id'] == 'r3'][0]
        check(L + 'Утро «Без даты»: плановая дата снята', t['plan']['kind'] == 'none')
        check(L + 'Утро: после решений вопросов не осталось, карточка вопросов исчезла', pg.locator(card).count() == 0)
        # evening
        s.at('2026-10-09T21:00:00+03:00')
        pg.click('[data-action="evening.open"]')
        check(L + 'Вечер открывается вручную в любое время', pg.locator('[data-action="evening.close"]').count() == 1)
        ev = pg.inner_text('main')
        check(L + 'Вечер: сегодняшняя и оставленная задачи в списке', 'Сегодняшняя' in ev and 'Вчерашняя' in ev)
        pg.locator(card + ' .row', has_text='Сегодняшняя').locator('[data-choice="keep"]').click()
        pg.locator(card + ' .row', has_text='Вчерашняя').locator('[data-choice="tomorrow"]').click()
        check(L + 'Вечер: утреннее «Оставить» не глушит вечерний вопрос', 'Давняя' in pg.inner_text(card))
        pg.locator(card + ' .row', has_text='Давняя').locator('[data-choice="keep"]').click()
        t = {t['id']: t for t in s.doc()['tasks']}
        check(L + 'Вечер «На завтра»: 10 октября, дедлайн цел', t['r1']['plan']['date'] == '2026-10-10' and t['r1']['deadline'] == '2026-10-30')
        check(L + 'Вечер «Оставить»: запомнено на 9 октября', t['r4']['review'] == {'day': '2026-10-09', 'choice': 'kept', 'part': 'pm'})
        check(L + 'Вечер: повторно не спрашивают (карточка вопросов исчезла), задача видна в «Уже разобрано»', pg.locator(card).count() == 0 and 'Сегодняшняя' in pg.inner_text('main'))
        check(L + 'Вечер: завтра показана перенесённая задача', 'Вчерашняя' in pg.inner_text('main'))
        # next morning
        pg.click('[data-action="evening.close"]')
        s.at('2026-10-10T08:00:00+03:00')
        s.reload()
        check(L + 'Утро следующего дня: оставленное вечером не спрашивают', pg.locator('section.review').count() == 0, pg.inner_text('main')[:200])
        check(L + 'Утро следующего дня: но задача видна в «Уже разобрано»', 'Сегодняшняя' in pg.inner_text('main'))
        pg.locator('.row', has_text='Сегодняшняя').locator('[data-choice="done"]').click()
        check(L + 'Из «Уже разобрано» можно решить заново — «Готово»', [t for t in s.doc()['tasks'] if t['id'] == 'r4'][0]['done'] is True)
        # all-to-tomorrow with confirmation
        d2 = s.doc()
        d2['tasks'] += [task('r5', 'A', 'day', '2026-10-05'), task('r6', 'B', 'day', '2026-10-06')]
        pg.evaluate("d => localStorage.setItem('organizer:data', JSON.stringify(d))", d2); s.reload()
        n = len(s.dialogs)
        pg.click('[data-action="review.all"]')
        check(L + '«Всё на завтра» просит подтверждения с числом', len(s.dialogs) == n + 1 and '2' in s.dialogs[-1], s.dialogs[-1])
        tt = {t['id']: t for t in s.doc()['tasks']}
        check(L + '«Всё на завтра»: перенесены только показанные', tt['r5']['plan']['date'] == '2026-10-11' and tt['r6']['plan']['date'] == '2026-10-11' and tt['r2']['plan']['date'] == '2026-10-07', str({k: tt[k]['plan'] for k in ('r5', 'r6', 'r2')}))
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    def evening_auto_flow(lang):
        L = f'[{lang}] '
        d = doc4(tasks=[task('e1', 'Сегодня не сделано', 'day', '2026-10-09'), task('e2', 'Завтрашняя', 'day', '2026-10-10', time='09:00', deadline='2026-10-12')],
                 events=[event('ee1', 'Лекция', '2026-10-10T10:00')], evening={"enabled": True, "time": "21:30"})
        s = Session(lang, data=d, when='2026-10-09T20:00:00+03:00')
        pg = s.pg
        check(L + 'До выбранного времени вечер сам не открывается', pg.locator('[data-action="evening.close"]').count() == 0)
        s.at('2026-10-09T21:45:00+03:00')
        check(L + 'После выбранного времени вечер открывается сам (при открытом приложении)', pg.locator('[data-action="evening.close"]').count() == 1)
        txt = pg.inner_text('main')
        check(L + 'Вечер: события, задачи и дедлайны завтрашнего дня', 'Лекция' in txt and 'Завтрашняя' in txt and '09:00' in txt)
        check(L + 'Вечер: незавершённое за сегодня', 'Сегодня не сделано' in txt)
        check(L + 'Вечер: помечено, что работает только при открытом приложении', pg.locator('main p.muted').first.inner_text() != '')
        dev = s.device()
        check(L + 'Вечер: показан раз за день (память на устройстве)', dev.get('lastEveningPreviewShownFor') == '2026-10-10', str(dev))
        pg.click('[data-action="evening.close"]')
        s.at('2026-10-09T22:30:00+03:00')
        check(L + 'Второй раз за вечер не открывается', pg.locator('[data-action="evening.close"]').count() == 0)
        s.reload()
        check(L + 'После перезапуска приложения в тот же вечер — тоже нет', pg.locator('[data-action="evening.close"]').count() == 0)
        # quick add for tomorrow from the evening screen
        pg.click('[data-action="evening.open"]')
        pg.fill('form[data-form="evening.add"] input[name=title]', 'Добавлено вечером')
        pg.click('form[data-form="evening.add"] button[type=submit]')
        t = [t for t in s.doc()['tasks'] if t['title'] == 'Добавлено вечером']
        check(L + 'Вечер: быстрое добавление на завтра', len(t) == 1 and t[0]['plan'] == {'kind': 'day', 'date': '2026-10-10'})
        pg.locator('.row', has_text='Добавлено вечером').locator('[data-action="edit.open"]').click()
        check(L + 'Вечер: задачи завтрашнего дня можно править', pg.locator('form[data-form="task.edit"]').count() == 1)
        pg.click('[data-action="edit.cancel"]')
        # settings
        pg.click('#settings-btn')
        pg.fill('form[data-form="evening.save"] input[name=time]', '20:15')
        pg.click('form[data-form="evening.save"] button[type=submit]')
        check(L + 'Настройки: время вечернего обзора сохраняется', s.doc()['settings']['eveningPreview'] == {'enabled': True, 'time': '20:15'}, str(s.doc()['settings']['eveningPreview']))
        pg.uncheck('form[data-form="evening.save"] input[name=enabled]')
        pg.click('form[data-form="evening.save"] button[type=submit]')
        check(L + 'Настройки: обзор можно выключить', s.doc()['settings']['eveningPreview']['enabled'] is False)
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    def evening_planday_flow():
        d = doc4(cutoff='04:00', tasks=[task('x1', 'Пятничная', 'day', '2026-10-09')], evening={"enabled": True, "time": "21:30"})
        s = Session('ru', data=d, when='2026-10-10T01:30:00+03:00')
        check('[ru] Вечер по личному дню: в 01:30 субботы (отбой 04:00) обзор открывается', s.pg.locator('[data-action="evening.close"]').count() == 1)
        check('[ru] Вечер по личному дню: заголовок — пятница', 'пт, 9 окт' in s.pg.inner_text('main section:first-of-type h2'), s.pg.inner_text('main section:first-of-type h2'))
        s.close()

    # =============================================================== waiting
    def waiting_flow(lang):
        L = f'[{lang}] '
        s = Session(lang)
        pg = s.pg
        form = 'form[data-form="wait.add"]'
        pg.fill(form + ' input[name=title]', 'Ответ от декана')
        pg.fill(form + ' input[name=from]', 'Иванов')
        pg.fill(form + ' input[name=followUp]', '2026-10-09')
        pg.click(form + ' button[type=submit]')
        w = s.doc()['waiting']
        check(L + 'Ожидание: добавлено с «от кого» и датой напоминания', len(w) == 1 and w[0]['from'] == 'Иванов' and w[0]['followUp'] == '2026-10-09', str(w))
        pg.fill(form + ' input[name=title]', 'Посылка')
        pg.click(form + ' button[type=submit]')
        check(L + 'Ожидание: достаточно названия', len(s.doc()['waiting']) == 2 and s.doc()['waiting'][1]['followUp'] is None)
        sections = pg.locator('main > section.card')
        check(L + 'Ожидание: раздел самый нижний на «Сегодня»', sections.last.get_attribute('id') == 'waiting-section')
        first_h = pg.locator('main > section.card.review h2')
        check(L + 'Напоминание в приложении: карточка наверху, когда срок наступил', first_h.count() == 1 and 'Ответ от декана' in pg.inner_text('main > section.card.review'))
        check(L + 'Ожидание не превратилось в задачу и не просрочено', len(s.doc()['tasks']) == 0)
        pg.click('main > section.card.review [data-action="wait.again"][data-days="3"]')
        check(L + '«Проверить через 3 дня»: напоминание ушло, дата сдвинута', pg.locator('main > section.card.review').count() == 0 and s.doc()['waiting'][0]['followUp'] == '2026-10-12', str(s.doc()['waiting'][0]))
        s.at('2026-10-13T09:00:00+03:00')
        check(L + 'Через несколько дней напоминание появляется снова', pg.locator('main > section.card.review').count() == 1)
        pg.locator('main > section.card.review [data-action="wait.toTask"]').click()
        d = s.doc()
        check(L + '«Нужно действие»: появилась задача на сегодня, ожидание решено и связано', len(d['tasks']) == 1 and d['tasks'][0]['plan']['date'] == '2026-10-13' and d['waiting'][0]['resolved'] and d['waiting'][0]['taskId'] == d['tasks'][0]['id'], str(d['waiting'][0]))
        pg.locator('#waiting-section .row', has_text='Посылка').locator('[data-action="wait.resolve"]').click()
        check(L + '«Решено»: скрыто из активных, но сохранено', s.doc()['waiting'][1]['resolved'] is True and 'Посылка' in pg.text_content('#waiting-section details'))
        pg.locator('#waiting-section details summary').click()
        pg.locator('#waiting-section details .row', has_text='Посылка').locator('[data-action="wait.reopen"]').click()
        check(L + 'Решённое можно вернуть в ожидание', s.doc()['waiting'][1]['resolved'] is False)
        pg.locator('#waiting-section .row:visible', has_text='Посылка').locator('[data-action="edit.open"]').first.click()
        pg.fill('form[data-form="waiting.edit"] input[name=note]', 'заметка')
        pg.click('form[data-form="waiting.edit"] button[type=submit]')
        check(L + 'Ожидание можно править', [w for w in s.doc()['waiting'] if w['title'] == 'Посылка'][0]['note'] == 'заметка')
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== recurring
    def recurring_flow(lang):
        L = f'[{lang}] '
        s = Session(lang)
        pg = s.pg
        s.tab('tasks')
        pg.click('main details:has(form[data-form="series.add"]) > summary')
        f = 'form[data-form="series.add"]'
        # fixed weekly series started two weeks ago → unconfirmed repeats, never marked missed
        pg.fill(f + ' input[name=title]', 'Зал')
        pg.fill(f + ' input[name=interval]', '1'); pg.select_option(f + ' select[name=freq]', 'weekly'); pg.select_option(f + ' select[name=mode]', 'fixed')
        pg.fill(f + ' input[name=startDate]', '2026-09-25')
        pg.click(f + ' button[type=submit]')
        ser = s.doc()['series']
        occ = [t for t in s.doc()['tasks'] if t['seriesId']]
        check(L + 'Повтор по расписанию: серия создана, повторы 25.09, 02.10, 09.10', len(ser) == 1 and sorted(t['occurrenceDate'] for t in occ) == ['2026-09-25', '2026-10-02', '2026-10-09'], str(sorted(t['occurrenceDate'] for t in occ)))
        check(L + 'Повторы не отмечены сделанными или пропущенными сами', all(not t['done'] and not t['skipped'] for t in occ))
        s.tab('today')
        card = pg.locator('main > section.card.review', has_text='↻')
        check(L + 'Сегодня: карточка «Повторы без подтверждения» (2 шт.), обычного «Утреннего разбора» нет', card.locator('.row').count() == 2 and 'Зал' in card.inner_text())
        card.locator('.row').first.locator('[data-how="doneThen"]').click()
        t0 = [t for t in s.doc()['tasks'] if t['occurrenceDate'] == '2026-09-25'][0]
        check(L + '«Сделано в тот день»: день выполнения = день повтора', t0['done'] and t0['doneDay'] == '2026-09-25')
        pg.locator('main > section.card.review .row').first.locator('[data-how="skip"]').click()
        t1 = [t for t in s.doc()['tasks'] if t['occurrenceDate'] == '2026-10-02'][0]
        check(L + '«Пропустить»: помечено только по вашему нажатию, запись сохранена', t1['skipped'] and not t1['done'])
        check(L + 'Карточка подтверждения исчезла, сегодняшний повтор остался задачей', pg.locator('main > section.card.review', has_text='↻').count() == 0 and 'Зал' in pg.inner_text('main'))
        # closed for 3 weeks: more repeats appear, still unconfirmed
        s.at('2026-10-30T09:00:00+03:00')
        occ = sorted(t['occurrenceDate'] for t in s.doc()['tasks'] if t['seriesId'] and not t['done'] and not t['skipped'])
        check(L + 'Приложение было закрыто: новые повторы 16.10, 23.10, 30.10 ждут подтверждения', occ == ['2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30'], str(occ))
        s.at('2026-10-30T09:00:30+03:00')
        check(L + 'Повторный запуск не создаёт дублей', len([t for t in s.doc()['tasks'] if t['seriesId']]) == 6, str(len([t for t in s.doc()['tasks'] if t['seriesId']])))
        s.reload()
        check(L + 'Перезапуск не создаёт дублей', len([t for t in s.doc()['tasks'] if t['seriesId']]) == 6)
        # completion-based
        s.tab('tasks')
        pg.click('main details:has(form[data-form="series.add"]) > summary')
        pg.fill(f + ' input[name=title]', 'Полить цветы')
        pg.fill(f + ' input[name=interval]', '3'); pg.select_option(f + ' select[name=freq]', 'daily'); pg.select_option(f + ' select[name=mode]', 'completion')
        pg.fill(f + ' input[name=startDate]', '2026-10-30')
        pg.click(f + ' button[type=submit]')
        pg.locator('.row', has_text='Полить цветы').locator('input[type=checkbox]').first.check()
        o = sorted((t['occurrenceDate'], t['done']) for t in s.doc()['tasks'] if t['title'] == 'Полить цветы')
        check(L + 'Повтор по выполнению: следующий через 3 дня после выполнения (02.11)', o == [('2026-10-30', True), ('2026-11-02', False)], str(o))
        check(L + 'История серии видна', pg.locator('details', has_text=('История' if lang == 'ru' else 'History')).count() >= 1)
        # edit & pause & delete
        pg.locator('.row', has_text='Полить цветы').locator('[data-action="edit.open"][data-kind="series"]').click()
        pg.fill('form[data-form="series.edit"] input[name=interval]', '5')
        pg.click('form[data-form="series.edit"] button[type=submit]')
        check(L + 'Правка серии: интервал 5', [x for x in s.doc()['series'] if x['title'] == 'Полить цветы'][0]['interval'] == 5)
        pg.locator('.row', has_text='Полить цветы').locator('[data-action="series.pause"]').click()
        check(L + 'Пауза серии', [x for x in s.doc()['series'] if x['title'] == 'Полить цветы'][0]['paused'] is True)
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== templates & lists
    def templates_flow(lang):
        L = f'[{lang}] '
        s = Session(lang)
        pg = s.pg
        s.tab('lists')
        names = pg.locator('#main [data-action="tpl.use"]').all_inner_texts()
        check(L + 'Шаблоны: есть Супермаркет и Чемодан', len(names) == 2 and any(('Супермаркет' if lang == 'ru' else 'Supermarket') in n for n in names) and any(('Чемодан' if lang == 'ru' else 'Suitcase') in n for n in names), str(names))
        check(L + 'Шаблоны: в данных ничего не сохраняется, пока их не меняют', s.doc()['templates'] == [])
        pg.locator('[data-action="tpl.use"]').first.click()
        lists = s.doc()['lists']
        check(L + 'Список из шаблона создан, все пункты без отметок', len(lists) == 1 and len(lists[0]['items']) > 10 and all(not i['done'] for i in lists[0]['items']))
        check(L + 'Пункты сгруппированы по категориям', pg.locator('.cathead').count() >= 5)
        pg.locator('section.card:has(h2:text-is("%s")) .row' % lists[0]['name']).first.locator('input[type=checkbox]').check()
        pg.locator('section.card:has(h2:text-is("%s")) .row' % lists[0]['name']).nth(1).locator('input[type=checkbox]').check()
        check(L + 'Отметки в списке ставятся', sum(i['done'] for i in s.doc()['lists'][0]['items']) == 2)
        check(L + 'Шаблон при этом не изменился (в данных по-прежнему пусто)', s.doc()['templates'] == [])
        pg.locator('[data-action="tpl.use"]').first.click()
        l2 = s.doc()['lists'][1]
        check(L + 'Второй список из шаблона снова без отметок', all(not i['done'] for i in l2['items']))
        # edit item in list
        card = 'section.card:has(h2:text-is("%s"))' % lists[0]['name']
        pg.locator(card + ' .row').first.locator('[data-action="edit.open"]').click()
        pg.fill('form[data-form="item.edit"] input[name=title]', 'Изменённый пункт')
        pg.click('form[data-form="item.edit"] button[type=submit]')
        check(L + 'Пункт списка можно править', any(i['title'] == 'Изменённый пункт' for i in s.doc()['lists'][0]['items']))
        pg.locator(card + ' .row', has_text='Изменённый пункт').locator('[data-action="item.delete"]').click()
        check(L + 'Пункт списка можно удалить (обратимо: запись остаётся с отметкой удаления)', [i for i in s.doc()['lists'][0]['items'] if i['title'] == 'Изменённый пункт'][0]['deletedAt'])
        # edit template (built-in -> own record)
        pg.locator('[data-action="tpl.edit"]').nth(1).click()
        ed = '#template-editor'
        pg.fill(ed + ' form[data-form="item.add"] input[name=title]', 'Зонт')
        pg.fill(ed + ' form[data-form="item.add"] input[name=category]', 'Другое' if lang == 'ru' else 'Other')
        pg.click(ed + ' form[data-form="item.add"] button[type=submit]')
        tpls = s.doc()['templates']
        check(L + 'Редактирование стандартного шаблона создаёт свою запись с основой', len(tpls) == 1 and tpls[0]['base'] == 'suitcase' and any(i['title'] == 'Зонт' for i in tpls[0]['items']), str([t['base'] for t in tpls]))
        check(L + 'Редактор остался открытым после создания записи', pg.locator(ed).count() == 1 and 'Зонт' in pg.inner_text(ed))
        check(L + 'Стандартный Чемодан не дублируется', pg.locator('[data-action="tpl.use"]').count() == 2)
        pg.fill(ed + ' form[data-form="cat.add"] input[name=name]', 'Моя категория')
        pg.click(ed + ' form[data-form="cat.add"] button[type=submit]')
        check(L + 'Категорию можно добавить', 'Моя категория' in s.doc()['templates'][0]['categories'])
        # own template, save list as template
        pg.click('[data-action="tpl.close"]')
        pg.fill('form[data-form="tpl.add"] input[name=name]', 'Дача')
        pg.click('form[data-form="tpl.add"] button[type=submit]')
        check(L + 'Свой шаблон создаётся', any(t['name'] == 'Дача' for t in s.doc()['templates']))
        pg.click('[data-action="tpl.close"]')
        pg.locator(card + ' [data-action="list.saveTemplate"]').first.click()
        saved = [t for t in s.doc()['templates'] if t['base'] is None and t['name'] == lists[0]['name']]
        check(L + '«Сохранить как шаблон»: пункты без отметок', len(saved) == 1 and all(not i['done'] for i in saved[0]['items']))
        # delete built-in, it must not reappear after reload; restore button
        n0 = pg.locator('[data-action="tpl.use"]').count()
        pg.locator('[data-action="tpl.delete"]').nth(0).click()
        s.reload(); s.tab('lists')
        check(L + 'Удалённый шаблон не возвращается после перезапуска', pg.locator('[data-action="tpl.use"]').count() == n0 - 1)
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        s.close()

    # =============================================================== upgrade from 0.3.0 data through the UI
    def upgrade_flow():
        v3 = {"schemaVersion": 3, "dataId": "old-org", "createdAt": NOWISO, "updatedAt": NOWISO,
              "tasks": [{k: v for k, v in task('o1', 'Старая задача', 'day', '2026-10-08', deadline='2026-10-20').items() if k not in ('review', 'seriesId', 'occurrenceDate', 'skipped', 'doneDay')}],
              "events": [event('oe1', 'Старое событие', '2026-10-09T10:00')], "projects": [], "lists": [{"id": "ol1", "name": "Старый список", "items": [{"id": "oi1", "title": "Пункт", "done": True, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}], "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}],
              "settings": {"eveningPreview": {"enabled": False, "time": "22:00"}, "day": {"wake": "08:00", "bed": "02:00", "cutoff": "02:00", "setupDone": True}}, "quarantine": []}
        raw = json.dumps(v3)
        s = Session('ru', data=v3, when='2026-10-09T12:00:00+03:00')
        d = s.doc()
        check('Обновление с 0.3.0: данные в формате 4, всё на месте', d['schemaVersion'] == 4 and d['dataId'] == 'old-org' and d['tasks'][0]['title'] == 'Старая задача' and d['tasks'][0]['deadline'] == '2026-10-20' and d['lists'][0]['items'][0]['done'] is True and d['events'][0]['title'] == 'Старое событие')
        check('Обновление с 0.3.0: настройки дня и вечера сохранены', d['settings']['day']['cutoff'] == '02:00' and d['settings']['eveningPreview']['time'] == '22:00')
        rb = s.pg.evaluate("JSON.parse(localStorage.getItem('organizer:rollback') || '[]')")
        check('Обновление с 0.3.0: исходный текст сохранён в копии «перед обновлением»', len(rb) == 1 and rb[0]['raw'] == json.dumps(v3) or (len(rb) == 1 and json.loads(rb[0]['raw']) == v3), str(len(rb)))
        check('Обновление с 0.3.0: старая задача в разборе, событие в расписании', 'Старая задача' in s.text() and 'Старое событие' in s.text())
        check('Обновление с 0.3.0: сообщение об обновлении формата', s.pg.locator('.banner.info').count() >= 1)
        s.close()

    # =============================================================== audit: contrast, overflow, errors, network
    def audit_flow(lang, theme):
        L = f'[{lang}/{theme}] '
        d = doc4(tasks=[task('a1', 'Вчерашняя', 'day', '2026-10-08', deadline='2026-10-30'), task('a2', 'Сегодняшняя', 'day', '2026-10-09', time='10:00'), task('a3', 'Неделя', 'week', '2026-10-05'),
                        task('a4', 'Повтор', 'day', '2026-10-02', seriesId='sr1', occurrenceDate='2026-10-02')],
                 events=[event('ae1', 'Лекция', '2026-10-09T10:00'), event('ae2', 'Экзамен', '2026-10-12T09:00')],
                 series=[{"id": "sr1", "title": "Повтор", "freq": "weekly", "interval": 1, "mode": "fixed", "startDate": "2026-09-25", "time": None, "paused": False, "generatedThrough": "2026-10-02", "projectId": None, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}],
                 waiting=[{"id": "w1", "title": "Ответ", "from": "Иван", "followUp": "2026-10-09", "note": "", "resolved": False, "resolvedAt": None, "taskId": None, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}],
                 evening={"enabled": True, "time": "21:30"})
        s = Session(lang, theme=theme, data=d, when='2026-10-09T09:00:00+03:00')
        pg = s.pg
        screens = [('today', None), ('calendar', None), ('calendar-year', 'year'), ('tasks', None), ('lists', None), ('data', None)]
        for name, mode in screens:
            if name.startswith('calendar'):
                s.tab('calendar')
                if mode == 'year': pg.click('[data-action="cal.mode"][data-mode="year"]')
                else:
                    if pg.locator('[data-action="cal.mode"][data-mode="month"]').count(): pg.click('[data-action="cal.mode"][data-mode="month"]')
                    pg.click('.cal-grid button[data-date="2026-10-09"]')
            else:
                s.tab(name)
            if name == 'tasks': pg.click('main details > summary')
            bad = pg.evaluate(CONTRAST_JS)
            check(L + f'Контраст ≥ 4.5:1 на экране «{name}»', not bad, '; '.join(bad[:4]))
            check(L + f'Нет горизонтальной прокрутки на «{name}»', pg.evaluate('document.documentElement.scrollWidth') <= 390)
            pg.screenshot(path=os.path.join(SHOTS, f'{lang}-{theme}-{name}.png'), full_page=True)
        pg.click('#settings-btn')
        bad = pg.evaluate(CONTRAST_JS)
        check(L + 'Контраст на «Настройки»', not bad, '; '.join(bad[:4]))
        s.tab('today'); pg.click('[data-action="evening.open"]')
        bad = pg.evaluate(CONTRAST_JS)
        check(L + 'Контраст на «Вечер»', not bad, '; '.join(bad[:4]))
        pg.screenshot(path=os.path.join(SHOTS, f'{lang}-{theme}-evening.png'), full_page=True)
        pg.locator('.row', has_text='Вчерашняя').locator('[data-action="edit.open"]').first.click()
        bad = pg.evaluate(CONTRAST_JS)
        check(L + 'Контраст формы правки', not bad, '; '.join(bad[:4]))
        check(L + 'Нет ошибок страницы', not s.errors, str(s.errors[:2]))
        foreign = [u for u in s.requests if not u.startswith(BASE)]
        check(L + 'Все запросы — только к файлам приложения', not foreign, str(foreign[:3]))
        s.close()

    def lang_switch_flow():
        s = Session('ru')
        pg = s.pg
        pg.click('#settings-btn')
        pg.click('[data-action="language.set"][data-mode="en"]')
        check('Переключение языка: интерфейс стал английским', pg.inner_text('#nav').startswith('Today') or 'Today' in pg.inner_text('#nav'))
        s.tab('calendar')
        check('Переключение языка: календарь на английском', 'October 2026' in pg.inner_text('.cal-title'))
        s.tab('today')
        check('Переключение языка: «Ожидаю от других» → Waiting for others', 'Waiting for others' in pg.inner_text('#waiting-section'))
        check('Переключение языка: данные не изменились', s.doc()['schemaVersion'] == 4)
        s.close()

    for fn, args in [(quick_flow, ('ru',)), (quick_flow, ('en',)), (calendar_flow, ('ru',)), (calendar_flow, ('en',)), (planday_flow, ()),
                     (review_flow, ('ru',)), (review_flow, ('en',)), (evening_auto_flow, ('ru',)), (evening_auto_flow, ('en',)), (evening_planday_flow, ()),
                     (waiting_flow, ('ru',)), (waiting_flow, ('en',)), (recurring_flow, ('ru',)), (recurring_flow, ('en',)),
                     (templates_flow, ('ru',)), (templates_flow, ('en',)), (upgrade_flow, ()), (lang_switch_flow, ()),
                     (audit_flow, ('ru', 'light')), (audit_flow, ('ru', 'dark')), (audit_flow, ('en', 'light')), (audit_flow, ('en', 'dark'))]:
        if os.environ.get('ONLY') and os.environ['ONLY'] not in fn.__name__: continue
        try:
            fn(*args)
        except Exception as e:
            results.append((f'{fn.__name__}{args} — ИСКЛЮЧЕНИЕ', False, str(e).splitlines()[0]))
            traceback.print_exc()
    browser.close()

passed = sum(1 for _, ok, _ in results if ok)
print(f'E2E-V4: {passed}/{len(results)} checks passed')
for name, ok, detail in results:
    print(('  ✓ ' if ok else '  ✗ ') + name + (f'  — {detail}' if detail and not ok else ''))
json.dump([{'name': n, 'ok': o, 'detail': d} for n, o, d in results], open(os.path.join(OUT, 'e2e-v4-results.json'), 'w'), ensure_ascii=False, indent=1)
sys.exit(0 if passed == len(results) else 1)
