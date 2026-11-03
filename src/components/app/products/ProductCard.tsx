import { useEffect, useRef, useState } from "react";
import { CircleSlash, Ellipsis, Package, Pencil, ScanBarcode, TriangleAlert } from "lucide-react";
import type { Product } from "@/data/types";
import type { Category } from "@/data/types";
import { formatBs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { type Item, isLow, NONE } from "./catalog";

export function ProductImage({ src, color }: { src?: string; color: string }) {
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

/** Precio fijo, o «Al vender» si se escribe en cada venta. */
const priceLabel = (price: number | null) => (price === null ? "Al vender" : formatBs(price));

/**
 * El stock de la sucursal como la cifra que manda en la tarjeta: número grande alineado a la derecha y, debajo,
 * el mínimo. Bajo el mínimo o en cero, el estado va escrito y con ícono sobre su fondo suave (nada solo con color).
 */
function StockFigure({ product }: { product: Product }) {
  if (product.stock === null) {
    return (
      <div className="grid justify-items-end text-right">
        <span className="text-xs font-semibold text-muted-foreground">Stock</span>
        <span className="text-sm font-semibold text-muted-foreground">Sin control</span>
      </div>
    );
  }
  const out = product.stock === 0;
  const low = !out && isLow(product);
  const tone = out ? "expense" : low ? "warning" : null;
  const Icon = out ? CircleSlash : TriangleAlert;
  return (
    <div
      className={cn("grid justify-items-end rounded-md text-right", tone && "-my-1 -mr-1 px-2 py-1")}
      style={tone ? { background: `var(--color-${tone}-soft)`, color: `var(--color-${tone})` } : undefined}
    >
      <span className={cn("text-xs font-semibold", !tone && "text-muted-foreground")}>
        {out ? "Sin stock" : low ? "Stock bajo" : "En stock"}
      </span>
      <span className="flex items-center gap-1.5 text-[length:var(--text-3xl)] leading-none font-extrabold tracking-[-0.03em] tabular-nums @max-lg/list:text-[length:var(--text-2xl)]">
        {tone && <Icon className="size-[0.7em]" strokeWidth={2.25} aria-hidden="true" />}
        {product.stock}
      </span>
      {product.minStock !== null && (
        <span className={cn("mt-0.5 text-xs tabular-nums", !tone && "text-muted-foreground")}>mín. {product.minStock}</span>
      )}
    </div>
  );
}

export function ProductCard({
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
  // En la lista angosta, el lápiz ocupa la esquina de arriba: la categoría y el nombre le dejan lugar; el stock llega hasta el borde.
  const clearCorner = (onEdit || onMove) && "@max-lg/list:pr-12";
  return (
    // Mosaico: foto 16:10 arriba. En la lista angosta (@container/list de ProductCatalog): fila con miniatura cuadrada a la izquierda.
    <Card className="relative h-full gap-0 overflow-hidden py-0 @max-lg/list:flex-row @max-lg/list:items-start">
      <div
        className="relative aspect-[16/10] @max-lg/list:m-3 @max-lg/list:mr-0 @max-lg/list:aspect-square @max-lg/list:w-20 @max-lg/list:shrink-0 @max-lg/list:overflow-hidden @max-lg/list:rounded-md"
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
            className="absolute top-2 right-2 bg-card shadow-sm pointer-coarse:size-11"
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
                className="absolute top-2 right-2 bg-card shadow-sm pointer-coarse:size-11"
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
        <h3 className={cn("m-0 text-base leading-snug font-semibold", clearCorner)}>{product.name}</h3>
        <p className={cn("m-0 flex items-center gap-1.5 text-sm text-muted-foreground", !product.barcode && "@max-lg/list:hidden")}>
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
                      <th scope="row" className="w-full max-w-0 truncate py-1 text-left font-normal text-muted-foreground">
                        {s.branch}
                      </th>
                      <td className="py-1 pl-3 text-right whitespace-nowrap tabular-nums">{priceLabel(s.price)}</td>
                      <td className={cn("py-1 pl-3 text-right whitespace-nowrap tabular-nums", s.low && "font-semibold text-[var(--color-warning)]")}>
                        {s.low && (
                          <>
                            <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
                            <span className="sr-only">Stock bajo: </span>
                          </>
                        )}
                        {s.stock ?? "Sin control"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          // Precio a la izquierda y stock a la derecha, en la misma línea de base: en la lista se leen como dos columnas.
          <div className="mt-auto flex items-end justify-between gap-3 pt-2 @max-lg/list:pt-1">
            <div className="grid min-w-0">
              <span className="text-xs font-semibold text-muted-foreground">Precio</span>
              <span className="text-xl leading-tight font-bold tabular-nums @max-lg/list:text-lg">{priceLabel(product.price)}</span>
            </div>
            <StockFigure product={product} />
          </div>
        )}
      </div>
    </Card>
  );
}
