/* SALEPRO service worker. The version below is stamped at build time (scripts/stamp-pwa.mjs).
   Caches only this site's own files. Requests to Neon (auth, data) are cross-origin and are never touched,
   so login tokens and business data are never stored by the worker. */
const VERSION = '__APP_VERSION__';
const BASE = '__BASE__'; // '' on its own domain, '/salepro-by-monte' on GitHub Pages
const CACHE = 'salepro-' + VERSION;
const SHELL = [BASE + '/', BASE + '/manifest.webmanifest', BASE + '/icons/icon-192.png', BASE + '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('salepro-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'GET_VERSION' && e.source) e.source.postMessage({ version: VERSION });
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === BASE + '/sw.js' || url.pathname === BASE + '/version.json') return;

  // Page loads: network first so a new release shows up, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(BASE + '/', copy)); return res; })
        .catch(() => caches.match(BASE + '/').then((r) => r || Response.error())),
    );
    return;
  }

  // Built files have a hash in their name, icons and fonts rarely change: cache first.
  if (new RegExp('^' + BASE + '/(_expo|assets|icons)/').test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});
