import { useState } from "react";
import { X } from "lucide-react";
import type { CatalogEntry } from "@/data/queries";
import { formatBs } from "@/lib/format";
import { Field, selectClass } from "./form";

/**
 * Lo que incluye un combo (productos del catálogo con su cantidad) y su precio en cada sucursal. Al crear, se ofrece
 * en las sucursales donde se venden todos sus productos; al editar, el precio de donde ya se vende.
 */
export function ComboFields({
  catalog,
  branches,
  product,
  initial = [],
  errors,
}: {
  catalog: CatalogEntry[];
  branches: { id: string; name: string }[];
  product?: CatalogEntry;
  initial?: string[];
  errors: Record<string, string>;
}) {
  const [parts, setParts] = useState(() =>
    product?.components ? product.components.map((c) => ({ productId: c.productId, qty: c.qty })) : initial.filter((id) => catalog.some((p) => p.id === id)).map((productId) => ({ productId, qty: 1 })),
  );
  const [off, setOff] = useState<Set<string>>(new Set());
  const byId = new Map(catalog.map((p) => [p.id, p]));
  // Un combo no entra en otro, ni se incluye a sí mismo.
  const options = catalog.filter((p) => !p.components && p.id !== product?.id && !parts.some((x) => x.productId === p.id));
  const soldAt = (productId: string, branchId: string) => byId.get(productId)?.soldIn.find((s) => s.branchId === branchId);
  const rows = product
    ? product.soldIn.map((s) => ({ id: s.branchId, name: s.branch, price: s.price }))
    : branches.filter((b) => parts.length > 0 && parts.every((x) => soldAt(x.productId, b.id))).map((b) => ({ ...b, price: null }));

  function separately(branchId: string) {
    const here = parts.map((x) => soldAt(x.productId, branchId));
    if (here.some((s) => !s)) return "Algún producto del combo no se vende en esta sucursal.";
    const prices = parts.map((x, i) => ({ price: here[i]!.price, qty: x.qty }));
    if (prices.some((p) => p.price == null)) return "Por separado: algunos se cobran al vender.";
    return `Por separado: ${formatBs(prices.reduce((sum, p) => sum + p.price! * p.qty, 0))}.`;
  }

  return (
    <>
      <input type="hidden" name="combo" value="true" />
      <fieldset className="grid min-w-0 gap-2 border-0 p-0">
        <legend className="mb-1 text-sm font-semibold">Qué incluye</legend>
        {parts.length > 0 && (
          <ul className="m-0 grid list-none gap-2 p-0">
            {parts.map((x, i) => {
              const item = byId.get(x.productId);
              const label = item?.name ?? "Producto";
              return (
                <li key={x.productId} className="flex min-w-0 items-center gap-2 rounded-lg border bg-card p-2">
                  <input type="hidden" name="componentId" value={x.productId} />
                  <span className="size-9 shrink-0 overflow-hidden rounded-md bg-muted">
                    {item?.image && <img src={item.image} alt="" decoding="async" className="size-full object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-semibold [overflow-wrap:anywhere]">{label}</span>
                  <label className="sr-only" htmlFor={`combo-qty-${x.productId}`}>
                    Cantidad de {label}
                  </label>
                  {/* .input es width: 100% (sin capa, le gana a w-20): el ancho lo pone este contenedor. */}
                  <span className="w-20 shrink-0">
                  <input
                    id={`combo-qty-${x.productId}`}
                    name="componentQty"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    step={1}
                    className="input text-center tabular-nums"
                    value={x.qty}
                    onChange={(e) => setParts((list) => list.map((p, j) => (j === i ? { ...p, qty: Math.max(1, Math.min(99, Number(e.target.value) || 1)) } : p)))}
                  />
                  </span>
                  <button
                    type="button"
                    className="icon-btn size-11 shrink-0"
                    aria-label={`Quitar ${label} del combo`}
                    onClick={() => setParts((list) => list.filter((_, j) => j !== i))}
                  >
                    <X className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Field id="combo-add" label={parts.length ? "Agregar otro producto" : "Agregar un producto"} error={errors.components}>
          <select
            id="combo-add"
            className={selectClass}
            value=""
            disabled={options.length === 0 || parts.length >= 20}
            onChange={(e) => e.target.value && setParts((list) => [...list, { productId: e.target.value, qty: 1 }])}
          >
            <option value="">{options.length ? "Elige un producto del catálogo" : "No quedan productos para agregar"}</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset className="grid min-w-0 gap-3 border-0 p-0">
        <legend className="mb-1 text-sm font-semibold">Precio del combo (Bs)</legend>
        {rows.length === 0 ? (
          <p className="field-hint m-0">
            {parts.length === 0
              ? "Elige los productos y aquí aparecen las sucursales donde se puede vender."
              : product
                ? "No se vende en ninguna sucursal. Agrégalo desde el inventario de una sucursal."
                : "Ninguna sucursal vende todos estos productos. Agrégalos al inventario de una sucursal para vender el combo ahí."}
          </p>
        ) : (
          rows.map((b) => {
            const on = Boolean(product) || !off.has(b.id);
            return (
              <div key={b.id} className="grid min-w-0 gap-1.5">
                {product ? (
                  <input type="hidden" name="priceBranch" value={b.id} />
                ) : (
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
                    <input
                      type="checkbox"
                      name="priceBranch"
                      value={b.id}
                      checked={on}
                      onChange={(e) => setOff((s) => { const next = new Set(s); e.target.checked ? next.delete(b.id) : next.add(b.id); return next; })}
                      className="size-5 shrink-0 accent-[var(--color-primary)]"
                    />
                    Vender en {b.name}
                  </label>
                )}
                {/* Deshabilitado no se envía: precio y sucursal siguen en el mismo orden (ver saveProduct). */}
                <Field id={`combo-price-${b.id}`} label={product ? b.name : `Precio en ${b.name}`} hint={separately(b.id)}>
                  <input
                    id={`combo-price-${b.id}`}
                    name="price"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className="input"
                    defaultValue={b.price ?? undefined}
                    placeholder="Al vender"
                    disabled={!on}
                  />
                </Field>
              </div>
            );
          })
        )}
        {errors.price && <p className="field-error m-0">{errors.price}</p>}
      </fieldset>
    </>
  );
}
