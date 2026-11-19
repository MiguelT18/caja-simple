import { actions } from "astro:actions";
import { useEffect, useRef, useState } from "react";
import { CircleCheck, Copy, ImagePlus, Layers, Lock, Package, Shirt, Trash2, UtensilsCrossed, X } from "lucide-react";
import type { BusinessKind, Category, ProductFormConfig, ProductSection, SaleMode } from "@/data/types";
import type { CatalogEntry } from "@/data/queries";
import type { PlanLimits } from "@/data/plans";
import { formatBs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { colorOf, saleMode } from "./catalog";
import { Field, FilePicker, MoneyInput, safeAction, selectClass, useActionForm } from "./form";
import { ProductCard } from "./ProductCard";
import { ComboFields } from "./ComboFields";
import { ScanBarcode } from "./ScanBarcode";
import { MODES, ProductFormSettings } from "./ProductFormSettings";
import { confirmDialog, flashToast } from "@/scripts/dialogs";
import { clearDraft, confirmDiscard, draftKey, hasDraft, keepDraft } from "@/scripts/drafts";
import { shrinkInput } from "@/scripts/shrink-image";

type Branch = { id: string; name: string };
const MODE_ICONS = { stock: Package, open: UtensilsCrossed, free: Shirt, combo: Layers } as const;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Lo que muestra la vista previa: se lee del formulario en cada cambio (los campos no son controlados). */
type Snapshot = { name: string; categoryId: string; branches: { id: string; on: boolean; price: string; stock: string }[] };

function read(form: HTMLFormElement, branches: Branch[]): Snapshot {
  const value = (id: string) => (form.querySelector<HTMLInputElement>(`#${CSS.escape(id)}`)?.value ?? "").trim();
  return {
    name: value("product-name"),
    categoryId: value("product-category"),
    branches: branches.map((b) => ({
      id: b.id,
      on: form.querySelector<HTMLInputElement>(`#sell-${CSS.escape(b.id)}`)?.checked ?? true,
      price: value(`price-${b.id}`),
      stock: value(`stock-${b.id}`),
    })),
  };
}

/** Una sección de la página: título, ayuda corta y su cuerpo en una superficie elevada. */
function Section({ id, title, hint, children, aside, bare }: { id: string; title: string; hint?: string; children: React.ReactNode; aside?: React.ReactNode; bare?: boolean }) {
  return (
    <section aria-labelledby={`${id}-title`} className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="grid min-w-0 gap-0.5">
          <h2 id={`${id}-title`} className="m-0 text-xl font-extrabold tracking-[-0.02em]">
            {title}
          </h2>
          {hint && <p className="m-0 text-sm text-[var(--color-text-muted)]">{hint}</p>}
        </div>
        {aside}
      </div>
      {bare ? children : <div className="card grid min-w-0 gap-4 p-4 sm:p-5">{children}</div>}
    </section>
  );
}

/**
 * La página de un producto (crear o editar): se adapta a cómo se vende y a lo que el negocio eligió mostrar.
 * A la izquierda, las secciones; a la derecha, cómo se ve en el catálogo, en vivo. Al crear, lo escrito queda como
 * borrador en este equipo hasta guardar (scripts/drafts.ts).
 */
export default function ProductEditor({
  businessId,
  kind,
  config,
  categories,
  catalog,
  branches,
  product,
  combo = false,
  comboSeed = [],
  limits,
  catalogHref,
  planHref,
}: {
  businessId: string;
  kind: BusinessKind;
  config: ProductFormConfig;
  categories: Category[];
  catalog: CatalogEntry[];
  branches: Branch[];
  product?: CatalogEntry;
  combo?: boolean;
  comboSeed?: string[];
  limits: Pick<PlanLimits, "stock" | "bulk">;
  catalogHref: string;
  planHref: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<SaleMode>(() => (combo ? "combo" : saleMode(product, kind, config.defaultMode)));
  const isCombo = mode === "combo";
  const creating = !product;
  const withStock = limits.stock;
  // Producto nuevo: se vende desde ya en las sucursales marcadas (todas, salvo las que se desmarquen).
  const [off, setOff] = useState<Set<string>>(new Set());
  // Antes de la primera lectura del formulario: todas las sucursales marcadas y sin precio, como arranca.
  const [snap, setSnap] = useState<Snapshot>({
    name: product?.name ?? "",
    categoryId: product?.categoryId ?? "",
    branches: branches.map((b) => ({ id: b.id, on: true, price: "", stock: "" })),
  });
  const sync = () => {
    if (formRef.current) setSnap(read(formRef.current, branches));
  };
  // Al cambiar el tipo aparecen y se van campos: la vista previa se vuelve a leer.
  useEffect(sync, [mode]);

  // Al crear, lo escrito queda como borrador hasta guardar; la foto y lo que incluye un combo no se guardan.
  const draft = creating ? draftKey("product", businessId, combo ? "combo" : "new") : undefined;
  useEffect(() => (draft && formRef.current ? keepDraft(formRef.current, draft) : undefined), [draft]);

  const another = useRef(false);
  const [lastAdded, setLastAdded] = useState("");
  const leave = (message?: string) => {
    if (message) flashToast(message);
    location.assign(catalogHref);
  };
  const save = useActionForm(
    (form) => actions.saveProduct(form) as never,
    () => {
      if (draft) clearDraft(draft);
      const name = snap.name;
      if (another.current) return startAnother(name);
      leave(
        product ? `Cambios de «${name}» guardados.`
        : isCombo ? `El combo «${name}» se armó.`
        : snap.branches.some((b) => b.on) && branches.length ? `«${name}» se agregó y ya se puede vender.`
        : `«${name}» se agregó al catálogo.`,
      );
    },
    // El aviso lo muestra el catálogo al volver (flashToast); con «Guardar y agregar otro», el aviso en línea.
    () => undefined,
  );

  // Foto: se achica al elegirla y se revisa antes de subir (el servidor rechazaría un archivo inválido).
  const [preview, setPreview] = useState(product?.image);
  const [removeImage, setRemoveImage] = useState(false);
  const [photoName, setPhotoName] = useState("");
  const [fileError, setFileError] = useState("");
  const [shrinking, setShrinking] = useState(false);
  const imageError = fileError || save.errors.image;

  function startAnother(name: string) {
    const form = formRef.current!;
    const category = (form.elements.namedItem("categoryId") as HTMLSelectElement).value;
    form.reset();
    (form.elements.namedItem("categoryId") as HTMLSelectElement).value = category;
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(undefined);
    setPhotoName("");
    setFileError("");
    setOff(new Set());
    setLastAdded(name);
    sync();
    (form.elements.namedItem("name") as HTMLInputElement).focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function cancel() {
    if (draft && hasDraft(draft)) {
      if (!(await confirmDiscard())) return;
      clearDraft(draft);
    }
    leave();
  }

  async function remove() {
    if (!product || !(await confirmDialog(`¿Borrar «${product.name}» del catálogo? Se quita de todas las sucursales.`, { confirmLabel: "Borrar", danger: true }))) return;
    const form = new FormData();
    form.set("id", product.id);
    const { error } = await safeAction(() => actions.deleteProduct(form));
    if (error) return save.setMessage(error.message);
    leave(`«${product.name}» se borró del catálogo.`);
  }

  // Una sección oculta por el negocio se muestra igual si este producto ya tiene ese dato.
  const hidden = new Set<ProductSection>(config.hidden ?? []);
  const fields = config.fields ?? [];
  const shows = (section: ProductSection, has: boolean) => !hidden.has(section) || has;
  const showPhoto = shows("photo", Boolean(product?.image));
  const showBarcode = !isCombo && shows("barcode", Boolean(product?.barcode));
  const showDescription = shows("description", Boolean(product?.description));
  const showExtra = fields.length > 0 && shows("extra", Object.keys(product?.attributes ?? {}).length > 0);

  // Dónde se vende: al crear, todas las sucursales (con casilla); al editar, donde ya se vende.
  const placing = creating && !isCombo && branches.length > 0;
  const soldIn = product?.soldIn ?? [];
  const priced = mode !== "free";
  const stocked = mode === "stock";

  /** Copia el precio de la primera sucursal marcada a las demás. */
  function samePrice() {
    const form = formRef.current!;
    const inputs = [...form.querySelectorAll<HTMLInputElement>("input[data-branch-price]:not(:disabled)")];
    const first = inputs.find((i) => i.value)?.value;
    if (!first) return;
    for (const input of inputs) input.value = first;
    form.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Vista previa: la misma tarjeta del catálogo, con lo que va escrito.
  const categoryIndex = categories.findIndex((c) => c.id === snap.categoryId);
  const color = categoryIndex >= 0 ? colorOf(categoryIndex) : "var(--color-text-subtle)";
  const rows = placing
    ? branches.flatMap((b, i) => {
        const s = snap.branches[i];
        return s?.on ? [{ branchId: b.id, branch: b.name, price: priced && s.price ? Number(s.price) : null, stock: stocked && withStock && s.stock ? Number(s.stock) : null }] : [];
      })
    : soldIn.map((s) => {
        const typed = snap.branches.find((b) => b.id === s.branchId)?.price;
        return { branchId: s.branchId, branch: s.branch, price: priced && typed ? Number(typed) : null, stock: stocked ? s.stock : null };
      });
  const previewItem: CatalogEntry = {
    id: product?.id ?? "preview",
    name: snap.name || (isCombo ? "Nombre del combo" : "Nombre del producto"),
    categoryId: snap.categoryId || undefined,
    category: categories[categoryIndex]?.name,
    image: removeImage ? undefined : preview,
    attributes: {},
    components: isCombo ? product?.components : undefined,
    soldIn: rows.map((r) => ({ branchId: r.branchId, branch: r.branch, price: r.price, stock: r.stock, minStock: null, low: false })),
  };
  const where = rows.length ? `Se vende en ${rows.map((r) => r.branch).join(", ")}` : creating && !isCombo ? "Todavía no se vende en ninguna sucursal" : "";
  const how = isCombo ? "El stock sale de los productos que incluye" : mode === "free" ? "El precio se escribe al vender" : mode === "open" ? "Sin control de stock" : withStock ? "Con control de stock" : "Stock: plan Negocio";
  const firstPrice = rows.find((r) => r.price !== null)?.price;

  const modes = product ? (isCombo ? [] : MODES) : [...MODES, { value: "combo" as const, label: "Combo", hint: "Varios productos a un precio" }];

  return (
    <form
      ref={formRef}
      className="grid min-w-0 gap-8 pb-4"
      onInput={sync}
      onChange={sync}
      onSubmit={(e) => {
        if (shrinking) return e.preventDefault();
        another.current = Boolean((e.nativeEvent as SubmitEvent).submitter?.hasAttribute("data-another"));
        save.onSubmit(e);
      }}
      noValidate
    >
      <input type="hidden" name="businessId" value={businessId} />
      {product && <input type="hidden" name="id" value={product.id} />}

      {/* Celular: la vista previa en una fila, arriba, para ver el resultado sin bajar hasta el final. */}
      <div className="flex min-w-0 items-center gap-3 rounded-lg bg-[var(--color-surface-muted)] p-3 lg:hidden" aria-hidden="true">
        <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-md" style={{ background: `color-mix(in srgb, ${color} 12%, var(--color-surface))`, color }}>
          {previewItem.image ? <img src={previewItem.image} alt="" className="size-full object-cover" /> : <Package className="size-6" strokeWidth={1.5} />}
        </span>
        <span className="grid min-w-0">
          <span className="truncate font-bold">{previewItem.name}</span>
          <span className="truncate text-sm text-[var(--color-text-muted)]">
            {firstPrice != null ? <span className="num">{formatBs(firstPrice)}</span> : how}
            {rows.length > 0 && ` · ${rows.length === 1 ? rows[0].branch : `${rows.length} sucursales`}`}
          </span>
        </span>
      </div>

      <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="grid min-w-0 gap-8">
          {lastAdded && (
            <p className="notice m-0 flex items-center gap-2 bg-[var(--color-income-soft)] font-semibold text-[var(--color-income)]" role="status">
              <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
              «{lastAdded}» se agregó al catálogo. Sigue con el próximo.
            </p>
          )}

          {modes.length > 0 && (
            <Section
              id="mode"
              title="¿Cómo se vende?"
              hint={product ? "Cambia los campos de abajo. El stock de cada sucursal se cambia en su inventario." : "La página muestra solo lo que sirve para ese tipo."}
              aside={<ProductFormSettings businessId={businessId} config={config} />}
              bare
            >
              {/* Control segmentado: una sola pieza, la opción elegida se levanta; su explicación va debajo. */}
              <div className="grid min-w-0 gap-2">
                <div
                  role="radiogroup"
                  aria-labelledby="mode-title"
                  aria-describedby="mode-hint"
                  className="grid min-w-0 grid-cols-2 gap-1 rounded-xl bg-[var(--color-surface-muted)] p-1 sm:flex"
                >
                  {modes.map((m) => {
                    const Icon = MODE_ICONS[m.value];
                    const segment = "flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-center font-semibold transition-[background-color,color,box-shadow] duration-150 motion-reduce:transition-none";
                    if (m.value === "combo" && !limits.bulk) {
                      return (
                        <a key={m.value} href={planHref} className={cn(segment, "text-[var(--color-text-muted)] no-underline hover:text-[var(--color-text)]")} aria-label="Combo: del plan Negocio. Ver planes">
                          <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                          {m.label}
                          <Lock className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                        </a>
                      );
                    }
                    return (
                      <label
                        key={m.value}
                        className={cn(
                          segment,
                          "group cursor-pointer text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] has-[:checked]:bg-[var(--color-surface)] has-[:checked]:text-[var(--color-text)] has-[:checked]:font-bold has-[:checked]:shadow-[var(--shadow-sm)] has-[:checked]:ring-1 has-[:checked]:ring-[var(--color-border-strong)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-focus)]",
                        )}
                      >
                        <input type="radio" name="saleMode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="sr-only" />
                        <Icon className="size-4 shrink-0 group-has-[:checked]:text-[var(--color-primary)]" strokeWidth={1.75} aria-hidden="true" />
                        <span className="truncate">{m.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p id="mode-hint" className="m-0 text-sm text-[var(--color-text-muted)]" aria-live="polite">
                  {modes.find((m) => m.value === mode)?.hint}
                </p>
              </div>
            </Section>
          )}

          <Section id="basics" title="Lo básico" aside={modes.length === 0 ? <ProductFormSettings businessId={businessId} config={config} /> : undefined}>
            <Field id="product-name" label="Nombre" error={save.errors.name}>
              <input
                id="product-name"
                name="name"
                className="input"
                defaultValue={product?.name}
                required
                maxLength={80}
                placeholder={isCombo ? "Ej.: Combo desayuno" : kind === "restaurante" ? "Ej.: Silpancho" : kind === "ropa" ? "Ej.: Chamarra de jean" : "Ej.: Leche entera 1 L"}
              />
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
          </Section>

          {isCombo && (
            <Section id="combo" title="Qué incluye" hint="Al venderlo se descuenta el stock de cada producto.">
              <ComboFields catalog={catalog} branches={branches} product={product} initial={comboSeed} errors={save.errors} />
            </Section>
          )}

          {!isCombo && (placing || soldIn.length > 0) && (
            <Section
              id="where"
              title={placing ? "Dónde se vende" : "Precio en cada sucursal"}
              hint={
                !priced ? "Quien vende escribe el precio en cada venta." : placing ? "Sin precio, quien vende lo escribe en cada venta." : "Déjalo vacío para que quien vende escriba el precio."
              }
              aside={
                priced && (placing ? branches.length : soldIn.length) > 1 ? (
                  <Button type="button" variant="ghost" className="h-11" onClick={samePrice}>
                    <Copy />
                    Mismo precio en todas
                  </Button>
                ) : undefined
              }
            >
              {placing &&
                branches.map((b) => {
                  const on = !off.has(b.id);
                  return (
                    <div key={b.id} className="grid min-w-0 gap-2 border-b border-[var(--color-border)] pb-4 last:border-0 last:pb-0">
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
                        <input
                          id={`sell-${b.id}`}
                          type="checkbox"
                          name="priceBranch"
                          value={b.id}
                          checked={on}
                          onChange={(e) => setOff((s) => { const next = new Set(s); e.target.checked ? next.delete(b.id) : next.add(b.id); return next; })}
                          className="size-5 shrink-0 accent-[var(--color-primary)]"
                        />
                        Vender en {b.name}
                      </label>
                      {/* Deshabilitados no se envían: sucursal, precio y stock siguen en el mismo orden (ver saveProduct). */}
                      {on && (priced || (stocked && withStock)) && (
                        <div className={cn("grid min-w-0 gap-3 sm:pl-8", priced && stocked && withStock ? "grid-cols-2 sm:grid-cols-3" : "sm:max-w-xs")}>
                          {priced ? (
                            <Field id={`price-${b.id}`} label="Precio">
                              <MoneyInput id={`price-${b.id}`} data-branch-price name="price" placeholder="Al vender" />
                            </Field>
                          ) : null}
                          {stocked && withStock && (
                            <>
                              <Field id={`stock-${b.id}`} label="Stock">
                                <input id={`stock-${b.id}`} name="stock" type="number" inputMode="numeric" step="1" min="0" className="input num" placeholder="0" />
                              </Field>
                              <Field id={`min-${b.id}`} label="Mínimo">
                                <input id={`min-${b.id}`} name="minStock" type="number" inputMode="numeric" step="1" min="0" className="input num" placeholder="0" />
                              </Field>
                            </>
                          )}
                        </div>
                      )}
                      {/* Precio al vender: la sucursal va sin precio fijo, pero cada sucursal necesita su lugar en la lista. */}
                      {on && !priced && <input type="hidden" name="price" value="" />}
                    </div>
                  );
                })}
              {!placing &&
                soldIn.map((s) => (
                  <div key={s.branchId}>
                    <input type="hidden" name="priceBranch" value={s.branchId} />
                    {priced ? (
                      <Field id={`price-${s.branchId}`} label={s.branch}>
                        <MoneyInput
                          id={`price-${s.branchId}`}
                          data-branch-price
                          name="price"
                          defaultValue={s.price ?? undefined}
                          placeholder="Al vender"
                        />
                      </Field>
                    ) : (
                      <>
                        <input type="hidden" name="price" value="" />
                        <p className="m-0 flex min-h-11 items-center justify-between gap-3 text-sm">
                          <span className="font-semibold">{s.branch}</span>
                          <span className="text-[var(--color-text-muted)]">Precio al vender</span>
                        </p>
                      </>
                    )}
                  </div>
                ))}
              {stocked && !withStock && (
                <p className="field-hint m-0">
                  El control de stock es del plan Negocio: por ahora se vende sin tope.{" "}
                  <a href={planHref} className="underline underline-offset-2">
                    Ver planes
                  </a>
                </p>
              )}
              {(save.errors.price || save.errors.stock || save.errors.minStock) && (
                <p className="field-error m-0">{save.errors.price || save.errors.stock || save.errors.minStock}</p>
              )}
            </Section>
          )}

          {showPhoto && (
            <Section id="photo" title="Foto" hint="Opcional. JPG, PNG o WebP; la achicamos al subirla.">
              <Field id="product-image" label="Foto del producto" error={imageError}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--color-surface)] text-[var(--color-text-muted)]">
                    {preview && !removeImage ? <img src={preview} alt="" decoding="async" className="size-full object-cover" /> : <ImagePlus className="size-6" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <FilePicker
                      id="product-image"
                      name="image"
                      accept={IMAGE_TYPES.join(",")}
                      icon={<ImagePlus />}
                      label={preview && !removeImage ? "Cambiar foto" : "Elegir foto"}
                      hint="Desde la galería o la cámara."
                      fileName={photoName}
                      aria-invalid={imageError ? true : undefined}
                      aria-describedby={imageError ? "product-image-error" : undefined}
                      onChange={async (e) => {
                        const input = e.target;
                        setShrinking(true);
                        const file = await shrinkInput(input, 640);
                        setShrinking(false);
                        const problem =
                          file && !IMAGE_TYPES.includes(file.type) ? "Elige una foto JPG, PNG o WebP."
                          : file && file.size > 2 * 1024 * 1024 ? "La foto pesa más de 2 MB. Elige una más liviana."
                          : "";
                        setFileError(problem);
                        setPhotoName(file && !problem ? file.name : "");
                        if (problem) input.value = "";
                        setRemoveImage(false);
                        if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
                        setPreview(file && !problem ? URL.createObjectURL(file) : product?.image);
                      }}
                    />
                  </div>
                </div>
                {product?.image && !removeImage && (
                  <button
                    type="button"
                    className="justify-self-start text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
                    onClick={() => {
                      setRemoveImage(true);
                      document.getElementById("product-image")?.focus();
                    }}
                  >
                    Quitar foto
                  </button>
                )}
                {removeImage && <input type="hidden" name="removeImage" value="true" />}
              </Field>
            </Section>
          )}

          {(showBarcode || showDescription) && (
            <Section id="details" title="Detalles">
              {showBarcode && (
                <Field id="product-barcode" label="Código de barras" hint="Opcional. Escanéalo con un lector o con la cámara." error={save.errors.barcode}>
                  <div className="flex min-w-0 gap-2">
                    <input
                      id="product-barcode"
                      name="barcode"
                      className="input num min-w-0 flex-1"
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
                        input?.dispatchEvent(new Event("input", { bubbles: true }));
                        input?.focus();
                      }}
                    />
                  </div>
                </Field>
              )}
              {showDescription && (
                <Field id="product-description" label="Descripción" hint="Opcional. Hasta 500 caracteres: se ve al abrir el producto." error={save.errors.description}>
                  <textarea
                    id="product-description"
                    name="description"
                    className="input min-h-24 py-2"
                    rows={3}
                    maxLength={500}
                    defaultValue={product?.description}
                    placeholder={kind === "ropa" ? "Ej.: Talla M, 100% algodón. Lavar en frío." : kind === "restaurante" ? "Ej.: Con arroz, papa y ensalada." : "Ej.: Caja de 12 unidades."}
                  />
                </Field>
              )}
            </Section>
          )}

          {showExtra && (
            <Section id="extra" title="Más datos" hint="Los campos propios de tu negocio. Se cambian en «Personalizar».">
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                {fields.map((f) => {
                  const id = `attr-${f.id}`;
                  const value = product?.attributes[f.id] ?? "";
                  return (
                    <div key={f.id}>
                      <input type="hidden" name="attrId" value={f.id} />
                      <Field id={id} label={f.label}>
                        {f.kind === "select" ? (
                          <select id={id} name="attrValue" className={selectClass} defaultValue={value}>
                            <option value="">Sin elegir</option>
                            {/* Un valor que ya no está en la lista se conserva hasta que se cambie. */}
                            {[...(f.options ?? []), ...(value && !f.options?.includes(value) ? [value] : [])].map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={id}
                            name="attrValue"
                            className={cn("input", f.kind === "number" && "num")}
                            type={f.kind === "number" ? "number" : "text"}
                            inputMode={f.kind === "number" ? "decimal" : undefined}
                            step={f.kind === "number" ? "any" : undefined}
                            maxLength={120}
                            defaultValue={value}
                          />
                        )}
                      </Field>
                    </div>
                  );
                })}
              </div>
              {save.errors.attributes && <p className="field-error m-0">{save.errors.attributes}</p>}
            </Section>
          )}

          {save.message && (
            <p className="notice notice-error m-0" role="alert">
              {save.message}
            </p>
          )}
        </div>

        {/* Escritorio: la tarjeta del catálogo tal como queda, en vivo, al lado de lo que se escribe. */}
        <aside className="sticky top-4 grid min-w-0 gap-3 max-lg:hidden" aria-labelledby="preview-title">
          <p id="preview-title" className="m-0 text-sm font-semibold text-[var(--color-text-muted)]">
            Así se ve en el {kind === "restaurante" ? "menú" : "catálogo"}
          </p>
          <div className="pointer-events-none" aria-hidden="true" inert>
            <ProductCard product={previewItem} category={categories[categoryIndex] ?? null} color={color} categories={categories} />
          </div>
          <ul className="m-0 grid list-none gap-1 p-0 text-sm">
            <li>{how}</li>
            {where && <li className="text-[var(--color-text-muted)]">{where}</li>}
          </ul>
        </aside>
      </div>

      {/* Barra de guardar: flota pegada abajo, compacta y a la derecha, así lo de atrás se sigue viendo. En escritorio
          main tiene su propio scroll con 3rem de padding abajo: el -2rem la deja a 1rem del borde del panel. En el
          celular (≤768px) hace scroll la página y queda sobre la barra del iPhone. Una sola fila: en el celular,
          Cancelar y Borrar quedan como íconos. */}
      <div className="sticky bottom-[-2rem] z-10 ml-auto flex w-fit max-w-full items-center gap-1.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-md)] max-[768px]:bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:w-full">
        {product && (
          <>
            <Button type="button" variant="ghost" className="h-11 text-destructive max-sm:w-11 max-sm:px-0" onClick={remove} aria-label="Borrar producto">
              <Trash2 />
              <span className="max-sm:hidden">Borrar</span>
            </Button>
            <span className="mx-1 h-6 w-px shrink-0 bg-[var(--color-border)] max-sm:hidden" aria-hidden="true" />
          </>
        )}
        <Button type="button" variant="ghost" className="h-11 max-sm:w-11 max-sm:px-0" onClick={cancel} aria-label="Cancelar">
          <X className="sm:hidden" />
          <span className="max-sm:hidden">Cancelar</span>
        </Button>
        {creating && !isCombo && (
          <Button type="submit" variant="outline" className="h-11 max-sm:flex-1" data-another {...save.submitProps} {...(shrinking && { "aria-disabled": true, "aria-busy": true })}>
            <span className="sm:hidden">Guardar y otro</span>
            <span className="max-sm:hidden">Guardar y agregar otro</span>
          </Button>
        )}
        <Button type="submit" className="h-11 max-sm:flex-1" {...save.submitProps} {...(shrinking && { "aria-disabled": true, "aria-busy": true })}>
          {save.busy ? "Guardando…" : product ? "Guardar cambios" : isCombo ? "Armar combo" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
