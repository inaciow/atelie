const V = 'atelie-9';
const BASE = ['./', 'index.html', 'app.js', 'cfg.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'icon-maskable-512.png', 'icon-mono-512.png'];
const EXT = /^https:\/\/(www\.gstatic\.com\/firebasejs\/|cdn\.jsdelivr\.net\/npm\/pdfjs-dist@|cdnjs\.cloudflare\.com\/|fonts\.googleapis\.com\/|fonts\.gstatic\.com\/)/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const meu = u.origin === location.origin;
  if (!meu && !EXT.test(r.url)) return;
  e.respondWith(caches.open(V).then(async c => {
    if (meu) {
      try { const res = await fetch(r, {cache: 'no-cache'}); if (res && res.ok) c.put(r, res.clone()); return res; }
      catch { return (await c.match(r, {ignoreSearch: true})) || (r.mode === 'navigate' ? c.match('index.html') : new Response('', {status: 504})); }
    }
    const hit = await c.match(r);
    if (hit) return hit;
    const res = await fetch(r).catch(() => null);
    if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone());
    return res || new Response('', {status: 504});
  }));
});
