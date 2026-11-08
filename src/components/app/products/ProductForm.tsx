import { actions } from "astro:actions";
import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import type { Category } from "@/data/types";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { AppDialog } from "../AppDialog";
import { type Item } from "./catalog";
import { Field, safeAction, selectClass, useActionForm } from "./form";
import { ScanBarcode } from "./ScanBarcode";
import { ComboFields } from "./ComboFields";
import type { CatalogEntry } from "@/data/queries";
import { refreshRegions } from "@/scripts/refresh";
import { confirmDialog, toast } from "@/scripts/dialogs";
import { shrinkInput } from "@/scripts/shrink-image";

export function ProductForm({
  businessId,
  categories,
  product,
  combo = false,
  comboSeed,
  catalog = [],
  branches = [],
  onClose,
}: {
  businessId: string;
  categories: Category[];
  product?: Item;
  /** Armar un combo nuevo (al editar, sale de product.components). comboSeed: productos con que empieza. */
  combo?: boolean;
  comboSeed?: string[];
  catalog?: CatalogEntry[];
  branches?: { id: string; name: string }[];
  onClose: () => void;
}) {
  const isCombo = combo || Boolean(product?.components);
  const formRef = useRef<HTMLFormElement>(null);
  // «Guardar y agregar otro»: el diálogo queda abierto, limpio y con la misma categoría, para cargar un estante seguido.
  const another = useRef(false);
  const [lastAdded, setLastAdded] = useState("");
  const save = useActionForm(
    (form) => actions.saveProduct(form) as never,
    () => (another.current ? startAnother() : onClose()),
    (form) =>
      another.current ? undefined
      : product ? `Cambios de «${form.get("name")}» guardados.`
      : isCombo ? `El combo «${form.get("name")}» se armó${form.getAll("priceBranch").length ? " y ya se puede vender" : ""}.`
      : `«${form.get("name")}» se agregó al catálogo.`,
  );

  function startAnother() {
    const form = formRef.current!;
    const name = new FormData(form).get("name") as string;
    const category = (form.elements.namedItem("categoryId") as HTMLSelectElement).value;
    form.reset();
    (form.elements.namedItem("categoryId") as HTMLSelectElement).value = category;
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(undefined);
    setFileError("");
    setLastAdded(name);
    (form.elements.namedItem("name") as HTMLInputElement).focus();
  }
  const [preview, setPreview] = useState(product?.image);
  const [removeImage, setRemoveImage] = useState(false);
  // La foto se revisa al elegirla: así el error llega antes de subir un archivo que el servidor va a rechazar.
  const [fileError, setFileError] = useState("");
  // Mientras se achica la foto no se envía: se subiría el original.
  const [shrinking, setShrinking] = useState(false);
  const imageError = fileError || save.errors.image;
  const soldIn = product && "soldIn" in product ? product.soldIn : [];

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
    <AppDialog
      title={isCombo ? (product ? "Editar combo" : "Armar combo") : product ? "Editar producto" : "Agregar producto"}
      description={
        isCombo ? "Junta productos de tu catálogo y véndelos a un precio propio. Al venderlo se descuenta el stock de cada uno."
        : soldIn.length ? "El stock se cambia en el inventario de cada sucursal."
        : "El precio y el stock se ponen en el inventario de cada sucursal."
      }
      size={isCombo ? "lg" : "md"}
      onClose={onClose}
    >
        <form
          ref={formRef}
          className="grid min-w-0 gap-4"
          onSubmit={(e) => {
            if (shrinking) return e.preventDefault();
            another.current = Boolean((e.nativeEvent as SubmitEvent).submitter?.hasAttribute("data-another"));
            save.onSubmit(e);
          }}
          noValidate
        >
          {lastAdded && (
            <p className="notice m-0 bg-[var(--color-income-soft)] font-semibold text-[var(--color-income)]" role="status">
              «{lastAdded}» se agregó al catálogo. Sigue con el próximo.
            </p>
          )}
          <input type="hidden" name="businessId" value={businessId} />
          {product && <input type="hidden" name="id" value={product.id} />}
          <Field id="product-name" label="Nombre" error={save.errors.name}>
            <input id="product-name" name="name" className="input" defaultValue={product?.name} required maxLength={80} placeholder={isCombo ? "Ej.: Combo desayuno" : "Ej.: Leche entera 1 L"} />
          </Field>
          {isCombo && (
            <ComboFields catalog={catalog} branches={branches} product={product && "soldIn" in product ? product : undefined} initial={comboSeed} errors={save.errors} />
          )}
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
          {!isCombo && (
          <Field id="product-barcode" label="Código de barras" hint="Opcional. Escanéalo con un lector o con la cámara." error={save.errors.barcode}>
            <div className="flex min-w-0 gap-2">
              <input
                id="product-barcode"
                name="barcode"
                className="input min-w-0 flex-1"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={product?.barcode}
                maxLength={14}
                aria-invalid={save.errors.barcode ? true : undefined}
                aria-describedby={save.errors.barcode ? "product-barcode-error" : "product-barcode-hint"}
              />
              <ScanBarcode
                onScan={(code) => {
                  const input = formRef.current?.elements.namedItem("barcode") as HTMLInputElement | null;
                  if (input) input.value = code;
                  input?.focus();
                }}
              />
            </div>
          </Field>
          )}
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
          {!isCombo && soldIn.length > 0 && (
            <fieldset className="grid min-w-0 gap-3 border-0 p-0">
              <legend className="mb-1 text-sm font-semibold">Precio de venta (Bs)</legend>
              {soldIn.map((s) => (
                <div key={s.branchId}>
                  <input type="hidden" name="priceBranch" value={s.branchId} />
                  <Field id={`product-price-${s.branchId}`} label={s.branch}>
                    <input
                      id={`product-price-${s.branchId}`}
                      name="price"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      className="input"
                      defaultValue={s.price ?? undefined}
                      placeholder="Al vender"
                    />
                  </Field>
                </div>
              ))}
              <p className={save.errors.price ? "field-error m-0" : "field-hint m-0"}>
                {save.errors.price || "Déjalo vacío para que quien vende escriba el precio en cada venta."}
              </p>
            </fieldset>
          )}
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
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              {!product && !isCombo && (
                <Button type="submit" variant="outline" data-another {...save.submitProps} {...(shrinking && { "aria-disabled": true, "aria-busy": true })}>
                  Guardar y agregar otro
                </Button>
              )}
              <Button type="submit" {...save.submitProps} {...(shrinking && { "aria-disabled": true, "aria-busy": true })}>
                {save.busy ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </DialogFooter>
        </form>
    </AppDialog>
  );
}
