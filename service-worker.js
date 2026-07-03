const CACHE_VERSION = "20260703161817";
const STATIC_CACHE = `turnuva-sonuclari-static-${CACHE_VERSION}`;
const DATA_CACHE = `turnuva-sonuclari-data-${CACHE_VERSION}`;
const STATIC_FILES = [
  "./",
  "./index.html",
  `./style.css?v=${CACHE_VERSION}`,
  `./app.js?v=${CACHE_VERSION}`,
  `./manifest.webmanifest?v=${CACHE_VERSION}`,
  `./assets/bilardo-atolyesi-header-blue.png?v=${CACHE_VERSION}`,
  `./assets/logo-bilardo-atolyesi.png?v=${CACHE_VERSION}`,
  `./assets/icon-192.png?v=${CACHE_VERSION}`,
  `./assets/icon-512.png?v=${CACHE_VERSION}`,
  `./assets/favicon.png?v=${CACHE_VERSION}`,
  `./assets/apple-touch-icon.png?v=${CACHE_VERSION}`,
  `./favicon.ico?v=${CACHE_VERSION}`
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_FILES))
      .catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith("turnuva-sonuclari-") && ![STATIC_CACHE, DATA_CACHE].includes(key))
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isDataRequest(url) {
  return url.pathname.endsWith("/data/turnuva.json") || url.pathname.endsWith("/data/turnuva.js");
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (_) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw _;
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  if (isDataRequest(url)) {
    event.respondWith(networkFirst(event.request, DATA_CACHE));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, STATIC_CACHE));
    return;
  }

  event.respondWith(networkFirst(event.request, STATIC_CACHE));
});
