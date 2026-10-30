import { useEffect, useMemo, useState } from "react";
import { FolderInput, Package, Pencil, Plus, ScanBarcode, Search, Tags, Trash2, TriangleAlert } from "lucide-react";
import type { Product } from "@/data/mock";
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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pager, usePage } from "../Pager";
import {
  addCategory,
  categoryOf,
  deleteCategory,
  initialState,
  loadState,
  moveProduct,
  nameError,
  renameCategory,
  saveState,
  type CategoryState,
} from "./categories";

const ALL = "all";
const NONE = "none";
const PAGE_SIZE = 12;

// Negocio: el producto del catálogo con dónde se vende. Sucursal: el producto con su precio y stock ahí.
type Item = Product | CatalogEntry;
type Mode = "business" | "branch";

const isLow = (p: Item) => ("soldIn" in p ? p.soldIn.some((s) => s.low) : p.stock <= p.minStock);
const colorOf = (index: number) => `var(--color-branch-${(index % 6) + 1})`;

export default function ProductCatalog({ products, mode, storageKey }: { products: Item[]; mode: Mode; storageKey: string }) {
  // Las categorías son del negocio: se editan en el catálogo y en la sucursal solo filtran.
  const canEdit = mode === "business";
  const [state, setState] = useState<CategoryState>(() => initialState(products));
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>(ALL);
  const [lowOnly, setLowOnly] = useState(false);

  // Se lee del navegador después de montar, así el HTML del servidor y el primer render coinciden.
  useEffect(() => {
    setState(loadState(storageKey, initialState(products)));
    setLoaded(true);
  }, [products, storageKey]);

  useEffect(() => {
    if (loaded && canEdit) saveState(storageKey, state);
  }, [state, loaded, canEdit, storageKey]);

  const withCategory = useMemo(() => products.map((p) => ({ product: p, categoryId: categoryOf(state, p) })), [products, state]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const { categoryId } of withCategory) map.set(categoryId ?? NONE, (map.get(categoryId ?? NONE) ?? 0) + 1);
    return map;
  }, [withCategory]);

  // Si se borra la categoría filtrada, vuelve a «Todas».
  const activeFilter = filter === ALL || filter === NONE || state.categories.some((c) => c.id === filter) ? filter : ALL;

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
          {canEdit && <CategoryManager state={state} setState={setState} counts={counts} />}
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar productos">
          <FilterChip active={activeFilter === ALL} onClick={() => setFilter(ALL)} count={products.length}>
            Todas
          </FilterChip>
          {state.categories.map((c, i) => (
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

      {visible.length === 0 ? (
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
            const index = state.categories.findIndex((c) => c.id === categoryId);
            return (
              <li key={product.id}>
                <ProductCard
                  product={product}
                  category={index >= 0 ? state.categories[index] : null}
                  color={index >= 0 ? colorOf(index) : "var(--color-text-subtle)"}
                  state={state}
                  onMove={canEdit ? (id) => setState((s) => moveProduct(s, product.id, id)) : undefined}
                />
              </li>
            );
          })}
        </ul>
      )}

      <Pager {...pager} onPage={pager.setPage} noun="productos" />
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
          : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden="true" />}
      {children}
      <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
    </button>
  );
}

function ProductCard({
  product,
  category,
  color,
  state,
  onMove,
}: {
  product: Item;
  category: { id: string; name: string } | null;
  color: string;
  state: CategoryState;
  onMove?: (categoryId: string | null) => void;
}) {
  const low = isLow(product);
  return (
    <Card className="h-full gap-0 overflow-hidden py-0 shadow-sm">
      <div
        className="relative aspect-[16/10]"
        style={{
          background: `color-mix(in srgb, ${color} 12%, var(--color-surface))`,
        }}
      >
        {product.image ? (
          <img src={product.image} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="grid size-full place-items-center" style={{ color }}>
            <Package className="size-10" strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
        {onMove && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon-sm"
                className="absolute top-2 right-2 bg-card shadow-sm"
                aria-label={`Mover ${product.name} a otra categoría`}
              >
                <FolderInput />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Mover a categoría</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={category?.id ?? NONE} onValueChange={(v) => onMove(v === NONE ? null : v)}>
                {state.categories.map((c) => (
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
                    <tr key={s.branch} className="border-t border-border first:border-t-0">
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
  state,
  setState,
  counts,
}: {
  state: CategoryState;
  setState: React.Dispatch<React.SetStateAction<CategoryState>>;
  counts: Map<string, number>;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    error: string | null;
  } | null>(null);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = nameError(state, draft);
    setError(problem);
    if (problem) return;
    setState((s) => addCategory(s, draft));
    setDraft("");
  };

  const saveEdit = () => {
    if (!editing) return;
    const problem = nameError(state, editing.name, editing.id);
    if (problem) return setEditing({ ...editing, error: problem });
    setState((s) => renameCategory(s, editing.id, editing.name));
    setEditing(null);
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
            <Button type="submit" className="h-10">
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
          {state.categories.map((c, i) => (
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
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          name: e.target.value,
                          error: null,
                        })
                      }
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
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Borrar ${c.name}`}
                    className="hover:text-destructive"
                    onClick={() => setState((s) => deleteCategory(s, c.id))}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
          {state.categories.length === 0 && <li className="px-2 py-4 text-sm text-muted-foreground">Todavía no hay categorías.</li>}
        </ul>
        <DialogFooter className="text-sm text-muted-foreground sm:justify-start">
          Al borrar una categoría, sus productos quedan en «Sin categoría».
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
