// Tipos y utilidades que comparten las piezas del catálogo.
import { isLowStock } from "@/data/cash";
import type { BusinessKind, Product, SaleMode } from "@/data/types";
import type { CatalogEntry } from "@/data/queries";

// Negocio: el producto del catálogo con dónde se vende. Sucursal: el producto con su precio y stock ahí.
export type Item = Product | CatalogEntry;

export const NONE = "none";
export const isLow = (p: Item) => ("soldIn" in p ? p.soldIn.some((s) => s.low) : isLowStock(p));
export { colorAt as colorOf } from "@/data/routes";

/** «2 × Hamburguesa, Papas»: lo que incluye un combo. */
export const comboSummary = (parts: { name: string; qty: number }[]) => parts.map((c) => (c.qty > 1 ? `${c.qty} × ${c.name}` : c.name)).join(", ");

/**
 * Cómo se vende un producto, para la página de producto. Uno que ya existe: combo si tiene componentes; si no, por
 * lo que tiene en las sucursales donde se vende (stock contado, o sin precio fijo). Uno nuevo: el tipo por defecto
 * del negocio o, sin él, el de su rubro.
 */
export function saleMode(product: CatalogEntry | undefined, kind: BusinessKind, defaultMode?: SaleMode): SaleMode {
  if (product?.components) return "combo";
  if (product?.soldIn.length) {
    if (product.soldIn.some((s) => s.stock !== null)) return "stock";
    return product.soldIn.every((s) => s.price === null) ? "free" : "open";
  }
  if (defaultMode) return defaultMode;
  return kind === "ropa" ? "free" : kind === "restaurante" ? "open" : "stock";
}
