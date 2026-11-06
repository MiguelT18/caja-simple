// Pedidos abiertos: carros con nombre que la sucursal guarda y cobra después. RLS deja tocar solo los abiertos.
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { payment, saleItems } from "./sales";
import { check, db, name, uuid } from "./shared";

export const orders = {
  /** Crea o actualiza el pedido. El id lo genera el navegador: guardar dos veces no lo duplica. */
  saveOrder: defineAction({
    input: z.object({ orderId: uuid, branchId: uuid, label: name(40, "Ponle un nombre al pedido"), items: saleItems.min(1, "El pedido no tiene productos") }),
    handler: async ({ orderId, branchId, label, items }, context) => {
      const sb = db(context);
      // update primero: los permisos de columna no dejan que un upsert reescriba branch_id.
      const { data, error } = await sb.from("orders").update({ label, items }).eq("id", orderId).select("id");
      check(error);
      if (data?.length) return { id: orderId };
      check((await sb.from("orders").insert({ id: orderId, branch_id: branchId, label, items })).error);
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
