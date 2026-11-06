import { CircleSlash, Pencil, TriangleAlert } from "lucide-react";
import type { Category, Product } from "@/data/types";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isLow, colorOf } from "./catalog";
import { ProductImage, priceLabel } from "./ProductCard";

/** Stock como en la tarjeta, en una celda: el estado va escrito y con ícono, no solo con color. */
function StockCell({ product }: { product: Product }) {
  if (product.stock === null) return <span className="text-muted-foreground">Sin control</span>;
  const out = product.stock === 0;
  const low = !out && isLow(product);
  const tone = out ? "expense" : low ? "warning" : null;
  const Icon = out ? CircleSlash : TriangleAlert;
  return (
    <div className="grid justify-items-end">
      <span className="inline-flex items-center gap-1 font-semibold tabular-nums" style={tone ? { color: `var(--color-${tone})` } : undefined}>
        {tone && <Icon className="size-3.5" strokeWidth={2.25} aria-hidden="true" />}
        {tone && <span className="text-xs">{out ? "Sin stock" : "Stock bajo"}</span>}
        {product.stock}
      </span>
      {product.minStock !== null && <span className="text-xs text-muted-foreground tabular-nums">mín. {product.minStock}</span>}
    </div>
  );
}

export function ProductTable({
  items,
  categories,
  onEdit,
}: {
  items: { product: Product; categoryId: string | null }[];
  categories: Category[];
  onEdit?: (product: Product) => void;
}) {
  return (
    <div className="card overflow-hidden p-0">
      <Table label="Productos">
        <TableCaption className="sr-only">Productos de la sucursal</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Código</TableHead>
            <TableHead className="text-right">Precio</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            {onEdit && (
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(({ product, categoryId }) => {
            const index = categories.findIndex((c) => c.id === categoryId);
            const color = index >= 0 ? colorOf(index) : "var(--color-text-subtle)";
            return (
              <TableRow key={product.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div
                      className="relative size-10 shrink-0 overflow-hidden rounded-md [&_svg]:size-5"
                      style={{ background: `color-mix(in srgb, ${color} 12%, var(--color-surface))` }}
                    >
                      <ProductImage src={product.image} color={color} />
                    </div>
                    <span className="font-semibold">{product.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
                    {index >= 0 ? categories[index].name : "Sin categoría"}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">{product.barcode ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{priceLabel(product.price)}</TableCell>
                <TableCell className="text-right">
                  <StockCell product={product} />
                </TableCell>
                {onEdit && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" className="pointer-coarse:size-11" aria-label={`Editar precio y stock de ${product.name}`} onClick={() => onEdit(product)}>
                      <Pencil />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
