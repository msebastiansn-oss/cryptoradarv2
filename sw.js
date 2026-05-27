const APP_VERSION = '2.2.1';
const CACHE = 'cryptoradar-v2-static-' + APP_VERSION;
const DATA_CACHE = 'cryptoradar-v2-data-' + APP_VERSION;

// Solo activos sin query strings — el HTML los referencia con ?v= pero el SW
// los cachea por pathname, no por URL completa.
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE && key !== DATA_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // JSON dinámicos y version.json: siempre red primero, caché como fallback.
  if (url.pathname.includes('/data/') || url.pathname.endsWith('/version.json')) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  // Archivos principales de la app: red primero para no quedar trabado en versión vieja.
  if (
    url.pathname === '/' ||
    url.pathname.endsWith('/cryptoradarv2/') ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/app.js') ||
    url.pathname.endsWith('/style.css') ||
    url.pathname.endsWith('/manifest.json')
  ) {
    event.respondWith(networkFirst(req, CACHE));
    return;
  }

  // Íconos y otros recursos estáticos: caché primero.
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});

async function networkFirst(req, cacheName) {
  try {
    // Forzar bypass de caché del browser para datos dinámicos
    const fetchReq = new Request(req.url, {
      headers: req.headers,
      cache: 'no-store'
    });
    const fresh = await fetch(fetchReq);
    if (fresh.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req.url, fresh.clone()); // cachear por URL base sin params
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(req.url);
    if (cached) return cached;
    // Fallback: intentar sin query string
    const baseUrl = req.url.split('?')[0];
    const cachedBase = await caches.match(baseUrl);
    if (cachedBase) return cachedBase;
    throw err;
  }
}
