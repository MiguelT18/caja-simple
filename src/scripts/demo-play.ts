import { formatBs } from "@/lib/format";

/*
 * Tarjetas animadas de «Un día en el local» (src/components/landing/Demo*.astro). El HTML trae el estado final;
 * este reloj lo lleva al paso 0 y lo recorre paso a paso. Atributos que lee:
 * - data-steps="600,700,…": duración de cada paso en ms (en la tarjeta).
 * - data-at="n": aparece desde el paso n. Con data-until="m" además se va en el paso m (es transitorio:
 *   sin JS no se ve).
 * - data-tap="n m": el toque cae sobre este elemento en los pasos n y m.
 * - data-demo-count="7@1,14@2" (+ data-from, data-sign): el monto cuenta hasta cada valor durante su paso.
 * - data-demo-type="n": el texto se tipea durante el paso n.
 */

export type Key = [value: number, step: number];

/** En qué paso va el reloj y cuánto de ese paso pasó (0–1). Pasado el final: el paso `durations.length`, completo. */
export function stepAt(durations: number[], ms: number) {
  let start = 0;
  for (let step = 0; step < durations.length; step++) {
    if (ms < start + durations[step]) return { step, progress: (ms - start) / durations[step] };
    start += durations[step];
  }
  return { step: durations.length, progress: 1 };
}

/** El texto escrito hasta `progress` (0–1). */
export const typedAt = (text: string, progress: number) => text.slice(0, Math.ceil(text.length * Math.min(1, Math.max(0, progress))));

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** El monto que se ve en `step`: cada clave sube desde el valor anterior hasta el suyo durante su paso. */
export function countAt(keys: Key[], from: number, step: number, progress: number) {
  let value = from;
  for (const [target, at] of keys) {
    if (step < at) break;
    value = step === at ? value + (target - value) * easeOut(progress) : target;
    if (step === at) break;
  }
  return value;
}

export const parseKeys = (attr: string): Key[] =>
  attr.split(",").map((pair) => {
    const [value, step] = pair.split("@").map(Number);
    return [value, step];
  });

/** Arma el reloj de una tarjeta y la deja en el paso 0. `live` dice si su turno está a la vista (si no, se pausa). */
export function mountDemo(card: HTMLElement, live: () => boolean) {
  const durations = (card.dataset.steps ?? "").split(",").map(Number);
  const total = durations.reduce((a, b) => a + b, 0);
  const appear = [...card.querySelectorAll<HTMLElement>("[data-at]")];
  const taps = [...card.querySelectorAll<HTMLElement>("[data-tap]")].map((el) => ({ el, steps: el.dataset.tap!.split(" ").map(Number) }));
  const counts = [...card.querySelectorAll<HTMLElement>("[data-demo-count]")].map((el) => ({
    el,
    keys: parseKeys(el.dataset.demoCount!),
    from: Number(el.dataset.from ?? 0),
    sign: el.dataset.sign as "+" | "−" | undefined,
  }));
  const types = [...card.querySelectorAll<HTMLElement>("[data-demo-type]")].map((el) => ({ el, step: Number(el.dataset.demoType), text: el.textContent ?? "" }));
  const replay = card.querySelector<HTMLButtonElement>("[data-replay]");

  let elapsed = 0;
  let last = 0;
  let running = false;
  let forced = false; // «Ver de nuevo» corre hasta el final aunque el turno no esté en la banda de encendido.
  let shownStep = -1;

  const render = (step: number, progress: number) => {
    for (const el of appear) {
      const at = Number(el.dataset.at);
      if (el.dataset.until === undefined) el.classList.toggle("is-off", step < at);
      else el.classList.toggle("is-on", step >= at && step < Number(el.dataset.until));
    }
    if (step !== shownStep) {
      // Quitar y volver a poner la clase reinicia la animación del toque aunque sea el mismo botón dos veces seguidas.
      for (const { el } of taps) el.classList.remove("is-tap");
      void card.offsetWidth;
      for (const { el, steps } of taps) if (steps.includes(step)) el.classList.add("is-tap");
      shownStep = step;
    }
    for (const c of counts) c.el.textContent = formatBs(countAt(c.keys, c.from, step, progress), c.sign);
    for (const t of types) {
      t.el.textContent = step < t.step ? "" : step > t.step ? t.text : typedAt(t.text, progress);
      t.el.classList.toggle("is-typing", step === t.step);
    }
  };

  const frame = (now: number) => {
    if (!forced && !live()) {
      running = false;
      return;
    }
    elapsed += Math.min(now - last, 100); // una pestaña dormida no salta pasos al volver
    last = now;
    const { step, progress } = stepAt(durations, elapsed);
    render(step, progress);
    if (elapsed < total) {
      requestAnimationFrame(frame);
    } else {
      running = forced = false;
      if (replay) replay.hidden = false;
    }
  };

  const wake = () => {
    if (running || elapsed >= total) return;
    running = true;
    requestAnimationFrame((now) => {
      last = now;
      requestAnimationFrame(frame);
    });
  };

  replay?.addEventListener("click", () => {
    elapsed = 0;
    forced = true;
    render(0, 0);
    wake();
  });

  card.classList.add("is-playable");
  render(0, 0);
  return { wake };
}
