// Push-only service worker: no fetch handler, no offline caching.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const { title, body, url, tag } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: false,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const client = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) return client.focus().then((focused) => (focused ?? client).navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
