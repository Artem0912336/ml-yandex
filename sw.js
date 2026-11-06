// Service worker офлайн-версии: кеширует приложение и движок Python
const CACHE = 'ml90-ab1790d59c50';
const LOCAL = ["./", "index.html", "worker.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
const CDN = ["https://cdn.jsdelivr.net/npm/pyodide@0.26.4/full/pyodide.js", "https://cdn.jsdelivr.net/npm/pyodide@0.26.4/full/pyodide.asm.js", "https://cdn.jsdelivr.net/npm/pyodide@0.26.4/full/pyodide.asm.wasm", "https://cdn.jsdelivr.net/npm/pyodide@0.26.4/full/python_stdlib.zip", "https://cdn.jsdelivr.net/npm/pyodide@0.26.4/full/pyodide-lock.json", "https://cdn.jsdelivr.net/npm/alasql@4.6.0/dist/alasql.min.js"];
const ALL = LOCAL.concat(CDN);
async function broadcast(msg) { for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg); }
async function fill() {
  const cache = await caches.open(CACHE);
  let done = 0;
  for (const url of ALL) {
    if (!(await cache.match(url, { ignoreVary: true }))) {
      const res = await fetch(url, { mode: CDN.includes(url) ? 'cors' : 'same-origin', cache: 'reload' });
      if (!res.ok) throw new Error(url.split('/').pop() + ': HTTP ' + res.status);
      await cache.put(url, res);
    }
    done++;
    if (done % 2 === 0 || done === ALL.length) broadcast({ type: 'progress', done, total: ALL.length });
  }
}
self.addEventListener('install', (e) => {
  e.waitUntil(fill().then(() => broadcast({ type: 'ready' }), (err) => broadcast({ type: 'failed', error: String(err.message || err) })).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('ml90-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'check' && e.ports[0]) {
    caches.open(CACHE).then(async (cache) => {
      let missing = 0;
      for (const url of ALL) if (!(await cache.match(url, { ignoreVary: true }))) missing++;
      if (missing) fill().then(() => broadcast({ type: 'ready' }), (err) => broadcast({ type: 'failed', error: String(err.message || err) }));
      e.ports[0].postMessage({ ok: !missing, missing, total: ALL.length });
    });
  }
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreVary: true, ignoreSearch: req.mode === 'navigate' }) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      // шрифты и прочее с CDN — сохранить на будущее
      if (res.ok && /fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(req.url)) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});
