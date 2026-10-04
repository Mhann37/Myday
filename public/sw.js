// Minimal service worker: makes the app installable and shows an offline page
// when a navigation fails. Check-in data is never cached here.
const CACHE = "myday-shell-v3";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([OFFLINE_URL, "/vault.js", "/offline-app.js"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (["/vault.js", "/offline-app.js"].includes(url.pathname)) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request)),
    );
    return;
  }
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL)),
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  event.waitUntil(
    (async () => {
      const payload = event.data.json();
      await self.registration.showNotification(payload.title || "My Day", {
        body: payload.body,
        icon: "/icons/icon-192.png",
        tag: payload.tag,
        data: { url: payload.url || "/", id: payload.id },
        actions: [{ action: "snooze", title: "Snooze 15 min" }],
      });
      if (payload.id)
        await fetch("/api/reminders/receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: payload.id }),
        }).catch(() => {});
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    (async () => {
      if (event.action === "snooze" && data.id) {
        const r = await fetch("/api/reminders/snooze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: data.id }),
        }).catch(() => null);
        if (r?.ok) return;
      }
      const url = new URL(data.url || "/", self.location.origin);
      if (url.origin !== self.location.origin) return;
      await self.clients.openWindow(url.href);
    })(),
  );
});
