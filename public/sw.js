const CACHE_NAME = 'ein-klum-shell-v1';
const PRECACHE_URLS = ['./', './index.html', './manifest.webmanifest'];
const NETWORK_TIMEOUT_MS = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkWithTimeout(request, ms = NETWORK_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('network timeout')), ms);
    fetch(request).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Never intercept cross-origin APIs (Firestore, Gemini, OpenAI, Anthropic, Fonts).
  if (url.origin !== self.location.origin) return;

  // Navigation requests (HTML): Network-First so git push updates appear immediately,
  // falling back to cached shell when deep in a supermarket with no signal.
  if (request.mode === 'navigate') {
    event.respondWith(
      networkWithTimeout(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          const cachedHtml = (await caches.match('./index.html')) || (await caches.match('./'));
          return cachedHtml || new Response('Offline', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // Hashed Vite static assets & local product images: Cache-First / SWR for instant offline load.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return res;
        });
      })
    );
    return;
  }

  // Other same-origin static files (manifest, icons): Network-First with cache fallback.
  event.respondWith(
    networkWithTimeout(request)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        return cached || new Response('', { status: 504, statusText: 'Offline' });
      })
  );
});
