// ZMIEŃ wersję przy każdym większym deployu
const CACHE_VERSION = "v2";
const CACHE_NAME = `grafik-cache-${CACHE_VERSION}`;

const ASSETS = [
  "index.html",
  "style.css",
  "app.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );

  // od razu aktywuj nowego SW (bez czekania)
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // skasuj stare cache
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith("grafik-cache-") && key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      );

      // przejmij od razu kontrolę nad wszystkimi klientami
      await self.clients.claim();

      // powiadom wszystkie okna/apki że jest nowa wersja
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage({ type: "NEW_VERSION_AVAILABLE" });
      }
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // tylko GET
  if (request.method !== "GET") return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).catch(() => {
        // gdy offline i ktoś próbuje wejść na stronę
        if (request.mode === "navigate") {
          return caches.match("index.html");
        }
      });
    })
  );
});
