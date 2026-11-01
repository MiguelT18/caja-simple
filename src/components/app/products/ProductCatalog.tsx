import { actions } from "astro:actions";
import { useEffect, useMemo, useRef, useState } from "react";
import { FolderInput, ImagePlus, Package, Pencil, Plus, ScanBarcode, Search, Tags, Trash2, TriangleAlert } from "lucide-react";
import type { Category, Product } from "@/data/types";
import type { CatalogEntry } from "@/data/queries";
import { formatBs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pager, usePage } from "../Pager";

const ALL = "all";
const NONE = "none";
const PAGE_SIZE = 12;

// Negocio: el producto del catálogo con dónde se vende. Sucursal: el producto con su precio y stock ahí.
type Item = Product | CatalogEntry;

interface Props {
  products: Item[];
  categories: Category[];
  businessId: string;
  /** Solo en la sucursal: dónde se edita el inventario. */
  branchId?: string;
  /** Solo la dueña edita: en el negocio el catálogo, en la sucursal el precio y el stock. */
  canEdit: boolean;
  /** En la sucursal: productos del catálogo que todavía no se venden ahí. */
  addable?: { id: string; name: string }[];
}

const isLow = (p: Item) => ("soldIn" in p ? p.soldIn.some((s) => s.low) : p.stock <= p.minStock);
const colorOf = (index: number) => `var(--color-branch-${(index % 6) + 1})`;
const nameError = (categories: Category[], name: string, exceptId?: string) => {
  const clean = name.trim();
  if (!clean) return "Escribe un nombre para la categoría.";
  if (clean.length > 40) return "Usa 40 caracteres o menos.";
  const taken = categories.some((c) => c.id !== exceptId && c.name.toLowerCase() === clean.toLowerCase());
  return taken ? `Ya existe la categoría «${clean}».` : null;
};

export default function ProductCatalog({ products: initialProducts, categories: initialCategories, businessId, branchId, canEdit, addable = [] }: Props) {
  const mode = branchId ? "branch" : "business";
  const [products, setProducts] = useState(initialProducts);
  const [categories, setCategories] = useState(initialCategories);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>(ALL);
  const [lowOnly, setLowOnly] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Item | "new" | null>(null);

  async function move(product: Item, categoryId: string | null) {
    const { error } = await actions.moveProduct({ productId: product.id, categoryId });
    if (error) return setError(error.message);
    const category = categories.find((c) => c.id === categoryId);
    setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, categoryId: category?.id, category: category?.name } : p)));
  }

  const categoryOf = (p: Item) => (p.categoryId && categories.some((c) => c.id === p.categoryId) ? p.categoryId : null);

  const withCategory = useMemo(() => products.map((p) => ({ product: p, categoryId: categoryOf(p) })), [products, categories]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const { categoryId } of withCategory) map.set(categoryId ?? NONE, (map.get(categoryId ?? NONE) ?? 0) + 1);
    return map;
  }, [withCategory]);

  // Si se borra la categoría filtrada, vuelve a «Todas».
  const activeFilter = filter === ALL || filter === NONE || categories.some((c) => c.id === filter) ? filter : ALL;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withCategory.filter(({ product, categoryId }) => {
      if (activeFilter === NONE && categoryId !== null) return false;
      if (activeFilter !== ALL && activeFilter !== NONE && categoryId !== activeFilter) return false;
      if (lowOnly && !isLow(product)) return false;
      return !q || product.name.toLowerCase().includes(q) || product.barcode?.includes(q);
    });
  }, [withCategory, activeFilter, lowOnly, query]);

  const pager = usePage(visible, PAGE_SIZE);

  // Cada cambio de filtro empieza en la primera página.
  useEffect(() => pager.setPage(1), [activeFilter, lowOnly, query]);

  const lowCount = products.filter(isLow).length;
  const filtered = query !== "" || activeFilter !== ALL || lowOnly;
  const clearFilters = () => {
    setQuery("");
    setFilter(ALL);
    setLowOnly(false);
  };

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-64">
            <span className="sr-only">Buscar por nombre o código de barras</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o código de barras"
              className="h-11 bg-card pl-9 text-base"
              autoComplete="off"
            />
          </label>
          {canEdit && mode === "business" && (
            <>
              <CategoryManager
                businessId={businessId}
                categories={categories}
                setCategories={setCategories}
                onDeleted={(id) =>
                  setProducts((list) => list.map((p) => (p.categoryId === id ? { ...p, categoryId: undefined, category: undefined } : p)))
                }
                counts={counts}
              />
              <Button className="h-11" onClick={() => setEditing("new")}>
                <Plus />
                Agregar producto
              </Button>
            </>
          )}
          {canEdit && mode === "branch" && addable.length > 0 && (
            <AddToBranch businessId={businessId} branchId={branchId!} addable={addable} />
          )}
        </div>
        {error && (
          <p className="notice notice-error m-0" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar productos">
          <FilterChip active={activeFilter === ALL} onClick={() => setFilter(ALL)} count={products.length}>
            Todas
          </FilterChip>
          {categories.map((c, i) => (
            <FilterChip
              key={c.id}
              active={activeFilter === c.id}
              onClick={() => setFilter(c.id)}
              count={counts.get(c.id) ?? 0}
              color={colorOf(i)}
            >
              {c.name}
            </FilterChip>
          ))}
          {(counts.get(NONE) ?? 0) > 0 && (
            <FilterChip active={activeFilter === NONE} onClick={() => setFilter(NONE)} count={counts.get(NONE) ?? 0}>
              Sin categoría
            </FilterChip>
          )}
          <span className="mx-1 w-px self-stretch bg-border" aria-hidden="true" />
          <FilterChip active={lowOnly} onClick={() => setLowOnly(!lowOnly)} count={lowCount} warning>
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            Stock bajo
          </FilterChip>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <Package className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="m-0 font-semibold">
            {mode === "business" ? "Tu catálogo está vacío" : "Esta sucursal todavía no vende productos"}
          </p>
          <p className="m-0 max-w-md text-sm text-muted-foreground">
            {mode === "business"
              ? "Agrega los productos que vendes. Después, en el inventario de cada sucursal, les pones precio y stock."
              : canEdit
                ? "Elige productos de tu catálogo y ponles precio y stock para esta sucursal."
                : "La dueña del negocio todavía no agregó productos a esta sucursal."}
          </p>
          {canEdit && mode === "business" && (
            <Button onClick={() => setEditing("new")}>
              <Plus />
              Agregar producto
            </Button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <Package className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="m-0 font-semibold">Ningún producto coincide con estos filtros</p>
          <Button variant="outline" onClick={clearFilters}>
            Quitar filtros
          </Button>
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4 p-0">
          {pager.pageItems.map(({ product, categoryId }) => {
            const index = categories.findIndex((c) => c.id === categoryId);
            return (
              <li key={product.id}>
                <ProductCard
                  product={product}
                  category={index >= 0 ? categories[index] : null}
                  color={index >= 0 ? colorOf(index) : "var(--color-text-subtle)"}
                  categories={categories}
                  onMove={canEdit && mode === "business" ? (id) => move(product, id) : undefined}
                  onEdit={canEdit ? () => setEditing(product) : undefined}
                />
              </li>
            );
          })}
        </ul>
      )}

      <Pager {...pager} onPage={pager.setPage} noun="productos" />
      {editing && mode === "business" && (
        <ProductForm
          businessId={businessId}
          categories={categories}
          product={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {editing && editing !== "new" && mode === "branch" && !("soldIn" in editing) && (
        <InventoryForm businessId={businessId} branchId={branchId!} product={editing} onClose={() => setEditing(null)} />
      )}
      {filtered && visible.length > 0 && (
        <p className="mt-3 mb-0 text-sm text-muted-foreground">
          Mostrando {visible.length} de {products.length} productos.{" "}
          <button type="button" className="font-semibold text-primary underline-offset-4 hover:underline" onClick={clearFilters}>
            Quitar filtros
          </button>
        </p>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  count,
  color,
  warning,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  color?: string;
  warning?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
        active
          ? warning
            ? "border-transparent bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
            : "border-transparent bg-[var(--color-text)] text-[var(--color-bg)]"
          : "border-transparent bg-[var(--color-surface-hover)] text-foreground hover:bg-[var(--color-border-strong)]/40",
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden="true" />}
      {children}
      <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
    </button>
  );
}

/** Foto del producto: esqueleto mientras llega, fundido al cargar y el ícono si no hay foto o falla. */
function ProductImage({ src, color }: { src?: string; color: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const img = useRef<HTMLImageElement>(null);
  // Si ya estaba en caché, onLoad pudo dispararse antes de hidratar.
  useEffect(() => {
    if (img.current?.complete) setState(img.current.naturalWidth ? "loaded" : "error");
  }, [src]);

  if (!src || state === "error") {
    return (
      <div className="grid size-full place-items-center" style={{ color }}>
        <Package className="size-10" strokeWidth={1.5} aria-hidden="true" />
      </div>
    );
  }
  return (
    <>
      {state === "loading" && <span className="skeleton absolute inset-0 rounded-none" aria-hidden="true" />}
      <img
        ref={img}
        src={src}
        alt=""
        className={cn("relative size-full object-cover transition-opacity duration-300 motion-reduce:transition-none", state === "loading" && "opacity-0")}
        loading="lazy"
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
      />
    </>
  );
}

function ProductCard({
  product,
  category,
  color,
  categories,
  onMove,
  onEdit,
}: {
  product: Item;
  category: { id: string; name: string } | null;
  color: string;
  categories: Category[];
  onMove?: (categoryId: string | null) => void;
  onEdit?: () => void;
}) {
  const low = isLow(product);
  return (
    <Card className="h-full gap-0 overflow-hidden py-0 hover:bg-[var(--color-surface-hover)]">
      <div
        className="relative aspect-[16/10]"
        style={{
          background: `color-mix(in srgb, ${color} 12%, var(--color-surface))`,
        }}
      >
        <ProductImage src={product.image} color={color} />
        {onEdit && !onMove && (
          <Button
            variant="secondary"
            size="icon-sm"
            className="absolute top-2 right-2 bg-card shadow-sm"
            aria-label={`Editar precio y stock de ${product.name}`}
            onClick={onEdit}
          >
            <Pencil />
          </Button>
        )}
        {onMove && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon-sm"
                className="absolute top-2 right-2 bg-card shadow-sm"
                aria-label={`Opciones de ${product.name}`}
              >
                <FolderInput />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {onEdit && (
                <>
                  <DropdownMenuItem onSelect={onEdit}>
                    <Pencil />
                    Editar producto
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuLabel>Mover a categoría</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={category?.id ?? NONE} onValueChange={(v) => onMove(v === NONE ? null : v)}>
                {categories.map((c) => (
                  <DropdownMenuRadioItem key={c.id} value={c.id}>
                    {c.name}
                  </DropdownMenuRadioItem>
                ))}
                <DropdownMenuRadioItem value={NONE}>Sin categoría</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <Badge variant="outline" className="max-w-full gap-1.5 truncate font-medium text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
          {category?.name ?? "Sin categoría"}
        </Badge>
        <h3 className="m-0 text-base leading-snug font-semibold">{product.name}</h3>
        {!("soldIn" in product) && <p className="m-0 text-xl font-bold tabular-nums">{formatBs(product.price)}</p>}
        <p className="m-0 flex items-center gap-1.5 text-sm text-muted-foreground">
          <ScanBarcode className="size-4 shrink-0" aria-hidden="true" />
          {product.barcode ? <span className="tabular-nums">{product.barcode}</span> : <span>Sin código</span>}
        </p>
        {"soldIn" in product ? (
          <div className="mt-auto pt-2 text-sm">
            {product.soldIn.length === 0 ? (
              <p className="m-0 text-muted-foreground">No se vende en ninguna sucursal</p>
            ) : (
              <table className="w-full border-collapse">
                <caption className="sr-only">Precio y stock por sucursal</caption>
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="pb-1 text-left font-medium">Sucursal</th>
                    <th scope="col" className="pb-1 text-right font-medium">Precio</th>
                    <th scope="col" className="pb-1 pl-3 text-right font-medium">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {product.soldIn.map((s) => (
                    <tr key={s.branchId} className="border-t border-border first:border-t-0">
                      <th scope="row" className="truncate py-1 text-left font-normal text-muted-foreground">
                        {s.branch}
                      </th>
                      <td className="py-1 text-right tabular-nums">{formatBs(s.price)}</td>
                      <td className={cn("py-1 pl-3 text-right tabular-nums", s.low && "font-semibold text-[var(--color-warning)]")}>
                        {s.low && <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" aria-label="Stock bajo:" />}
                        {s.stock}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-sm">
            <span className="tabular-nums">
              <span className="font-semibold">{product.stock}</span> <span className="text-muted-foreground">en stock</span>
            </span>
            {low && (
              <span className="chip chip-warning">
                <TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />
                Stock bajo
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function CategoryManager({
  businessId,
  categories,
  setCategories,
  onDeleted,
  counts,
}: {
  businessId: string;
  categories: Category[];
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  onDeleted: (id: string) => void;
  counts: Map<string, number>;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; error: string | null } | null>(null);

  const add = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = nameError(categories, draft);
    setError(problem);
    if (problem) return;
    setBusy(true);
    const { data, error } = await actions.saveCategory({ businessId, name: draft });
    setBusy(false);
    if (error) return setError(error.message);
    setCategories((list) => [...list, data].sort((a, b) => a.name.localeCompare(b.name, "es")));
    setDraft("");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const problem = nameError(categories, editing.name, editing.id);
    if (problem) return setEditing({ ...editing, error: problem });
    const { error } = await actions.saveCategory({ businessId, id: editing.id, name: editing.name });
    if (error) return setEditing({ ...editing, error: error.message });
    setCategories((list) => list.map((c) => (c.id === editing.id ? { ...c, name: editing.name.trim() } : c)));
    setEditing(null);
  };

  const remove = async (c: Category) => {
    if (!window.confirm(`¿Borrar la categoría «${c.name}»? Sus productos quedan en «Sin categoría».`)) return;
    const { error } = await actions.deleteCategory({ id: c.id });
    if (error) return setError(error.message);
    setCategories((list) => list.filter((x) => x.id !== c.id));
    onDeleted(c.id);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11 bg-card">
          <Tags />
          Categorías
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Categorías de productos</DialogTitle>
          <DialogDescription>Arma las que use tu negocio. Sirven para filtrar el catálogo.</DialogDescription>
        </DialogHeader>

        <form onSubmit={add} className="grid gap-2" noValidate>
          <Label htmlFor="new-category">Nueva categoría</Label>
          <div className="flex gap-2">
            <Input
              id="new-category"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              placeholder="Ej.: Embutidos"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "new-category-error" : undefined}
              className="h-10 text-base"
              maxLength={40}
            />
            <Button type="submit" className="h-10" disabled={busy}>
              <Plus />
              Agregar
            </Button>
          </div>
          {error && (
            <p id="new-category-error" className="field-error">
              {error}
            </p>
          )}
        </form>

        <ul className="m-0 grid max-h-72 list-none gap-1 overflow-y-auto p-0">
          {categories.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf(i) }} aria-hidden="true" />
              {editing?.id === c.id ? (
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex gap-2">
                    <Input
                      autoFocus
                      value={editing.name}
                      aria-label={`Nuevo nombre para ${c.name}`}
                      aria-invalid={editing.error ? true : undefined}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value, error: null })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="h-9 text-base"
                      maxLength={40}
                    />
                    <Button size="sm" className="h-9" onClick={saveEdit}>
                      Guardar
                    </Button>
                  </div>
                  {editing.error && <p className="field-error">{editing.error}</p>}
                </div>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">{counts.get(c.id) ?? 0}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Renombrar ${c.name}`}
                    onClick={() => setEditing({ id: c.id, name: c.name, error: null })}
                  >
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Borrar ${c.name}`} className="hover:text-destructive" onClick={() => remove(c)}>
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
          {categories.length === 0 && <li className="px-2 py-4 text-sm text-muted-foreground">Todavía no hay categorías.</li>}
        </ul>
        <DialogFooter className="text-sm text-muted-foreground sm:justify-start">
          Al borrar una categoría, sus productos quedan en «Sin categoría».
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Campo de formulario con su error; los nombres coinciden con los de la acción. */
function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
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

const selectClass = "input";

/** Envía el formulario a una acción y recarga al guardar. Devuelve errores por campo o el general. */
function useActionForm(action: (form: FormData) => Promise<{ error?: { message: string; fields?: Record<string, string[] | undefined> } }>) {
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

function ProductForm({
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
  const save = useActionForm((form) => actions.saveProduct(form) as never);
  const [preview, setPreview] = useState(product?.image);
  const [removeImage, setRemoveImage] = useState(false);

  async function remove() {
    if (!product || !window.confirm(`¿Borrar «${product.name}» del catálogo? Se quita de todas las sucursales.`)) return;
    const form = new FormData();
    form.set("id", product.id);
    const { error } = await actions.deleteProduct(form);
    if (error) return window.alert(error.message);
    window.location.reload();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product ? "Editar producto" : "Agregar producto"}</DialogTitle>
          <DialogDescription>El precio y el stock se ponen en el inventario de cada sucursal.</DialogDescription>
        </DialogHeader>
        <form className="grid min-w-0 gap-4" onSubmit={save.onSubmit} noValidate>
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
          <Field id="product-image" label="Foto" hint="Opcional. JPG, PNG o WebP, hasta 2 MB." error={save.errors.image}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted text-muted-foreground">
                {preview && !removeImage ? <img src={preview} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6" aria-hidden="true" />}
              </span>
              <input
                id="product-image"
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="w-full min-w-0 text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setRemoveImage(false);
                  setPreview(file ? URL.createObjectURL(file) : product?.image);
                }}
              />
            </div>
            {product?.image && !removeImage && (
              <button type="button" className="justify-self-start text-sm font-semibold text-primary underline-offset-4 hover:underline" onClick={() => setRemoveImage(true)}>
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

function StockFields({ product, errors }: { product?: Product; errors: Record<string, string> }) {
  return (
    <>
      <Field id="inv-price" label="Precio de venta (Bs)" error={errors.price}>
        <input id="inv-price" name="price" type="number" inputMode="decimal" step="0.01" min="0" className="input" defaultValue={product?.price} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="inv-stock" label="Stock" error={errors.stock}>
          <input id="inv-stock" name="stock" type="number" inputMode="numeric" step="1" min="0" className="input" defaultValue={product?.stock ?? 0} required />
        </Field>
        <Field id="inv-min" label="Stock mínimo" hint="Avisa cuando baje de aquí." error={errors.minStock}>
          <input id="inv-min" name="minStock" type="number" inputMode="numeric" step="1" min="0" className="input" defaultValue={product?.minStock ?? 0} required />
        </Field>
      </div>
    </>
  );
}

function InventoryForm({ businessId, branchId, product, onClose }: { businessId: string; branchId: string; product: Product; onClose: () => void }) {
  const save = useActionForm((form) => actions.saveInventory(form) as never);

  async function remove() {
    if (!window.confirm(`¿Dejar de vender «${product.name}» en esta sucursal? Sigue en el catálogo.`)) return;
    const form = new FormData();
    form.set("branchId", branchId);
    form.set("productId", product.id);
    const { error } = await actions.removeInventory(form);
    if (error) return window.alert(error.message);
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

function AddToBranch({ businessId, branchId, addable }: { businessId: string; branchId: string; addable: { id: string; name: string }[] }) {
  const save = useActionForm((form) => actions.saveInventory(form) as never);
  return (
    <Dialog>
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
            <Button type="submit" disabled={save.busy}>
              {save.busy ? "Guardando…" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
