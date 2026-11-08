import { actions } from "astro:actions";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DialogFooter } from "@/components/ui/dialog";
import { AppDialog } from "../AppDialog";
import { toast } from "@/scripts/dialogs";
import { refreshRegions } from "@/scripts/refresh";
import { safeAction } from "./form";

type Draft = { on: boolean; price: string; stock: string };
const EMPTY: Draft = { on: false, price: "", stock: "" };
const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Agrega varios productos del catálogo a la sucursal de una vez: se marcan en una tabla y se les pone precio y stock
 * ahí mismo (vacío = se cobra al vender / no se controla). Escribir un precio o un stock marca la fila.
 */
export function AddToBranch({
  businessId,
  branchId,
  addable,
  withStock = true,
}: {
  businessId: string;
  branchId: string;
  addable: { id: string; name: string }[];
  /** Sin control de stock (plan Gratis): solo el precio. */
  withStock?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => addable.filter((p) => plain(p.name).includes(plain(query.trim()))), [addable, query]);
  const chosen = addable.filter((p) => drafts[p.id]?.on);
  const draft = (id: string) => drafts[id] ?? EMPTY;
  const edit = (id: string, change: Partial<Draft>) => setDrafts((all) => ({ ...all, [id]: { ...(all[id] ?? EMPTY), ...change } }));
  const allShown = shown.length > 0 && shown.every((p) => draft(p.id).on);

  async function submit() {
    if (busy || !chosen.length) return;
    const items = chosen.map((p) => {
      const d = draft(p.id);
      return { productId: p.id, price: d.price === "" ? undefined : Number(d.price), stock: d.stock === "" ? undefined : Number(d.stock) };
    });
    const bad = items.find((i) => (i.price !== undefined && !(i.price >= 0)) || (i.stock !== undefined && !(Number.isInteger(i.stock) && i.stock >= 0)));
    if (bad) return setMessage(`Revisa «${addable.find((p) => p.id === bad.productId)!.name}»: el precio es un monto y el stock, un número entero de 0 o más.`);
    setBusy(true);
    setMessage("");
    const { data, error } = await safeAction(() => actions.addToInventory({ businessId, branchId, items }));
    setBusy(false);
    if (error) return setMessage(error.message);
    setOpen(false);
    setDrafts({});
    setQuery("");
    toast(data.added === 1 ? `«${chosen[0].name}» se agregó a esta sucursal.` : `Se agregaron ${data.added} productos a esta sucursal.`, "success");
    await refreshRegions();
  }

  return (
    <AppDialog
      title="Agregar a la sucursal"
      description={
        withStock
          ? "Marca los productos del catálogo y ponles precio y stock aquí. Sin precio se cobra al vender; sin stock, no se controla."
          : "Marca los productos del catálogo y ponles precio aquí. Sin precio se cobra al vender. El control de stock es del plan Negocio."
      }
      size="xl"
      className="flex flex-col"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setMessage("");
      }}
      trigger={
        <Button className="h-11">
          <Plus />
          Agregar a la sucursal
        </Button>
      }
    >

        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-56">
            <span className="sr-only">Buscar en el catálogo</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--color-text-muted)]" aria-hidden="true" />
            <input type="search" className="input w-full"
              // .input (sin capa) le gana a pl-9: el lugar de la lupa va en línea.
              style={{ paddingLeft: "2.25rem" }} placeholder="Buscar" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="size-5 accent-[var(--color-primary)]"
              checked={allShown}
              disabled={!shown.length}
              onChange={(e) => setDrafts((all) => ({ ...all, ...Object.fromEntries(shown.map((p) => [p.id, { ...(all[p.id] ?? EMPTY), on: e.target.checked }])) }))}
            />
            {query.trim() ? "Marcar los que se ven" : "Marcar todos"}
          </label>
        </div>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {shown.length === 0 ? (
            <p className="m-0 py-6 text-center text-sm text-[var(--color-text-muted)]">Ningún producto del catálogo coincide con «{query}».</p>
          ) : (
            <ul className="m-0 grid list-none gap-1 p-0" role="list">
              {shown.map((p) => {
                const d = draft(p.id);
                return (
                  <li
                    key={p.id}
                    className={cn(
                      "grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-md px-2 py-2 hover:bg-[var(--color-surface-hover)]",
                      withStock ? "sm:grid-cols-[auto_minmax(0,1fr)_8rem_6.5rem]" : "sm:grid-cols-[auto_minmax(0,1fr)_8rem]",
                    )}
                  >
                    <input
                      id={`add-${p.id}`}
                      type="checkbox"
                      className="size-5 accent-[var(--color-primary)]"
                      checked={d.on}
                      onChange={(e) => edit(p.id, { on: e.target.checked })}
                    />
                    <label htmlFor={`add-${p.id}`} className="col-span-2 min-w-0 truncate text-sm font-semibold sm:col-span-1">
                      {p.name}
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      className="input col-start-2 sm:col-start-auto"
                      placeholder="Al vender"
                      aria-label={`Precio de ${p.name} (Bs)`}
                      value={d.price}
                      onChange={(e) => edit(p.id, { price: e.target.value, on: d.on || e.target.value !== "" })}
                    />
                    {withStock && (
                      <input
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min="0"
                        className="input"
                        placeholder="Stock"
                        aria-label={`Stock de ${p.name}`}
                        value={d.stock}
                        onChange={(e) => edit(p.id, { stock: e.target.value, on: d.on || e.target.value !== "" })}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {message && (
          <p className="notice notice-error m-0" role="alert">
            {message}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} aria-disabled={busy || !chosen.length || undefined} aria-busy={busy || undefined}>
            {busy ? "Agregando…" : chosen.length > 1 ? `Agregar ${chosen.length} productos` : "Agregar"}
          </Button>
        </DialogFooter>
    </AppDialog>
  );
}
