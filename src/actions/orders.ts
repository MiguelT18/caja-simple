// Pedidos abiertos: carros con nombre que la sucursal guarda y cobra después. RLS deja tocar solo los abiertos.
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { payment, saleItems } from "./sales";
import { check, db, money, name, uuid } from "./shared";

export const orders = {
  /** Crea o actualiza el pedido. El id lo genera el navegador: guardar dos veces no lo duplica. */
  saveOrder: defineAction({
    input: z.object({
      orderId: uuid,
      branchId: uuid,
      label: name(40, "Ponle un nombre al pedido"),
      items: saleItems.min(1, "El pedido no tiene productos"),
      // Encargo (opcional): sin estos campos, el pedido conserva los que tenía.
      details: z
        .object({
          phone: z.string().trim().max(30, { error: "El teléfono no puede pasar de 30 caracteres." }).transform((v) => v || null),
          dueOn: z.union([z.iso.date({ error: "Elige el día de entrega" }), z.literal("")]).transform((v) => v || null),
          delivery: z.string().trim().max(120, { error: "La entrega no puede pasar de 120 caracteres." }).transform((v) => v || null),
        })
        .optional(),
    }),
    handler: async ({ orderId, branchId, label, items, details }, context) => {
      const sb = db(context);
      const extra = details ? { phone: details.phone, due_on: details.dueOn, delivery: details.delivery } : {};
      // update primero: los permisos de columna no dejan que un upsert reescriba branch_id.
      const { data, error } = await sb.from("orders").update({ label, items, ...extra }).eq("id", orderId).select("id");
      check(error);
      if (data?.length) return { id: orderId };
      check((await sb.from("orders").insert({ id: orderId, branch_id: branchId, label, items, ...extra })).error);
      return { id: orderId };
    },
  }),

  deleteOrder: defineAction({
    input: z.object({ orderId: uuid }),
    handler: async ({ orderId }, context) => {
      check((await db(context).from("orders").delete().eq("id", orderId)).error);
      return { ok: true };
    },
  }),

  /** Adelanto de un encargo: entra a la caja del turno abierto de la sucursal (la base exige trabajar ahí). */
  addOrderDeposit: defineAction({
    accept: "form",
    input: z.object({ depositId: uuid, orderId: uuid, amount: money.refine((v) => v > 0, { error: "El adelanto tiene que ser mayor a cero" }), payment }),
    handler: async ({ depositId, orderId, amount, payment }, context) => {
      const sb = db(context);
      const shiftId = await openShiftOf(sb, orderId);
      check((await sb.rpc("add_order_deposit", { p_id: depositId, p_order: orderId, p_shift: shiftId, p_amount: amount, p_payment: payment })).error);
      return { ok: true };
    },
  }),

  /** Devuelve todo el adelanto en efectivo, de la caja del turno abierto. Después el pedido se puede descartar. */
  refundOrderDeposit: defineAction({
    accept: "form",
    input: z.object({ refundId: uuid, orderId: uuid }),
    handler: async ({ refundId, orderId }, context) => {
      const sb = db(context);
      const shiftId = await openShiftOf(sb, orderId);
      check((await sb.rpc("refund_order_deposit", { p_id: refundId, p_order: orderId, p_shift: shiftId })).error);
      return { ok: true };
    },
  }),

  /** Registra la venta con lo que tiene el carro y cierra el pedido, todo junto en la base. */
  chargeOrder: defineAction({
    input: z.object({ orderId: uuid, saleId: uuid, shiftId: uuid, payment, items: saleItems.min(1, "La venta no tiene productos") }),
    handler: async ({ orderId, saleId, shiftId, payment, items }, context) => {
      const { data, error } = await db(context).rpc("charge_order", { p_order: orderId, p_sale: saleId, p_shift: shiftId, p_payment: payment, p_items: items });
      check(error);
      return { id: data };
    },
  }),
};

/** El turno abierto de la sucursal del pedido (hay uno a la vez por sucursal). Sin turno, el mismo error que la base. */
async function openShiftOf(sb: ReturnType<typeof db>, orderId: string) {
  const { data: order, error } = await sb.from("orders").select("branch_id").eq("id", orderId).maybeSingle();
  check(error);
  if (!order) throw new ActionError({ code: "NOT_FOUND", message: "Ese pedido ya no existe." });
  const { data: open, error: closeError } = await sb.from("shift_closes").select("shift_id").eq("branch_id", order.branch_id).eq("status", "en-curso").maybeSingle();
  check(closeError);
  if (!open) throw new ActionError({ code: "BAD_REQUEST", message: "El turno no está abierto. Ábrelo en Turnos para recibir el adelanto." });
  return open.shift_id;
}
