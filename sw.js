// ════════════════════════════════════════════════════════
// sw.js — Service Worker for Botkassen
// Cache-shell strategi, network-first for alt lokalt innhold,
// Firebase/Firestore går alltid direkte til nett.
// ════════════════════════════════════════════════════════
const VERSJON    = 18;
const CACHE_NAVN = `botkassen-v${VERSJON}`;

const SHELL = [
  './',
  './index.html',
  './botkassa.css',
  './app.js',
  './firebase.js',
  './ui.js',
  './admin.js',
  './botkassa-logikk.js',
  './botkassa-data.js',
  './botkassa-ui.js',
  './botkassa-admin-ui.js',
  './botkassa-del-sesong.js',
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
  // Bare GET fra vår egen opprinnelse caches. Alt annet (Firebase, fonter,
  // QR-tjenesten osv.) går rett til nett uten at service workeren blander seg inn.
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request).then(response => {
      if (response.status === 200) {
        const kopi = response.clone();
        caches.open(CACHE_NAVN).then(cache => cache.put(e.request, kopi));
      }
      return response;
    }).catch(() =>
      caches.match(e.request, { ignoreSearch: true }).then(cached =>
        cached ?? (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
    )
  );
});
