// Tipos y utilidades que comparten las piezas del catálogo.
import { isLowStock } from "@/data/cash";
import type { Product } from "@/data/types";
import type { CatalogEntry } from "@/data/queries";

// Negocio: el producto del catálogo con dónde se vende. Sucursal: el producto con su precio y stock ahí.
export type Item = Product | CatalogEntry;

export const NONE = "none";
export const isLow = (p: Item) => ("soldIn" in p ? p.soldIn.some((s) => s.low) : isLowStock(p));
export { colorAt as colorOf } from "@/data/routes";
