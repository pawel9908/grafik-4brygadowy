const CACHE_NAME = "grafik-cache-v2";

const ASSETS = [
  "./",                 // root (ważne na GitHub Pages)
  "index.html",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.error("Cache addAll error:", err);
      });
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
});

// network-first dla wszystkiego, z fallbackiem na index.html dla nawigacji
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // nawigacja stron (adres w pasku)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("index.html"))
    );
    return;
  }

  // reszta – cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // tylko GET i te same originy wrzucamy do cache
        if (req.method === "GET" && res.ok) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, res.clone());
          });
        }
        return res;
      });
    })
  );
});
