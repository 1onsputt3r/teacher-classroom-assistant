const CACHE_PREFIX = 'teacher-classroom-assistant-';
const CACHE_NAME = `${CACHE_PREFIX}pwa-main-20260911-timer-scroll-1`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './preview-v2/',
  './preview-v2/index.html',
  './preview-v2/styles.css?v=20260911-timer-scroll-1',
  './preview-v2/app.js?v=20260911-timer-scroll-1',
  './preview-v2/core.mjs?v=20260911-timer-scroll-1',
  './preview-v2/timer.mjs?v=20260911-timer-scroll-1'
];

function cachesToDelete(keys) {
  return keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(cachesToDelete(keys).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === 'navigate') return caches.match('./index.html');
    return Response.error();
  }));
});
