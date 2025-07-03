const CACHE_NAME = 'pwa-static-v1';
const APP_SHELL = [
  '/',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Handle audio files separately (both network-first and cache)
  if (request.url.endsWith('.m4a')) {
    event.respondWith(
      caches.open('audio-cache-v1').then(cache =>
        cache.match(request).then(
          cached => cached || fetch(request).then(resp => {
            cache.put(request, resp.clone());
            return resp;
          })
        )
      )
    );
    return;
  }

  // App shell - network first, fallback to cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});