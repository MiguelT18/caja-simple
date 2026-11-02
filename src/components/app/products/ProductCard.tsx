import { useEffect, useRef, useState } from "react";
import { FolderInput, Package, Pencil, ScanBarcode, TriangleAlert } from "lucide-react";
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
        {!("soldIn" in product) && <p className="m-0 text-xl font-bold tabular-nums">{priceLabel(product.price)}</p>}
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
                      <td className="py-1 text-right tabular-nums">{priceLabel(s.price)}</td>
                      <td className={cn("py-1 pl-3 text-right tabular-nums", s.low && "font-semibold text-[var(--color-warning)]")}>
                        {s.low && <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" aria-label="Stock bajo:" />}
                        {s.stock ?? "Sin control"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-sm">
            {product.stock === null ? (
              <span className="text-muted-foreground">Sin control de stock</span>
            ) : (
              <span className="tabular-nums">
                <span className="font-semibold">{product.stock}</span> <span className="text-muted-foreground">en stock</span>
              </span>
            )}
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
