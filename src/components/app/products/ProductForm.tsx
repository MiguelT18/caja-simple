import { actions } from "astro:actions";
import { useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import type { Category } from "@/data/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type Item } from "./catalog";
import { Field, safeAction, selectClass, useActionForm } from "./form";
import { refreshRegions } from "@/scripts/refresh";
import { confirmDialog, toast } from "@/scripts/dialogs";
import { shrinkInput } from "@/scripts/shrink-image";

export function ProductForm({
  businessId,
  categories,
  product,
  onClose,
}: {
  businessId: string;
  categories: Category[];
  product?: Item;
  onClose: () => void;
}) {
  const save = useActionForm((form) => actions.saveProduct(form) as never, onClose, (form) =>
    product ? `Cambios de «${form.get("name")}» guardados.` : `«${form.get("name")}» se agregó al catálogo.`,
  );
  const [preview, setPreview] = useState(product?.image);
  const [removeImage, setRemoveImage] = useState(false);
  // La foto se revisa al elegirla: así el error llega antes de subir un archivo que el servidor va a rechazar.
  const [fileError, setFileError] = useState("");
  // Mientras se achica la foto no se envía: se subiría el original.
  const [shrinking, setShrinking] = useState(false);
  const imageError = fileError || save.errors.image;

  async function remove() {
    if (!product || !(await confirmDialog(`¿Borrar «${product.name}» del catálogo? Se quita de todas las sucursales.`, { confirmLabel: "Borrar", danger: true }))) return;
    const form = new FormData();
    form.set("id", product.id);
    const { error } = await safeAction(() => actions.deleteProduct(form));
    // Dentro del diálogo, en línea: un toast quedaría detrás del modal, inerte.
    if (error) return save.setMessage(error.message);
    onClose();
    await refreshRegions();
    toast(`«${product.name}» se borró del catálogo.`, "success");
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product ? "Editar producto" : "Agregar producto"}</DialogTitle>
          <DialogDescription>El precio y el stock se ponen en el inventario de cada sucursal.</DialogDescription>
        </DialogHeader>
        <form className="grid min-w-0 gap-4" onSubmit={(e) => (shrinking ? e.preventDefault() : save.onSubmit(e))} noValidate>
          <input type="hidden" name="businessId" value={businessId} />
          {product && <input type="hidden" name="id" value={product.id} />}
          <Field id="product-name" label="Nombre" error={save.errors.name}>
            <input id="product-name" name="name" className="input" defaultValue={product?.name} required maxLength={80} placeholder="Ej.: Leche entera 1 L" />
          </Field>
          <Field id="product-category" label="Categoría">
            <select id="product-category" name="categoryId" className={selectClass} defaultValue={product?.categoryId ?? ""}>
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="product-barcode" label="Código de barras" hint="Opcional. Puedes escanearlo con un lector." error={save.errors.barcode}>
            <input
              id="product-barcode"
              name="barcode"
              className="input"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={product?.barcode}
              maxLength={14}
            />
          </Field>
          <Field id="product-description" label="Descripción" hint="Opcional. Hasta 500 caracteres: se ve al abrir el producto." error={save.errors.description}>
            <textarea
              id="product-description"
              name="description"
              className="input min-h-20 py-2"
              rows={3}
              maxLength={500}
              defaultValue={product?.description}
              placeholder="Ej.: Talla única, 100% algodón. Lavar en frío."
            />
          </Field>
          <Field id="product-image" label="Foto" hint="Opcional. JPG, PNG o WebP. La achicamos al subirla." error={imageError}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted text-muted-foreground">
                {preview && !removeImage ? <img src={preview} alt="" decoding="async" className="size-full object-cover" /> : <ImagePlus className="size-6" aria-hidden="true" />}
              </span>
              <input
                id="product-image"
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="w-full min-w-0 text-sm"
                aria-invalid={imageError ? true : undefined}
                aria-describedby={imageError ? "product-image-error" : "product-image-hint"}
                onChange={async (e) => {
                  const input = e.target;
                  setShrinking(true);
                  const file = await shrinkInput(input, 640);
                  setShrinking(false);
                  const problem =
                    file && !["image/jpeg", "image/png", "image/webp"].includes(file.type) ? "Elige una foto JPG, PNG o WebP."
                    : file && file.size > 2 * 1024 * 1024 ? "La foto pesa más de 2 MB. Elige una más liviana."
                    : "";
                  setFileError(problem);
                  if (problem) input.value = "";
                  setRemoveImage(false);
                  if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
                  setPreview(file && !problem ? URL.createObjectURL(file) : product?.image);
                }}
              />
            </div>
            {product?.image && !removeImage && (
              <button type="button" className="justify-self-start text-sm font-semibold text-primary underline-offset-4 hover:underline" onClick={() => {
                  setRemoveImage(true);
                  // El botón desaparece: el foco pasa al campo de la foto.
                  document.getElementById("product-image")?.focus();
                }}>
                Quitar foto
              </button>
            )}
            {removeImage && <input type="hidden" name="removeImage" value="true" />}
          </Field>
          {save.message && (
            <p className="notice notice-error m-0" role="alert">
              {save.message}
            </p>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {product ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={remove}>
                <Trash2 />
                Borrar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" {...save.submitProps} {...(shrinking && { "aria-disabled": true, "aria-busy": true })}>
                {save.busy ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
