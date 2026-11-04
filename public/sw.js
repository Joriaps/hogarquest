/* HogarQuest service worker: offline shell + cache-first static assets.
   Bump VERSION to force clients to drop old caches. */
const VERSION = 'v2';
const CACHE = 'hogarquest-' + VERSION;
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(
        // Cache each entry independently so one failure doesn't abort install.
        PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {}))
      ).then(() =>
        // Also precache the hashed JS/CSS referenced by index.html, so the app works offline from the first launch.
        fetch('./index.html', { cache: 'reload' })
          .then((r) => r.text())
          .then((html) => {
            const assets = [...new Set(html.match(/\.?\/?assets\/[^"'\s>]+/g) || [])].map((a) => './' + a.replace(/^\.?\//, ''));
            return Promise.all(assets.map((a) => cache.add(a).catch(() => {})));
          })
          .catch(() => {})
      ))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('hogarquest-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .catch(() => {})
      .then(() => self.clients.claim())
  );
});

function put(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return;
  const copy = response.clone();
  caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  // Cross-origin (sync API, CDNs) and API paths always go straight to the network.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  if (req.mode === 'navigate') {
    // Network-first for the HTML shell, falling back to the cached index.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) put('./index.html', res);
          return res;
        })
        .catch(() =>
          caches.match('./index.html')
            .then((r) => r || caches.match('./'))
            .then((r) => r || Response.error())
        )
    );
    return;
  }

  // Cache-first for same-origin static assets (hashed /assets/*, icons, fonts...).
  event.respondWith(
    caches.match(req)
      .then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          put(req, res);
          return res;
        });
      })
      .catch(() => fetch(req))
  );
});
