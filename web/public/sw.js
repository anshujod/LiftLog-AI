const CACHE_NAME = "liftlog-static-v2";
const APP_SHELL = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

const STATIC_CACHE_LIMIT = 50;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

// Static-assets only. HTML navigations and API calls are always network-only:
// the app is network-first (good gym wifi) and must never serve stale
// authenticated HTML or cached JSON. Only versioned _next/static chunks and
// icons are cached, with a small LRU cap for low-end Android.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept navigations or API/Next data requests.
  if (request.mode === "navigate") return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/data/")) return;

  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico";

  if (!isStatic) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const clone = response.clone();
        // Fire-and-forget put + LRU trim so slow Cache Storage never blocks paint.
        event.waitUntil(
          cache.put(request, clone).then(async () => {
            const keys = await cache.keys();
            if (keys.length > STATIC_CACHE_LIMIT) {
              await cache.delete(keys[0]);
            }
          })
        );
      }
      return response;
    })
  );
});
