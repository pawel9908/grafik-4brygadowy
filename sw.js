const PRECACHE = "grafik-precache-v4";
const RUNTIME = "grafik-runtime-v4";

const PRECACHE_ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
];

// INSTALL – pre-cache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// ACTIVATE – czyścimy stare cache
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![PRECACHE, RUNTIME].includes(key))
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

// FETCH – offline-first (stale-while-revalidate)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const request = event.request;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          // aktualizujemy cache w tle
          const clone = networkResponse.clone();
          caches.open(RUNTIME).then((cache) => {
            cache.put(request, clone);
          });
          return networkResponse;
        })
        .catch(() => {
          // offline + brak w sieci
          if (cachedResponse) return cachedResponse;
          if (request.mode === "navigate") {
            return caches.match("index.html");
          }
        });

      // jeśli mamy coś w cache → zwracamy od razu
      return cachedResponse || fetchPromise;
    })
  );
});
