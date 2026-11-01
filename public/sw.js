// Service worker de Caja Simple: solo muestra las notificaciones push (ver supabase/functions/send-push).
self.addEventListener("push", (event) => {
  const { title = "Caja Simple", body = "", url = "/app" } = event.data?.json() ?? {};
  event.waitUntil(self.registration.showNotification(title, { body, icon: "/favicon.svg", badge: "/favicon.svg", data: { url } }));
});

// Al tocar el aviso: enfoca una pestaña de la app si hay una abierta; si no, abre una.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/app", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      return open ? open.focus().then((w) => w?.navigate(url)) : self.clients.openWindow(url);
    }),
  );
});
