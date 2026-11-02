// Formularios de /app que guardan con Astro Actions, sin recargar a ciegas.
//   <form data-action="openShift">        → llama a actions.openShift(new FormData(form))
//   data-redirect="/app/{slug}"           → al guardar, va ahí ({campo} sale de la respuesta); si no, recarga
//   <p class="notice" data-form-notice>   → donde se muestra el error general
//   <p class="field-error" id="<name>-error"> → errores de cada campo
//   data-confirm="¿…?" data-confirm-label="Quitar" data-danger → pide confirmación en un diálogo (scripts/dialogs.ts)
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
