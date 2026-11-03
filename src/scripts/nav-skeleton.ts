// Al navegar dentro de /app, el área principal se vuelve el esqueleto de la página destino mientras
// el servidor la prepara. Es navegación normal del navegador: solo cambia lo que se ve mientras espera.
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

let original: Node[] | null = null;
const originalPath = location.pathname;
let timer: ReturnType<typeof setTimeout> | undefined;

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
    original ??= [...main.childNodes];
    // El anuncio va en una región fija fuera de <main>: una que se crea junto con el cambio no se lee.
    announce("Cargando…");
    main.replaceChildren(template.content.cloneNode(true));
    main.setAttribute("aria-busy", "true");
  }, DELAY);
}

document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = (event.target as Element).closest?.("a[href]");
  if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute("download")) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || !url.pathname.startsWith("/app")) return;
  if (url.pathname === location.pathname && url.search === location.search) return;
  showPageSkeleton(url);
});

// Al volver con «Atrás», el navegador puede restaurar esta página tal como quedó: devuelve el contenido.
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  clearTimeout(timer);
  const main = document.querySelector("main");
  if (main && original) main.replaceChildren(...original);
  main?.removeAttribute("aria-busy");
  original = null;
  markCurrent(originalPath);
});
