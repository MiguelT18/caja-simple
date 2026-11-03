import { formatBs } from "@/lib/format";
import { SKY_END, SKY_START, skyPoint } from "./sky";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));

// Los turnos se encienden al entrar en vista y se apagan al salir, así vuelven a encenderse
// cada vez que se pasa por ahí; sin JS quedan encendidos. `is-seen` no se quita: el contenido
// de cada pieza aparece una vez y no se vuelve a ocultar.
// La banda de encendido va del 25% al 65% de la pantalla. El borde inferior es la línea de lectura:
// un turno se enciende al cruzarla, y el cielo usa la misma línea para saber en qué turno está.
const LIT_TOP = 0.25;
const LIT_LINE = 0.65;
const shifts = [...document.querySelectorAll<HTMLElement>(".shift")];
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        entry.target.classList.toggle("is-lit", entry.isIntersecting);
        if (entry.isIntersecting) entry.target.classList.add("is-seen");
      }
    },
    { rootMargin: `-${LIT_TOP * 100}% 0px -${(1 - LIT_LINE) * 100}% 0px` },
  );
  for (const shift of shifts) {
    shift.classList.add("is-armed");
    observer.observe(shift);
  }
}

// Volver arriba: se muestra cuando el primer bloque de la página (el hero en /) ya salió de la pantalla.
const toTop = document.querySelector<HTMLElement>("[data-to-top]");
const hero = document.querySelector("main > :first-child");
if (toTop && hero && "IntersectionObserver" in window) {
  toTop.dataset.hidden = "";
  new IntersectionObserver(([entry]) => toTop.toggleAttribute("data-hidden", entry.isIntersecting)).observe(hero);
  // Al llegar arriba, el foco pasa a la marca para que el teclado siga desde el inicio.
  toTop.addEventListener("click", (event) => {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    document.querySelector<HTMLElement>(".site-header .brand")?.focus({ preventScroll: true });
  });
}

// Barra: se esconde al bajar y aparece al subir. Ignora movimientos pequeños para no parpadear.
let lastY = window.scrollY;
window.addEventListener(
  "scroll",
  () => {
    const y = window.scrollY;
    if (y < 80) {
      delete document.body.dataset.header;
    } else if (y > lastY + 6) {
      document.body.dataset.header = "hidden";
    } else if (y < lastY - 6) {
      delete document.body.dataset.header;
    } else {
      return;
    }
    lastY = y;
  },
  { passive: true },
);

if (!reduceMotion) {
  // Montos de la tarjeta del hero: cuentan desde 0 hasta el valor que ya trae el HTML.
  for (const el of document.querySelectorAll<HTMLElement>("[data-count]")) {
    const target = Number(el.dataset.count);
    const sign = el.dataset.sign as "+" | "−" | undefined;
    const start = performance.now() + Number(el.dataset.delay ?? 0);
    // El lector de pantalla lee solo el valor final; la cuenta animada es visual (si no, lee números a medio contar).
    const shown = Object.assign(document.createElement("span"), { textContent: el.textContent });
    shown.setAttribute("aria-hidden", "true");
    el.replaceChildren(shown, Object.assign(document.createElement("span"), { className: "sr-only", textContent: el.textContent }));
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / 900));
      shown.textContent = formatBs(target * easeOutExpo(t), sign);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Arco del día: cada turno ocupa un tercio del arco. El turno activo es el último que cruzó la línea
  // de lectura (el último que se encendió); el astro avanza dentro de su tercio según cuánto de ese
  // turno ya pasó la línea, y la fase (sol, atardecer, luna) es la de ese turno.
  const phases = ["morning", "afternoon", "night"];
  const sky = document.querySelector<HTMLElement>(".sky");
  if (sky && shifts.length) {
    let shown = SKY_START;
    let running = false;

    const target = () => {
      const line = window.innerHeight * LIT_LINE;
      let active = 0;
      shifts.forEach((shift, i) => {
        if (shift.getBoundingClientRect().top <= line) active = i;
      });
      const rect = shifts[active].getBoundingClientRect();
      const within = Math.min(1, Math.max(0, (line - rect.top) / rect.height));
      return {
        day: SKY_START + ((active + within) / shifts.length) * (SKY_END - SKY_START),
        phase: phases[Math.min(active, phases.length - 1)],
      };
    };

    const frame = () => {
      const goal = target();
      shown += (goal.day - shown) * 0.08;
      if (Math.abs(goal.day - shown) < 0.0005) shown = goal.day;
      const { x, y } = skyPoint(shown);
      sky.style.setProperty("--x", x.toFixed(3));
      sky.style.setProperty("--y", y.toFixed(3));
      sky.dataset.phase = goal.phase;
      running = shown !== goal.day;
      if (running) requestAnimationFrame(frame);
    };

    const wake = () => {
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    };

    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake, { passive: true });
    wake();
  }
}
