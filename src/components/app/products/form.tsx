// Piezas de los formularios del catálogo: campo con error, envío a una acción y campos de stock.
import { useState } from "react";
import type { Product } from "@/data/types";
import { Label } from "@/components/ui/label";

export function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export const selectClass = "input";

/** Envía el formulario a una acción y recarga al guardar. Devuelve errores por campo o el general. */
export function useActionForm(action: (form: FormData) => Promise<{ error?: { message: string; fields?: Record<string, string[] | undefined> } }>) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  async function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage("");
    const { error } = await action(new FormData(e.currentTarget));
    if (!error) return window.location.reload();
    setBusy(false);
    if (error.fields) setErrors(Object.fromEntries(Object.entries(error.fields).map(([k, v]) => [k, v?.[0] ?? ""])));
    else setMessage(error.message);
  }
  return { busy, errors, message, onSubmit };
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
