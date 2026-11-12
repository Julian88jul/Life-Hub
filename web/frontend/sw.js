// Service Worker: macht die App installierbar und startet sie sofort aus dem Speicher des Geräts.
// Die Oberfläche kommt aus dem Cache; im Hintergrund wird nach einer neuen Version gefragt. Gibt es eine,
// bekommt die geöffnete Seite Bescheid (kurz nach dem Start lädt sie still neu, sonst erscheint ein Hinweis).
// API-Aufrufe laufen nie über diesen Cache.
const VERSION = "46"; // gleich wie ?v= in index.html
const CACHE = `lifehub-shell-v${VERSION}`;
const SHELL = ["./", `style.css?v=${VERSION}`, `app.js?v=${VERSION}`, `avatars.js?v=${VERSION}`, `config.js?v=${VERSION}`,
  "manifest.webmanifest", "icon.svg", "icon-192.png", "apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  // „reload“: am Browser-Zwischenspeicher vorbei, damit keine alten Dateien in den neuen Cache geraten
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Neue Version der Seite im Hintergrund geladen: offene Fenster bekommen Bescheid. Weil die neu geöffnete Seite beim
// Erkennen oft noch nicht existiert, fragt sie außerdem selbst nach („hello“) und nennt ihre Version.
let latest = null; // Version der zuletzt geladenen Seite (aus app.js?v=…)
const versionOf = (html) => (html.match(/app\.js\?v=(\d+)/) || [])[1] || null;
const notifyUpdate = () => self.clients.matchAll({ type: "window" })
  .then((list) => list.forEach((c) => c.postMessage({ type: "update-ready", version: latest })));
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "hello" && latest && e.data.version !== latest && e.source) {
    e.source.postMessage({ type: "update-ready", version: latest });
  }
});

async function respond(e) {
  const cache = await caches.open(CACHE);
  const isPage = e.request.mode === "navigate";
  const key = isPage ? "./" : e.request; // die Seite liegt immer unter „./“ (Anker und Parameter spielen keine Rolle)
  const cached = await cache.match(key);
  const cachedPage = isPage && cached ? cached.clone() : null; // vorher kopieren: die Antwort selbst geht gleich an die Seite
  // Im Hintergrund beim Server nachfragen („no-cache“: unverändert = kurze 304-Antwort) und den Cache auffrischen
  const fresh = fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then(async (res) => {
    if (res.ok && res.type === "basic") {
      if (cachedPage) {
        const [before, after] = await Promise.all([cachedPage.text(), res.clone().text()]);
        await cache.put(key, res.clone());
        if (before !== after && versionOf(after) && versionOf(after) !== versionOf(before)) {
          latest = versionOf(after);
          await notifyUpdate();
        }
      } else {
        await cache.put(key, res.clone());
      }
    }
    return res;
  });
  if (cached) {
    e.waitUntil(fresh.catch(() => {}));
    return cached;
  }
  try { return await fresh; } catch {
    return (await caches.match(e.request, { ignoreSearch: true })) || Response.error();
  }
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(respond(e));
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
