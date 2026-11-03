import { actions } from "astro:actions";
import { useEffect, useMemo, useState } from "react";
import { Package, Plus, Search, TriangleAlert } from "lucide-react";
import type { Category } from "@/data/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pager, usePage } from "../Pager";
import { type Item, isLow, colorOf, NONE } from "./catalog";
import { ProductCard } from "./ProductCard";
import { CategoryManager } from "./CategoryManager";
import { ProductForm } from "./ProductForm";
import { InventoryForm } from "./InventoryForm";
import { AddToBranch } from "./AddToBranch";

const ALL = "all";
const PAGE_SIZE = 12;


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

        {/* En celular, una tira que se desliza de lado en vez de varios renglones de filtros. */}
        <div
          className="flex flex-wrap gap-2 max-sm:-mx-4 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-4 max-sm:pb-1 max-sm:[scrollbar-width:none]"
          role="group"
          aria-label="Filtrar productos"
        >
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
          <span className="mx-1 w-px shrink-0 self-stretch bg-border" aria-hidden="true" />
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
        // Con espacio, mosaicos con foto; en un contenedor angosto (celular), filas compactas con miniatura cuadrada.
        <div className="@container/list">
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4 p-0 @max-lg/list:grid-cols-1 @max-lg/list:gap-2">
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
        </div>
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
        "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors pointer-coarse:min-h-11",
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
