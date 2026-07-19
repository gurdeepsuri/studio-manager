// ============================================================================
// sw.js — offline app shell. Bump CACHE when files change to force an update.
// ============================================================================
const CACHE = 'studio-manager-v4';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/router.js',
  './js/state.js',
  './js/db.js',
  './js/ui.js',
  './js/form.js',
  './js/util.js',
  './js/share.js',
  './js/storage.js',
  './js/views/dashboard.js',
  './js/views/projects.js',
  './js/views/quotes.js',
  './js/views/invoices.js',
  './js/views/appointments.js',
  './js/views/expenses.js',
  './js/views/vendors.js',
  './js/views/reports.js',
  './js/views/settings.js',
  './assets/icon.svg',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/fonts/julius-sans-one.woff2',
  './assets/fonts/jost.woff2',
  './assets/fonts/jost-italic.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // SPA navigations → app shell
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }

  // cache-first, then network (and cache the result)
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});
