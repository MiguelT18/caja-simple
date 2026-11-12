// Borradores de los formularios de alta en localStorage: lo escrito vuelve al reabrir o recargar y se borra al guardar.
//   const stop = keepDraft(form, draftKey("product", businessId)) → restaura y guarda en cada cambio
//   clearDraft(key) al guardar con éxito · hasDraft(key) antes de descartar · confirmDiscard() pide confirmación
// Nunca se guardan archivos, contraseñas ni campos ocultos.
import { confirmDialog } from "./dialogs";

const PREFIX = "draft:";
export const draftKey = (...parts: string[]) => PREFIX + parts.join(":");

/** Lo mínimo de un campo que hace falta para guardarlo y restaurarlo (un input, select o textarea). */
export interface DraftField {
  id: string;
  name: string;
  type: string;
  value: string;
  checked?: boolean;
}

type Saved = Record<string, string | boolean>;

const SKIP = new Set(["file", "password", "hidden", "submit", "button", "reset", "image"]);
const isCheck = (f: DraftField) => f.type === "checkbox" || f.type === "radio";

/** Clave de cada campo: su id o, sin id, el nombre y su posición entre los del mismo nombre. */
function keyed<F extends DraftField>(fields: F[]) {
  const seen = new Map<string, number>();
  return fields
    .filter((f) => f.name && !SKIP.has(f.type))
    .map((f) => {
      const i = seen.get(f.name) ?? 0;
      seen.set(f.name, i + 1);
      return [f.id || `${f.name}#${i}`, f] as const;
    });
}

/** Lo que cambió respecto de `initial` (los valores al cargar); vacío si no hay nada escrito. */
export function collect(fields: DraftField[], initial: Saved): Saved {
  const out: Saved = {};
  for (const [key, f] of keyed(fields)) {
    const value = isCheck(f) ? Boolean(f.checked) : f.value;
    if (value !== initial[key]) out[key] = value;
  }
  return out;
}

/** Los valores actuales, para comparar después con collect(). */
export const snapshotOf = (fields: DraftField[]): Saved =>
  Object.fromEntries(keyed(fields).map(([key, f]) => [key, isCheck(f) ? Boolean(f.checked) : f.value]));

function read(key: string): Saved | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, saved: Saved) {
  try {
    if (Object.keys(saved).length) localStorage.setItem(key, JSON.stringify(saved));
    else localStorage.removeItem(key);
  } catch {}
}

export const hasDraft = (key: string) => Boolean(read(key));

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

/** Al cerrar sesión: que la próxima persona en este equipo no vea lo que escribió la anterior. */
export function clearAllDrafts() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  } catch {}
}

export const confirmDiscard = () =>
  confirmDialog("Lo que escribiste en este formulario se borra.", { title: "¿Descartar el borrador?", confirmLabel: "Descartar", danger: true });

const fieldsOf = (form: HTMLFormElement) =>
  [...form.elements].filter((el): el is HTMLInputElement => "name" in el && "value" in el) as unknown as (HTMLInputElement & DraftField)[];

/** Restaura el borrador de `key` en el formulario y lo va guardando en cada cambio. Devuelve cómo dejar de guardarlo. */
export function keepDraft(form: HTMLFormElement, key: string) {
  // Los valores de fábrica (defaultValue), no los de ahora: un form.reset() vuelve a ellos.
  const initial = snapshotOf(fieldsOf(form).map((f) => ({ id: f.id, name: f.name, type: f.type, value: f.defaultValue ?? "", checked: f.defaultChecked })));
  const saved = read(key);
  let restoring = Boolean(saved);
  const save = () => !restoring && write(key, collect(fieldsOf(form), initial));

  if (saved) {
    const byKey = () => new Map(keyed(fieldsOf(form)));
    // Primero las casillas, con un clic: así React actualiza su estado y aparecen los campos que dependen de ellas.
    for (const [k, f] of byKey()) if (isCheck(f) && k in saved && f.checked !== saved[k]) f.click();
    requestAnimationFrame(() => {
      for (const [k, f] of byKey()) {
        if (isCheck(f) || !(k in saved) || f.value === saved[k]) continue;
        f.value = String(saved[k]);
        f.dispatchEvent(new Event("input", { bubbles: true }));
        f.dispatchEvent(new Event("change", { bubbles: true }));
      }
      restoring = false;
    });
  }
  form.addEventListener("input", save);
  form.addEventListener("change", save);
  return () => {
    form.removeEventListener("input", save);
    form.removeEventListener("change", save);
  };
}
