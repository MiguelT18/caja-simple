// Rutas de /app y el color de cada sucursal (ver docs/modelo-de-datos.md › Rutas).
import type { Membership, Role } from "./session";
import type { Branch, Business } from "./types";

export const businessHref = (b: Business) => `/app/${b.slug}`;
export const branchHref = (b: Business, br: Branch, section = "") => `/app/${b.slug}/sucursales/${br.slug}${section && `/${section}`}`;

/** Dónde entra cada rol: la dueña al resumen del negocio; la empleada a registrar venta en su sucursal. */
export const entryHref = (m: Membership) =>
  m.role === "dueño" || !m.branches[0] ? businessHref(m.business) : branchHref(m.business, m.branches[0], "registrar-venta");

/** Secciones de sucursal que ve cada rol ("" es el resumen de la sucursal). */
export const branchSections = (role: Role) =>
  role === "dueño" ? ["", "registrar-venta", "ventas", "gastos", "inventario", "turnos"] : ["registrar-venta", "ventas", "gastos", "inventario", "turnos"];

/** Color de una sucursal: el mismo que en «Sucursales» (por su orden en el negocio). */
export const branchColor = (m: Membership, branchId: string) => colorAt(Math.max(0, m.branches.findIndex((b) => b.id === branchId)));

/** Uno de los 6 colores de sucursal, por posición. */
export const colorAt = (index: number) => `var(--color-branch-${(index % 6) + 1})`;
