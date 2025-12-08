// Ustaw root zgodnie z GitHub Pages
const ROOT = "/grafik-4brygadowy/";

// Zmieniaj przy każdym deployu
const CACHE_VERSION = "v13";
const CACHE_NAME = `grafik-cache-${CACHE_VERSION}`;

const ASSETS = [
  ROOT,
  ROOT + "index.html",
  ROOT + "style.css",
  ROOT + "app.js",
  ROOT + "manifest.webmanifest",
  ROOT + "icon-192.png",
  ROOT + "icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Czyścimy stare cache
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith("grafik-cache-") && key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();

      // Wyślij info do aplikacji
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
  const req = event.request;

  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).catch(() => {
        if (req.mode === "navigate") {
          return caches.match(ROOT + "index.html");
        }
      });
    })
  );
});
