import { CircleSlash, Pencil, ScanBarcode, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { type Item, isLow } from "./catalog";
import { ProductImage, priceLabel, priceSummary, stockSummary } from "./ProductCard";

/** Nombre que comparten la foto de la tarjeta y la del detalle: el navegador la pasa de una a otra. */
export const DETAIL_TRANSITION = "product-photo";

/** Estado del stock escrito (con ícono): nada se dice solo con color. */
function StockState({ stock, low }: { stock: number | null; low: boolean }) {
  if (stock === null) return <span className="text-muted-foreground">Sin control</span>;
  if (stock === 0)
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-expense)]">
        <CircleSlash className="size-3.5" aria-hidden="true" />
        Sin stock
      </span>
    );
  if (low)
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-warning)]">
        <TriangleAlert className="size-3.5" aria-hidden="true" />
        Stock bajo
      </span>
    );
  return <span className="text-muted-foreground">En stock</span>;
}

/** Detalle de un producto: foto grande de fondo, descripción y el desglose de precio y stock por sucursal. */
export function ProductDetail({
  product,
  category,
  color,
  onClose,
  onEdit,
}: {
  product: Item;
  category: { id: string; name: string } | null;
  color: string;
  onClose: () => void;
  onEdit?: () => void;
}) {
  // En el negocio, una fila por sucursal; en una sucursal, solo la suya.
  const rows =
    "soldIn" in product
      ? product.soldIn.map((s) => ({ key: s.branchId, branch: s.branch, price: s.price, stock: s.stock, minStock: s.minStock, low: s.low }))
      : [{ key: product.id, branch: null, price: product.price, stock: product.stock, minStock: product.minStock, low: isLow(product) }];
  const total = stockSummary(rows);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Sin la animación propia del diálogo: la hace la transición de vista (la foto viaja desde la tarjeta). */}
      <DialogContent
        showCloseButton={false}
        // El foco vuelve a la tarjeta que se abrió (Radix no lo encuentra: se abrió dentro de la transición).
        onCloseAutoFocus={(e) => {
          const card = document.querySelector(`[data-product-art="${CSS.escape(product.id)}"]`)?.parentElement;
          const button = card?.querySelector<HTMLElement>("[data-open]");
          if (button) {
            e.preventDefault();
            button.focus();
          }
        }}
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 data-[state=closed]:animate-none data-[state=open]:animate-none sm:max-w-xl"
      >
        <div
          // Alto acotado: la foto nunca se come el modal (en el celular, nombre, precio y stock quedan a la vista).
          // La máscara la vuelve transparente hacia abajo: se funde con el fondo del modal (casi negro en el tema oscuro),
          // sin el borde que deja un degradado pintado encima.
          className="relative aspect-[16/9] max-h-[min(40dvh,18rem)] w-full shrink-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_40%,transparent)]"
          style={{ background: `color-mix(in srgb, ${color} 12%, var(--color-surface))`, viewTransitionName: DETAIL_TRANSITION }}
        >
          {product.image ? (
            // Sin el fundido de carga de ProductImage: la foto ya está en caché (la mostró la tarjeta) y la transición
            // necesita verla desde el primer cuadro. decoding sync: decodificada antes de capturar la vista nueva.
            <img src={product.image} alt="" decoding="sync" className="absolute inset-0 size-full object-cover" data-fallback />
          ) : (
            <ProductImage color={color} />
          )}
        </div>
        <DialogClose asChild>
          <Button variant="secondary" size="icon-sm" className="absolute top-3 right-3 z-10 bg-card shadow-sm pointer-coarse:size-11" aria-label="Cerrar">
            <X />
          </Button>
        </DialogClose>

        <div className="grid min-w-0 gap-5 p-5 sm:p-6">
          {/* Sube sobre la parte ya opaca del degradado, como una portada: el nombre se lee sobre fondo sólido. */}
          <div className="relative -mt-12 grid min-w-0 gap-2">
            <Badge variant="outline" className="max-w-full gap-1.5 justify-self-start truncate font-medium text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
              {category?.name ?? "Sin categoría"}
            </Badge>
            <DialogTitle className="text-[length:var(--text-2xl)] leading-tight font-bold [overflow-wrap:anywhere]">{product.name}</DialogTitle>
            <p className="m-0 flex items-center gap-1.5 text-sm text-muted-foreground">
              <ScanBarcode className="size-4 shrink-0" aria-hidden="true" />
              {product.barcode ? <span className="tabular-nums">{product.barcode}</span> : <span>Sin código de barras</span>}
            </p>
          </div>

          {product.description ? (
            <DialogDescription className="m-0 text-base whitespace-pre-line text-foreground [overflow-wrap:anywhere]">{product.description}</DialogDescription>
          ) : (
            <DialogDescription className="m-0">Sin descripción.{onEdit && " Puedes agregarla al editar el producto."}</DialogDescription>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-0.5 rounded-lg bg-muted px-4 py-3">
              <span className="text-xs font-semibold text-muted-foreground">Precio</span>
              <span className="text-xl font-bold tabular-nums">{priceSummary(rows.map((r) => r.price))}</span>
            </div>
            <div className="grid gap-0.5 rounded-lg bg-muted px-4 py-3">
              <span className="text-xs font-semibold text-muted-foreground">{rows.length > 1 ? "Stock total" : "Stock"}</span>
              <span className="text-xl font-bold tabular-nums">{total.stock ?? "Sin control"}</span>
            </div>
          </div>

          <section aria-labelledby="product-detail-breakdown" className="grid gap-2">
            <h3 id="product-detail-breakdown" className="m-0 text-sm font-semibold">
              {"soldIn" in product ? "Desglose por sucursal" : "En esta sucursal"}
            </h3>
            {rows.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">No se vende en ninguna sucursal. Agrégalo desde el inventario de una sucursal.</p>
            ) : (
              <>
              {/* Angosto: una ficha por sucursal; con espacio, tabla. */}
              <ul className="m-0 grid list-none gap-2 p-0 sm:hidden">
                {rows.map((r) => (
                  <li key={r.key} className="grid gap-2 rounded-lg border px-3 py-2.5 text-sm">
                    {r.branch !== null && <span className="font-semibold [overflow-wrap:anywhere]">{r.branch}</span>}
                    <dl className="m-0 grid grid-cols-3 gap-2">
                      {[
                        ["Precio", priceLabel(r.price)],
                        ["Stock", r.stock ?? "—"],
                        ["Mínimo", r.minStock ?? "—"],
                      ].map(([label, value]) => (
                        <div key={label as string} className="grid">
                          <dt className="text-xs text-muted-foreground">{label}</dt>
                          <dd className="m-0 tabular-nums">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <StockState stock={r.stock} low={r.low} />
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-lg border sm:block">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-muted text-xs text-muted-foreground">
                    <tr>
                      {"soldIn" in product && <th scope="col" className="px-3 py-2 text-left font-medium">Sucursal</th>}
                      <th scope="col" className="px-3 py-2 text-right font-medium">Precio</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Stock</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Mínimo</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-t">
                        {r.branch !== null && (
                          <th scope="row" className="px-3 py-2 text-left font-medium [overflow-wrap:anywhere]">
                            {r.branch}
                          </th>
                        )}
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{priceLabel(r.price)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{r.stock ?? "—"}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{r.minStock ?? "—"}</td>
                        <td className={cn("px-3 py-2 whitespace-nowrap")}>
                          <StockState stock={r.stock} low={r.low} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </section>

          {onEdit && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={onEdit}>
                <Pencil />
                {"soldIn" in product ? "Editar producto" : "Editar precio y stock"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
