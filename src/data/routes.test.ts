import { describe, expect, it } from "vitest";
import { notificationHref } from "./routes";
import type { Membership } from "./session";
import type { Notification } from "./types";

const branch = { id: "br1", businessId: "b1", slug: "centro", name: "Centro", address: "" };
const business = { id: "b1", slug: "tienda", name: "Tienda", ownerId: "o", plan: "Gratis", kind: "tienda" } as Membership["business"];
const owner: Membership = { business, role: "dueño", branches: [branch] };
const employee: Membership = { business, role: "empleado", branches: [branch] };
const note = (kind: string, extra: Partial<Notification> = {}) =>
  ({ id: "n", createdAt: "", read: false, kind, data: {}, businessId: "b1", branchId: "br1", ...extra }) as Notification;

describe("notificationHref", () => {
  it("un turno por empezar lleva a Turnos de la sucursal, para la dueña y para quien trabaja ahí", () => {
    expect(notificationHref(note("shift_reminder"), [owner])).toBe("/app/tienda/sucursales/centro/turnos");
    expect(notificationHref(note("shift_reminder"), [employee])).toBe("/app/tienda/sucursales/centro/turnos");
  });
  it("stock bajo lleva al inventario; sin sucursal conocida, la dueña va al catálogo", () => {
    expect(notificationHref(note("low_stock"), [owner])).toBe("/app/tienda/sucursales/centro/inventario");
    expect(notificationHref(note("low_stock", { branchId: undefined }), [owner])).toBe("/app/tienda/catalogo");
  });
  it("lo del equipo y del plan va al negocio para la dueña; quien trabaja ahí va a su sucursal", () => {
    expect(notificationHref(note("shift_change"), [owner])).toBe("/app/tienda/empleados");
    expect(notificationHref(note("plan_expiring"), [owner])).toBe("/app/tienda/plan");
    expect(notificationHref(note("ownership"), [employee])).toBe("/app/tienda/sucursales/centro/registrar-venta");
  });
  it("sin un negocio donde estés (invitación sin aceptar), no lleva a ningún lado", () => {
    expect(notificationHref(note("invitation", { businessId: "otro" }), [owner])).toBeUndefined();
  });
});
