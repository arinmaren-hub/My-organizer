"""Click-through test (0.5.0 UI) of the organizer in headless Chromium (iPhone-sized screen).
Requires: Python 3, Playwright (pip install playwright && playwright install chromium).
Usage: python3 e2e-test.py <app_folder> <output_folder>
The app folder is copied into the output folder first, so it is never modified.
Prints one line per check; the results are also saved as e2e-results.json."""
import datetime, functools, http.server, json, os, re, shutil, socketserver, sys, threading, traceback
from playwright.sync_api import sync_playwright

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
SITE = os.path.join(OUT, 'site')
shutil.rmtree(SITE, ignore_errors=True)
shutil.copytree(SRC, SITE)


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
Handler.extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                          '.js': 'text/javascript', '.webmanifest': 'application/manifest+json'}
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Handler, directory=SITE))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}/'

results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))

def step(name):
    def deco(fn):
        try:
            fn()
        except Exception as e:
            results.append((name, False, 'EXCEPTION: ' + str(e).splitlines()[0]))
            traceback.print_exc()
        return fn
    return deco

PROTOTYPE = {
    "tasks": [{"id": "a1", "name": "Задача из прототипа", "scope": "none", "date": "", "done": False, "created": "2026-10-01"}],
    "events": [{"id": "e1", "name": "Событие из прототипа", "at": "2026-10-09T10:00"}],
    "lists": [{"id": "l1", "name": "Список из прототипа", "items": [{"id": "i1", "name": "Молоко", "done": True}]}],
    "projects": [{"id": "p1", "name": "Проект из прототипа", "steps": [{"id": "s1", "name": "План", "done": True}], "current": 3, "total": 10, "unit": "глав"}]
}

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                              timezone_id='Europe/Athens', locale='ru-RU', accept_downloads=True)
    pg = ctx.new_page()
    page_errors, console_errors, dialogs = [], [], []
    dismiss = []  # substrings: the next dialog containing one of them is dismissed (once)
    pg.on('pageerror', lambda e: page_errors.append(str(e)))
    pg.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
    def on_dialog(d):
        dialogs.append(d.message)
        hit = next((x for x in dismiss if x in d.message), None)
        if hit is not None:
            dismiss.remove(hit)
            d.dismiss()
        else:
            d.accept()
    pg.on('dialog', on_dialog)
    def new_page(c):
        q = c.new_page()
        q.on('pageerror', lambda e: page_errors.append(str(e)))
        q.on('dialog', lambda d: (dialogs.append(d.message), d.accept()))
        return q
    def skip_onboarding(q):
        q.wait_for_selector('[data-action="onboarding.skip"]', timeout=5000)
        q.click('[data-action="onboarding.skip"]')
        q.wait_for_selector('nav#nav button', timeout=5000)
    def seed(q, data, extra=None):
        q.goto(BASE + 'tests.css')
        q.evaluate("d => localStorage.setItem('organizer:data', JSON.stringify(d))", data)
        for k, v in (extra or {}).items():
            q.evaluate("([k, v]) => localStorage.setItem(k, v)", [k, v])
        q.goto(BASE)
        q.wait_for_function('() => window.__organizerReady === true')
    ATHENS = datetime.timezone(datetime.timedelta(hours=3))
    NOWISO = '2026-10-01T10:00:00.000Z'
    def task(i, title, kind, date=None, **kw):
        t = {"id": i, "title": title, "plan": {"kind": kind, "date": date}, "time": None, "reminder": None, "deadline": None,
             "projectId": None, "done": False, "completedAt": None, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}
        t.update(kw); return t
    def doc3(cutoff='00:00', tasks=(), events=()):
        return {"schemaVersion": 3, "createdAt": NOWISO, "updatedAt": NOWISO, "tasks": list(tasks), "events": list(events), "projects": [], "lists": [],
                "settings": {"eveningPreview": {"enabled": False, "time": "21:30"}, "day": {"wake": "08:00", "bed": cutoff, "cutoff": cutoff, "setupDone": True}}, "quarantine": []}
    def event(i, title, start):
        return {"id": i, "title": title, "start": start, "end": None, "allDay": False, "repeat": None, "alerts": [], "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None}

    doc = lambda: pg.evaluate("JSON.parse(localStorage.getItem('organizer:data') || 'null')")
    main_text = lambda: pg.inner_text('main')
    NAV = {'Сегодня': 'today', 'Календарь': 'calendar', 'Задачи': 'tasks', 'Списки': 'lists', 'Today': 'today', 'Calendar': 'calendar', 'Tasks': 'tasks', 'Lists': 'lists'}
    SUB = {'Данные': 'data', 'Data': 'data', 'Прогресс': 'projects', 'Progress': 'projects', 'Настройки': 'settings', 'Settings': 'settings'}
    def sub(q, name):
        if not q.locator('#more-btn').is_visible(): q.click('nav#nav [data-tab="today"]'); q.wait_for_timeout(40)
        q.click('#more-btn'); q.wait_for_selector('#sheet-root .sheet'); q.wait_for_timeout(260)
        q.click(f'#sheet-root [data-action="go"][data-tab="{name}"]'); q.wait_for_timeout(60)
    def settings(q): sub(q, 'settings')
    def tab(name, q=None):
        q = q or pg
        if name in NAV: q.click(f'nav [data-tab="{NAV[name]}"]'); q.wait_for_timeout(40)
        else: sub(q, SUB[name])
    def add_text(q, text):
        q.click('#fab'); q.wait_for_selector('#sheet-root textarea[name=text]'); q.wait_for_timeout(260)
        q.fill('#sheet-root textarea[name=text]', text)
        q.click('#sheet-root form[data-form="task.quickAdd"] button[type=submit]'); q.wait_for_timeout(60)
    def no_sheet(q): return q.locator('#sheet-root .sheet').count() == 0
    def today_key():
        return pg.evaluate("(() => { const d = new Date(); const p = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; })()")

    pg.goto(BASE)
    pg.wait_for_function('() => window.__organizerReady === true', timeout=10000)
    TODAY = today_key()

    @step('Первый запуск')
    def _():
        check('Первый запуск: вопросы о дне вместо вкладок', pg.locator('form[data-form="onboarding.save"]').count() == 1 and pg.is_hidden('#nav'))
        check('Первый запуск: выбор языка, по умолчанию русский', pg.locator('button[data-action="language.set"]').count() == 2 and pg.inner_text('button.choice.active[data-action="language.set"]').startswith('Русский'))
        check('Первый запуск: поля «встаю», «ложусь», «день заканчивается»', all(pg.locator(f'form[data-form="onboarding.save"] input[name={n}]').count() == 1 for n in ('wake', 'bed', 'cutoff')))
        check('Первый запуск: ничего не записано до ответа', doc() is None)
        pg.click('[data-action="onboarding.skip"]')
        pg.wait_for_selector('nav#nav button')
        d = doc()
        check('Пропуск: день заканчивается в 00:00, вопросы больше не показываются', d and d['settings']['day'] == {'wake': None, 'bed': None, 'cutoff': '00:00', 'setupDone': True}, str(d and d['settings']))
        pg.reload(); pg.wait_for_function('() => window.__organizerReady === true')
        check('Пропуск: после перезапуска сразу «Сегодня»', pg.locator('form[data-form="onboarding.save"]').count() == 0)


    @step('Запуск')
    def _():
        check('Запуск: экран «Сегодня» открывается (день недели и дата вверху, без «Быстро добавить»)', pg.inner_text('#app-title') != '' and 'Быстро добавить' not in main_text())
        check('Запуск: 4 вкладки внизу', pg.locator('nav#nav button').count() == 4)
        check('Запуск: нет горизонтальной прокрутки на ширине iPhone (390px)', pg.evaluate('document.documentElement.scrollWidth') <= 390)

    @step('Быстрое добавление')
    def _():
        add_text(pg, 'Купить хлеб\nПозвонить маме\n')
        d = doc()
        check('Быстрое добавление: 2 строки → 2 задачи на сегодня', d and [t['title'] for t in d['tasks']] == ['Купить хлеб', 'Позвонить маме'] and all(t['plan'] == {'kind': 'day', 'date': TODAY} for t in d['tasks']), str(d and [t['plan'] for t in d['tasks']]))
        check('Быстрое добавление: лист закрыт, задачи на экране', no_sheet(pg) and 'Купить хлеб' in main_text())
        add_text(pg, 'Сдать эссе')
        check('Быстрое добавление: ещё задача на «Сегодня»', 'Сдать эссе' in pg.inner_text('#today-list'))

    @step('Черновик быстрого ввода')
    def _():
        pg.click('#fab'); pg.wait_for_selector('#sheet-root textarea'); pg.wait_for_timeout(260)
        pg.fill('#sheet-root textarea', 'недописанная задача')
        pg.keyboard.press('Escape')
        pg.click('#fab'); pg.wait_for_selector('#sheet-root textarea'); pg.wait_for_timeout(260)
        check('Черновик быстрого ввода не теряется при закрытии листа', pg.input_value('#sheet-root textarea') == 'недописанная задача')
        pg.fill('#sheet-root textarea', '')
        pg.keyboard.press('Escape')
        pg.locator('.row:has-text("Сдать эссе") input[type=checkbox]').check()
        pg.reload(); pg.wait_for_function('() => window.__organizerReady === true')
        check('Отметка «готово» сохраняется после перезагрузки', pg.locator('.row:has-text("Сдать эссе") input[type=checkbox]').is_checked())
        t = [t for t in doc()['tasks'] if t['title'] == 'Сдать эссе'][0]
        check('Отметка «готово» записывает completedAt', t['done'] and t['completedAt'])

    @step('Календарь')
    def _():
        tab('Календарь')
        add_text(pg, 'Лекция AN1000 в 10:00')
        pg.click('[data-action="quick.asEvent"]')
        check('Календарь: событие создаётся через «＋» (ошибка 1 исправлена)', 'Лекция AN1000' in main_text() and len(doc()['events']) == 1, main_text()[:100])
        tab('Сегодня')
        check('Календарь: событие в расписании на сегодня', '10:00' in pg.inner_text('#today-list') and 'Лекция AN1000' in pg.inner_text('#today-list'))

    @step('Прогресс')
    def _():
        d = doc()
        d['projects'].append({"id": "pr1", "name": "Диплом", "milestones": [], "quantity": {"current": 0, "total": 12, "unit": "глав"}, "createdAt": NOWISO, "updatedAt": NOWISO, "deletedAt": None})
        pg.evaluate("d => localStorage.setItem('organizer:data', JSON.stringify(d))", d)
        pg.reload(); pg.wait_for_function('() => window.__organizerReady === true')
        pg.click('#more-btn'); pg.wait_for_selector('#sheet-root .sheet'); pg.wait_for_timeout(260)
        check('Прогресс скрыт из вкладок, но доступен из «···», когда проекты есть', pg.locator('nav#nav [data-tab="projects"]').count() == 0 and pg.locator('#sheet-root [data-tab="projects"]').count() == 1)
        pg.click('#sheet-root [data-tab="projects"]')
        check('Прогресс: проект с данными на месте', 'Диплом' in main_text())
        for name in ['План', 'Глава 1']:
            pg.fill('form[data-form="milestone.add"] input[name=title]', name)
            pg.press('form[data-form="milestone.add"] input[name=title]', 'Enter')
        check('Прогресс: после добавления этапа курсор остаётся в поле', pg.evaluate("document.activeElement && document.activeElement.closest('form') && document.activeElement.closest('form').dataset.form") == 'milestone.add')
        pg.locator('label.row:has-text("План") input').check()
        check('Прогресс: этапы 1/2', 'Этапы · 1/2' in main_text())
        pg.click('button[data-action="qty.step"][data-delta="1"]')
        pg.click('button[data-action="qty.step"][data-delta="1"]')
        check('Прогресс: +1 дважды → 2/12', 'Количество · 2/12 глав' in main_text())
        pg.fill('input[data-action="qty.set"]', '7')
        pg.dispatch_event('input[data-action="qty.set"]', 'change')
        check('Прогресс: ввод числа → 7/12 (58%)', 'Количество · 7/12 глав (58%)' in main_text())
        pg.click('button[data-action="qty.step"][data-delta="-1"]')
        check('Прогресс: −1 → 6/12', 'Количество · 6/12 глав' in main_text())

    @step('Списки')
    def _():
        tab('Списки')
        pg.click('#fab'); pg.wait_for_selector('#sheet-root form[data-form="list.add"]'); pg.wait_for_timeout(260)
        pg.fill('#sheet-root form[data-form="list.add"] input[name=name]', 'Покупки')
        pg.click('#sheet-root form[data-form="list.add"] button[type=submit]'); pg.wait_for_timeout(150)
        check('Списки: список создаётся и открывается (ошибка 1 исправлена)', pg.inner_text('#app-title') == 'Покупки', pg.inner_text('#app-title'))
        for name in ['Молоко', 'Хлеб']:
            pg.click('#fab'); pg.wait_for_selector('#sheet-root textarea'); pg.wait_for_timeout(260)
            pg.fill('#sheet-root textarea', name); pg.click('#sheet-root form button[type=submit]')
        pg.locator('.row:has-text("Молоко") input[type=checkbox]').check()
        check('Списки: пункты добавляются и отмечаются', pg.locator('.row.is-done:has-text("Молоко")').count() == 1 and 'Хлеб' in main_text())

    @step('Фоновая перерисовка')
    def _():
        pg.click('#fab'); pg.wait_for_selector('#sheet-root textarea'); pg.wait_for_timeout(260)
        pg.fill('#sheet-root textarea', 'Печен')
        pg.evaluate("window.dispatchEvent(new StorageEvent('storage', { key: 'organizer:appearance' }))")
        st = pg.evaluate("(() => { const el = document.activeElement; return { name: el && el.name, value: el && el.value }; })()")
        check('Фоновая перерисовка не сбивает ввод: фокус и набранный текст на месте', st == {'name': 'text', 'value': 'Печен'}, str(st))
        pg.keyboard.type('ье')
        pg.click('#sheet-root form button[type=submit]')
        check('Фоновая перерисовка: после продолжения ввода пункт добавляется целиком', 'Печенье' in main_text())

    @step('Удаление и восстановление')
    def _():
        tab('Задачи')
        pg.locator('.row:has-text("Купить хлеб") .ttext').dispatch_event('contextmenu'); pg.wait_for_selector('#sheet-root .sheet'); pg.wait_for_timeout(260)
        pg.click('#sheet-root [data-action="task.delete"]')
        check('Удаление: задача скрыта', 'Купить хлеб' not in main_text())
        t = [t for t in doc()['tasks'] if t['title'] == 'Купить хлеб'][0]
        check('Удаление: запись не стёрта, а помечена deletedAt', t['deletedAt'] is not None)
        tab('Данные')
        check('Удаление: видна в «Удалённые (30 дней)»', 'Задача: Купить хлеб' in main_text())
        pg.click('button[data-action="restore"]')
        tab('Задачи')
        check('Удаление: восстановление возвращает задачу', 'Купить хлеб' in main_text())
        check('Удаление: перед удалением спрашивается подтверждение', any('Восстановить можно' in d for d in dialogs))

    @step('Утренний разбор')
    def _():
        d = doc()
        y = pg.evaluate(f"(() => {{ const d = new Date('{TODAY}T12:00:00'); d.setDate(d.getDate()-3); const p = n => String(n).padStart(2,'0'); return `${{d.getFullYear()}}-${{p(d.getMonth()+1)}}-${{p(d.getDate())}}`; }})()")
        d['tasks'].append({"id": "overdue1", "title": "Просроченная", "plan": {"kind": "day", "date": y}, "time": None, "reminder": None,
                           "deadline": "2026-12-01", "projectId": None, "done": False, "completedAt": None,
                           "createdAt": "2026-10-01T10:00:00.000Z", "updatedAt": "2026-10-01T10:00:00.000Z", "deletedAt": None})
        pg.evaluate("d => localStorage.setItem('organizer:data', JSON.stringify(d))", d)
        pg.reload(); pg.wait_for_function('() => window.__organizerReady === true')
        check('Хвосты: просроченная дневная задача посчитана', pg.locator('[data-fold="tails"] .count').inner_text() == '1')
        pg.click('[data-fold="tails"] .foldhead')
        check('Хвосты: дедлайн виден в строке задачи', 'дедлайн' in pg.inner_text('[data-fold="tails"]'))
        pg.click('[data-fold="tails"] button[data-action="review"][data-choice="today"]')
        check('Хвосты: «Сегодня» переносит задачу, хвостов не остаётся', pg.locator('[data-fold="tails"]').count() == 0 and 'Просроченная' in pg.inner_text('#today-list'))
        t = [t for t in doc()['tasks'] if t['id'] == 'overdue1'][0]
        check('Хвосты: перенос не меняет дедлайн (решение 6)', t['deadline'] == '2026-12-01' and t['plan'] == {'kind': 'day', 'date': TODAY})

    backup_path = os.path.join(OUT, 'backup.json')

    @step('Защита от внедрения')
    def _():
        tab('Сегодня')
        add_text(pg, '<img src=x onerror="alert(1)">')
        tab('Задачи')
        check('Название с HTML показывается как текст, а не выполняется', '<img src=x' in main_text() and pg.locator('main img').count() == 0 and not any(m == '1' for m in dialogs))

    @step('Экспорт')
    def _():
        tab('Данные')
        with pg.expect_download() as dl:
            pg.click('main button[data-action="backup.export"]')
        dl.value.save_as(backup_path)
        data = json.load(open(backup_path, encoding='utf-8'))
        check('Экспорт: файл скачан, формат резервной копии', data.get('app') == 'organizer' and data.get('kind') == 'backup' and data.get('schemaVersion') == 4)
        check('Экспорт: в файле есть id органайзера и нет сведений об устройстве', data['data'].get('dataId') and 'lastBackupAt' not in json.dumps(data))
        check('Экспорт: имя файла с датой', re.match(r'organizer-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$', dl.value.suggested_filename) is not None, dl.value.suggested_filename)
        check('Экспорт: в файле все данные', len(data['data']['tasks']) == len(doc()['tasks']) and len(data['data']['lists']) == 1 and len(data['data']['projects']) == 1)
        check('Экспорт: отмечена дата последней копии', 'Последняя копия:' in main_text())
        pg.click('button[data-action="backup.toggleText"]')
        check('Экспорт: запасной способ — текст копии показан', pg.locator('textarea.json').count() == 1 and '"kind": "backup"' in pg.input_value('textarea.json'))


    @step('Импорт')
    def _():
        data = json.load(open(backup_path, encoding='utf-8'))
        t = dict(data['data']['tasks'][0]); t['id'] = 'imported1'; t['title'] = 'Из импорта'
        data['data']['tasks'].append(t)
        mod = os.path.join(OUT, 'backup-mod.json')
        json.dump(data, open(mod, 'w', encoding='utf-8'), ensure_ascii=False)
        pg.set_input_files('input[data-action="import.file"]', mod)
        pg.wait_for_selector('button[data-action="import.apply"]', timeout=5000)
        check('Импорт: предпросмотр перед заменой', 'Файл проверен' in main_text() and 'будут заменены' in main_text())
        n_before = len(doc()['tasks'])
        pg.click('button[data-action="import.apply"]')
        check('Импорт: данные заменены', len(doc()['tasks']) == n_before + 1)
        check('Импорт: автокопия «перед импортом» создана', 'перед импортом' in main_text())


    @step('Импорт и восстановление при сбое записи')
    def _():
        tab('Данные')
        while pg.locator('#banners button[data-action="notice.dismiss"]').count():
            pg.click('#banners button[data-action="notice.dismiss"] >> nth=0')
        check('Перед проверкой сбоя старые сообщения убраны', 'Импорт выполнен' not in pg.inner_text('#banners'))
        disk_before = pg.evaluate("localStorage.getItem('organizer:data')")
        data = json.load(open(backup_path, encoding='utf-8'))
        t = dict(data['data']['tasks'][0]); t['id'] = 'mustnotappear'; t['title'] = 'Не должна появиться'
        data['data']['tasks'].append(t)
        path = os.path.join(OUT, 'backup-fail.json')
        json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
        pg.evaluate("""() => { const orig = Storage.prototype.setItem; window.__failSave = true;
          Storage.prototype.setItem = function (k, v) { if (window.__failSave && k === 'organizer:data') { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); }; }""")
        pg.set_input_files('input[data-action="import.file"]', path)
        pg.wait_for_selector('button[data-action="import.apply"]', timeout=5000)
        pg.click('button[data-action="import.apply"]')
        check('Сбой записи при импорте: нет сообщения об успехе, показана причина',
              'Импорт не выполнен' in pg.inner_text('#banners') and 'Импорт выполнен' not in pg.inner_text('#banners') and 'не удалось сохранить' in main_text())
        check('Сбой записи при импорте: предпросмотр остаётся, можно повторить', pg.locator('button[data-action="import.apply"]').count() == 1)
        check('Сбой записи при импорте: сохранённые данные не изменились', pg.evaluate("localStorage.getItem('organizer:data')") == disk_before)
        check('Сбой записи при импорте: нет ложного «⚠ Не сохранено»', pg.locator('[data-action="save.retry"]').count() == 0)
        tab('Задачи')
        check('Сбой записи при импорте: на экране прежние данные', 'Не должна появиться' not in main_text())
        tab('Данные')
        pg.click('button[data-action="snapshot.restore"] >> nth=0')
        check('Сбой записи при восстановлении: нет сообщения об успехе',
              'Восстановление не выполнено' in pg.inner_text('#banners') and 'Данные восстановлены' not in pg.inner_text('#banners'))
        check('Сбой записи при восстановлении: сохранённые данные не изменились', pg.evaluate("localStorage.getItem('organizer:data')") == disk_before)
        pg.evaluate("window.__failSave = false")
        pg.set_input_files('input[data-action="import.file"]', path)
        pg.wait_for_selector('button[data-action="import.apply"]', timeout=5000)
        pg.click('button[data-action="import.apply"]')
        check('После освобождения места импорт проходит и сохраняется',
              'Импорт выполнен' in pg.inner_text('#banners') and any(t['title'] == 'Не должна появиться' for t in doc()['tasks']))


    @step('Импорт неверных данных')
    def _():
        tab('Данные')
        pg.click('details summary')
        pg.fill('form[data-form="import.paste"] textarea', 'это не json')
        pg.click('form[data-form="import.paste"] button[type=submit]')
        pg.wait_for_selector('main .banner.error', timeout=5000)
        check('Импорт: неверный текст отклонён с понятной ошибкой', 'не корректный JSON' in main_text())
        bad = dict(PROTOTYPE); bad['events'] = [{"id": "x", "name": "без времени"}]
        path = os.path.join(OUT, 'bad.json')
        json.dump(bad, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
        pg.set_input_files('input[data-action="import.file"]', path)
        pg.wait_for_selector('button[data-action="import.apply"]', timeout=5000)
        check('Импорт: файл с плохой записью — предупреждение о карантине', 'попадут в карантин' in main_text())
        pg.click('button[data-action="import.apply"]')
        pg.reload(); pg.wait_for_function('() => window.__organizerReady === true')
        tab('Данные')
        check('Ошибка 2 исправлена: после импорта плохой записи приложение работает после перезагрузки', 'Карантин · 1' in main_text())
        tab('Задачи')
        check('Импорт: хорошие записи из того же файла загружены', 'Задача из прототипа' in main_text())


    @step('Повреждённые данные')
    def _():
        pg.evaluate("localStorage.setItem('organizer:data', '{broken json')")
        pg.reload(); pg.wait_for_function('() => window.__organizerReady === true')
        check('Ошибка 3 исправлена: предупреждение о повреждённых данных', 'Основные данные не читаются' in pg.inner_text('#banners'))
        rescue = pg.evaluate("JSON.parse(localStorage.getItem('organizer:rescue'))")
        check('Ошибка 3: исходный текст сохранён без изменений', rescue and rescue[0]['raw'] == '{broken json')
        check('Ошибка 3: загружена последняя автокопия', len(doc()['tasks']) > 0)
        tab('Данные')
        check('Ошибка 3: раздел «Повреждённые данные» виден', 'Повреждённые данные' in main_text())

    AUDIT_JS = r"""() => {
      const parse = c => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
      const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c; } return parse(getComputedStyle(document.documentElement).backgroundColor); };
      const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const issues = [], seen = new Set();
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) {
        const t = w.currentNode, el = t.parentElement;
        if (!t.textContent.trim() || seen.has(el) || !visible(el) || el.closest('button:disabled, noscript, option')) continue;
        seen.add(el);
        const r = ratio(parse(getComputedStyle(el).color), bgOf(el));
        if (r < 4.5) issues.push(`«${t.textContent.trim().slice(0, 30)}» ${r.toFixed(2)}`);
      }
      for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=file]), textarea, select')) {
        if (!visible(el)) continue;
        const r = ratio(parse(getComputedStyle(el).color), bgOf(el));
        if (r < 4.5) issues.push(`поле ${el.name || el.type} ${r.toFixed(2)}`);
      }
      for (const el of document.querySelectorAll('body *')) {
        if (visible(el) && getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)') issues.push(`ярко-белый фон: ${el.tagName.toLowerCase()}.${el.className}`);
      }
      return issues;
    }"""


    @step('Оформление')
    def _():
        d = doc()
        y = pg.evaluate(f"(() => {{ const d = new Date('{TODAY}T12:00:00'); d.setDate(d.getDate()-2); const p = n => String(n).padStart(2,'0'); return `${{d.getFullYear()}}-${{p(d.getMonth()+1)}}-${{p(d.getDate())}}`; }})()")
        d['tasks'].append({"id": "overdue-theme", "title": "Просроченная для проверки цветов", "plan": {"kind": "day", "date": y}, "time": None, "reminder": None,
                           "deadline": None, "projectId": None, "done": False, "completedAt": None,
                           "createdAt": "2026-10-01T10:00:00.000Z", "updatedAt": "2026-10-01T10:00:00.000Z", "deletedAt": None})
        pg.evaluate("d => localStorage.setItem('organizer:data', JSON.stringify(d))", d)
        pg.reload(); pg.wait_for_function('() => window.__organizerReady === true')
        keys_before = pg.evaluate("['organizer:data','organizer:snapshots','organizer:rollback','organizer:device'].map(k => localStorage.getItem(k))")
        settings(pg)
        check('Настройки: открываются кнопкой в шапке, три варианта оформления', 'Оформление' in main_text() and pg.locator('button[data-action="appearance.set"]').count() == 3)
        check('Настройки: по умолчанию «Как в системе»', pg.inner_text('button.choice.active[data-action="appearance.set"]').startswith('Как в системе'))
        for mode, scheme in (('light', 'dark'), ('dark', 'light'), ('system', 'dark'), ('system', 'light')):
            pg.emulate_media(color_scheme=scheme)
            settings(pg)
            pg.click(f'button[data-action="appearance.set"][data-mode="{mode}"]')
            dark = mode == 'dark' or (mode == 'system' and scheme == 'dark')
            label = f'«{mode}» при системной теме {scheme}'
            bg = pg.evaluate("getComputedStyle(document.body).backgroundColor")
            check(f'Оформление {label}: фон {"тёмный" if dark else "светлый тёплый"}', bg == ('rgb(27, 26, 24)' if dark else 'rgb(242, 238, 230)'), bg)
            check(f'Оформление {label}: поля даты, списки и флажки в той же схеме', pg.evaluate("getComputedStyle(document.documentElement).colorScheme") == ('dark' if dark else 'light'))
            issues = []
            for name in ['Сегодня', 'Календарь', 'Задачи', 'Списки', 'Прогресс', 'Данные']:
                tab(name)
                if name == 'Данные':
                    pg.click('button[data-action="backup.toggleText"]')
                    pg.click('details summary')
                    pg.set_input_files('input[data-action="import.file"]', backup_path)
                    pg.wait_for_selector('button[data-action="import.apply"]', timeout=5000)
                issues += [f'{name}: {i}' for i in pg.evaluate(AUDIT_JS)]
                if name == 'Данные':
                    pg.click('button[data-action="import.cancel"]')
                    pg.click('button[data-action="backup.toggleText"]')
                if mode != 'system' and name in ('Сегодня', 'Данные', 'Прогресс'):
                    pg.screenshot(path=os.path.join(OUT, f'theme-{mode}-{name}.png'), full_page=True)
            settings(pg)
            issues += [f'Настройки: {i}' for i in pg.evaluate(AUDIT_JS)]
            # every message style (info / warning / error banners, backup note, error in a card)
            pg.evaluate("""() => { document.getElementById('banners').innerHTML =
              '<div class="banner info line"><span class="grow">Информация</span><button class="icon">×</button></div>' +
              '<div class="banner warn line"><span class="grow">Предупреждение</span><button class="icon">×</button></div>' +
              '<div class="banner error"><b>Ошибка:</b> текст <div class="line"><button>Повторить</button></div></div>' +
              '<div class="card note line"><span class="grow">Напоминание о копии</span><button>Сохранить копию</button></div>' +
              '<div class="card"><p class="bad">Красный текст</p><p class="is-done"><span class="title">Готово</span></p><button class="danger">Заменить данные</button></div>'; }""")
            issues += [f'Сообщения: {i}' for i in pg.evaluate(AUDIT_JS)]
            pg.evaluate("document.getElementById('banners').innerHTML = ''")
            if mode != 'system':
                pg.screenshot(path=os.path.join(OUT, f'theme-{mode}-Настройки.png'), full_page=True)
            check(f'Оформление {label}: контраст текста ≥ 4.5:1 и нет ярко-белого фона на всех экранах (с баннерами, разбором, импортом)', not issues, '; '.join(issues[:6]))
        pg.emulate_media(color_scheme='dark')
        pg.click('button[data-action="appearance.set"][data-mode="system"]')
        pg.emulate_media(color_scheme='light')
        check('«Как в системе»: смена темы iPhone применяется сразу, без перезапуска', pg.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(242, 238, 230)')
        pg.click('button[data-action="appearance.set"][data-mode="dark"]')
        check('Тёмное: цвет строки состояния тоже тёмный', pg.evaluate("[...document.querySelectorAll('meta[name=theme-color]')].map(m => m.content)") == ['#1b1a18', '#1b1a18'])
        pg.reload(); pg.wait_for_function('() => window.__organizerReady === true')
        check('Выбор сохраняется после перезапуска', pg.evaluate("document.documentElement.dataset.theme") == 'dark' and pg.evaluate("localStorage.getItem('organizer:appearance')") == 'dark')
        settings(pg)
        check('После перезапуска в настройках отмечено «Тёмное»', pg.inner_text('button.choice.active[data-action="appearance.set"]').startswith('Тёмное'))
        keys_after = pg.evaluate("['organizer:data','organizer:snapshots','organizer:rollback','organizer:device'].map(k => localStorage.getItem(k))")
        check('Смена оформления не изменила данные, автокопии и сведения устройства', keys_before == keys_after)
        pg.click('button[data-action="appearance.set"][data-mode="system"]')
        pg.emulate_media(color_scheme='light')


    @step('Язык интерфейса')
    def _():
        keys_before = pg.evaluate("['organizer:data','organizer:snapshots','organizer:rollback','organizer:device'].map(k => localStorage.getItem(k))")
        pg.evaluate("window.__i18nMissing.clear()")
        settings(pg)
        pg.click('button[data-action="language.set"][data-mode="en"]')
        check('English: header, tabs and page language switch at once',
              pg.inner_text('nav#nav').split('\n')[0].strip() == 'Today' and pg.evaluate('document.documentElement.lang') == 'en')
        texts = []
        for name in ['Today', 'Calendar', 'Tasks', 'Lists', 'Progress', 'Data']:
            tab(name)
            if name == 'Data':
                pg.click('button[data-action="backup.toggleText"]')
                pg.set_input_files('input[data-action="import.file"]', backup_path)
                pg.wait_for_selector('button[data-action="import.apply"]', timeout=5000)
            texts.append(main_text())
            if name == 'Data':
                pg.click('button[data-action="import.cancel"]')
                pg.click('button[data-action="backup.toggleText"]')
        settings(pg)
        texts.append(main_text())
        missing = pg.evaluate("[...window.__i18nMissing]")
        check('English: every screen has a translation for every text (no missing keys)', not missing, str(missing[:5]))
        check('English: dates and labels are English', 'Waiting for others' in texts[0] and 'Automatic copies' in texts[5] and 'My day' in texts[6], texts[0][:80])
        UI_RU = ['Календарь', 'Задачи', 'Данные', 'Сохранить', 'Удалить', 'Без даты', 'Автокопии', 'Ожидаю', 'окт']
        leaks = [w for w in UI_RU if any(w in t for t in texts)]
        check('English: no Russian interface words left (user data stays as typed)', not leaks, str(leaks))
        pg.reload(); pg.wait_for_function('() => window.__organizerReady === true')
        check('English: the choice is kept after restart', pg.evaluate("localStorage.getItem('organizer:language')") == 'en' and pg.inner_text('nav#nav').split('\n')[0].strip() == 'Today')
        settings(pg)
        pg.click('button[data-action="language.set"][data-mode="ru"]')
        check('Русский возвращается одним нажатием', pg.inner_text('nav#nav').split('\n')[0].strip() == 'Сегодня' and pg.evaluate('document.documentElement.lang') == 'ru')
        keys_after = pg.evaluate("['organizer:data','organizer:snapshots','organizer:rollback','organizer:device'].map(k => localStorage.getItem(k))")
        check('Смена языка не изменила данные, автокопии и сведения устройства', keys_before == keys_after)


    @step('Ошибка сохранения')
    def _():
        pg.evaluate("""() => { const orig = Storage.prototype.setItem; window.__failSave = true;
          Storage.prototype.setItem = function (k, v) { if (window.__failSave && k === 'organizer:data') { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); }; }""")
        tab('Сегодня')
        add_text(pg, 'Не сохранится сразу')
        check('Ошибка 5 исправлена: видно предупреждение о несохранении', 'Не удалось сохранить' in pg.inner_text('#banners') and pg.locator('[data-action="save.retry"]').count() == 1)
        pg.evaluate("window.__failSave = false")
        pg.click('#banners button[data-action="save.retry"]')
        check('Ошибка 5: «Повторить» сохраняет и убирает предупреждение', 'Не удалось сохранить' not in pg.inner_text('#banners'))
        check('Ошибка 5: задача действительно записана', any(t['title'] == 'Не сохранится сразу' for t in doc()['tasks']))


    @step('Офлайн')
    def _():
        pg.evaluate('navigator.serviceWorker.ready')
        pg.reload(); pg.wait_for_function('() => window.__organizerReady === true')
        check('Офлайн: service worker управляет страницей', pg.evaluate('!!navigator.serviceWorker.controller'))
        ctx.set_offline(True)
        pg.reload(); pg.wait_for_function('() => window.__organizerReady === true', timeout=10000)
        tab('Сегодня')
        add_text(pg, 'Офлайн-задача')
        tab('Задачи')
        check('Офлайн: приложение открывается и работает без сети', 'Офлайн-задача' in main_text())
        ctx.set_offline(False)


    @step('Обновление версии')
    def _():
        n_tasks = len(doc()['tasks'])
        cur = re.search(r"APP_VERSION = '([^']+)'", open(os.path.join(SITE, 'version.js'), encoding='utf-8').read()).group(1)
        NEW_VERSION = cur + '-test'
        for f in ('sw.js', 'version.js'):
            path = os.path.join(SITE, f)
            s = open(path, encoding='utf-8').read()
            assert f"'{cur}'" in s, f
            open(path, 'w', encoding='utf-8').write(s.replace(f"'{cur}'", f"'{NEW_VERSION}'"))
        pg.evaluate('navigator.serviceWorker.getRegistration().then(r => r.update())')
        pg.wait_for_selector('#banners button[data-action="update.apply"]', timeout=15000)
        check('Обновление: появляется «Доступна новая версия»', True)
        with pg.expect_navigation():
            pg.click('#banners button[data-action="update.apply"]')
        pg.wait_for_function('() => window.__organizerReady === true')
        tab('Данные')
        check('Обновление: после «Обновить» работает новая версия', f'Версия {NEW_VERSION}' in main_text())
        check('Обновление: данные сохранились', len(doc()['tasks']) == n_tasks)


    @step('Тесты tests.html')
    def _():
        t = ctx.new_page()
        t.goto(BASE + 'tests.html')
        t.wait_for_function('() => window.__testResults && window.__testResults.done', timeout=30000)
        r = t.evaluate('window.__testResults')
        check(f"tests.html на опубликованном сайте: {r['passed']}/{r['total']} пройдено", r['passed'] == r['total'],
              '; '.join(f['name'] + ': ' + f['error'] for f in r['failures']))
        t.close()


    pg.screenshot(path=os.path.join(OUT, 'screen-data.png'), full_page=True)
    tab('Сегодня')

    pg.screenshot(path=os.path.join(OUT, 'screen-today.png'), full_page=True)
    tab('Прогресс')

    pg.screenshot(path=os.path.join(OUT, 'screen-progress.png'), full_page=True)


    # ---- fresh context: migration of prototype data left under the old key ----

    @step('Перенос данных прототипа')
    def _():
        c2 = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Europe/Athens')
        p2 = c2.new_page()
        p2.goto(BASE + 'tests.css')
        p2.evaluate("d => localStorage.setItem('arina-organizer-v1', JSON.stringify(d))", PROTOTYPE)
        p2.goto(BASE)
        p2.wait_for_function('() => window.__organizerReady === true')
        check('Перенос: сообщение о переносе данных прототипа', 'Перенесены данные прототипа' in p2.inner_text('#banners'))
        skip_onboarding(p2)
        tab('Задачи', p2)
        check('Перенос: задачи прототипа на месте', 'Задача из прототипа' in p2.inner_text('main'))
        check('Перенос: старый ключ не изменён', p2.evaluate("localStorage.getItem('arina-organizer-v1')") == json.dumps(PROTOTYPE, ensure_ascii=False, separators=(',', ':')) or json.loads(p2.evaluate("localStorage.getItem('arina-organizer-v1')")) == PROTOTYPE)
        c2.close()


    # ---- iPhone Safari (not installed): warning about separate storage ----

    @step('Подсказка для Safari на iPhone')
    def _():
        c4 = browser.new_context(**p.devices['iPhone 13'])
        p4 = c4.new_page()
        p4.goto(BASE)
        p4.wait_for_function('() => window.__organizerReady === true')
        check('Safari на iPhone (не установлено): предупреждение о раздельных данных', 'раздельные данные' in p4.inner_text('#banners'))
        c4.close()


    # ---- the saved theme applies before the app code runs (no flash) ----

    @step('Оформление без мигания')
    def _():
        c5 = browser.new_context(viewport={'width': 390, 'height': 844}, color_scheme='light')
        p5 = c5.new_page()
        p5.goto(BASE + 'tests.css')
        p5.evaluate("localStorage.setItem('organizer:appearance', 'dark')")
        p5.route('**/app.js', lambda route: route.abort())
        p5.goto(BASE)
        p5.wait_for_load_state('load')
        check('Сохранённое «Тёмное» применяется ещё до запуска кода приложения (нет вспышки светлого)',
              p5.evaluate("document.documentElement.dataset.theme") == 'dark' and p5.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(27, 26, 24)')
        c5.close()


    # ---- fresh context with a fake clock: "today" rolls over at midnight ----

    @step('Смена дня')
    def _():
        c3 = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Europe/Athens')
        p3 = c3.new_page()
        p3.clock.install(time=datetime.datetime(2026, 10, 9, 23, 59, 0, tzinfo=datetime.timezone(datetime.timedelta(hours=3))))
        p3.goto(BASE)
        p3.wait_for_function('() => window.__organizerReady === true')
        skip_onboarding(p3)
        before = p3.inner_text('#top')
        p3.clock.run_for(120000)
        after = p3.inner_text('#top')
        check('Смена дня: «Сегодня» само переключается после полуночи (ошибка 13)', '9 октября' in before and '10 октября' in after)
        c3.close()


    # ---- first launch with answers: the bedtime is suggested as the end of the day ----

    @step('Первый запуск с ответами')
    def _():
        c = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Europe/Athens')
        q = new_page(c)
        q.goto(BASE); q.wait_for_function('() => window.__organizerReady === true')
        q.fill('input[name=wake]', '07:30')
        q.fill('input[name=bed]', '01:30')
        check('Онбординг: «день заканчивается» подставляется из времени сна', q.input_value('input[name=cutoff]') == '01:30')
        q.click('form[data-form="onboarding.save"] button[type=submit]')
        q.wait_for_selector('nav#nav button')
        d = q.evaluate("JSON.parse(localStorage.getItem('organizer:data'))")
        check('Онбординг: ответы сохранены', d['settings']['day'] == {'wake': '07:30', 'bed': '01:30', 'cutoff': '01:30', 'setupDone': True}, str(d['settings']['day']))
        settings(q)
        q.fill('form[data-form="day.save"] input[name=cutoff]', '03:00')
        q.click('form[data-form="day.save"] button[type=submit]')
        d = q.evaluate("JSON.parse(localStorage.getItem('organizer:data'))")
        check('Настройки: конец дня можно поменять вручную', d['settings']['day']['cutoff'] == '03:00' and d['settings']['day']['bed'] == '01:30')
        c.close()


    # ---- planning day after midnight, with a fake clock ----

    @step('Плановый день ночью')
    def _():
        c = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Europe/Athens')
        q = new_page(c)
        q.clock.install(time=datetime.datetime(2026, 10, 9, 22, 0, tzinfo=ATHENS))
        seed(q, doc3('03:00', tasks=[task('fri', 'Пятничная задача', 'day', '2026-10-09', deadline='2026-10-09')],
                     events=[event('night', 'Ночной поезд', '2026-10-10T01:00'), event('sat', 'Субботний завтрак', '2026-10-10T09:00')]))
        top = lambda: q.inner_text('#top')
        check('Пятница 22:00: заголовок — пятница, 9 октября', 'Пятница' in top() and '9 октября' in top(), top())
        lst = lambda: q.inner_text('#today-list')
        check('Пятница 22:00: ночное событие субботы (01:00) в списке пятничного дня с реальной датой',
              'Ночной поезд' in lst() and '10' in lst() and 'Субботний завтрак' not in q.inner_text('main'), lst())
        q.clock.run_for(3 * 3600 * 1000 + 30 * 60 * 1000)  # → Saturday 01:30
        check('Суббота 01:30: «Сегодня» всё ещё пятница, рядом пометка календарной даты', 'Пятница' in top() and '10' in top() and '9 октября' in top(), top())
        check('Суббота 01:30: пятничная задача ещё не просрочена (нет «Хвостов»)', q.locator('[data-fold="tails"]').count() == 0)
        add_text(q, 'Ночная задача')
        d = q.evaluate("JSON.parse(localStorage.getItem('organizer:data'))")
        t = [x for x in d['tasks'] if x['title'] == 'Ночная задача'][0]
        check('Суббота 01:30: задача из «＋» на Сегодня попадает на пятницу (плановый день), время создания — реальное',
              t['plan'] == {'kind': 'day', 'date': '2026-10-09'} and t['createdAt'].startswith('2026-10-09T22:30'), str(t['plan']) + ' ' + t['createdAt'])
        q.clock.run_for(91 * 60 * 1000)  # → Saturday 03:01
        check('Суббота 03:01: «Сегодня» — суббота, пятничные задачи в «Хвостах»', 'Суббота' in top() and q.locator('[data-fold="tails"] .count').inner_text() == '2', top())
        f = [x for x in q.evaluate("JSON.parse(localStorage.getItem('organizer:data'))")['tasks'] if x['id'] == 'fri'][0]
        check('Дедлайн и дата задачи не изменились', f['deadline'] == '2026-10-09' and f['plan']['date'] == '2026-10-09')
        c.close()

    @step('Завершить день')
    def _():
        c = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Europe/Athens')
        q = new_page(c)
        q.clock.install(time=datetime.datetime(2026, 10, 9, 21, 0, tzinfo=ATHENS))
        seed(q, doc3('03:00', tasks=[task('fri', 'Пятничная задача', 'day', '2026-10-09')]))
        before = q.evaluate("localStorage.getItem('organizer:data')")
        def menu_click(sel):
            q.click('#more-btn'); q.wait_for_selector('#sheet-root .sheet'); q.wait_for_timeout(260); q.click(sel); q.wait_for_timeout(100)
        menu_click('#sheet-root [data-action="day.finish"]')
        check('«Завершить день»: спрашивает подтверждение и переходит на субботу', any('Завершить' in m for m in dialogs) and 'Суббота' in q.inner_text('#top') and q.locator('[data-fold="tails"] .count').inner_text() == '1', q.inner_text('#top'))
        check('«Завершить день»: данные органайзера не меняются', q.evaluate("localStorage.getItem('organizer:data')") == before)
        menu_click('#sheet-root [data-action="day.undoFinish"]')
        check('«Вернуть»: снова пятница, хвостов нет', 'Пятница' in q.inner_text('#top') and q.locator('[data-fold="tails"]').count() == 0)
        menu_click('#sheet-root [data-action="day.finish"]')
        q.clock.run_for(6 * 3600 * 1000 + 60 * 1000)  # → Saturday 03:01
        check('После 03:00 завершённый день не сдвигает дальше: суббота, а не воскресенье', 'Суббота' in q.inner_text('#top'), q.inner_text('#top'))
        c.close()

    @step('Вечерний конец дня')
    def _():
        c = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Europe/Athens')
        q = new_page(c)
        q.clock.install(time=datetime.datetime(2026, 12, 31, 22, 59, tzinfo=datetime.timezone(datetime.timedelta(hours=2))))
        seed(q, doc3('23:00'))
        before = q.inner_text('#top')
        q.clock.run_for(2 * 60 * 1000)
        check('Конец дня 23:00 в Новый год: в 23:01 31 декабря «Сегодня» уже 1 января', '31 декабря' in before and '1 января' in q.inner_text('#top'), before[:120])
        c.close()


    # ---- a backup from another organizer (another person's device) ----

    @step('Чужая резервная копия')
    def _():
        c = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Europe/Athens', accept_downloads=True)
        q = c.new_page()
        q.on('pageerror', lambda e: page_errors.append(str(e)))
        rules = {'ДРУГОГО': False}
        msgs = []
        def dlg(d):
            msgs.append(d.message)
            accept = next((v for k, v in rules.items() if k in d.message), True)
            d.accept() if accept else d.dismiss()
        q.on('dialog', dlg)
        q.goto(BASE); q.wait_for_function('() => window.__organizerReady === true')
        skip_onboarding(q)
        add_text(q, 'Моя личная задача')
        mine = q.evaluate("localStorage.getItem('organizer:data')")
        tab('Данные', q)
        q.set_input_files('input[data-action="import.file"]', backup_path)  # made in the first context = another organizer
        q.wait_for_selector('button[data-action="import.apply"]', timeout=5000)
        check('Чужая копия: предпросмотр предупреждает, что она из другого органайзера', 'другом органайзере' in q.inner_text('main'))
        q.click('button[data-action="import.apply"]')
        check('Чужая копия: нужно отдельное подтверждение; отказ ничего не меняет',
              any('ДРУГОГО' in m for m in msgs) and q.evaluate("localStorage.getItem('organizer:data')") == mine and q.evaluate("localStorage.getItem('organizer:rollback')") is None)
        rules['ДРУГОГО'] = True
        q.click('button[data-action="import.apply"]')
        d = q.evaluate("JSON.parse(localStorage.getItem('organizer:data'))")
        rb = q.evaluate("JSON.parse(localStorage.getItem('organizer:rollback'))")
        check('Чужая копия: после двух подтверждений заменена, свои данные остались в копии для отката',
              not any(t['title'] == 'Моя личная задача' for t in d['tasks']) and rb and any(t['title'] == 'Моя личная задача' for t in rb[0]['data']['tasks']))
        c.close()


    unexpected = [e for e in page_errors]
    check('Нет необработанных ошибок JavaScript на страницах', not unexpected, '; '.join(unexpected[:3]))
    csp = [e for e in console_errors if 'Content Security Policy' in e]
    check('Нет нарушений политики безопасности (CSP)', not csp, '; '.join(csp[:3]))
    browser.close()

srv.shutdown()
passed = sum(1 for r in results if r[1])
print(f'E2E-LEGACY: {passed}/{len(results)} checks passed')
for name, ok, detail in results:
    print(('  ✓ ' if ok else '  ✗ ') + name + (f'  — {detail}' if detail else ''))
json.dump([{'name': n, 'ok': o, 'detail': d} for n, o, d in results], open(os.path.join(OUT, 'e2e-results.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
