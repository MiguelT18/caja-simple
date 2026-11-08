import { useEffect, useRef, useState } from "react";
import { CircleSlash, Ellipsis, Layers, Package, Pencil, ScanBarcode, Trash2, TriangleAlert } from "lucide-react";
import type { Product } from "@/data/types";
import type { Category } from "@/data/types";
import { formatBs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { type Item, comboSummary, isLow, NONE } from "./catalog";

export function ProductImage({ src, color }: { src?: string; color: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const img = useRef<HTMLImageElement>(null);
  // Si ya estaba en caché, onLoad pudo dispararse antes de hidratar.
  useEffect(() => {
    if (img.current?.complete) setState(img.current.naturalWidth ? "loaded" : "error");
  }, [src]);

  if (!src || state === "error") {
    return (
      <div className="absolute inset-0 grid place-items-center" style={{ color }}>
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
        // Fuera del flujo: la foto llena el marco 16:10 sin estirarlo, mida lo que mida.
        className={cn("absolute inset-0 size-full object-cover transition-opacity duration-300 motion-reduce:transition-none", state === "loading" && "opacity-0")}
        loading="lazy"
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
      />
    </>
  );
}

/** Precio fijo, o «Al vender» si se escribe en cada venta. */
export const priceLabel = (price: number | null) => (price === null ? "Al vender" : formatBs(price));

/**
 * El stock de la sucursal como la cifra que manda en la tarjeta: número grande alineado a la derecha y, debajo,
 * el mínimo. Bajo el mínimo o en cero, el estado va escrito y con ícono sobre su fondo suave (nada solo con color).
 */
export function StockFigure({ stock, minStock, low, caption }: { stock: number | null; minStock: number | null; low: boolean; caption?: string }) {
  if (stock === null) {
    return (
      <div className="grid min-w-0 justify-self-end justify-items-end text-right">
        <span className="text-xs font-semibold text-muted-foreground">Stock</span>
        <span className="text-sm font-semibold text-muted-foreground">Sin control</span>
        {caption && <span className="mt-0.5 max-w-full truncate text-xs text-muted-foreground">{caption}</span>}
      </div>
    );
  }
  const out = stock === 0;
  const tone = out ? "expense" : low ? "warning" : null;
  const Icon = out ? CircleSlash : TriangleAlert;
  return (
    <div
      className={cn("grid min-w-0 max-w-full justify-self-end justify-items-end rounded-md text-right", tone && "-my-1 -mr-1 px-2 py-1")}
      style={tone ? { background: `var(--color-${tone}-soft)`, color: `var(--color-${tone})` } : undefined}
    >
      <span className={cn("text-xs font-semibold", !tone && "text-muted-foreground")}>
        {out ? "Sin stock" : low ? "Stock bajo" : "En stock"}
      </span>
      <span className="flex items-center gap-1.5 text-[length:var(--text-3xl)] leading-none font-extrabold tracking-[-0.03em] tabular-nums @max-lg/list:text-[length:var(--text-2xl)]">
        {tone && <Icon className="size-[0.7em]" strokeWidth={2.25} aria-hidden="true" />}
        {stock}
      </span>
      {(caption || minStock !== null) && (
        <span className={cn("mt-0.5 max-w-full truncate text-xs tabular-nums", !tone && "text-muted-foreground")}>{caption ?? `mín. ${minStock}`}</span>
      )}
    </div>
  );
}

/** Precio en una línea: el mismo en todas las sucursales, «Desde …» si cambia, o «Al vender». */
export function priceSummary(prices: (number | null)[]) {
  const fixed = prices.filter((p): p is number => p !== null);
  if (fixed.length === 0) return priceLabel(null);
  const min = Math.min(...fixed);
  return fixed.length === prices.length && fixed.every((p) => p === min) ? formatBs(min) : `Desde ${formatBs(min)}`;
}

/** Stock sumado de las sucursales que lo controlan; null si ninguna lo controla. */
export function stockSummary(soldIn: { stock: number | null; low: boolean }[]) {
  const tracked = soldIn.filter((s) => s.stock !== null);
  return { stock: tracked.length ? tracked.reduce((sum, s) => sum + s.stock!, 0) : null, low: soldIn.some((s) => s.low) };
}

export function ProductCard({
  product,
  category,
  color,
  categories,
  onMove,
  onEdit,
  onDelete,
  onOpen,
}: {
  product: Item;
  category: { id: string; name: string } | null;
  color: string;
  categories: Category[];
  onMove?: (categoryId: string | null) => void;
  onEdit?: () => void;
  /** Elimina el producto del catálogo (confirma antes quien lo llama). */
  onDelete?: () => void;
  /** Abre el detalle: toda la tarjeta es el botón (el nombre se estira sobre ella). */
  onOpen?: () => void;
}) {
  // En la lista angosta, el lápiz ocupa la esquina de arriba: la categoría y el nombre le dejan lugar; el stock llega hasta el borde.
  const clearCorner = (onEdit || onMove) && "@max-lg/list:pr-12";
  return (
    // Mosaico: foto 16:10 arriba. En la lista angosta (@container/list de ProductCatalog): fila con miniatura cuadrada a la izquierda.
    <Card
      className={cn(
        "relative h-full gap-0 overflow-hidden py-0 @max-lg/list:flex-row @max-lg/list:items-start",
        onOpen && "transition-shadow hover:shadow-md has-[[data-open]:focus-visible]:ring-2 has-[[data-open]:focus-visible]:ring-[var(--color-focus)] motion-reduce:transition-none",
      )}
    >
      <div
        data-product-art={product.id}
        className="relative aspect-[16/10] shrink-0 overflow-hidden @max-lg/list:m-3 @max-lg/list:mr-0 @max-lg/list:aspect-square @max-lg/list:w-20 @max-lg/list:shrink-0 @max-lg/list:overflow-hidden @max-lg/list:rounded-md"
        style={{
          background: `color-mix(in srgb, ${color} 12%, var(--color-surface))`,
        }}
      >
        <ProductImage src={product.image} color={color} />
      </div>
        {onEdit && !onMove && (
          <Button
            variant="secondary"
            size="icon-sm"
            className="absolute top-2 right-2 z-10 bg-card shadow-sm pointer-coarse:size-11"
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
                className="absolute top-2 right-2 z-10 bg-card shadow-sm pointer-coarse:size-11"
                aria-label={`Opciones de ${product.name}`}
              >
                <Ellipsis />
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
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                    <Trash2 />
                    Eliminar del catálogo
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

      <div className="flex min-w-0 flex-1 flex-col gap-2 self-stretch p-4 @max-lg/list:gap-1 @max-lg/list:p-3">
        <div className={cn("flex min-w-0", clearCorner)}>
          <Badge variant="outline" className="max-w-full gap-1.5 truncate font-medium text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
            {category?.name ?? "Sin categoría"}
          </Badge>
        </div>
        <h3 className={cn("m-0 text-base leading-snug font-semibold [overflow-wrap:anywhere]", clearCorner)}>
          {onOpen ? (
            // El ::after cubre la tarjeta: se abre con un clic en cualquier parte; el menú queda encima (z-10).
            <button type="button" data-open className="cursor-pointer text-left outline-none after:absolute after:inset-0 after:content-['']" onClick={onOpen}>
              {product.name}
              <span className="sr-only">: ver detalle</span>
            </button>
          ) : (
            product.name
          )}
        </h3>
        {product.components ? (
          <p className="m-0 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <Layers className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">
              <span className="font-semibold text-foreground">Combo:</span> {comboSummary(product.components)}
            </span>
          </p>
        ) : (
          <p className={cn("m-0 flex items-center gap-1.5 text-sm text-muted-foreground", !product.barcode && "@max-lg/list:hidden")}>
            <ScanBarcode className="size-4 shrink-0" aria-hidden="true" />
            {product.barcode ? <span className="tabular-nums">{product.barcode}</span> : <span>Sin código</span>}
          </p>
        )}
        {"soldIn" in product ? (
          product.soldIn.length === 0 ? (
            <p className="m-0 mt-auto pt-2 text-sm text-muted-foreground">No se vende en ninguna sucursal</p>
          ) : (
            // Resumen de todas las sucursales; el desglose por sucursal está en el detalle.
            <div className="mt-auto grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-3 pt-2 @max-lg/list:pt-1">
              <div className="grid min-w-0">
                <span className="text-xs font-semibold text-muted-foreground">Precio</span>
                <span className="text-xl leading-tight font-bold whitespace-nowrap tabular-nums @max-lg/list:text-lg">{priceSummary(product.soldIn.map((b) => b.price))}</span>
              </div>
              <StockFigure
                {...stockSummary(product.soldIn)}
                minStock={null}
                caption={product.soldIn.length === 1 ? product.soldIn[0].branch : `en ${product.soldIn.length} sucursales`}
              />
            </div>
          )
        ) : (
          // Precio a la izquierda y stock a la derecha, en la misma línea de base: en la lista se leen como dos columnas.
          <div className="mt-auto grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-3 pt-2 @max-lg/list:pt-1">
            <div className="grid min-w-0">
              <span className="text-xs font-semibold text-muted-foreground">Precio</span>
              <span className="text-xl leading-tight font-bold whitespace-nowrap tabular-nums @max-lg/list:text-lg">{priceLabel(product.price)}</span>
            </div>
            <StockFigure stock={product.stock} minStock={product.minStock} low={isLow(product)} />
          </div>
        )}
      </div>
    </Card>
  );
}
