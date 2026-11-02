// Pop-ups propios en lugar de window.confirm y window.alert (ver DESIGN.md › Diálogos y avisos).
//   await confirmDialog("¿Quitar el turno?", { confirmLabel: "Quitar", danger: true }) → true si acepta
//   toast("No se pudo guardar.", "error")                                              → aviso flotante que se va solo

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

let toastRegion: HTMLElement | undefined;

/** Aviso flotante abajo a la derecha (arriba del todo en móvil). Los errores se anuncian de inmediato. */
export function toast(message: string, tone: "error" | "success" | "info" = "info") {
  if (!toastRegion) {
    toastRegion = document.createElement("div");
    toastRegion.className = "toast-region";
    document.body.append(toastRegion);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${tone}`;
  el.setAttribute("role", tone === "error" ? "alert" : "status");
  el.innerHTML = `<p></p><button type="button" class="icon-btn" aria-label="Cerrar aviso">×</button>`;
  el.querySelector("p")!.textContent = message;

  const dismiss = () => {
    el.classList.add("toast-leaving");
    // Sin animación (movimiento reducido) no hay animationend: se quita igual.
    const remove = () => el.remove();
    el.addEventListener("animationend", remove, { once: true });
    setTimeout(remove, 400);
  };
  el.querySelector("button")!.addEventListener("click", dismiss);
  toastRegion.append(el);
  setTimeout(dismiss, tone === "error" ? 8000 : 5000);
}
