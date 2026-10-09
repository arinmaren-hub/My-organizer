// Service worker: keeps a copy of the app's files so it opens without internet.
// It never touches your data (that lives in localStorage, not in this cache).
//
// RELEASE RULE: after changing ANY app file, set VERSION to the same value as
// APP_VERSION in version.js. The changed sw.js is what tells installed copies
// that an update exists; they then show the "new version available" banner.
// If you add a new file, add it to ASSETS too (tests.html checks both).

const VERSION = '0.3.0';
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
  './planday.js',
  './view-onboarding.js'
];

self.addEventListener('install', event => {
  // cache: 'reload' bypasses the browser's HTTP cache so a new version gets fresh files.
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
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
