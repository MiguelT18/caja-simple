// Piezas de los formularios del catálogo: campo con error, envío a una acción y campos de stock.
import { cloneElement, isValidElement, useEffect, useRef, useState } from "react";
import type { Product } from "@/data/types";
import { Label } from "@/components/ui/label";

/**
 * Campo con etiqueta, ayuda y error. El control (hijo) recibe aria-invalid y aria-describedby enlazados a la ayuda
 * y al error, así el lector de pantalla los lee al enfocarlo.
 */
export function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  const describedBy = [hint && !error && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const control =
    isValidElement<Record<string, unknown>>(children) && children.props.id === id
      ? cloneElement(children, { "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })
      : children;
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control}
      {hint && !error && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export const selectClass = "input";

type ActionResult = { error?: { message: string; fields?: Record<string, string[] | undefined> } };

/** Llama a una acción sin que una caída de red rompa la pantalla: la excepción vuelve como `{ error }`. */
export async function safeAction<T extends ActionResult>(call: () => Promise<T>): Promise<T | { data?: undefined; error: { message: string } }> {
  try {
    return await call();
  } catch {
    return { error: { message: "No hay conexión. Revisa tu internet e intenta de nuevo." } };
  }
}

/**
 * Envía el formulario a una acción y recarga al guardar. Devuelve errores por campo o el general.
 * `submitProps` va en el botón de envío: aria-disabled (no disabled) para que el foco no se pierda mientras guarda.
 * Tras un error por campo, el foco pasa al primer campo inválido.
 */
export function useActionForm(action: (form: FormData) => Promise<ActionResult>) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (Object.keys(errors).length > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  async function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    formRef.current = e.currentTarget;
    setBusy(true);
    setErrors({});
    setMessage("");
    const form = new FormData(e.currentTarget);
    const { error } = await safeAction(() => action(form));
    if (!error) return window.location.reload();
    setBusy(false);
    const fields = "fields" in error ? error.fields : undefined;
    if (fields && Object.keys(fields).length > 0) setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v?.[0] ?? ""])));
    else setMessage(error.message);
  }
  const submitProps = { "aria-disabled": busy || undefined, "aria-busy": busy || undefined };
  return { busy, errors, message, setMessage, onSubmit, submitProps };
}

/** Casilla con su texto: decide si se muestra un grupo de campos. */
function Toggle({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input type="checkbox" name={name} value="true" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
      {label}
    </label>
  );
}

/**
 * Precio y stock en una sucursal. Sin «Precio fijo», el precio se escribe al vender (prenda única);
 * sin «Controlar stock», se vende sin tope (un plato, una prenda por tipo). Los campos ocultos no se envían.
 */
export function StockFields({ product, errors }: { product?: Product; errors: Record<string, string> }) {
  const [fixedPrice, setFixedPrice] = useState(product?.price !== null);
  const [trackStock, setTrackStock] = useState(product?.stock !== null);
  return (
    <>
      <Toggle name="fixedPrice" label="Precio fijo" checked={fixedPrice} onChange={setFixedPrice} />
      {fixedPrice ? (
        <Field id="inv-price" label="Precio de venta (Bs)" error={errors.price}>
          <input id="inv-price" name="price" type="number" inputMode="decimal" step="0.01" min="0" className="input" defaultValue={product?.price ?? undefined} required />
        </Field>
      ) : (
        <p className="field-hint m-0">Quien vende escribe el precio en cada venta.</p>
      )}
      <Toggle name="trackStock" label="Controlar stock" checked={trackStock} onChange={setTrackStock} />
      {trackStock ? (
        <div className="grid grid-cols-2 gap-3">
          <Field id="inv-stock" label="Stock" error={errors.stock}>
            <input id="inv-stock" name="stock" type="number" inputMode="numeric" step="1" min="0" className="input" defaultValue={product?.stock ?? 0} required />
          </Field>
          <Field id="inv-min" label="Stock mínimo" hint="Avisa cuando baje de aquí." error={errors.minStock}>
            <input id="inv-min" name="minStock" type="number" inputMode="numeric" step="1" min="0" className="input" defaultValue={product?.minStock ?? 0} required />
          </Field>
        </div>
      ) : (
        <p className="field-hint m-0">Se vende sin tope y sin avisos de stock bajo.</p>
      )}
    </>
  );
}
