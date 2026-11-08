// Piezas de los formularios del catálogo: campo con error, envío a una acción y campos de stock.
import { cloneElement, isValidElement, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { Product } from "@/data/types";
import { Label } from "@/components/ui/label";
import { refreshRegions } from "@/scripts/refresh";
import { toast } from "@/scripts/dialogs";

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
    <div className="grid min-w-0 content-start gap-1.5">
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

/**
 * Selector de archivo: un recuadro que se toca entero, en vez del input nativo (que en el celular se ve tosco).
 * El input real queda oculto pero enfocable; dentro de Field recibe aria-invalid y aria-describedby.
 */
export function FilePicker({
  id,
  name,
  accept,
  icon,
  label,
  fileName,
  hint,
  onChange,
  ...aria
}: {
  id: string;
  name?: string;
  accept: string;
  icon: ReactNode;
  label: string;
  fileName?: string;
  hint?: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  return (
    <label
      className="flex min-h-14 min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[var(--color-input-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm transition-colors hover:bg-[var(--color-surface-muted)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-focus)] has-[[aria-invalid=true]]:border-[var(--color-expense)]"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--color-primary-soft)] text-[var(--color-primary)] [&_svg]:size-5" aria-hidden="true">
        {icon}
      </span>
      <span className="grid min-w-0 flex-1">
        <span className="truncate font-semibold">{fileName || label}</span>
        <span className="text-xs text-[var(--color-text-muted)]">{fileName ? "Toca para cambiarlo" : hint}</span>
      </span>
      <input id={id} name={name} type="file" accept={accept} className="sr-only" onChange={onChange} {...aria} />
    </label>
  );
}

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
/**
 * Envía el formulario a la acción. Si sale bien: cierra (onDone), actualiza la página y avisa con `success` (texto fijo
 * o armado con lo enviado). Si falla, el error queda dentro del diálogo: una notificación quedaría detrás del modal.
 */
export function useActionForm(
  action: (form: FormData) => Promise<ActionResult>,
  onDone?: () => void,
  // Sin texto (la función devuelve undefined), no hay toast: el diálogo sigue abierto y avisa él mismo.
  success?: string | ((form: FormData) => string | undefined),
) {
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
    if (!error) {
      // Sin recargar: se cierra el diálogo y la página cambia solo lo que muestra estos datos (scripts/refresh.ts).
      onDone?.();
      await refreshRegions();
      const text = typeof success === "string" ? success : success?.(form);
      if (text) toast(text, "success");
      return setBusy(false);
    }
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
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
      <input type="checkbox" name={name} value="true" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 shrink-0 accent-[var(--color-primary)]" />
      {label}
    </label>
  );
}

/**
 * Precio y stock en una sucursal. Sin «Precio fijo», el precio se escribe al vender (prenda única);
 * sin «Controlar stock», se vende sin tope (un plato, una prenda por tipo). Los campos ocultos no se envían.
 */
export function StockFields({
  product,
  errors,
  stockLocked = false,
  planHref,
}: {
  product?: Product;
  errors: Record<string, string>;
  /** Plan Gratis: el stock se ve pero no se cambia (la base lo tiene congelado). */
  stockLocked?: boolean;
  planHref?: string;
}) {
  const [fixedPrice, setFixedPrice] = useState(product?.price !== null);
  const [trackStock, setTrackStock] = useState(product?.stock !== null);
  return (
    // Dos bloques, precio y stock, separados por una línea: cada interruptor queda junto a lo que activa.
    <div className="grid min-w-0 gap-4">
      <div className="grid min-w-0 gap-2">
        <Toggle name="fixedPrice" label="Precio fijo" checked={fixedPrice} onChange={setFixedPrice} />
        {fixedPrice ? (
          <Field id="inv-price" label="Precio de venta (Bs)" error={errors.price}>
            <input id="inv-price" name="price" type="number" inputMode="decimal" step="0.01" min="0" className="input" defaultValue={product?.price ?? undefined} required />
          </Field>
        ) : (
          <p className="field-hint m-0">Quien vende escribe el precio en cada venta.</p>
        )}
      </div>
      {product?.components ? (
        // Un combo no tiene stock propio: alcanza para lo que alcancen sus productos (comboStock).
        <p className="field-hint m-0 border-t pt-4">
          {product.stock === null
            ? "El stock sale de los productos del combo; ninguno lo controla."
            : `El stock sale de los productos del combo: alcanza para ${product.stock}.`}
        </p>
      ) : stockLocked ? (
        <div className="grid min-w-0 gap-1 border-t pt-4">
          <p className="m-0 text-sm font-semibold">
            {product?.stock == null ? "Sin control de stock" : (
              <>
                Stock: <span className="num">{product.stock}</span>
                {product.minStock != null && (
                  <>
                    {" "}· mínimo <span className="num">{product.minStock}</span>
                  </>
                )}{" "}
                (congelado)
              </>
            )}
          </p>
          <p className="field-hint m-0">
            {product?.stock == null ? "El control de stock es del plan Negocio." : "Se ve como estaba, pero no cambia con las ventas: el control de stock es del plan Negocio."}{" "}
            {planHref && (
              <a href={planHref} className="underline underline-offset-2">
                Ver planes
              </a>
            )}
          </p>
        </div>
      ) : (
      <div className="grid min-w-0 gap-2 border-t pt-4">
        <Toggle name="trackStock" label="Controlar stock" checked={trackStock} onChange={setTrackStock} />
        {/* Si ya se controlaba, el stock de ahora: al guardar se aplica solo la diferencia (ver saveInventory). */}
        {trackStock && product && product.stock !== null && <input type="hidden" name="stockBefore" value={product.stock} />}
        {trackStock ? (
          <div className="grid min-w-0 grid-cols-2 items-start gap-3">
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
      </div>
      )}
    </div>
  );
}
