// Cobro de planes: la dueña genera el cobro; el monto lo calcula la base (create_plan_charge) y el pago lo marca un
// administrador (activate_plan_charge). Ver docs/planes-de-suscripcion.md.
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { check, db, uuid } from "./shared";

export const billing = {
  createPlanCharge: defineAction({
    accept: "form",
    input: z.object({
      businessId: uuid,
      // Los locales que paga: 1 = plan Negocio; más = Sucursales. La base nunca cobra menos de los que ya tiene.
      branches: z.coerce.number({ error: "Elige cuántos locales" }).int().min(1, "Elige al menos 1 local").max(20, "Hasta 20 locales"),
      period: z.enum(["mensual", "anual"], { error: "Elige si pagas el mes o el año" }),
    }),
    handler: async ({ businessId, branches, period }, context) => {
      const { data, error } = await db(context).rpc("create_plan_charge", { p_business: businessId, p_branches: branches, p_period: period, p_method: "qr" });
      check(error);
      return { id: data };
    },
  }),

  /** Solo los que no se pagaron (por pagar o vencidos): RLS deja fuera los pagados. */
  deletePlanCharge: defineAction({
    accept: "form",
    input: z.object({ id: uuid }),
    handler: async ({ id }, context) => {
      const { data, error } = await db(context).from("plan_charges").delete().eq("id", id).select("id");
      check(error);
      if (!data?.length) throw new ActionError({ code: "NOT_FOUND", message: "Ese cobro ya está pagado o ya no existe." });
      return { ok: true };
    },
  }),
};
