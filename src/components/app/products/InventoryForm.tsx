import { actions } from "astro:actions";
import { Trash2 } from "lucide-react";
import type { Product } from "@/data/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionForm, StockFields } from "./form";
import { confirmDialog, toast } from "@/scripts/dialogs";

export function InventoryForm({ businessId, branchId, product, onClose }: { businessId: string; branchId: string; product: Product; onClose: () => void }) {
  const save = useActionForm((form) => actions.saveInventory(form) as never);

  async function remove() {
    if (!(await confirmDialog(`¿Dejar de vender «${product.name}» en esta sucursal? Sigue en el catálogo.`, { confirmLabel: "Dejar de vender", danger: true }))) return;
    const form = new FormData();
    form.set("branchId", branchId);
    form.set("productId", product.id);
    const { error } = await actions.removeInventory(form);
    if (error) return toast(error.message, "error");
    window.location.reload();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>Precio y stock en esta sucursal.</DialogDescription>
        </DialogHeader>
        <form className="grid min-w-0 gap-4" onSubmit={save.onSubmit} noValidate>
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="branchId" value={branchId} />
          <input type="hidden" name="productId" value={product.id} />
          <StockFields product={product} errors={save.errors} />
          {save.message && (
            <p className="notice notice-error m-0" role="alert">
              {save.message}
            </p>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" className="text-destructive" onClick={remove}>
              <Trash2 />
              Quitar de la sucursal
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.busy}>
                {save.busy ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
