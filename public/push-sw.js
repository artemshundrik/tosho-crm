self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Нове сповіщення" };
  }

  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "Нове сповіщення";
  const body = typeof payload.body === "string" ? payload.body : "";
  const href = typeof payload.href === "string" ? payload.href : "/";
  const tag = typeof payload.tag === "string" && payload.tag ? payload.tag : href;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { href },
      badge: "/favicon.svg",
      icon: "/favicon.svg",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url.includes(self.location.origin)) {
          client.navigate(href);
          return client.focus();
        }
      }
      return self.clients.openWindow(href);
    })
  );
});
