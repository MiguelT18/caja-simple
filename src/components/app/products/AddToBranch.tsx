import { actions } from "astro:actions";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, selectClass, useActionForm, StockFields } from "./form";

export function AddToBranch({ businessId, branchId, addable }: { businessId: string; branchId: string; addable: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const save = useActionForm((form) => actions.saveInventory(form) as never, () => setOpen(false), (form) =>
    `«${addable.find((p) => p.id === form.get("productId"))?.name ?? "El producto"}» se agregó a esta sucursal.`,
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11">
          <Plus />
          Agregar a la sucursal
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar a la sucursal</DialogTitle>
          <DialogDescription>Elige un producto del catálogo y ponle precio y stock aquí.</DialogDescription>
        </DialogHeader>
        <form className="grid min-w-0 gap-4" onSubmit={save.onSubmit} noValidate>
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="branchId" value={branchId} />
          <Field id="inv-product" label="Producto" error={save.errors.productId}>
            <select id="inv-product" name="productId" className={selectClass} required>
              {addable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <StockFields errors={save.errors} />
          {save.message && (
            <p className="notice notice-error m-0" role="alert">
              {save.message}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" {...save.submitProps}>
              {save.busy ? "Guardando…" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
