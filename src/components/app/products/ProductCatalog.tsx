import { actions } from "astro:actions";
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { Layers, LayoutGrid, List, ListFilter, Lock, Package, Plus, Search, TriangleAlert, Upload, X } from "lucide-react";
import type { Category, Product, ProductField } from "@/data/types";
import type { CatalogEntry } from "@/data/queries";
import type { PlanLimits } from "@/data/plans";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pager, usePage } from "../Pager";
import { type Item, isLow, colorOf, NONE } from "./catalog";
import { ProductCard } from "./ProductCard";
import { DETAIL_TRANSITION, ProductDetail } from "./ProductDetail";
import { ProductTable } from "./ProductTable";
import { CategoryManager } from "./CategoryManager";
import { ImportProducts } from "./ImportProducts";
import { InventoryForm } from "./InventoryForm";
import { AddToBranch } from "./AddToBranch";
import { safeAction } from "./form";
import { navigate } from "astro:transitions/client";
import { announce, confirmDialog, toast } from "@/scripts/dialogs";
import { refreshRegions } from "@/scripts/refresh";

const PAGE_SIZE = 12;
const VIEW_KEY = "caja-simple-inventory-view";

/**
 * Cambia la vista con la API de View Transitions: la foto de la tarjeta y la del detalle comparten nombre por un
 * momento y el navegador la lleva de una a otra. Sin soporte o con movimiento reducido, cambia sin animar.
 */
function morph(productId: string, update: () => void, opening: boolean) {
  const art = document.querySelector<HTMLElement>(`[data-product-art="${CSS.escape(productId)}"]`);
  if (!art || !document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return update();
  // Solo un elemento puede tener el nombre a la vez: al abrir lo tiene la tarjeta antes y el detalle después; al cerrar, al revés.
  if (opening) art.style.viewTransitionName = DETAIL_TRANSITION;
  const transition = document.startViewTransition(() => {
    art.style.viewTransitionName = opening ? "" : DETAIL_TRANSITION;
    flushSync(update);
  });
  transition.finished.finally(() => (art.style.viewTransitionName = ""));
}


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
  /** En el negocio: sucursales a las que puede entrar lo que se importa. */
  branches?: { id: string; name: string }[];
  /** Lo que permite el plan del negocio (la base lo aplica igual): sin él, todo permitido. */
  limits?: Pick<PlanLimits, "products" | "stock" | "bulk">;
  /** Página del plan, para los enlaces de lo que es de un plan pago. */
  planHref?: string;
  /** Catálogo del negocio (/app/[negocio]/catalogo): crear y editar un producto es en su página (catalogo/nuevo, catalogo/[id]). */
  catalogHref?: string;
  /** Campos propios del negocio, para mostrarlos en el detalle. */
  fields?: ProductField[];
}

const OPEN: Pick<PlanLimits, "products" | "stock" | "bulk"> = { products: null, stock: true, bulk: true };

/** Botón de algo que es de un plan pago: lleva a la página del plan, con un candado que lo dice (no solo el color). */
function PaidOnly({ href, icon: Icon, children }: { href: string; icon: typeof Plus; children: React.ReactNode }) {
  return (
    <Button asChild variant="outline" className="h-11 max-sm:flex-1">
      <a href={href} title="Disponible en el plan Negocio">
        <Icon />
        {children}
        <Lock className="text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">(plan Negocio)</span>
      </a>
    </Button>
  );
}

export default function ProductCatalog({
  products: initialProducts,
  categories: initialCategories,
  businessId,
  branchId,
  canEdit,
  addable = [],
  branches = [],
  limits = OPEN,
  planHref = "#",
  catalogHref = "",
  fields = [],
}: Props) {
  const mode = branchId ? "branch" : "business";
  const [products, setProducts] = useState(initialProducts);
  const [categories, setCategories] = useState(initialCategories);
  // Tras guardar, la página trae los datos nuevos como props (scripts/refresh.ts): la búsqueda y el filtro se quedan.
  useEffect(() => setProducts(initialProducts), [initialProducts]);
  useEffect(() => setCategories(initialCategories), [initialCategories]);
  const [query, setQuery] = useState("");
  // Categorías elegidas (y NONE para «Sin categoría»); vacío = todas.
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [lowOnly, setLowOnly] = useState(false);
  const [error, setError] = useState("");
  // En la sucursal se edita el precio y el stock en un diálogo; en el negocio, el producto en su propia página.
  const [editing, setEditing] = useState<Product | null>(null);
  const edit = (product: Item) => {
    if (mode === "branch") return setEditing(product as Product);
    void navigate(`${catalogHref}/${product.id}`);
  };
  // Por id: tras guardar, el detalle muestra los datos nuevos que llegan como props.
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = detailId ? products.find((p) => p.id === detailId) : undefined;
  const openDetail = (id: string) => morph(id, () => setDetailId(id), true);
  const closeDetail = () => detailId && morph(detailId, () => setDetailId(null), false);
  const [view, setView] = useState<"grid" | "table">("grid");

  // La vista elegida se recuerda en este navegador; se lee tras hidratar para no desfasar el HTML del servidor.
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "table") setView("table");
    } catch {}
  }, []);
  const chooseView = (next: "grid" | "table") => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {}
  };
  const asTable = mode === "branch" && view === "table";

  // Optimista: el cambio se ve al instante y se deshace si la base lo rechaza.
  async function move(product: Item, categoryId: string | null) {
    const category = categories.find((c) => c.id === categoryId);
    const swap = (to: Partial<Item>) => setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, ...to } : p)));
    setError("");
    swap({ categoryId: category?.id, category: category?.name });
    const { error } = await safeAction(() => actions.moveProduct({ productId: product.id, categoryId }));
    if (!error) return toast(`«${product.name}» ahora está en ${category ? `«${category.name}»` : "Sin categoría"}.`, "success");
    swap({ categoryId: product.categoryId, category: product.category });
    setError(error.message);
  }

  // Borrar del catálogo lo quita de todas las sucursales: se confirma nombrando dónde se vende.
  async function remove(product: Item) {
    const soldIn = "soldIn" in product ? product.soldIn.length : 0;
    const where = soldIn ? ` Se quita también de ${soldIn === 1 ? "la sucursal donde se vende" : `las ${soldIn} sucursales donde se vende`}.` : "";
    if (!(await confirmDialog(`¿Eliminar «${product.name}» del catálogo?${where}`, { confirmLabel: "Eliminar", danger: true }))) return;
    const form = new FormData();
    form.set("id", product.id);
    setError("");
    const { error } = await safeAction(() => actions.deleteProduct(form));
    if (error) return setError(error.message);
    setProducts((list) => list.filter((p) => p.id !== product.id));
    toast(`«${product.name}» se eliminó del catálogo.`, "success");
    await refreshRegions();
  }

  const categoryOf = (p: Item) => (p.categoryId && categories.some((c) => c.id === p.categoryId) ? p.categoryId : null);

  const withCategory = useMemo(() => products.map((p) => ({ product: p, categoryId: categoryOf(p) })), [products, categories]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const { categoryId } of withCategory) map.set(categoryId ?? NONE, (map.get(categoryId ?? NONE) ?? 0) + 1);
    return map;
  }, [withCategory]);

  // Lo que se filtra, en el orden de la lista; una categoría borrada deja de contar.
  const options = useMemo(
    () => [
      ...categories.map((c, i) => ({ id: c.id, name: c.name, color: colorOf(i) as string | undefined })),
      ...((counts.get(NONE) ?? 0) > 0 || picked.has(NONE) ? [{ id: NONE, name: "Sin categoría", color: undefined }] : []),
    ],
    [categories, counts, picked],
  );
  const active = options.filter((o) => picked.has(o.id));
  const activeKey = active.map((o) => o.id).join();
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withCategory.filter(({ product, categoryId }) => {
      if (active.length > 0 && !picked.has(categoryId ?? NONE)) return false;
      if (lowOnly && !isLow(product)) return false;
      return !q || product.name.toLowerCase().includes(q) || product.barcode?.includes(q) || product.description?.toLowerCase().includes(q);
    });
  }, [withCategory, activeKey, lowOnly, query]);

  const pager = usePage(visible, PAGE_SIZE);

  // Cada cambio de filtro empieza en la primera página.
  useEffect(() => pager.setPage(1), [activeKey, lowOnly, query]);

  // Cuántos quedan al buscar o filtrar: se anuncia al dejar de escribir, no en cada tecla.
  useEffect(() => {
    if (query === "" && !activeKey && !lowOnly) return;
    const timer = setTimeout(() => announce(visible.length === 0 ? "Ningún producto coincide." : `${visible.length} ${visible.length === 1 ? "producto" : "productos"}`), 500);
    return () => clearTimeout(timer);
  }, [visible.length, activeKey, lowOnly, query]);

  const lowCount = products.filter(isLow).length;
  const filtered = query !== "" || active.length > 0 || lowOnly;
  const clearFilters = () => {
    setQuery("");
    setPicked(new Set());
    setLowOnly(false);
  };

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <label className="relative min-w-0 flex-1 basis-72">
            <span className="sr-only">Buscar por nombre, código o descripción</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, código o descripción"
              className="h-11 bg-card pl-9 text-base"
              autoComplete="off"
            />
          </label>
          {canEdit && mode === "business" && (
            // Crear: la principal primero (también para el teclado); combo e importar, secundarias al lado.
            // En el celular, la principal ocupa la fila y las otras dos comparten la de abajo.
            <div className="flex flex-wrap items-center gap-2 max-sm:w-full" role="group" aria-label="Agregar al catálogo">
              <Button asChild className="h-11 max-sm:w-full">
                <a href={`${catalogHref}/nuevo`}>
                  <Plus />
                  Agregar producto
                </a>
              </Button>
              {products.length > 0 &&
                (limits.bulk ? (
                  <Button asChild variant="outline" className="h-11 max-sm:flex-1">
                    <a href={`${catalogHref}/nuevo?tipo=combo`}>
                      <Layers />
                      Armar combo
                    </a>
                  </Button>
                ) : (
                  <PaidOnly href={planHref} icon={Layers}>
                    Armar combo
                  </PaidOnly>
                ))}
              {limits.bulk ? (
                <ImportProducts businessId={businessId} branches={branches} />
              ) : (
                <PaidOnly href={planHref} icon={Upload}>
                  Importar
                </PaidOnly>
              )}
            </div>
          )}
          {canEdit && mode === "branch" && addable.length > 0 && (
            <AddToBranch businessId={businessId} branchId={branchId!} addable={addable} withStock={limits.stock} />
          )}
          {mode === "branch" && products.length > 0 && (
            <div className="inline-flex rounded-md border bg-card p-0.5" role="group" aria-label="Vista">
              {([
                ["grid", "Ver como cuadrícula", LayoutGrid],
                ["table", "Ver como tabla", List],
              ] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  aria-label={label}
                  title={label}
                  onClick={() => chooseView(value)}
                  className={cn(
                    "grid size-10 place-items-center rounded-sm transition-colors",
                    view === value ? "bg-[var(--color-text)] text-[var(--color-bg)]" : "text-muted-foreground hover:bg-[var(--color-surface-hover)]",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
        {canEdit && mode === "business" && limits.products !== null && (
          <p className={cn("m-0 text-sm", products.length >= limits.products ? "font-semibold text-[var(--color-text)]" : "text-muted-foreground")}>
            <span className="num">
              {products.length} de {limits.products}
            </span>{" "}
            productos del plan Gratis.{" "}
            {products.length >= limits.products ? "Llegaste al tope: " : ""}
            <a href={planHref} className="underline underline-offset-2">
              Sin límite en el plan Negocio
            </a>
          </p>
        )}
        {error && (
          <p className="notice notice-error m-0" role="alert">
            {error}
          </p>
        )}

        {/* Filtros a la izquierda, «Limpiar» junto a ellos y, al final, «Editar categorías», que es lo que los arma. */}
        <div className="flex flex-wrap items-center gap-2">
            {options.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-9 gap-2 pointer-coarse:h-11" aria-label={`Filtrar por categoría${active.length ? `: ${active.length} elegidas` : ""}`}>
                    <ListFilter strokeWidth={1.75} aria-hidden="true" />
                    Categorías
                    {active.length > 0 && (
                      <span className="grid min-w-5 place-items-center rounded-full bg-[var(--color-text)] px-1.5 text-xs font-semibold text-[var(--color-bg)] tabular-nums" aria-hidden="true">
                        {active.length}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] p-0">
                  <fieldset className="m-0 border-0 p-2">
                    <legend className="px-2 pt-1 pb-2 text-sm font-semibold">Mostrar productos de</legend>
                    {options.map((o) => (
                      <label key={o.id} className="flex min-h-11 items-center gap-3 rounded-md px-2 text-base hover:bg-[var(--color-surface-hover)]">
                        <input type="checkbox" checked={picked.has(o.id)} onChange={() => toggle(o.id)} className="size-5 shrink-0 accent-[var(--color-primary)]" />
                        {o.color && <span className="size-2 shrink-0 rounded-full" style={{ background: o.color }} aria-hidden="true" />}
                        <span className="min-w-0 flex-1 truncate">{o.name}</span>
                        <span className="text-sm text-muted-foreground tabular-nums">{counts.get(o.id) ?? 0}</span>
                      </label>
                    ))}
                  </fieldset>
                  <div className="flex items-center justify-between border-t p-2">
                    <span className="px-2 text-sm text-muted-foreground">{active.length === 0 ? "Todas las categorías" : `${active.length} elegidas`}</span>
                    {active.length > 0 && (
                      <Button variant="ghost" size="sm" className="h-9" onClick={() => setPicked(new Set())}>
                        Limpiar
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <FilterChip active={lowOnly} onClick={() => setLowOnly(!lowOnly)} count={lowCount} warning>
              <TriangleAlert className="size-3.5" aria-hidden="true" />
              Stock bajo
            </FilterChip>
            {/* Cada categoría elegida, a la vista y con su propia ✕ para quitarla sin abrir el menú. */}
            {active.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                aria-label={`Quitar el filtro ${o.name}`}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-text)] px-3 text-sm font-medium whitespace-nowrap text-[var(--color-bg)] pointer-coarse:min-h-11"
              >
                {o.color && <span className="size-2 rounded-full" style={{ background: o.color }} aria-hidden="true" />}
                {o.name}
                <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              </button>
            ))}
            {filtered && (
              <Button variant="ghost" size="sm" className="h-9 text-primary pointer-coarse:h-11" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            )}
            {canEdit && mode === "business" && (
              <div className="ml-auto">
                <CategoryManager
                  businessId={businessId}
                  categories={categories}
                  setCategories={setCategories}
                  onDeleted={(id) =>
                    setProducts((list) => list.map((p) => (p.categoryId === id ? { ...p, categoryId: undefined, category: undefined } : p)))
                  }
                  counts={counts}
                />
              </div>
            )}
          </div>
        {filtered && visible.length > 0 && (
          <p className="m-0 text-sm text-muted-foreground">
            Mostrando {visible.length} de {products.length} {products.length === 1 ? "producto" : "productos"}.
          </p>
        )}
      </div>

      {products.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <Package className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="m-0 font-semibold">
            {mode === "business" ? "Tu catálogo está vacío" : "Esta sucursal todavía no vende productos"}
          </p>
          <p className="m-0 max-w-md text-sm text-muted-foreground">
            {mode === "business"
              ? "Agrega los productos que vendes, con su precio y stock en cada sucursal."
              : canEdit
                ? "Elige productos de tu catálogo y ponles precio y stock para esta sucursal."
                : "Todavía no hay productos en esta sucursal. Quien administra el negocio los agrega desde el catálogo."}
          </p>
          {canEdit && mode === "business" && (
            <Button asChild>
              <a href={`${catalogHref}/nuevo`}>
                <Plus />
                Agregar producto
              </a>
            </Button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <Package className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="m-0 font-semibold">Ningún producto coincide con estos filtros</p>
          <p className="m-0 max-w-md text-sm text-muted-foreground">
            {[
              query.trim() && `«${query.trim()}»`,
              active.length > 0 && `${active.length === 1 ? "Categoría" : "Categorías"}: ${active.map((o) => o.name).join(", ")}`,
              lowOnly && "Stock bajo",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <Button variant="outline" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        </div>
      ) : asTable ? (
        <ProductTable
          items={pager.pageItems as { product: Product; categoryId: string | null }[]}
          categories={categories}
          onEdit={canEdit ? edit : undefined}
        />
      ) : (
        // Con espacio, mosaicos con foto; en un contenedor angosto (celular), filas compactas con miniatura cuadrada.
        <div className="@container/list">
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4 p-0 @max-lg/list:grid-cols-1 @max-lg/list:gap-2">
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
                  onDelete={canEdit && mode === "business" ? () => remove(product) : undefined}
                  onEdit={canEdit ? () => edit(product) : undefined}
                  onOpen={() => openDetail(product.id)}
                />
              </li>
            );
          })}
        </ul>
        </div>
      )}

      <Pager {...pager} onPage={pager.setPage} noun="productos" />
      {detail &&
        (() => {
          const index = categories.findIndex((c) => c.id === detail.categoryId);
          return (
            <ProductDetail
              product={detail}
              category={index >= 0 ? categories[index] : null}
              color={index >= 0 ? colorOf(index) : "var(--color-text-subtle)"}
              onClose={closeDetail}
              fields={fields}
              onEdit={
                canEdit && (mode === "business" || !("soldIn" in detail))
                  ? () => {
                      // El detalle se cierra sin animar y se abre la edición.
                      setDetailId(null);
                      edit(detail);
                    }
                  : undefined
              }
            />
          );
        })()}
      {editing && mode === "branch" && (
        <InventoryForm businessId={businessId} branchId={branchId!} product={editing} stockLocked={!limits.stock} planHref={planHref} onClose={() => setEditing(null)} />
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
