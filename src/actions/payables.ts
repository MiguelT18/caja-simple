// Gastos fijos y pendientes: anotarlos, corregirlos, cancelarlos y pagarlos (de la caja o fuera de ella).
// Quién puede qué lo decide la base (RLS, triggers y pay_pending_expense); ver docs/modelo-de-datos.md.
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { amount, expenseFields } from "./sales";
import { check, db, optional, uuid } from "./shared";

const dueOn = optional.pipe(z.iso.date({ error: "Usa una fecha válida" }).optional());
// Quién paga: solo lo decide la dueña (la base ignora lo que mande otra persona, private.keep_payer).
const payer = z.enum(["sucursal", "dueña"]).optional();
const fixedFields = {
  ...expenseFields,
  frequency: z.enum(["diario", "semanal", "quincenal", "mensual"], { error: "Elige cada cuánto se paga" }),
  startsOn: z.iso.date({ error: "Elige el día del primer pago" }),
  // Vacío: sin vencimiento.
  graceDays: optional.pipe(z.coerce.number<string | undefined>().int("Usa un número entero").min(0, "No puede ser negativo").max(365).optional()),
  // Vacío: no es el sueldo de nadie.
  employeeId: optional.pipe(uuid.optional()),
  payer,
};
const fixedRow = ({ startsOn, graceDays, employeeId, ...rest }: z.infer<z.ZodObject<typeof fixedFields>>) => ({
  ...rest,
  starts_on: startsOn,
  grace_days: graceDays ?? null,
  employee_id: employeeId ?? null,
});

export const payables = {
  createFixedExpense: defineAction({
    accept: "form",
    input: z.object({ fixedId: uuid, branchId: uuid, ...fixedFields }),
    handler: async ({ fixedId, branchId, ...fields }, context) => {
      const { error } = await db(context).from("fixed_expenses").insert({ id: fixedId, branch_id: branchId, ...fixedRow(fields) });
      // Doble envío del mismo formulario: ya quedó guardado.
      if (error?.code === "23505" && error.message.includes("fixed_expenses_pkey")) return { ok: true };
      check(error);
      return { ok: true };
    },
  }),

  /** Cambia los próximos períodos; los pendientes ya generados quedan como están. */
  updateFixedExpense: defineAction({
    accept: "form",
    input: z.object({ fixedId: uuid, ...fixedFields }),
    handler: async ({ fixedId, ...fields }, context) => {
      check((await db(context).from("fixed_expenses").update(fixedRow(fields)).eq("id", fixedId).select("id").single()).error);
      return { ok: true };
    },
  }),

  /** Deja de generar pendientes; lo que ya se debe sigue a la vista. */
  archiveFixedExpense: defineAction({
    input: z.object({ fixedId: uuid }),
    handler: async ({ fixedId }, context) => {
      check((await db(context).from("fixed_expenses").update({ archived_at: new Date().toISOString() }).eq("id", fixedId).select("id").single()).error);
      return { ok: true };
    },
  }),

  createPendingExpense: defineAction({
    accept: "form",
    input: z.object({ pendingId: uuid, branchId: uuid, dueOn, payer, ...expenseFields }),
    handler: async ({ pendingId, branchId, dueOn, ...fields }, context) => {
      const { error } = await db(context)
        .from("pending_expenses")
        .insert({ id: pendingId, branch_id: branchId, due_on: dueOn ?? null, ...fields });
      if (error?.code === "23505" && error.message.includes("pending_expenses_pkey")) return { ok: true };
      check(error);
      return { ok: true };
    },
  }),

  /** Solo la dueña: el monto de este período (la factura llegó distinta) y el vencimiento. */
  updatePendingExpense: defineAction({
    accept: "form",
    input: z.object({ pendingId: uuid, amount, dueOn, payer }),
    handler: async ({ pendingId, amount, dueOn, payer }, context) => {
      check((await db(context).from("pending_expenses").update({ amount, due_on: dueOn ?? null, payer }).eq("id", pendingId).select("id").single()).error);
      return { ok: true };
    },
  }),

  /** Ya no se debe (o no se debe el resto). Queda quién y cuándo. */
  cancelPendingExpense: defineAction({
    input: z.object({ pendingId: uuid }),
    handler: async ({ pendingId }, context) => {
      check((await db(context).from("pending_expenses").update({ canceled_at: new Date().toISOString() }).eq("id", pendingId).select("id").single()).error);
      return { ok: true };
    },
  }),

  /** Quien trabaja en la sucursal pagó todo o parte con su plata: queda pagado fuera de la caja y nace su reembolso. */
  payFromPocket: defineAction({
    accept: "form",
    input: z.object({ paymentId: uuid, pendingId: uuid, amount }),
    handler: async ({ paymentId, pendingId, amount }, context) => {
      check((await db(context).rpc("pay_pending_from_pocket", { p_payment: paymentId, p_pending: pendingId, p_amount: amount })).error);
      return { ok: true };
    },
  }),

  payPendingExpense: defineAction({
    accept: "form",
    input: z
      .object({ paymentId: uuid, pendingId: uuid, amount, from: z.enum(["caja", "fuera"], { error: "Elige de dónde sale la plata" }), shiftId: uuid.optional() })
      .refine((v) => v.from === "fuera" || v.shiftId, { message: "Abre un turno para pagar de la caja.", path: ["from"] }),
    handler: async ({ paymentId, pendingId, amount, from, shiftId }, context) => {
      const { error } = await db(context).rpc("pay_pending_expense", {
        p_payment: paymentId,
        p_pending: pendingId,
        p_amount: amount,
        p_shift: from === "caja" ? shiftId : undefined,
      });
      check(error);
      return { ok: true };
    },
  }),

  /** Efectivo que se lleva la dueña de la caja del turno abierto. No es un gasto: solo baja el esperado. */
  createWithdrawal: defineAction({
    accept: "form",
    input: z.object({ withdrawalId: uuid, branchId: uuid, shiftId: uuid, amount, note: optional.pipe(z.string().max(120, "Máximo 120 caracteres").optional()) }),
    handler: async ({ withdrawalId, branchId, shiftId, amount, note }, context) => {
      const { error } = await db(context)
        .from("cash_withdrawals")
        .insert({ id: withdrawalId, branch_id: branchId, shift_id: shiftId, amount, note: note ?? null });
      if (error?.code === "23505" && error.message.includes("cash_withdrawals_pkey")) return { ok: true };
      check(error);
      return { ok: true };
    },
  }),

  voidWithdrawal: defineAction({
    input: z.object({ withdrawalId: uuid }),
    handler: async ({ withdrawalId }, context) => {
      check((await db(context).from("cash_withdrawals").update({ voided_at: new Date().toISOString() }).eq("id", withdrawalId).select("id").single()).error);
      return { ok: true };
    },
  }),

  /** Un pago fuera de la caja que se anotó por error. Uno de la caja se deshace eliminando su gasto. */
  voidPendingPayment: defineAction({
    input: z.object({ paymentId: uuid }),
    handler: async ({ paymentId }, context) => {
      check((await db(context).from("pending_payments").update({ voided_at: new Date().toISOString() }).eq("id", paymentId).select("id").single()).error);
      return { ok: true };
    },
  }),
};
