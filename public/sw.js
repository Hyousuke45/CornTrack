/*
 * CornTrack service worker — makes the app installable and lets it open
 * without a network connection.
 *
 * Strategies:
 *   • navigations (page loads)  → network-first, fall back to the cached
 *     /index.html shell so the app opens offline and picks up new deploys
 *     whenever the device is online;
 *   • hashed build assets (/assets/…), icons, manifest → cache-first with a
 *     background refresh (old hashed files are immutable, so this is safe);
 *   • everything else same-origin → stale-while-revalidate;
 *   • cross-origin requests (Supabase API, Google Fonts) are NOT intercepted —
 *     offline data handling lives in the app's IndexedDB sync layer instead.
 */

const VERSION = "corntrack-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll fails the whole install if one asset 404s — cache individually.
      await Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => undefined)
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => !name.startsWith(VERSION)).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase / fonts: handled by the app layer

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put("/index.html", response.clone());
    }
    return response;
  } catch {
    const cached =
      (await caches.match(request)) ||
      (await caches.match("/index.html")) ||
      (await caches.match("/"));
    return (
      cached ||
      new Response("CornTrack is offline and the app shell is not cached yet.", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      })
    );
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches
          .open(request.url.includes("/assets/") ? SHELL_CACHE : RUNTIME_CACHE)
          .then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => undefined);
  return cached || refresh || Response.error();
}

/* Allow the page to ask the worker to skip waiting after an update. */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
