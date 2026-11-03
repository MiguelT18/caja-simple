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
import { isBusy, setBusy } from "./busy";
import { confirmDialog, flashToast, toast } from "./dialogs";
import { showPageSkeleton } from "./nav-skeleton";

type ActionFn = (input: FormData) => Promise<{ data?: Record<string, unknown>; error?: Error & { code?: string } }>;

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.action) return;
  event.preventDefault();

  const action = (actions as unknown as Record<string, ActionFn>)[form.dataset.action];
  const notice = form.querySelector<HTMLElement>("[data-form-notice]");
  const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
  if (isBusy(submit)) return;
  const confirmText = form.dataset.confirm;
  if (confirmText && !(await confirmDialog(confirmText, { confirmLabel: form.dataset.confirmLabel, danger: "danger" in form.dataset }))) return;

  for (const el of form.querySelectorAll<HTMLElement>(".field-error")) el.textContent = "";
  for (const el of form.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
  if (notice) notice.textContent = "";
  setBusy(submit, true);

  let result: Awaited<ReturnType<ActionFn>>;
  try {
    result = await action(new FormData(form));
  } catch {
    result = { error: new Error("No hay conexión. Revisa tu internet e intenta de nuevo.") };
  }
  const { data, error } = result;
  if (!error) {
    unsaved.delete(form);
    if (form.dataset.success) flashToast(form.dataset.success);
    const target = form.dataset.redirect?.replace(/\{(\w+)\}/g, (_, key) => String(data?.[key] ?? ""));
    if (target) {
      const url = new URL(target, location.href);
      if (url.pathname.startsWith("/app")) showPageSkeleton(url);
      window.location.assign(url);
    }
    else window.location.reload();
    return;
  }

  setBusy(submit, false);
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
  if (notice) {
    notice.textContent = error.message || "No se pudo guardar. Intenta de nuevo.";
    // El aviso está al final del formulario: que se vea aunque el diálogo tenga scroll.
    notice.scrollIntoView({ block: "nearest" });
  } else toast(error.message || "No se pudo guardar. Intenta de nuevo.", "error");
});

// Cambios sin guardar: se compara lo que hay en el formulario con lo que tenía al cargar.
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

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const opener = target?.closest<HTMLElement>("[data-open-dialog]");
  if (opener) {
    const dialog = document.getElementById(opener.dataset.openDialog!) as HTMLDialogElement | null;
    if (!dialog) return;
    dialog.showModal();
    opened.set(dialog, dialogSnapshot(dialog));
    dialog.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus();
    return;
  }
  const closer = target?.closest<HTMLElement>("[data-close-dialog]");
  if (closer) closer.closest("dialog")?.close();
  // Clic en el fondo del diálogo: lo cierra solo si no hay nada escrito (un toque de más en el celular no borra lo cargado).
  if (target instanceof HTMLDialogElement && target.classList.contains("modal") && dialogSnapshot(target) === opened.get(target)) target.close();
});

// Lo que tenía cada diálogo al abrirse, para saber si el clic en el fondo perdería cambios.
const opened = new WeakMap<HTMLDialogElement, string>();
const dialogSnapshot = (dialog: HTMLDialogElement) => [...dialog.querySelectorAll("form")].map(snapshot).join("|");

// Al cerrar un diálogo, sus errores no quedan para la próxima vez que se abra.
document.addEventListener(
  "close",
  (event) => {
    const dialog = event.target;
    if (!(dialog instanceof HTMLDialogElement) || !dialog.classList.contains("modal")) return;
    for (const el of dialog.querySelectorAll<HTMLElement>(".field-error, [data-form-notice]")) el.textContent = "";
    for (const el of dialog.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
  },
  true,
);
