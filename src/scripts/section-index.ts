// Índice «En esta página» de las páginas de ajustes: marca con aria-current la sección que se está leyendo
// (la que ocupa la franja alta del panel) y lleva a cada una sin el salto nativo del ancla.
// Enlaces: <a href="#id" data-index-link="id">; secciones: <section id="id" tabindex="-1">. Se llama dentro de onPage().
export function sectionIndex(signal: AbortSignal) {
  const links = new Map([...document.querySelectorAll<HTMLAnchorElement>("[data-index-link]")].map((a) => [a.dataset.indexLink!, a]));
  if (links.size === 0) return;
  const ids = [...links.keys()];
  const last = ids[ids.length - 1];
  const mark = (id: string) => {
    links.forEach((a, key) => (key === id ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
    // En el celular el índice es una fila de píldoras: la activa queda a la vista (solo scroll horizontal de la fila).
    const link = links.get(id);
    const list = link?.closest("ul");
    if (link && list && list.scrollWidth > list.clientWidth) list.scrollTo({ left: link.offsetLeft - 16, behavior: "smooth" });
  };

  // Quien hace scroll: <main> en escritorio, la página en el celular (main sin overflow).
  const first = document.getElementById(ids[0]);
  let box: HTMLElement = document.scrollingElement as HTMLElement;
  for (let p = first?.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) {
      box = p;
      break;
    }
  }
  const isPage = box === document.scrollingElement;
  const atEnd = () => box.scrollTop + box.clientHeight >= box.scrollHeight - 2;

  // Tras un clic, la marca queda en lo elegido hasta que termina el scroll.
  let pinned: string | null = null;
  let unpin = 0;
  const release = () => {
    clearTimeout(unpin);
    pinned = null;
  };
  // Respaldo para navegadores sin scrollend.
  const scrollTarget = isPage ? window : box;
  scrollTarget.addEventListener("scrollend", release, { signal });
  scrollTarget.addEventListener(
    "scroll",
    () => {
      if (pinned) {
        clearTimeout(unpin);
        unpin = window.setTimeout(release, 600);
      } else if (atEnd()) mark(last);
    },
    { passive: true, signal },
  );

  const visible = new Set<string>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id);
      if (pinned) return;
      // Al fondo, la última sección (corta) nunca llega a la franja alta: se marca igual.
      const current = atEnd() ? last : ids.find((id) => visible.has(id));
      if (current) mark(current);
    },
    { rootMargin: "-10% 0px -60% 0px" },
  );
  signal.addEventListener("abort", () => observer.disconnect());

  links.forEach((a, id) => {
    const section = document.getElementById(id);
    if (!section) return;
    observer.observe(section);
    // Sin el salto nativo del ancla: ese desplaza también a los ancestros y corría la app entera hacia abajo.
    a.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        const offset = isPage ? 0 : box.getBoundingClientRect().top;
        const top = section.getBoundingClientRect().top - offset + box.scrollTop - parseFloat(getComputedStyle(section).scrollMarginTop);
        const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
        box.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
        // Con el estado del ClientRouter: sin él, «Atrás» no sabría a qué página volver.
        history.replaceState(history.state, "", `#${id}`);
        pinned = id;
        clearTimeout(unpin);
        unpin = window.setTimeout(release, 600);
        mark(id);
        section.focus({ preventScroll: true });
      },
      { signal },
    );
  });

  const fromHash = decodeURIComponent(location.hash.slice(1));
  mark(links.has(fromHash) ? fromHash : ids[0]);
}
