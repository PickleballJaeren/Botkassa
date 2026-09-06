// ════════════════════════════════════════════════════════
// sw.js — Service Worker for Botkassa
// Cache-shell strategi, network-first for alt lokalt innhold,
// Firebase/Firestore går alltid direkte til nett.
// ════════════════════════════════════════════════════════
const VERSJON    = 14;
const CACHE_NAVN = `botkassa-v${VERSJON}`;

const SHELL = [
  './',
  './index.html',
  './botkassa.css',
  './app.js',
  './firebase.js',
  './ui.js',
  './admin.js',
  './botkassa-logikk.js',
  './botkassa-ui.js',
  './botkassa-admin-ui.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './klubbmerke.png',
  './agurkseddel.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAVN).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAVN).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const erEkstern = url.hostname.includes('firebase') || url.hostname.includes('firestore')
    || url.hostname.includes('googleapis') || url.hostname.includes('gstatic') || url.hostname.includes('fonts.g');

  if (erEkstern) { e.respondWith(fetch(e.request)); return; }

  e.respondWith(
    fetch(e.request).then(response => {
      if (e.request.method === 'GET' && response.status === 200) {
        const kopi = response.clone();
        caches.open(CACHE_NAVN).then(cache => cache.put(e.request, kopi));
      }
      return response;
    }).catch(() =>
      caches.match(e.request, { ignoreSearch: true }).then(cached => cached ?? caches.match('./index.html'))
    )
  );
});
