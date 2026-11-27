// Al navegar dentro de /app, el área principal se vuelve el esqueleto de la página destino mientras
// el servidor la prepara (el ClientRouter cambia después solo el contenido; el menú lateral queda).
// Los esqueletos son los <template data-skeleton> de src/components/app/PageSkeleton.astro.

import { announce } from "./dialogs";

// Si la página llega antes, no se muestra nada: evita un parpadeo en navegaciones rápidas.
const DELAY = 150;

type Variant = "dashboard" | "table" | "grid" | "cards";

// Rutas de docs/modelo-de-datos.md.
function skeletonFor(pathname: string): Variant {
  const path = pathname.replace(/\/$/, "");
  if (path === "/app" || /^\/app\/[^/]+\/sucursales$/.test(path)) return "cards";
  if (/\/(catalogo|inventario)$/.test(path)) return "grid";
  if (/^\/app\/[^/]+$/.test(path) || /^\/app\/[^/]+\/sucursales\/[^/]+$/.test(path)) return "dashboard";
  return "table";
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Marca en el menú lateral la sección de `pathname`, antes de que llegue la página (el menú no se vuelve a pintar). */
function markCurrent(pathname: string) {
  // Solo las secciones: la biblioteca de sucursales marca la actual con aria-current="true" y no se toca.
  for (const link of document.querySelectorAll<HTMLAnchorElement>("nav a.nav-link[href]")) {
    if (link.pathname === pathname) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

/** Muestra el esqueleto de `url` en <main> si la navegación tarda más de DELAY. */
export function showPageSkeleton(url: URL) {
  const main = document.querySelector("main");
  const template = document.querySelector<HTMLTemplateElement>(`template[data-skeleton="${skeletonFor(url.pathname)}"]`);
  if (!main || !template) return;

  // La selección del lateral cambia en el acto, sin esperar al servidor.
  markCurrent(url.pathname);

  clearTimeout(timer);
  timer = setTimeout(() => {
    // El anuncio va en una región fija fuera de <main>: una que se crea junto con el cambio no se lee.
    announce("Cargando…");
    main.replaceChildren(template.content.cloneNode(true));
    main.setAttribute("aria-busy", "true");
    // El esqueleto es el principio de otra página: arriba del todo (main se desplaza en escritorio; la ventana, en móvil).
    main.scrollTop = 0;
    window.scrollTo(0, 0);
  }, DELAY);
}

/** Marca `card` como ocupada (global.css › [data-morph][aria-busy]) si la navegación tarda más de DELAY. */
function showCardLoading(card: HTMLElement, pathname: string) {
  markCurrent(pathname);
  clearTimeout(timer);
  timer = setTimeout(() => {
    announce("Cargando…");
    card.setAttribute("aria-busy", "true");
  }, DELAY);
}

// Toda navegación dentro de /app (enlaces, formularios GET, navigate(), Atrás) pasa por aquí.
document.addEventListener("astro:before-preparation", (event) => {
  const { to, from, sourceElement } = event;
  if (!to.pathname.startsWith("/app") || (to.pathname === from.pathname && to.search === from.search)) return;
  // La tarjeta que pasa al encabezado (view transition) tiene que seguir en pantalla cuando llega la página nueva:
  // en vez del esqueleto, la propia tarjeta muestra que está cargando.
  const card = sourceElement?.closest<HTMLElement>("[data-morph]");
  if (card) return showCardLoading(card, to.pathname);
  showPageSkeleton(to);
});

// La página nueva trae su menú lateral: el que se conserva copia de él qué enlaces son los actuales.
// Por tipo de enlace y href: la sucursal actual en la biblioteca lleva el mismo href que su sección («Ventas» y la
// sucursal apuntan a …/ventas), y cada uno tiene su propio aria-current ("page" y "true").
const linkKey = (a: HTMLAnchorElement) => `${a.classList[0] ?? ""} ${a.getAttribute("href")}`;
document.addEventListener("astro:before-swap", (event) => {
  clearTimeout(timer);
  for (const card of document.querySelectorAll("[data-morph][aria-busy]")) card.removeAttribute("aria-busy");
  const links = event.newDocument.querySelectorAll<HTMLAnchorElement>(".sidebar a[href]");
  const current = new Map([...links].map((a) => [linkKey(a), a.getAttribute("aria-current")]));
  for (const link of document.querySelectorAll<HTMLAnchorElement>(".sidebar a[href]")) {
    const value = current.get(linkKey(link));
    if (value) link.setAttribute("aria-current", value);
    else if (current.has(linkKey(link))) link.removeAttribute("aria-current");
  }
});
