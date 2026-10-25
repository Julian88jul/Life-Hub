// Minimaler Service Worker: macht die App installierbar und cached nur die Oberfläche.
// API-Aufrufe gehen immer ans Netz (Mails/Termine sollen nie veraltet angezeigt werden).
const CACHE = "lifehub-shell-v30";
const SHELL = ["./", "style.css", "app.js", "avatars.js", "config.js", "manifest.webmanifest", "icon.svg", "apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Netzwerk zuerst, Cache als Rückfall (so sieht man Änderungen sofort)
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
