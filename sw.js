// Ustaw root zgodnie z GitHub Pages
const ROOT = "/grafik-4brygadowy/";

// Zmieniaj przy każdym deployu
const CACHE_VERSION = "v29";
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

// INSTALL
self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)),
  );
});

// ACTIVATE
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // usuń stare cache
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith("grafik-cache-") && key !== CACHE_NAME,
          )
          .map((key) => caches.delete(key)),
      );

      await self.clients.claim();

      // powiadom aplikację
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clients) {
        client.postMessage({ type: "NEW_VERSION_AVAILABLE" });
      }
    })(),
  );
});

// FETCH
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  // 🔴 HTML → zawsze świeże (network-first)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(ROOT + "index.html")),
    );
    return;
  }

  // 🟡 JS / CSS → network-first (ważne!)
  if (
    req.url.includes(".js") ||
    req.url.includes(".css") ||
    req.url.includes(".webmanifest")
  ) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  // 🟢 reszta → cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
      );
    }),
  );
});
