// Ventas y gastos.
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { check, db, name, uuid } from "./shared";

export const sales = {
  registerSale: defineAction({
    input: z.object({
      branchId: uuid,
      shiftId: uuid,
      items: z
        // price: solo para productos con precio al vender; con precio fijo la base usa el del inventario.
        .array(z.object({ productId: uuid, qty: z.number().int().min(1).max(10_000), price: z.number().positive("Escribe el precio").max(9_999_999).optional() }))
        .min(1, "La venta no tiene productos")
        .max(200),
    }),
    handler: async ({ branchId, shiftId, items }, context) => {
      const { data, error } = await db(context).rpc("register_sale", { p_branch: branchId, p_shift: shiftId, p_items: items });
      check(error);
      return { id: data };
    },
  }),

  createExpense: defineAction({
    accept: "form",
    input: z.object({
      branchId: uuid,
      shiftId: uuid,
      concept: name(120, "Ingresa el concepto"),
      category: name(40, "Ingresa la categoría"),
      amount: z.coerce.number({ error: "Ingresa un monto" }).positive("El monto debe ser mayor a cero").max(9_999_999),
    }),
    handler: async ({ branchId, shiftId, ...fields }, context) => {
      const { error } = await db(context)
        .from("expenses")
        .insert({ branch_id: branchId, shift_id: shiftId, recorded_by: context.locals.userId!, ...fields });
      check(error);
      return { ok: true };
    },
  }),
};
