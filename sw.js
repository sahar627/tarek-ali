/* سَحَر — عامل الخدمة: تخزين كل الملفات للعمل بدون إنترنت */
const V = 'sahar-v3';
const ASSETS = [
  './', './index.html', './app.css', './app.js', './manifest.webmanifest',
  './data/quran.json', './data/adhkar.json',
  './fonts/amiri-quran.woff2', './fonts/amiri.woff2',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable.png', './icons/icon-180.png'
];

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
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(V)).put(req, res.clone());
      return res;
    } catch {
      return (await caches.match('./index.html')) ||
        new Response('التطبيق غير متصل ولم يُخزَّن هذا الملف بعد.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
  })());
});
