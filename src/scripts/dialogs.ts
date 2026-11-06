// Pop-ups propios en lugar de window.confirm y window.alert (ver DESIGN.md › Diálogos y avisos).
//   await confirmDialog("¿Quitar el turno?", { confirmLabel: "Quitar", danger: true }) → true si acepta
//   toast("No se pudo guardar.", "error")                                              → aviso flotante
//   flashToast("Gasto guardado.")                                                      → aviso que se muestra tras recargar
//   announce("3 productos")                                                            → solo para lectores de pantalla

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  danger?: boolean;
}

let confirmEl: HTMLDialogElement | undefined;

function confirmShell() {
  if (confirmEl) return confirmEl;
  confirmEl = document.createElement("dialog");
  confirmEl.className = "modal confirm-dialog";
  confirmEl.setAttribute("aria-labelledby", "confirm-dialog-title");
  confirmEl.setAttribute("aria-describedby", "confirm-dialog-text");
  confirmEl.innerHTML = `
    <form method="dialog" class="modal-form">
      <header class="modal-head">
        <h2 id="confirm-dialog-title"></h2>
        <p id="confirm-dialog-text"></p>
      </header>
      <div class="modal-actions">
        <button type="submit" value="cancel" class="btn btn-secondary">Cancelar</button>
        <button type="submit" value="ok" class="btn"></button>
      </div>
    </form>`;
  // Clic en el fondo: cuenta como cancelar.
  confirmEl.addEventListener("click", (event) => {
    if (event.target === confirmEl) confirmEl.close("cancel");
  });
  return confirmEl;
}

/** Pide confirmación en un diálogo modal; resuelve true si la persona acepta. */
export function confirmDialog(message: string, { title = "¿Seguro?", confirmLabel = "Aceptar", danger = false }: ConfirmOptions = {}) {
  const dialog = confirmShell();
  // Dentro de un diálogo de React (Radix) abierto: si no, su trampa de foco no deja usar este.
  (document.querySelector('[role="dialog"][data-state="open"]') ?? document.body).append(dialog);
  dialog.querySelector("h2")!.textContent = title;
  dialog.querySelector("p")!.textContent = message;
  const ok = dialog.querySelector<HTMLButtonElement>('button[value="ok"]')!;
  ok.textContent = confirmLabel;
  ok.className = `btn ${danger ? "btn-danger" : "btn-primary"}`;
  dialog.returnValue = "";
  dialog.showModal();
  // El foco empieza en Cancelar: Enter no confirma algo destructivo sin querer.
  dialog.querySelector<HTMLButtonElement>('button[value="cancel"]')!.focus();
  return new Promise<boolean>((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), { once: true }));
}

// Regiones vivas fijas, creadas al cargar: los lectores de pantalla solo anuncian bien lo que se escribe
// en una región que ya estaba en la página (un nodo nuevo que llega con texto suele pasar en silencio).
let toastRegion: HTMLElement | undefined;
let politeRegion: HTMLElement | undefined;
let assertiveRegion: HTMLElement | undefined;

function liveRegion(politeness: "polite" | "assertive") {
  const el = document.createElement("div");
  el.className = "sr-only";
  el.setAttribute("aria-live", politeness);
  el.setAttribute("aria-atomic", "true");
  document.body.append(el);
  return el;
}

function regions() {
  if (!toastRegion) {
    toastRegion = document.createElement("div");
    toastRegion.className = "toast-region";
    document.body.append(toastRegion);
    politeRegion = liveRegion("polite");
    assertiveRegion = liveRegion("assertive");
  }
  return { toasts: toastRegion, polite: politeRegion!, assertive: assertiveRegion! };
}

// Las islas React importan este módulo también al renderizar en el servidor: ahí no hay document.
const inBrowser = typeof document !== "undefined";

if (inBrowser) {
  if (document.body) regions();
  else document.addEventListener("DOMContentLoaded", regions, { once: true });
}

/** Anuncia un texto solo a lectores de pantalla (carrito, búsqueda, paginación, carga). */
export function announce(message: string, politeness: "polite" | "assertive" = "polite") {
  const region = regions()[politeness];
  // Con un diálogo abierto, lo de afuera queda oculto para el lector de pantalla: la región se muda adentro.
  const host = document.querySelector('[role="dialog"][data-state="open"], dialog[open]') ?? document.body;
  if (region.parentElement !== host) host.append(region);
  // Vaciar y escribir en el siguiente cuadro: así se repite el anuncio aunque el texto sea igual al anterior.
  region.textContent = "";
  requestAnimationFrame(() => (region.textContent = message));
}

/**
 * Aviso flotante abajo a la derecha (arriba del todo en móvil). Se va solo, salvo los errores y los que llevan enlace
 * (hay que poder leerlos y usarlos sin apuro, WCAG 2.2.1). Con el mouse encima o con foco dentro, no se cierra.
 */
export function toast(message: string, tone: "error" | "success" | "warning" | "info" = "info", link?: { href: string; label: string }) {
  const { toasts } = regions();
  const el = document.createElement("div");
  el.className = `toast toast-${tone}`;
  el.innerHTML = `<p></p><button type="button" class="icon-btn" aria-label="Cerrar aviso">×</button>`;
  el.querySelector("p")!.textContent = message;
  if (link) {
    const a = document.createElement("a");
    a.href = link.href;
    a.textContent = link.label;
    el.querySelector("p")!.append(" ", a);
  }

  const dismiss = () => {
    el.classList.add("toast-leaving");
    // Sin animación (movimiento reducido) no hay animationend: se quita igual.
    const remove = () => el.remove();
    el.addEventListener("animationend", remove, { once: true });
    setTimeout(remove, 400);
  };
  el.querySelector("button")!.addEventListener("click", dismiss);
  toasts.append(el);
  announce(link ? `${message} ${link.label}` : message, tone === "error" ? "assertive" : "polite");

  if (tone === "error" || link) return;
  let timer = setTimeout(dismiss, 6000);
  const pause = () => clearTimeout(timer);
  const resume = () => {
    if (el.matches(":hover, :focus-within")) return;
    clearTimeout(timer);
    timer = setTimeout(dismiss, 3000);
  };
  el.addEventListener("mouseenter", pause);
  el.addEventListener("focusin", pause);
  el.addEventListener("mouseleave", resume);
  el.addEventListener("focusout", resume);
}

/** Aviso que sobrevive a una recarga (p. ej. «Venta registrada» tras guardar y recargar). */
export function flashToast(message: string, tone: "error" | "success" | "info" = "success") {
  try {
    sessionStorage.setItem("flash-toast", JSON.stringify({ message, tone }));
  } catch {}
}

// Muestra el aviso guardado antes de la recarga.
if (inBrowser) try {
  const saved = sessionStorage.getItem("flash-toast");
  if (saved) {
    sessionStorage.removeItem("flash-toast");
    const { message, tone } = JSON.parse(saved);
    setTimeout(() => toast(message, tone), 300);
  }
} catch {}
