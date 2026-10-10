// Service worker: keeps a copy of the app's files so it opens without internet.
// It never touches your data (that lives in localStorage, not in this cache).
//
// RELEASE RULE: after changing ANY app file, set VERSION to the same value as
// APP_VERSION in version.js. The changed sw.js is what tells installed copies
// that an update exists; they then show the "new version available" banner.
// If you add a new file, add it to ASSETS too (tests.html checks both).

const VERSION = '0.5.1';
const CACHE = 'organizer-' + VERSION;
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './boot.js',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './app.js',
  './version.js',
  './util.js',
  './dates.js',
  './schema.js',
  './storage.js',
  './store.js',
  './backup.js',
  './selectors.js',
  './actions.js',
  './components.js',
  './view-today.js',
  './view-calendar.js',
  './view-tasks.js',
  './view-projects.js',
  './view-lists.js',
  './view-data.js',
  './view-settings.js',
  './appearance.js',
  './i18n.js',
  './i18n-v4.js',
  './i18n-v5.js',
  './home.js',
  './icons.js',
  './view-sheets.js',
  './parsedate.js',
  './recur.js',
  './templates.js',
  './calendar.js',
  './view-waiting.js',
  './view-evening.js',
  './planday.js',
  './view-onboarding.js'
];

self.addEventListener('install', event => {
  // Every file is fetched with «?v=<version>» and cache: 'reload': the address is new for this version, so neither the
  // browser's cache nor a CDN in front of the site can hand back an old copy of one file next to new copies of the others.
  // The copy is stored under the plain address. If version.js does not say this version, the install stops and is
  // tried again later (a half-uploaded site never becomes the offline copy).
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const fetched = [];
    for (const url of ASSETS) {
      const res = await fetch(new Request(`${url}?v=${encodeURIComponent(VERSION)}`, { cache: 'reload' }));
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      // the body is read right away (an unread response keeps its connection busy and the next fetch would wait for it)
      fetched.push([url, new Response(await res.arrayBuffer(), { status: res.status, statusText: res.statusText, headers: res.headers })]);
    }
    const ver = fetched.find(([u]) => u === './version.js');
    if (ver && !(await ver[1].clone().text()).includes(`'${VERSION}'`)) throw new Error('version.js does not match sw.js');
    for (const [url, res] of fetched) await cache.put(url, res);
  })());
  // No skipWaiting() here: the new version waits until the user taps "Обновить".
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('organizer-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Pages: cached copy first; other pages (e.g. tests.html) from the network;
    // offline fallback is the app itself.
    event.respondWith((async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      try { return await fetch(req); } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)));
});
