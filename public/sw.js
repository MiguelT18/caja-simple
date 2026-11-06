// Service worker de Caja Simple: avisos push (ver supabase/functions/send-push), página sin conexión
// y una copia de Vender para poder abrirla sin red (la cola de ventas vive en registrar-venta.astro).
const SHELL = "shell-v2"; // offline.html (con todo adentro: sin red no carga otro archivo) y los archivos con hash de /_astro (no cambian nunca)
// shortcut: los /_astro de builds viejos se acumulan hasta cambiar SHELL; poda por fecha si la caché crece.
const PAGES = "pages-v1"; // la última copia de cada página de Vender: se borra al cerrar sesión
const SELL_PAGE = /^\/app\/[^/]+\/sucursales\/[^/]+\/registrar-venta\/?$/;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/offline.html"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== PAGES).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // En un equipo compartido, la copia de Vender no debe sobrevivir a la sesión.
  if (url.pathname === "/api/auth/logout") {
    event.waitUntil(caches.delete(PAGES));
    return;
  }
  if (request.method !== "GET") return;

  if (url.pathname.startsWith("/_astro/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) caches.open(SHELL).then((c) => c.put(request, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode !== "navigate") return;
  // Siempre primero la red: caja, stock y avisos salen frescos. La copia es solo para cuando no hay conexión.
  const sell = SELL_PAGE.test(url.pathname);
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (sell && res.ok) {
          const copy = res.clone();
          event.waitUntil(caches.open(PAGES).then((c) => c.put(url.pathname, copy)));
        }
        return res;
      })
      .catch(async () => (sell && (await caches.match(url.pathname, { cacheName: PAGES }))) || (await caches.match("/offline.html"))),
  );
});

self.addEventListener("push", (event) => {
  const { title = "Caja Simple", body = "", url = "/app" } = event.data?.json() ?? {};
  event.waitUntil(self.registration.showNotification(title, { body, icon: "/icons/icon-192.png", badge: "/favicon.svg", data: { url } }));
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
