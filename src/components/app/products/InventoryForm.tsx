import { actions } from "astro:actions";
import { Trash2 } from "lucide-react";
import type { Product } from "@/data/types";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { AppDialog } from "../AppDialog";
import { safeAction, useActionForm, StockFields } from "./form";
import { refreshRegions } from "@/scripts/refresh";
import { confirmDialog, toast } from "@/scripts/dialogs";

export function InventoryForm({
  businessId,
  branchId,
  product,
  stockLocked = false,
  planHref,
  onClose,
}: {
  businessId: string;
  branchId: string;
  product: Product;
  /** Plan Gratis: solo el precio se guarda; el stock se ve congelado. */
  stockLocked?: boolean;
  planHref?: string;
  onClose: () => void;
}) {
  const save = useActionForm(
    (form) => actions.saveInventory(form) as never,
    onClose,
    stockLocked ? `Precio de «${product.name}» guardado.` : `Precio y stock de «${product.name}» guardados.`,
  );

  async function remove() {
    if (!(await confirmDialog(`¿Dejar de vender «${product.name}» en esta sucursal? Sigue en el catálogo.`, { confirmLabel: "Dejar de vender", danger: true }))) return;
    const form = new FormData();
    form.set("branchId", branchId);
    form.set("productId", product.id);
    const { error } = await safeAction(() => actions.removeInventory(form));
    // Dentro del diálogo, en línea: un toast quedaría detrás del modal, inerte.
    if (error) return save.setMessage(error.message);
    onClose();
    await refreshRegions();
    toast(`«${product.name}» ya no se vende en esta sucursal.`, "success");
  }

  return (
    <AppDialog title={product.name} description={stockLocked ? "Precio en esta sucursal." : "Precio y stock en esta sucursal."} onClose={onClose}>
        <form className="grid min-w-0 gap-4" onSubmit={save.onSubmit} noValidate>
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="branchId" value={branchId} />
          <input type="hidden" name="productId" value={product.id} />
          <StockFields product={product} errors={save.errors} stockLocked={stockLocked} planHref={planHref} />
          {save.message && (
            <p className="notice notice-error m-0" role="alert">
              {save.message}
            </p>
          )}
          {/* Quitar, separado y a la izquierda; Cancelar y Guardar a la derecha (en el celular, a lo ancho). */}
          <DialogFooter className="mt-2 flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="ghost" className="text-destructive sm:-ml-3" onClick={remove}>
              <Trash2 />
              Quitar de la sucursal
            </Button>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" {...save.submitProps}>
                {save.busy ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </DialogFooter>
        </form>
    </AppDialog>
  );
}
