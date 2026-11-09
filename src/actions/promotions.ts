// Promociones con descuento. La base exige plan pago y RLS que sea la dueña.
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import type { Database } from "@/lib/database.types";
import { check, db, money, name, uuid } from "./shared";

const day = z.iso.date({ error: "Fecha no válida" });

const promotion = z
  .object({
    businessId: uuid,
    id: uuid.optional(),
    name: name(60, "Escribe un nombre para la promoción"),
    kind: z.enum(["percent", "price", "bundle"], { error: "Elige el tipo de descuento" }),
    percent: z.coerce.number().int("Usa un número entero").min(1, "Entre 1 y 99%").max(99, "Entre 1 y 99%").optional(),
    price: money.optional(),
    buy: z.coerce.number().int().min(2, "Lleva al menos 2").max(20, "Máximo 20").optional(),
    pay: z.coerce.number().int().min(1, "Paga al menos 1").optional(),
    productIds: z.array(uuid).min(1, "Elige al menos un producto").max(500, "Máximo 500 productos"),
    /** null = todas las sucursales. */
    branchIds: z.array(uuid).min(1, "Elige al menos una sucursal").nullable(),
    /** null = todos los días. */
    weekdays: z.array(z.number().int().min(1).max(7)).min(1, "Elige al menos un día").nullable(),
    startsOn: day.nullable(),
    endsOn: day.nullable(),
  })
  .superRefine((p, ctx) => {
    const need = (ok: boolean, path: string, message: string) => ok || ctx.addIssue({ code: "custom", path: [path], message });
    if (p.kind === "percent") need(p.percent !== undefined, "percent", "Escribe el porcentaje");
    if (p.kind === "price") need(p.price !== undefined, "price", "Escribe el precio de la promoción");
    if (p.kind === "bundle") {
      need(p.buy !== undefined, "buy", "Escribe cuántos lleva");
      need(p.pay !== undefined && p.buy !== undefined && p.pay < p.buy, "pay", "Paga menos de los que lleva");
    }
    if (p.startsOn && p.endsOn) need(p.endsOn >= p.startsOn, "endsOn", "Termina antes de empezar");
  });

export const promotions = {
  savePromotion: defineAction({
    input: promotion,
    handler: async (p, context) => {
      // Una sola llamada: la promoción y sus productos se guardan juntos o no se guarda nada.
      // gen types no marca como nullables los argumentos de una función; save_promotion acepta null en todos los opcionales.
      const args = {
        p_business: p.businessId,
        p_id: p.id ?? null,
        p_name: p.name,
        p_kind: p.kind,
        p_percent: p.kind === "percent" ? p.percent! : null,
        p_price: p.kind === "price" ? p.price! : null,
        p_buy: p.kind === "bundle" ? p.buy! : null,
        p_pay: p.kind === "bundle" ? p.pay! : null,
        p_branch_ids: p.branchIds,
        p_weekdays: p.weekdays && new Set(p.weekdays).size < 7 ? [...new Set(p.weekdays)].sort() : null,
        p_starts_on: p.startsOn,
        p_ends_on: p.endsOn,
        p_product_ids: p.productIds,
      };
      const { data, error } = await db(context).rpc("save_promotion", args as Database["public"]["Functions"]["save_promotion"]["Args"]);
      check(error);
      return { id: data! };
    },
  }),

  togglePromotion: defineAction({
    input: z.object({ id: uuid, active: z.boolean() }),
    handler: async ({ id, active }, context) => {
      const { error } = await db(context).from("promotions").update({ active }).eq("id", id).select("id").single();
      check(error);
      return { ok: true };
    },
  }),

  deletePromotion: defineAction({
    input: z.object({ id: uuid }),
    handler: async ({ id }, context) => {
      // Las ventas que la usaron conservan su descuento (sale_items.promotion_id queda en null).
      const { error } = await db(context).from("promotions").delete().eq("id", id);
      check(error);
      return { ok: true };
    },
  }),
};
