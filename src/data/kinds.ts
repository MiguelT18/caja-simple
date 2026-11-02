// Rubros de negocio: cambian textos y secciones de la app, nunca lo que permite la base (ver docs/modelo-de-datos.md › Rubros).
import type { BusinessKind } from "./types";

export const businessKinds: { value: BusinessKind; label: string; hint: string }[] = [
  { value: "tienda", label: "Tienda o almacén", hint: "Productos con precio y stock." },
  { value: "ropa", label: "Ropa americana", hint: "Prendas con precio al vender y fardos." },
  { value: "restaurante", label: "Restaurante", hint: "Menú sin stock y pedidos por mesa." },
];

/** Opciones del campo «Rubro» para FormInput. */
export const kindOptions = (selected: BusinessKind = "tienda") =>
  businessKinds.map((k) => ({ value: k.value, label: `${k.label}: ${k.hint}`, selected: k.value === selected }));

/** El catálogo de un restaurante es su menú. */
export const catalogLabel = (kind: BusinessKind) => (kind === "restaurante" ? "Menú" : "Catálogo");
