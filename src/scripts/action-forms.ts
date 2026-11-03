// Formularios de /app que guardan con Astro Actions, sin recargar a ciegas.
//   <form data-action="openShift">        → llama a actions.openShift(new FormData(form))
//   data-redirect="/app/{slug}"           → al guardar, va ahí ({campo} sale de la respuesta); si no, recarga
//   <p class="notice" data-form-notice>   → donde se muestra el error general
//   <p class="field-error" id="<name>-error"> → errores de cada campo
//   data-confirm="¿…?" data-confirm-label="Quitar" data-danger → pide confirmación en un diálogo (scripts/dialogs.ts)
//   data-track-changes                  → «Guardar» deshabilitado sin cambios, [data-change-status] con el estado,
//                                          evento «formchange» ({ dirty }) y aviso al salir con cambios
//   data-success="Cambios guardados."    → al recargar tras guardar, lo muestra en un toast
// Diálogos: <button data-open-dialog="id"> abre <dialog id="id" class="modal">; [data-close-dialog] lo cierra.
import { actions, isInputError } from "astro:actions";
import { confirmDialog, toast } from "./dialogs";
import { showPageSkeleton } from "./nav-skeleton";

type ActionFn = (input: FormData) => Promise<{ data?: Record<string, unknown>; error?: Error & { code?: string } }>;

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.action) return;
  event.preventDefault();

  const action = (actions as unknown as Record<string, ActionFn>)[form.dataset.action];
  const notice = form.querySelector<HTMLElement>("[data-form-notice]");
  const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
  const confirmText = form.dataset.confirm;
  if (confirmText && !(await confirmDialog(confirmText, { confirmLabel: form.dataset.confirmLabel, danger: "danger" in form.dataset }))) return;

  for (const el of form.querySelectorAll<HTMLElement>(".field-error")) el.textContent = "";
  for (const el of form.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
  if (notice) notice.textContent = "";
  if (submit) submit.disabled = true;

  const { data, error } = await action(new FormData(form));
  if (!error) {
    unsaved.delete(form);
    if (form.dataset.success) {
      try {
        sessionStorage.setItem(SUCCESS_KEY, form.dataset.success);
      } catch {}
    }
    const target = form.dataset.redirect?.replace(/\{(\w+)\}/g, (_, key) => String(data?.[key] ?? ""));
    if (target) {
      const url = new URL(target, location.href);
      if (url.pathname.startsWith("/app")) showPageSkeleton(url);
      window.location.assign(url);
    }
    else window.location.reload();
    return;
  }

  if (submit) submit.disabled = false;
  if (isInputError(error)) {
    let first: HTMLElement | null = null;
    for (const [field, messages] of Object.entries(error.fields)) {
      const input = form.querySelector<HTMLElement>(`[name="${field}"]`);
      const message = document.getElementById(`${form.id ? `${form.id}-` : ""}${field}-error`);
      input?.setAttribute("aria-invalid", "true");
      if (message) message.textContent = (messages as string[])[0] ?? "";
      else if (notice) notice.textContent = (messages as string[])[0] ?? "";
      first ??= input;
    }
    first?.focus();
    return;
  }
  if (notice) notice.textContent = error.message || "No se pudo guardar. Intenta de nuevo.";
  else toast(error.message || "No se pudo guardar. Intenta de nuevo.", "error");
});

// Cambios sin guardar: se compara lo que hay en el formulario con lo que tenía al cargar.
const SUCCESS_KEY = "action-form-success";
const unsaved = new Set<HTMLFormElement>();

/** Los valores del formulario como texto comparable; de un archivo, su nombre y tamaño. */
const snapshot = (form: HTMLFormElement) =>
  JSON.stringify([...new FormData(form)].map(([key, value]) => [key, value instanceof File ? `${value.name}:${value.size}` : value]));

for (const form of document.querySelectorAll<HTMLFormElement>("form[data-track-changes]")) {
  const initial = snapshot(form);
  const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
  const status = form.querySelector<HTMLElement>("[data-change-status]");
  const update = () => {
    const dirty = snapshot(form) !== initial;
    if (dirty) unsaved.add(form);
    else unsaved.delete(form);
    form.toggleAttribute("data-dirty", dirty);
    if (submit) submit.disabled = !dirty;
    if (status) status.textContent = dirty ? "Tienes cambios sin guardar" : "Sin cambios";
    form.dispatchEvent(new CustomEvent("formchange", { detail: { dirty } }));
  };
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  // Al cerrar un diálogo sin guardar, sus cambios no cuentan para el aviso al salir.
  form.closest("dialog")?.addEventListener("close", () => unsaved.delete(form));
  update();
}

window.addEventListener("beforeunload", (event) => {
  if ([...unsaved].some((form) => form.isConnected && !form.closest("dialog:not([open])"))) event.preventDefault();
});

try {
  const saved = sessionStorage.getItem(SUCCESS_KEY);
  if (saved) {
    sessionStorage.removeItem(SUCCESS_KEY);
    toast(saved, "success");
  }
} catch {}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const opener = target?.closest<HTMLElement>("[data-open-dialog]");
  if (opener) {
    const dialog = document.getElementById(opener.dataset.openDialog!) as HTMLDialogElement | null;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus();
    return;
  }
  const closer = target?.closest<HTMLElement>("[data-close-dialog]");
  if (closer) closer.closest("dialog")?.close();
  // Clic en el fondo del diálogo: lo cierra.
  if (target instanceof HTMLDialogElement && target.classList.contains("modal")) target.close();
});
