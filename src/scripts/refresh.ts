// Actualizar solo lo que cambió, sin recargar la página entera.
//   <section data-region="totales"> → refreshRegions() trae esta misma página otra vez y cambia cada región por la nueva.
// Las islas React se conservan (con su estado: búsqueda, página, filtro) y reciben los props nuevos.
// Los scripts que se atan a elementos al cargar escuchan «regions:swapped» para volver a atarse a las regiones nuevas.
// La app navega con el ClientRouter de Astro (Layout.astro): onPage() y onRegions() corren en cada página, no solo en la primera.
import { navigate } from "astro:transitions/client";

// Mientras se navega a otra página, actualizar esta no tiene sentido: <main> ya puede ser el esqueleto y, sin regiones,
// el respaldo de recargar devolvía a la página que se estaba dejando.
let navigating = false;
if (typeof document !== "undefined") {
  document.addEventListener("astro:before-preparation", () => (navigating = true));
  document.addEventListener("astro:page-load", () => (navigating = false));
}

/**
 * Cambia las regiones `names` (todas, si no se pasan) por las de `url` (por defecto, esta misma página).
 * Sin regiones o sin red, recarga: nunca queda peor que antes.
 * Con `keepFocus` (avisos en vivo, que nadie pidió con un clic): el foco vuelve al mismo control de la región nueva
 * y, si no estaba en una región, no se toca. Esos avisos nunca navegan: si algo falla, la página queda como estaba.
 * Tampoco cambian una región en uso (busy): se actualiza en el próximo aviso.
 */
export async function refreshRegions(names?: string[], url = location.href, { keepFocus = false } = {}) {
  if (navigating) return;
  const from = location.href;
  const fallback = () => (keepFocus ? undefined : navigate(url));
  const selector = (name: string) => `[data-region="${CSS.escape(name)}"]`;
  const current = [...document.querySelectorAll<HTMLElement>("[data-region]")].filter((el) => !names || names.includes(el.dataset.region!));
  if (current.length === 0) return fallback();

  let fresh: Document;
  try {
    const response = await fetch(url, { headers: { accept: "text/html" } });
    if (!response.ok) throw new Error(String(response.status));
    fresh = new DOMParser().parseFromString(await response.text(), "text/html");
  } catch {
    return fallback();
  }
  // Se navegó a otra página mientras llegaba esta: lo que trajo ya no corresponde.
  if (navigating || location.href !== from) return;

  const focusedId = document.activeElement?.id;
  const swapped: HTMLElement[] = [];
  let refocus: HTMLElement | undefined;
  for (const now of current) {
    if (keepFocus && busy(now)) continue;
    const next = fresh.querySelector<HTMLElement>(selector(now.dataset.region!));
    if (!next) {
      now.remove(); // ya no corresponde (p. ej., la barra del turno al cerrarlo)
      continue;
    }
    const at = keepFocus && document.activeElement && now.contains(document.activeElement) ? [...now.querySelectorAll(FOCUSABLE)].indexOf(document.activeElement) : -1;
    keepIslands(now, next);
    now.replaceWith(next);
    swapped.push(next);
    if (at >= 0) refocus = next.querySelectorAll<HTMLElement>(FOCUSABLE)[at];
  }
  // Una región que antes no estaba (la barra del turno al abrirlo) va detrás del elemento con id que la precede.
  for (const next of fresh.querySelectorAll<HTMLElement>("[data-region]")) {
    const name = next.dataset.region!;
    if ((names && !names.includes(name)) || document.querySelector(selector(name))) continue;
    const anchor = next.previousElementSibling?.id && document.getElementById(next.previousElementSibling.id);
    if (!anchor) return fallback();
    anchor.after(next);
    swapped.push(next);
  }

  if (keepFocus) {
    refocus?.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent("regions:swapped", { detail: { regions: swapped } }));
    return;
  }
  // El foco vuelve al mismo control si sigue existiendo; si no, a la primera región (sin perderse en el <body>).
  if (!document.activeElement || document.activeElement === document.body) {
    const target = (focusedId && document.getElementById(focusedId)) || swapped[0];
    if (target && !target.matches("a, button, input, select, textarea, [tabindex]")) target.tabIndex = -1;
    target?.focus({ preventScroll: true });
  }
  document.dispatchEvent(new CustomEvent("regions:swapped", { detail: { regions: swapped } }));
}

const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";

/** En uso: un menú o la bandeja abiertos, un diálogo abierto, un formulario con cambios o un campo donde se escribe. */
function busy(region: HTMLElement) {
  if (region.querySelector(":popover-open, dialog[open], form[data-dirty]")) return true;
  const active = document.activeElement;
  return !!active && region.contains(active) && active.matches("input:not([type=checkbox], [type=radio], [type=hidden]), textarea, select");
}

/** Pone en `next` las islas ya hidratadas de `now` (misma posición y componente), con los props nuevos. */
function keepIslands(now: HTMLElement, next: HTMLElement) {
  const old = [...now.querySelectorAll("astro-island")];
  const incoming = [...next.querySelectorAll("astro-island")];
  incoming.forEach((island, i) => {
    const live = old[i];
    if (!live || live.getAttribute("component-url") !== island.getAttribute("component-url")) return;
    island.replaceWith(live);
    // @astrojs/react solo renderiza islas con «ssr» (Astro lo quita al hidratar): sin esto, los props nuevos se ignoran.
    // Reusa la raíz de React ya creada, así la isla conserva su estado.
    live.setAttribute("ssr", "");
    // Cambiar «props» hace que Astro vuelva a renderizar la isla con ellos (attributeChangedCallback).
    live.setAttribute("props", island.getAttribute("props") ?? "{}");
  });
}

/**
 * Corre `init` en cada página: al cargar y después de cada navegación. `signal` se corta al dejar la página: úsalo en
 * lo que se ata a window o document, intervalos y conexiones, para que no sigan corriendo en la página siguiente.
 */
export function onPage(init: (signal: AbortSignal) => void) {
  eachPage(() => {
    const controller = new AbortController();
    document.addEventListener("astro:before-swap", () => controller.abort(), { once: true });
    init(controller.signal);
  });
}

/** Corre `init` sobre cada página y sobre cada región nueva. */
export function onRegions(init: (root: ParentNode) => void) {
  eachPage(() => init(document));
  document.addEventListener("regions:swapped", (event) => {
    for (const region of (event as CustomEvent<{ regions: HTMLElement[] }>).detail.regions) init(region);
  });
}


// Sin ClientRouter (la landing, el acceso) no hay «astro:page-load»: la página es una sola y se corre ya.
function eachPage(run: () => void) {
  if (document.querySelector('meta[name="astro-view-transitions-enabled"]')) document.addEventListener("astro:page-load", run);
  else run();
}
