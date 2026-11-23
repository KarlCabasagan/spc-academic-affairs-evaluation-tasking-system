// Service Worker for SPC Academic Affairs Evaluation System
// Enables offline access for public evaluation pages

const CACHE_NAME = "spc-eval-v2";

const STATIC_ASSETS = [
  "/",
  "/public",
  "/spc-logo.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/manifest.json",
];

const STATIC_EXT_RE = /\.(?:js|css|png|jpg|jpeg|svg|webp|woff2?|json)$/i;

function offlineResponse() {
  return new Response("Offline", {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function isCacheableStaticResponse(response) {
  if (!response || !response.ok) return false;
  const contentType = response.headers.get("Content-Type") || "";
  // Guard against SPA /index.html fallback polluting .js/.css/icon caches
  return !contentType.includes("text/html");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Only intercept same-origin HTTP(S) traffic; never cache Supabase or extension requests
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (url.origin !== self.location.origin) return;
  if (url.hostname.includes("supabase")) return;

  // Navigation requests (HTML): network-first, fallback to cached shell
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const contentType = response.headers.get("Content-Type") || "";
          if (response.ok && contentType.includes("text/html")) {
            const clone = response.clone();
            event.waitUntil(
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, clone))
                .catch(() => {}),
            );
          }
          return response;
        })
        .catch(async () => {
          const cached =
            (await caches.match(request)) ||
            (await caches.match("/public")) ||
            (await caches.match("/"));
          return cached || offlineResponse();
        }),
    );
    return;
  }

  // Static assets: cache-first with safe background revalidation
  if (STATIC_EXT_RE.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          event.waitUntil(
            fetch(request)
              .then((networkResponse) => {
                if (isCacheableStaticResponse(networkResponse)) {
                  const clone = networkResponse.clone();
                  return caches
                    .open(CACHE_NAME)
                    .then((cache) => cache.put(request, clone));
                }
                return undefined;
              })
              .catch(() => {}),
          );
          return cachedResponse;
        }

        return fetch(request)
          .then((networkResponse) => {
            if (isCacheableStaticResponse(networkResponse)) {
              const clone = networkResponse.clone();
              event.waitUntil(
                caches
                  .open(CACHE_NAME)
                  .then((cache) => cache.put(request, clone))
                  .catch(() => {}),
              );
            }
            return networkResponse;
          })
          .catch(() => offlineResponse());
      }),
    );
    return;
  }

  // Default same-origin fallback: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          event.waitUntil(
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, clone))
              .catch(() => {}),
          );
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        return cached || offlineResponse();
      }),
  );
});
