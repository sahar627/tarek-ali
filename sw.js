/* سَحَر — عامل الخدمة (النسخة المسطّحة) */
const V = 'sahar-flat-v59';
const ASSETS = ['./', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable.png', './icon-180.png', './og.png',
  './athan.json', './recite.json', './takbir.mp3', './makkah.mp3', './madinah.mp3',
  './madinah-fajr.mp3', './rifaat.mp3'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await Promise.all(ASSETS.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.endsWith('.apk')) return;   /* يتولاه المتصفح مباشرة */
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(V)).put(req, res.clone());
      return res;
    } catch {
      return (await caches.match('./index.html')) || new Response('غير متصل', { status: 503 });
    }
  })());
});
