// Estado «guardando» de un botón de envío sin `disabled`: así el foco se queda en el botón
// (con `disabled` cae al <body> y el lector de pantalla pierde el lugar). Quien llama evita el doble envío con isBusy().
//   setBusy(button, true, "Guardando…") → aria-disabled + aria-busy y el texto cambia
//   setBusy(button, false)              → vuelve el texto original

export function isBusy(button: HTMLButtonElement | null | undefined) {
  return button?.getAttribute("aria-busy") === "true";
}

export function setBusy(button: HTMLButtonElement | null | undefined, busy: boolean, label = "Guardando…") {
  if (!button) return;
  if (busy) {
    button.dataset.idleHtml ??= button.innerHTML;
    button.setAttribute("aria-busy", "true");
    button.setAttribute("aria-disabled", "true");
    button.textContent = button.dataset.busyLabel ?? label;
  } else {
    if (button.dataset.idleHtml !== undefined) button.innerHTML = button.dataset.idleHtml;
    delete button.dataset.idleHtml;
    button.removeAttribute("aria-busy");
    button.removeAttribute("aria-disabled");
  }
}
