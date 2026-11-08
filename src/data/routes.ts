// Rutas de /app y el color de cada sucursal (ver docs/modelo-de-datos.md › Rutas).
import type { Membership, Role } from "./session";
import type { Branch, Business, Notification } from "./types";

export const businessHref = (b: Business) => `/app/${b.slug}`;
export const branchHref = (b: Business, br: Branch, section = "") => `/app/${b.slug}/sucursales/${br.slug}${section && `/${section}`}`;

/** Dónde entra cada rol: la dueña al resumen del negocio; la empleada a registrar venta en su sucursal. */
export const entryHref = (m: Membership) =>
  m.role === "dueño" || !m.branches[0] ? businessHref(m.business) : branchHref(m.business, m.branches[0], "registrar-venta");

/** Secciones de sucursal que ve cada rol ("" es el resumen de la sucursal). */
export const branchSections = (role: Role) =>
  role === "dueño" ? ["", "registrar-venta", "ventas", "gastos", "inventario", "turnos", "reportes"] : ["registrar-venta", "ventas", "gastos", "inventario", "turnos", "equipo"];

/** Color de una sucursal: el mismo que en «Sucursales» (por su orden en el negocio). */
export const branchColor = (m: Membership, branchId: string) => colorAt(Math.max(0, m.branches.findIndex((b) => b.id === branchId)));

/** Uno de los 6 colores de sucursal, por posición. */
export const colorAt = (index: number) => `var(--color-branch-${(index % 6) + 1})`;

/**
 * A dónde lleva tocar un aviso: a la sección que trata (Turnos, Inventario, Empleados, Plan) de su sucursal o de su
 * negocio, según el rol. Sin un negocio donde estés (una invitación sin aceptar), no lleva a ningún lado.
 */
export function notificationHref(n: Notification, memberships: Membership[]): string | undefined {
  const m = memberships.find((x) => x.business.id === n.businessId);
  if (!m) return undefined;
  const branch = m.branches.find((b) => b.id === n.branchId);
  const owner = m.role === "dueño";
  const inBranch = (section: string) => (branch ? branchHref(m.business, branch, section) : owner ? businessHref(m.business) : entryHref(m));
  switch (n.kind) {
    case "shift_reminder":
    case "shift_late":
    case "shift_closed":
    case "cash_mismatch":
    case "reopen_request":
    case "reopen_answer":
    case "reopen_sent":
      return inBranch("turnos");
    case "low_stock":
      return branch ? branchHref(m.business, branch, "inventario") : owner ? `${businessHref(m.business)}/catalogo` : entryHref(m);
    case "shift_change":
    case "invitation_answer":
    case "join_request":
      return owner ? `${businessHref(m.business)}/empleados` : entryHref(m);
    case "plan_expiring":
    case "plan_expired":
      return owner ? `${businessHref(m.business)}/plan` : entryHref(m);
    default:
      // Invitación aceptada, pedido para unirse aceptado, negocio traspasado: a la entrada de ese negocio.
      return entryHref(m);
  }
}
