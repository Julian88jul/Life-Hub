// Minimaler Service Worker: macht die App installierbar und cached nur die Oberfläche.
// API-Aufrufe gehen immer ans Netz (Mails/Termine sollen nie veraltet angezeigt werden).
const CACHE = "lifehub-shell-v43";
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

// Erinnerungen: Benachrichtigung zeigen (kommt vom Server über den Push-Dienst von Apple bzw. Google)
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Life Hub", {
    body: d.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: d.tag || undefined,
    data: { url: d.url || "./" },
  }));
});

// Antippen: offene App nach vorn holen und den Tag im Kalender zeigen, sonst die App öffnen
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  const day = (url.match(/#day=(\d{4}-\d{2}-\d{2})/) || [])[1];
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope) && "focus" in c) {
        if (day) c.postMessage({ type: "open-day", day });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
