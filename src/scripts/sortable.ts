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
    const startNext = item.nextElementSibling;
    // Dónde se agarró, respecto del borde de arriba del ítem: así no salta al empezar.
    const grab = event.clientY - item.getBoundingClientRect().top;
    let lastY = event.clientY;
    let frame = 0;
    item.classList.add("dragging");
    // Sin esto, al mover el ítem en el DOM el navegador corrige el desplazamiento (scroll anchoring) para que lo visible
    // no salte: la lista se corre bajo el dedo, el ítem vuelve a cambiar de lugar y queda saltando entre dos posiciones.
    const anchor = scroller.style.overflowAnchor;
    scroller.style.overflowAnchor = "none";

    /** Reordena según dónde está el puntero ahora y deja el ítem bajo él. Se llama al mover y en cada paso del autodesplazamiento. */
    const place = () => {
      // Pasa a otro lugar cuando su borde (el de arriba al subir, el de abajo al bajar) cruza la mitad de un vecino:
      // con tarjetas altas no hay que arrastrar una entera.
      const top = lastY - grab;
      const bottom = top + item.offsetHeight;
      // Posiciones de diseño (offsetTop) y no getBoundingClientRect: los vecinos que aún se deslizan (FLIP) se verían
      // en su lugar viejo, el ítem volvería a cruzarlos y quedaría saltando entre dos lugares.
      const at = (el: HTMLElement) => {
        const box = list.getBoundingClientRect();
        return (el.offsetParent === list ? box.top + list.clientTop : box.top - list.offsetTop) + el.offsetTop;
      };
      const mid = (el: HTMLElement) => at(el) + el.offsetHeight / 2;
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
      const box = list.getBoundingClientRect();
      // Dentro de la lista: si sobresale, agranda el área desplazable y el autodesplazamiento nunca llega al final.
      const y = Math.min(Math.max(top, box.top), box.bottom - item.offsetHeight);
      item.style.transform = `translateY(${y - at(item)}px)`;
    };

    // Mientras el puntero esté cerca del borde, desplaza aunque no se mueva: más rápido cuanto más cerca o más afuera.
    const tick = () => {
      const box = scroller === document.scrollingElement ? { top: 0, bottom: innerHeight } : scroller.getBoundingClientRect();
      const top = Math.max(box.top, 0);
      const bottom = Math.min(box.bottom, innerHeight);
      const edge = Math.min(80, (bottom - top) / 4);
      const depth = lastY < top + edge ? lastY - top - edge : lastY > bottom - edge ? lastY - bottom + edge : 0;
      if (depth) {
        const before = scroller.scrollTop;
        scroller.scrollBy({ top: Math.sign(depth) * Math.ceil(Math.min(1, Math.abs(depth) / edge) * 20), behavior: "instant" });
        // En el tope (arriba o abajo) no cambia nada y no hay que recalcular.
        if (scroller.scrollTop !== before) place();
      }
      frame = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      lastY = e.clientY;
      place();
    };

    // Con el dedo, que la página no se desplace por su cuenta mientras se arrastra: el autodesplazamiento la mueve.
    const noPan = (e: TouchEvent) => e.preventDefault();

    const onEnd = () => {
      cancelAnimationFrame(frame);
      scroller.style.overflowAnchor = anchor;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("touchmove", noPan);
      // Vuelve suave desde donde quedó bajo el dedo hasta su lugar en la lista.
      const offset = item.style.transform;
      item.style.transform = "";
      const settle = still() || !offset ? null : item.animate([{ transform: offset }, { transform: "none" }], { duration: 180, easing: EASE });
      const done = () => item.classList.remove("dragging");
      if (settle) settle.onfinish = settle.oncancel = done;
      else done();
      o.onDrop?.(item, items().indexOf(item) !== startIndex);
    };

    // Escape cancela: el ítem vuelve a donde estaba.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (items().indexOf(item) !== startIndex) {
        move(item, startNext);
        o.onChange?.(item);
      }
      onEnd();
    };

    // En el documento y no con setPointerCapture: mover el ítem en el DOM suelta la captura.
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onEnd);
    document.addEventListener("pointercancel", onEnd);
    document.addEventListener("keydown", onKey);
    document.addEventListener("touchmove", noPan, { passive: false });
    frame = requestAnimationFrame(tick);
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
