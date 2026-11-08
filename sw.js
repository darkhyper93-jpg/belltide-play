/*
 * Belltide service worker: makes the PWA installable and playable offline.
 * - Pages: network first (always get the newest build), cache as fallback.
 * - Hashed build assets (/assets/): cache first (their names change per build);
 *   range requests (the music's audio element) get the whole file.
 * - Other same-origin files: stale-while-revalidate.
 * - version.json: never cached (update check, src/ui/update.ts).
 */
const CACHE = 'belltide-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // The update check must always reach the network.
  if (url.pathname.endsWith('/version.json')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./'))),
    );
    return;
  }

  if (url.pathname.includes('/assets/')) {
    // An audio element asks for byte ranges (206), which the cache cannot
    // keep: fetch the whole file instead, so the music also plays offline.
    // A full 200 answers a range request fine for media.
    const whole = req.headers.has('range') ? new Request(url.href) : req;
    event.respondWith(
      caches.match(whole).then((hit) => hit || fetch(whole).then((res) => {
        if (res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(whole, copy));
        }
        return res;
      })),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => hit);
      return hit || fresh;
    }),
  );
});
