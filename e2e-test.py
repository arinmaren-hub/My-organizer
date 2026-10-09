"""Click-through test of the organizer in headless Chromium (iPhone-sized screen).
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
    pg.on('pageerror', lambda e: page_errors.append(str(e)))
    pg.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
    def on_dialog(d):
        dialogs.append(d.message)
        d.accept()
    pg.on('dialog', on_dialog)

    doc = lambda: pg.evaluate("JSON.parse(localStorage.getItem('organizer:data') || 'null')")
    main_text = lambda: pg.inner_text('main')
    def tab(name):
        pg.click(f'nav button:text-is("{name}")')
    def today_key():
        return pg.evaluate("(() => { const d = new Date(); const p = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; })()")

    pg.goto(BASE)
    pg.wait_for_function('window.__organizerReady === true', timeout=10000)
    TODAY = today_key()

    @step('Запуск')
    def _():
        check('Запуск: экран «Сегодня» открывается', 'Быстро добавить' in main_text())
        check('Запуск: 6 вкладок', pg.locator('nav button').count() == 6)
        check('Запуск: нет горизонтальной прокрутки на ширине iPhone (390px)', pg.evaluate('document.documentElement.scrollWidth') <= 390)

    @step('Быстрое добавление')
    def _():
        pg.fill('form[data-form="task.quickAdd"] textarea', 'Купить хлеб\nПозвонить маме\n')
        pg.click('form[data-form="task.quickAdd"] button[type=submit]')
        d = doc()
        check('Быстрое добавление: 2 строки → 2 задачи «Без даты»', d and [t['title'] for t in d['tasks']] == ['Купить хлеб', 'Позвонить маме'] and all(t['plan']['kind'] == 'none' for t in d['tasks']))
        check('Быстрое добавление: поле очищено после добавления', pg.input_value('form[data-form="task.quickAdd"] textarea') == '')
        pg.select_option('form[data-form="task.quickAdd"] select', 'day')
        check('Быстрое добавление: поле даты появляется для «На день»', pg.is_visible('form[data-form="task.quickAdd"] input[name=date]'))
        pg.fill('form[data-form="task.quickAdd"] textarea', 'Сдать эссе')
        pg.click('form[data-form="task.quickAdd"] button[type=submit]')
        check('Быстрое добавление: задача на сегодня видна в «Сегодня»', 'Сдать эссе' in pg.inner_text('main section:has(h2:text-matches("^Сегодня"))'))

    @step('Черновик быстрого ввода')
    def _():
        pg.fill('form[data-form="task.quickAdd"] textarea', 'недописанная задача')
        pg.locator('.row:has-text("Сдать эссе") input[type=checkbox]').check()
        check('Черновик быстрого ввода не теряется при отметке задачи', pg.input_value('form[data-form="task.quickAdd"] textarea') == 'недописанная задача')
        pg.fill('form[data-form="task.quickAdd"] textarea', '')
        pg.dispatch_event('form[data-form="task.quickAdd"] textarea', 'input')
        pg.reload(); pg.wait_for_function('window.__organizerReady === true')
        check('Отметка «готово» сохраняется после перезагрузки', pg.locator('.row:has-text("Сдать эссе") input[type=checkbox]').is_checked())
        t = [t for t in doc()['tasks'] if t['title'] == 'Сдать эссе'][0]
        check('Отметка «готово» записывает completedAt', t['done'] and t['completedAt'])

    @step('Календарь')
    def _():
        tab('Календарь')
        pg.fill('form[data-form="event.add"] input[name=title]', 'Лекция AN1000')
        pg.fill('form[data-form="event.add"] input[name=start]', f'{TODAY}T10:00')
        pg.click('form[data-form="event.add"] button[type=submit]')
        check('Календарь: событие создаётся (ошибка 1 исправлена)', 'Лекция AN1000' in main_text() and len(doc()['events']) == 1)
        tab('Сегодня')
        check('Календарь: событие в «Расписании» на сегодня', '10:00 · Лекция AN1000' in main_text())

    @step('Прогресс')
    def _():
        tab('Прогресс')
        pg.fill('form[data-form="project.add"] input[name=name]', 'Диплом')
        pg.fill('form[data-form="project.add"] input[name=total]', '12')
        pg.fill('form[data-form="project.add"] input[name=unit]', 'глав')
        pg.click('form[data-form="project.add"] button[type=submit]')
        check('Прогресс: проект создаётся (ошибка 1 исправлена)', 'Диплом' in main_text())
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
        pg.fill('form[data-form="list.add"] input[name=name]', 'Покупки')
        pg.click('form[data-form="list.add"] button[type=submit]')
        check('Списки: список создаётся (ошибка 1 исправлена)', 'Покупки' in main_text())
        for name in ['Молоко', 'Хлеб']:
            pg.fill('form[data-form="item.add"] input[name=title]', name)
            pg.press('form[data-form="item.add"] input[name=title]', 'Enter')
        pg.locator('label.row:has-text("Молоко") input').check()
        check('Списки: пункты добавляются и отмечаются', pg.locator('label.row.is-done:has-text("Молоко")').count() == 1 and 'Хлеб' in main_text())

    @step('Фоновая перерисовка')
    def _():
        pg.fill('form[data-form="item.add"] input[name=title]', 'Печен')
        pg.evaluate("window.dispatchEvent(new StorageEvent('storage', { key: 'organizer:appearance' }))")
        st = pg.evaluate("(() => { const el = document.activeElement; return { name: el && el.name, form: el && el.form && el.form.dataset.form, value: el && el.value }; })()")
        check('Фоновая перерисовка не сбивает ввод: фокус и набранный текст на месте', st == {'name': 'title', 'form': 'item.add', 'value': 'Печен'}, str(st))
        pg.keyboard.type('ье')
        pg.keyboard.press('Enter')
        check('Фоновая перерисовка: после продолжения ввода пункт добавляется целиком, поле очищается',
              'Печенье' in main_text() and pg.input_value('form[data-form="item.add"] input[name=title]') == '')

    @step('Удаление и восстановление')
    def _():
        tab('Задачи')
        pg.click('.row:has-text("Купить хлеб") button[data-action="task.delete"]')
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
        pg.reload(); pg.wait_for_function('window.__organizerReady === true')
        check('Разбор: просроченная дневная задача показана', 'Утренний разбор · 1' in main_text())
        check('Разбор: дедлайн виден в строке задачи', 'дедлайн' in pg.inner_text('section.review'))
        pg.click('section.review button[data-action="task.move"][data-kind="day"]')
        check('Разбор: «Сегодня» переносит задачу и разбор исчезает', 'Утренний разбор' not in main_text() and 'Просроченная' in pg.inner_text('main section:has(h2:text-matches("^Сегодня"))'))
        t = [t for t in doc()['tasks'] if t['id'] == 'overdue1'][0]
        check('Разбор: перенос не меняет дедлайн (решение 6)', t['deadline'] == '2026-12-01' and t['plan'] == {'kind': 'day', 'date': TODAY})

    @step('Защита от внедрения')
    def _():
        tab('Сегодня')
        pg.fill('form[data-form="task.quickAdd"] textarea', '<img src=x onerror="alert(1)">')
        pg.click('form[data-form="task.quickAdd"] button[type=submit]')
        tab('Задачи')
        check('Название с HTML показывается как текст, а не выполняется', '<img src=x' in main_text() and pg.locator('main img').count() == 0 and not any(m == '1' for m in dialogs))

    backup_path = os.path.join(OUT, 'backup.json')
    @step('Экспорт')
    def _():
        tab('Данные')
        with pg.expect_download() as dl:
            pg.click('main button[data-action="backup.export"]')
        dl.value.save_as(backup_path)
        data = json.load(open(backup_path, encoding='utf-8'))
        check('Экспорт: файл скачан, формат резервной копии', data.get('app') == 'organizer' and data.get('kind') == 'backup' and data.get('schemaVersion') == 2)
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
        check('Сбой записи при импорте: нет ложного «⚠ Не сохранено»', 'Не сохранено' not in pg.inner_text('#status'))
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
        pg.reload(); pg.wait_for_function('window.__organizerReady === true')
        tab('Данные')
        check('Ошибка 2 исправлена: после импорта плохой записи приложение работает после перезагрузки', 'Карантин · 1' in main_text())
        tab('Задачи')
        check('Импорт: хорошие записи из того же файла загружены', 'Задача из прототипа' in main_text())

    @step('Повреждённые данные')
    def _():
        pg.evaluate("localStorage.setItem('organizer:data', '{broken json')")
        pg.reload(); pg.wait_for_function('window.__organizerReady === true')
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
        pg.reload(); pg.wait_for_function('window.__organizerReady === true')
        keys_before = pg.evaluate("['organizer:data','organizer:snapshots','organizer:device'].map(k => localStorage.getItem(k))")
        pg.click('#settings-btn')
        check('Настройки: открываются кнопкой в шапке, три варианта оформления', 'Оформление' in main_text() and pg.locator('button.choice').count() == 3)
        check('Настройки: по умолчанию «Как в системе»', pg.inner_text('button.choice.active').startswith('Как в системе'))
        for mode, scheme in (('light', 'dark'), ('dark', 'light'), ('system', 'dark'), ('system', 'light')):
            pg.emulate_media(color_scheme=scheme)
            pg.click('#settings-btn')
            pg.click(f'button.choice[data-mode="{mode}"]')
            dark = mode == 'dark' or (mode == 'system' and scheme == 'dark')
            label = f'«{mode}» при системной теме {scheme}'
            bg = pg.evaluate("getComputedStyle(document.body).backgroundColor")
            check(f'Оформление {label}: фон {"тёмный" if dark else "светлый тёплый"}', bg == ('rgb(27, 26, 24)' if dark else 'rgb(242, 238, 230)'), bg)
            check(f'Оформление {label}: поля даты, списки и флажки в той же схеме', pg.evaluate("getComputedStyle(document.documentElement).colorScheme") == ('dark' if dark else 'light'))
            issues = []
            for name in ['Сегодня', 'Календарь', 'Задачи', 'Прогресс', 'Списки', 'Данные']:
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
            pg.click('#settings-btn')
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
        pg.click('button.choice[data-mode="system"]')
        pg.emulate_media(color_scheme='light')
        check('«Как в системе»: смена темы iPhone применяется сразу, без перезапуска', pg.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(242, 238, 230)')
        pg.click('button.choice[data-mode="dark"]')
        check('Тёмное: цвет строки состояния тоже тёмный', pg.evaluate("[...document.querySelectorAll('meta[name=theme-color]')].map(m => m.content)") == ['#1b1a18', '#1b1a18'])
        pg.reload(); pg.wait_for_function('window.__organizerReady === true')
        check('Выбор сохраняется после перезапуска', pg.evaluate("document.documentElement.dataset.theme") == 'dark' and pg.evaluate("localStorage.getItem('organizer:appearance')") == 'dark')
        pg.click('#settings-btn')
        check('После перезапуска в настройках отмечено «Тёмное»', pg.inner_text('button.choice.active').startswith('Тёмное'))
        keys_after = pg.evaluate("['organizer:data','organizer:snapshots','organizer:device'].map(k => localStorage.getItem(k))")
        check('Смена оформления не изменила данные, автокопии и сведения устройства', keys_before == keys_after)
        pg.click('button.choice[data-mode="system"]')
        pg.emulate_media(color_scheme='light')

    @step('Ошибка сохранения')
    def _():
        pg.evaluate("""() => { const orig = Storage.prototype.setItem; window.__failSave = true;
          Storage.prototype.setItem = function (k, v) { if (window.__failSave && k === 'organizer:data') { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); }; }""")
        tab('Сегодня')
        pg.fill('form[data-form="task.quickAdd"] textarea', 'Не сохранится сразу')
        pg.click('form[data-form="task.quickAdd"] button[type=submit]')
        check('Ошибка 5 исправлена: видно предупреждение о несохранении', 'Не удалось сохранить' in pg.inner_text('#banners') and 'Не сохранено' in pg.inner_text('#status'))
        pg.evaluate("window.__failSave = false")
        pg.click('#banners button[data-action="save.retry"]')
        check('Ошибка 5: «Повторить» сохраняет и убирает предупреждение', 'Не удалось сохранить' not in pg.inner_text('#banners'))
        check('Ошибка 5: задача действительно записана', any(t['title'] == 'Не сохранится сразу' for t in doc()['tasks']))

    @step('Офлайн')
    def _():
        pg.evaluate('navigator.serviceWorker.ready')
        pg.reload(); pg.wait_for_function('window.__organizerReady === true')
        check('Офлайн: service worker управляет страницей', pg.evaluate('!!navigator.serviceWorker.controller'))
        ctx.set_offline(True)
        pg.reload(); pg.wait_for_function('window.__organizerReady === true', timeout=10000)
        tab('Сегодня')
        pg.fill('form[data-form="task.quickAdd"] textarea', 'Офлайн-задача')
        pg.click('form[data-form="task.quickAdd"] button[type=submit]')
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
        pg.wait_for_function('window.__organizerReady === true')
        tab('Данные')
        check('Обновление: после «Обновить» работает новая версия', f'Версия {NEW_VERSION}' in main_text())
        check('Обновление: данные сохранились', len(doc()['tasks']) == n_tasks)

    @step('Тесты tests.html')
    def _():
        t = ctx.new_page()
        t.goto(BASE + 'tests.html')
        t.wait_for_function('window.__testResults && window.__testResults.done', timeout=30000)
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
        p2.wait_for_function('window.__organizerReady === true')
        check('Перенос: сообщение о переносе данных прототипа', 'Перенесены данные прототипа' in p2.inner_text('#banners'))
        p2.click('nav button:text-is("Задачи")')
        check('Перенос: задачи прототипа на месте', 'Задача из прототипа' in p2.inner_text('main'))
        check('Перенос: старый ключ не изменён', p2.evaluate("localStorage.getItem('arina-organizer-v1')") == json.dumps(PROTOTYPE, ensure_ascii=False, separators=(',', ':')) or json.loads(p2.evaluate("localStorage.getItem('arina-organizer-v1')")) == PROTOTYPE)
        c2.close()

    # ---- iPhone Safari (not installed): warning about separate storage ----
    @step('Подсказка для Safari на iPhone')
    def _():
        c4 = browser.new_context(**p.devices['iPhone 13'])
        p4 = c4.new_page()
        p4.goto(BASE)
        p4.wait_for_function('window.__organizerReady === true')
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
        p3.wait_for_function('window.__organizerReady === true')
        before = p3.inner_text('main')
        p3.clock.run_for(120000)
        after = p3.inner_text('main')
        check('Смена дня: «Сегодня» само переключается после полуночи (ошибка 13)', 'пт, 9 окт' in before and 'сб, 10 окт' in after)
        c3.close()

    unexpected = [e for e in page_errors]
    check('Нет необработанных ошибок JavaScript на страницах', not unexpected, '; '.join(unexpected[:3]))
    csp = [e for e in console_errors if 'Content Security Policy' in e]
    check('Нет нарушений политики безопасности (CSP)', not csp, '; '.join(csp[:3]))
    browser.close()

srv.shutdown()
passed = sum(1 for r in results if r[1])
print(f'E2E: {passed}/{len(results)} checks passed')
for name, ok, detail in results:
    print(('  ✓ ' if ok else '  ✗ ') + name + (f'  — {detail}' if detail else ''))
json.dump([{'name': n, 'ok': o, 'detail': d} for n, o, d in results], open(os.path.join(OUT, 'e2e-results.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
