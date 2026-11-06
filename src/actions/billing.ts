// Cobro de planes: la dueña genera el cobro; el monto lo calcula la base (create_plan_charge) y el pago lo marca un
// administrador (activate_plan_charge). Ver docs/planes-de-suscripcion.md.
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { check, db, uuid } from "./shared";

export const billing = {
  createPlanCharge: defineAction({
    accept: "form",
    input: z.object({
      businessId: uuid,
      plan: z.enum(["Negocio", "Sucursales"], { error: "Elige el plan" }),
      period: z.enum(["mensual", "anual"], { error: "Elige si pagas el mes o el año" }),
      method: z.enum(["qr", "transferencia", "tarjeta"], { error: "Elige cómo pagas" }),
    }),
    handler: async ({ businessId, plan, period, method }, context) => {
      const { data, error } = await db(context).rpc("create_plan_charge", { p_business: businessId, p_plan: plan, p_period: period, p_method: method });
      check(error);
      return { id: data };
    },
  }),
};
