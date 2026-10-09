"""Upgrade test: an installed older version (0.2.0, 0.2.1 or 0.2.2) with real,
saved data is updated to the new version the way an iPhone gets it — the
service worker finds the new files, the user taps «Обновить».
Two independent browser contexts (two people) are upgraded side by side.
Usage: python3 upgrade-test.py <old_app_dir> <new_app_dir> <out_dir>

Checked (DECISIONS.md, release rules R1–R12):
  - every task, event, project, milestone, list item, deleted record, quarantine
    entry and setting is identical after the upgrade, field by field;
  - the exact original text is kept as a rollback copy and can be restored;
  - the old version's automatic copies are all kept;
  - appearance, language and device keys are untouched; no key is removed;
  - the service-worker update does not clear or reset anything;
  - a window still running the old version cannot overwrite upgraded data;
  - the two people's data never mix.
"""
import functools, http.server, json, os, re, shutil, socketserver, sys, threading, traceback
from playwright.sync_api import sync_playwright

OLD, NEW, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
SITE = os.path.join(OUT, 'site')
shutil.rmtree(SITE, ignore_errors=True)
shutil.copytree(OLD, SITE)
ver = lambda d: re.search(r"APP_VERSION = '([^']+)'", open(os.path.join(d, 'version.js'), encoding='utf-8').read()).group(1)
OLD_V, NEW_V = ver(OLD), ver(NEW)


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

NOW = '2026-09-15T10:00:00.000Z'
def realistic(tag):
    """Data of someone who has used the organizer for a while (schema 2)."""
    d = {'schemaVersion': 2, 'createdAt': '2026-03-01T08:00:00.000Z', 'updatedAt': NOW, 'tasks': [], 'events': [], 'projects': [], 'lists': [],
         'settings': {'eveningPreview': {'enabled': tag == 'A', 'time': '21:00'}}, 'quarantine': []}
    for i in range(80):
        kind = ('day', 'week', 'none')[i % 3]
        date = f'2026-10-{1 + i % 20:02d}' if kind == 'day' else ('2026-09-28', '2026-10-05', '2026-10-12')[i % 3] if kind == 'week' else None
        t = {'id': f'{tag}-t{i}', 'title': f'{tag}-личная задача {i} «текст» & <b>', 'plan': {'kind': kind, 'date': date}, 'time': None, 'reminder': None,
             'deadline': f'2026-11-{1 + i % 28:02d}' if i % 5 == 0 else None, 'projectId': f'{tag}-p1' if i % 13 == 0 else None,
             'done': i % 4 == 0, 'completedAt': f'2026-10-{1 + i % 9:02d}T18:00:00.000Z' if i % 4 == 0 else None,
             'createdAt': f'2026-09-{1 + i % 28:02d}T09:00:00.000Z', 'updatedAt': f'2026-09-{1 + i % 28:02d}T09:30:00.000Z',
             'deletedAt': '2026-10-05T12:00:00.000Z' if i % 17 == 0 else None}
        if kind == 'day' and i % 6 == 0:
            t['time'] = '08:45'; t['reminder'] = {'minutesBefore': 15}
        d['tasks'].append(t)
    for i in range(15):
        d['events'].append({'id': f'{tag}-e{i}', 'title': f'{tag}-событие {i}', 'start': f'2026-10-{1 + i:02d}T{8 + i % 12:02d}:30', 'end': None, 'allDay': False,
                            'repeat': {'freq': 'weekly', 'days': [2, 4], 'until': None, 'skip': ['2026-10-08']} if i == 0 else None,
                            'alerts': [{'minutesBefore': 60}] if i == 1 else [], 'createdAt': NOW, 'updatedAt': NOW, 'deletedAt': None})
    for p in range(1, 4):
        d['projects'].append({'id': f'{tag}-p{p}', 'name': f'{tag}-проект {p}', 'milestones': [
            {'id': f'{tag}-m{p}-{j}', 'title': f'Этап {j}', 'done': j < p, 'createdAt': NOW, 'updatedAt': NOW, 'deletedAt': None} for j in range(5)],
            'quantity': {'current': p * 2, 'total': 12, 'unit': 'глав'}, 'createdAt': NOW, 'updatedAt': NOW, 'deletedAt': None})
    for l in range(1, 4):
        d['lists'].append({'id': f'{tag}-l{l}', 'name': f'{tag}-список {l}', 'items': [
            {'id': f'{tag}-i{l}-{j}', 'title': f'{tag}-пункт {j}', 'done': j % 2 == 1, 'createdAt': NOW, 'updatedAt': NOW, 'deletedAt': None} for j in range(8)],
            'createdAt': NOW, 'updatedAt': NOW, 'deletedAt': None})
    d['quarantine'].append({'at': NOW, 'source': 'import', 'collection': 'events', 'parentId': None, 'reason': 'нет или неверное время начала',
                            'record': {'id': f'{tag}-bad', 'name': 'без времени'}})
    return d

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    dump = lambda q: q.evaluate("Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))")

    def ready(q):
        q.wait_for_function('window.__organizerReady === true', timeout=15000)

    def open_old(tag, appearance):
        c = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Europe/Athens', accept_downloads=True)
        q = c.new_page()
        q.on('pageerror', lambda e: errors.append(f'{tag}: {e}'))
        q.on('dialog', lambda d: d.accept())
        q.goto(BASE); ready(q)
        q.evaluate('navigator.serviceWorker.ready')
        q.evaluate("([d, a]) => { localStorage.setItem('organizer:data', JSON.stringify(d)); localStorage.setItem('organizer:appearance', a);"
                   " localStorage.setItem('organizer:device', JSON.stringify({ lastDailySnapshot: '2026-01-01' })); }", [realistic(tag), appearance])
        q.reload(); ready(q)
        return c, q

    def use_old_version(tag, q):
        """Real work in the old version: every kind of copy is made by the old code itself."""
        tab = lambda i: q.click(f'nav button >> nth={i}')
        q.fill('form[data-form="task.quickAdd"] textarea', f'{tag}-добавлена в {OLD_V}')
        q.click('form[data-form="task.quickAdd"] button[type=submit]')       # first change today → daily copy
        tab(2)
        q.locator('.row:has-text("личная задача 1 ") input[type=checkbox]').first.check()
        tab(4)
        q.fill('form[data-form="item.add"] input[name=title] >> nth=0', f'{tag}-новый пункт')
        q.press('form[data-form="item.add"] input[name=title] >> nth=0', 'Enter')
        tab(5)
        with q.expect_download() as dl:
            q.click('main button[data-action="backup.export"]')            # export → last backup date
        path = os.path.join(OUT, f'backup-{tag}-{OLD_V}.json')
        dl.value.save_as(path)
        data = json.load(open(path, encoding='utf-8'))
        data['data']['tasks'].append(dict(data['data']['tasks'][0], id=f'{tag}-from-import', title=f'{tag}-из импорта'))
        mod = os.path.join(OUT, f'backup-{tag}-mod.json')
        json.dump(data, open(mod, 'w', encoding='utf-8'), ensure_ascii=False)
        q.set_input_files('input[data-action="import.file"]', mod)
        q.wait_for_selector('button[data-action="import.apply"]', timeout=5000)
        q.click('button[data-action="import.apply"]')                       # import → 'before-import' copy
        q.click('button[data-action="snapshot.restore"] >> nth=0')          # restore → 'before-restore' copy
        tab(2)
        q.locator('.row:has-text("личная задача 2 ") button[data-action="task.delete"]').first.click()  # soft delete
        return path

    def records(doc):
        return {k: doc[k] for k in ('tasks', 'events', 'projects', 'lists', 'quarantine')}

    def update_to_new(q):
        q.evaluate('navigator.serviceWorker.getRegistration().then(r => r.update())')
        q.wait_for_selector('#banners button[data-action="update.apply"]', timeout=20000)
        with q.expect_navigation():
            q.click('#banners button[data-action="update.apply"]')
        ready(q)

    people = {}
    @step(f'{OLD_V}: два человека работают со старой версией')
    def _():
        for tag, look in (('A', 'dark'), ('B', 'light')):
            c, q = open_old(tag, look)
            use_old_version(tag, q)
            q.reload(); ready(q)
            people[tag] = {'ctx': c, 'page': q, 'before': dump(q)}
            snaps = json.loads(people[tag]['before'].get('organizer:snapshots') or '[]')
            reasons = sorted(s['reason'] for s in snaps)
            check(f'{tag}: старая версия сделала свои копии (ежедневная, перед импортом, перед восстановлением)',
                  {'daily', 'before-import', 'before-restore'} <= set(reasons), str(reasons))
            check(f'{tag}: в старой версии есть удалённая запись и выполненные задачи',
                  any(t['deletedAt'] for t in json.loads(people[tag]['before']['organizer:data'])['tasks']))
        # A also has a second window still running the old version
        people['A']['old_window'] = people['A']['ctx'].new_page()
        people['A']['old_window'].on('pageerror', lambda e: errors.append(f'A-old: {e}'))
        people['A']['old_window'].goto(BASE); ready(people['A']['old_window'])

    # ---- the new version is published ----
    for f in os.listdir(NEW):
        src = os.path.join(NEW, f)
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(SITE, f))

    @step(f'Обновление {OLD_V} → {NEW_V} через «Обновить»')
    def _():
        for tag in ('A', 'B'):
            q = people[tag]['page']
            update_to_new(q)
            people[tag]['after'] = dump(q)
            people[tag]['banners'] = q.inner_text('#banners')
            people[tag]['onboarding'] = q.locator('form[data-form="onboarding.save"]').count() == 1

    for tag in ('A', 'B'):
        @step(f'{tag}: проверка после обновления')
        def _():
            P = people[tag]
            before, after = P['before'], P['after']
            old_raw = before['organizer:data']
            old, new = json.loads(old_raw), json.loads(after['organizer:data'])
            check(f'{tag}: работает новая версия {NEW_V}, формат данных 3', P['page'].evaluate("import('./version.js').then(m => m.APP_VERSION)") == NEW_V and new['schemaVersion'] == 3)
            for k, v in records(old).items():
                check(f'{tag}: {k} — каждая запись и каждое поле без изменений ({len(v)} шт.)', new[k] == v)
            check(f'{tag}: настройки вечерней сводки и даты документа сохранены',
                  new['settings']['eveningPreview'] == old['settings']['eveningPreview'] and (new['createdAt'], new['updatedAt']) == (old['createdAt'], old['updatedAt']))
            check(f'{tag}: выполненные, дедлайны, удалённые, повторы на месте',
                  sum(t['done'] for t in new['tasks']) == sum(t['done'] for t in old['tasks']) and sum(bool(t['deadline']) for t in new['tasks']) == sum(bool(t['deadline']) for t in old['tasks'])
                  and sum(bool(t['deletedAt']) for t in new['tasks']) == sum(bool(t['deletedAt']) for t in old['tasks']) and new['events'][0]['repeat'] == old['events'][0]['repeat'])
            rb = json.loads(after.get('organizer:rollback') or '[]')
            mig = [c for c in rb if c['reason'] == 'before-migration']
            check(f'{tag}: исходный текст сохранён как копия для отката — побайтно', len(mig) == 1 and mig[0]['raw'] == old_raw)
            old_copies = json.loads(before.get('organizer:snapshots') or '[]')
            new_copies = json.loads(after.get('organizer:snapshots') or '[]') + [c for c in rb if c['reason'] != 'before-migration']
            key = lambda c: (c.get('id') or c['at'], c['reason'])
            check(f'{tag}: все {len(old_copies)} копий старой версии сохранены', sorted(map(key, old_copies)) == sorted(map(key, new_copies)),
                  f'{sorted(map(key, old_copies))} vs {sorted(map(key, new_copies))}')
            check(f'{tag}: ни один ключ хранилища не удалён', set(before) <= set(after), str(set(before) - set(after)))
            check(f'{tag}: оформление и сведения устройства не тронуты',
                  after.get('organizer:appearance') == before.get('organizer:appearance') and json.loads(after['organizer:device']).get('lastBackupAt') == json.loads(before['organizer:device']).get('lastBackupAt'))
            check(f'{tag}: сообщение «Данные переведены в новый формат»', 'переведены в новый формат' in P['banners'], P['banners'][:200])
            check(f'{tag}: после обновления один раз задаются вопросы о дне', P['onboarding'])
            other = 'B' if tag == 'A' else 'A'
            check(f'{tag}: в хранилище нет ни одной записи другого человека', f'{other}-личная' not in json.dumps(after, ensure_ascii=False) and f'{other}-' not in after['organizer:data'])

    @step('Окно со старой версией не может перезаписать новые данные')
    def _():
        w = people['A']['old_window']
        disk = w.evaluate("localStorage.getItem('organizer:data')")
        w.evaluate("window.dispatchEvent(new StorageEvent('storage', { key: 'organizer:data' }))")
        w.fill('form[data-form="task.quickAdd"] textarea', 'из старого окна')
        w.click('form[data-form="task.quickAdd"] button[type=submit]')
        check('Старое окно: только чтение (данные новее его версии)', 'Только чтение' in w.inner_text('#banners') or 'только чтения' in w.inner_text('#banners').lower(), w.inner_text('#banners')[:200])
        check('Старое окно: ничего не записало', w.evaluate("localStorage.getItem('organizer:data')") == disk)
        w.close()

    @step('После вопросов о дне и повторного запуска')
    def _():
        A, B = people['A']['page'], people['B']['page']
        A.click('[data-action="onboarding.skip"]')
        B.fill('input[name=bed]', '00:30')
        B.click('form[data-form="onboarding.save"] button[type=submit]')
        for tag, q in (('A', A), ('B', B)):
            q.wait_for_selector('nav button')
            q.reload(); ready(q)
            after = dump(q)
            new = json.loads(after['organizer:data'])
            old = json.loads(people[tag]['before']['organizer:data'])
            check(f'{tag}: записи по-прежнему совпадают с данными {OLD_V}', records(new) == records(old))
            rb = json.loads(after['organizer:rollback'])
            check(f'{tag}: копия перед обновлением не дублируется при перезапуске', sum(c['reason'] == 'before-migration' for c in rb) == 1)
        check('B: конец дня = время сна (00:30)', json.loads(dump(B)['organizer:data'])['settings']['day']['cutoff'] == '00:30')

    @step('Откат к данным до обновления')
    def _():
        q = people['A']['page']
        q.fill('form[data-form="task.quickAdd"] textarea', 'после обновления')
        q.click('form[data-form="task.quickAdd"] button[type=submit]')
        q.click('nav button >> nth=5')
        row = q.locator('.row:has-text("перед обновлением формата данных")')
        check('В «Автокопиях» видна копия «перед обновлением формата данных»', row.count() == 1)
        row.locator('button[data-action="snapshot.restore"]').click()
        new = json.loads(q.evaluate("localStorage.getItem('organizer:data')"))
        old = json.loads(people['A']['before']['organizer:data'])
        check('Откат возвращает все записи точно как в старой версии', records(new) == records(old))
        check('После отката вопросы о дне не повторяются', q.locator('form[data-form="onboarding.save"]').count() == 0)

    @step('Офлайн после обновления')
    def _():
        q = people['B']['page']
        caches = q.evaluate("caches.keys()")
        check('Старый офлайн-кэш удалён, новый на месте', caches == ['organizer-' + NEW_V], str(caches))
        before = q.evaluate("localStorage.getItem('organizer:data')")
        people['B']['ctx'].set_offline(True)
        q.reload(); ready(q)
        check('Без сети открывается новая версия с теми же данными', q.evaluate("localStorage.getItem('organizer:data')") == before and 'B-' in q.inner_text('main'))
        people['B']['ctx'].set_offline(False)

    check('Нет необработанных ошибок JavaScript', not errors, '; '.join(errors[:3]))
    browser.close()

srv.shutdown()
passed = sum(1 for r in results if r[1])
print(f'UPGRADE {OLD_V} → {NEW_V}: {passed}/{len(results)} checks passed')
for name, ok, detail in results:
    print(('  ✓ ' if ok else '  ✗ ') + name + (f'  — {detail}' if detail and not ok else ''))
json.dump([{'name': n, 'ok': o, 'detail': d} for n, o, d in results], open(os.path.join(OUT, 'upgrade-results.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
sys.exit(0 if passed == len(results) else 1)
