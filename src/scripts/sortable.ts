// Ordenar una lista arrastrando el asa de cada ítem ([data-drag]) con mouse o dedo, o con las flechas sobre el asa.
// El ítem sigue al puntero y los demás se deslizan a su lugar nuevo (FLIP); con movimiento reducido, sin animar.
// Lo usan el editor de turnos (al crear) y Turnos (los de la sucursal).

interface Options {
  /** Selector de los ítems: hijos directos de la lista. */
  item: string;
  /** Cambió el orden en el DOM (durante el arrastre, en cada paso). */
  onChange?: (item: HTMLElement) => void;
  /** Terminó el movimiento: soltó el asa o movió con el teclado. `changed` si quedó en otro lugar. */
  onDrop?: (item: HTMLElement, changed: boolean) => void;
}

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** El contenedor que se desplaza (diálogo, panel de la app o la página), para seguir al arrastrar cerca del borde. */
function scrollerOf(el: Element) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement as HTMLElement;
}

export function sortable(list: HTMLElement, o: Options) {
  const items = () => [...list.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.matches(o.item));

  /** Mueve `item` antes de `before` y desliza a los otros desde donde se veían hasta su lugar nuevo. */
  const move = (item: HTMLElement, before: Element | null) => {
    const others = items().filter((el) => el !== item);
    const first = new Map(others.map((el) => [el, el.getBoundingClientRect().top]));
    for (const el of others) for (const a of el.getAnimations()) a.cancel();
    list.insertBefore(item, before);
    if (still()) return;
    for (const el of others) {
      const dy = first.get(el)! - el.getBoundingClientRect().top;
      if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 220, easing: EASE });
    }
  };

  list.addEventListener("pointerdown", (event) => {
    const handle = (event.target as Element).closest<HTMLElement>("[data-drag]");
    const item = handle?.closest<HTMLElement>(o.item);
    if (!handle || !item || item.parentElement !== list || event.button !== 0) return;
    event.preventDefault();
    const scroller = scrollerOf(list);
    const startIndex = items().indexOf(item);
    // Dónde se agarró, respecto del borde de arriba del ítem: así no salta al empezar.
    const grab = event.clientY - item.getBoundingClientRect().top;
    let lastY = event.clientY;
    item.classList.add("dragging");

    const follow = () => {
      item.style.transform = "";
      const top = item.getBoundingClientRect().top;
      item.style.transform = `translateY(${lastY - grab - top}px)`;
    };

    const onMove = (e: PointerEvent) => {
      lastY = e.clientY;
      const edge = 56;
      const box = scroller === document.scrollingElement ? { top: 0, bottom: innerHeight } : scroller.getBoundingClientRect();
      if (lastY < box.top + edge) scroller.scrollBy(0, -14);
      else if (lastY > box.bottom - edge) scroller.scrollBy(0, 14);
      // Pasa a otro lugar cuando su borde (el de arriba al subir, el de abajo al bajar) cruza la mitad de un vecino:
      // con tarjetas altas no hay que arrastrar una entera.
      const top = lastY - grab;
      const bottom = top + item.offsetHeight;
      const mid = (el: Element) => {
        const b = el.getBoundingClientRect();
        return b.top + b.height / 2;
      };
      const all = items();
      const i = all.indexOf(item);
      const above = all.slice(0, i).find((el) => top < mid(el));
      const below = all.slice(i + 1).findLast((el) => bottom > mid(el));
      if (above) {
        move(item, above);
        o.onChange?.(item);
      } else if (below) {
        move(item, below.nextElementSibling);
        o.onChange?.(item);
      }
      follow();
    };

    const onEnd = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
      // Vuelve suave desde donde quedó bajo el dedo hasta su lugar en la lista.
      const offset = item.style.transform;
      item.style.transform = "";
      const settle = still() || !offset ? null : item.animate([{ transform: offset }, { transform: "none" }], { duration: 180, easing: EASE });
      const done = () => item.classList.remove("dragging");
      if (settle) settle.onfinish = settle.oncancel = done;
      else done();
      o.onDrop?.(item, items().indexOf(item) !== startIndex);
    };

    // En el documento y no con setPointerCapture: mover el ítem en el DOM suelta la captura.
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onEnd);
    document.addEventListener("pointercancel", onEnd);
  });

  list.addEventListener("keydown", (event) => {
    const handle = (event.target as Element).closest<HTMLElement>("[data-drag]");
    const item = handle?.closest<HTMLElement>(o.item);
    if (!handle || !item || item.parentElement !== list) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const all = items();
    const i = all.indexOf(item);
    if (event.key === "ArrowUp" ? i === 0 : i === all.length - 1) return;
    move(item, event.key === "ArrowUp" ? all[i - 1] : (all[i + 2] ?? null));
    handle.focus();
    o.onChange?.(item);
    o.onDrop?.(item, true);
  });
}
