// Actualizar solo lo que cambió, sin recargar la página entera.
//   <section data-region="totales"> → refreshRegions() trae esta misma página otra vez y cambia cada región por la nueva.
// Las islas React se conservan (con su estado: búsqueda, página, filtro) y reciben los props nuevos.
// Los scripts que se atan a elementos al cargar escuchan «regions:swapped» para volver a atarse a las regiones nuevas.

/**
 * Cambia las regiones `names` (todas, si no se pasan) por las de `url` (por defecto, esta misma página).
 * Sin regiones o sin red, recarga: nunca queda peor que antes.
 */
export async function refreshRegions(names?: string[], url = location.href) {
  dropPrerendered();
  const selector = (name: string) => `[data-region="${CSS.escape(name)}"]`;
  const current = [...document.querySelectorAll<HTMLElement>("[data-region]")].filter((el) => !names || names.includes(el.dataset.region!));
  if (current.length === 0) return location.assign(url);

  let fresh: Document;
  try {
    const response = await fetch(url, { headers: { accept: "text/html" } });
    if (!response.ok) throw new Error(String(response.status));
    fresh = new DOMParser().parseFromString(await response.text(), "text/html");
  } catch {
    return location.assign(url);
  }

  const focusedId = document.activeElement?.id;
  const swapped: HTMLElement[] = [];
  for (const now of current) {
    const next = fresh.querySelector<HTMLElement>(selector(now.dataset.region!));
    if (!next) {
      now.remove(); // ya no corresponde (p. ej., la barra del turno al cerrarlo)
      continue;
    }
    keepIslands(now, next);
    now.replaceWith(next);
    swapped.push(next);
  }
  // Una región que antes no estaba (la barra del turno al abrirlo) va detrás del elemento con id que la precede.
  for (const next of fresh.querySelectorAll<HTMLElement>("[data-region]")) {
    const name = next.dataset.region!;
    if ((names && !names.includes(name)) || document.querySelector(selector(name))) continue;
    const anchor = next.previousElementSibling?.id && document.getElementById(next.previousElementSibling.id);
    if (!anchor) return location.assign(url);
    anchor.after(next);
    swapped.push(next);
  }

  // El foco vuelve al mismo control si sigue existiendo; si no, a la primera región (sin perderse en el <body>).
  if (!document.activeElement || document.activeElement === document.body) {
    const target = (focusedId && document.getElementById(focusedId)) || swapped[0];
    if (target && !target.matches("a, button, input, select, textarea, [tabindex]")) target.tabIndex = -1;
    target?.focus({ preventScroll: true });
  }
  document.dispatchEvent(new CustomEvent("regions:swapped", { detail: { regions: swapped } }));
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

/** Corre `init` sobre la página al cargar y sobre cada región nueva. */
export function onRegions(init: (root: ParentNode) => void) {
  init(document);
  document.addEventListener("regions:swapped", (event) => {
    for (const region of (event as CustomEvent<{ regions: HTMLElement[] }>).detail.regions) init(region);
  });
}

/**
 * Descarta las páginas que Chrome preparó en segundo plano (astro.config.mjs › clientPrerender): después de guardar
 * algo tendrían datos viejos. Al quitar las reglas, el navegador cancela esos prerenders y el próximo clic pide la página.
 */
function dropPrerendered() {
  document.querySelectorAll('script[type="speculationrules"]').forEach((rules) => rules.remove());
}
