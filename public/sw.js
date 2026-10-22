// Push-only service worker: no fetch handler, no offline caching.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function parsePayload(event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  if (!data || typeof data !== "object") data = {};
  return {
    title: typeof data.title === "string" && data.title ? data.title : "Training Tailor",
    body: typeof data.body === "string" ? data.body : undefined,
    url: typeof data.url === "string" && data.url ? data.url : "/",
    tag: typeof data.tag === "string" && data.tag ? data.tag : undefined,
  };
}

// Always show a notification: Safari/iOS may revoke subscriptions for silent pushes.
self.addEventListener("push", (event) => {
  const { title, body, url, tag } = parsePayload(event);
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
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const client = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        try {
          const focused = await client.focus();
          await (focused ?? client).navigate(url);
          return;
        } catch {
          // Uncontrolled or detached client: fall through to a new window.
        }
      }
      await self.clients.openWindow(url);
    }),
  );
});
