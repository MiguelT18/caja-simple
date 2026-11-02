// Turnos.
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { check, db, money, name, time, tone, uuid } from "./shared";

export const shifts = {
  saveShift: defineAction({
    accept: "form",
    input: z.object({
      branchId: uuid,
      id: uuid.optional(),
      name: name(40, "Ingresa el nombre del turno"),
      start: time,
      end: time,
      tone,
    }).refine((s) => s.start !== s.end, { message: "La hora de fin no puede ser igual a la de inicio", path: ["end"] }),
    handler: async ({ branchId, id, name, start, end, tone }, context) => {
      const sb = db(context);
      const fields = { name, start_time: start, end_time: end, tone };
      const { error } = id
        ? await sb.from("shifts").update(fields).eq("id", id).select("id").single()
        : await sb.from("shifts").insert({ branch_id: branchId, ...fields }).select("id").single();
      check(error, `Ya hay un turno llamado «${name}» en esta sucursal.`);
      return { ok: true };
    },
  }),

  /** Quita un turno. Se archiva: las ventas y los gastos viejos siguen mostrando su nombre. */
  deleteShift: defineAction({
    accept: "form",
    input: z.object({ id: uuid }),
    handler: async ({ id }, context) => {
      const sb = db(context);
      const { data: shift, error } = await sb.from("shifts").select("branch_id").eq("id", id).is("archived_at", null).single();
      check(error);
      const [{ count: active }, { count: open }] = await Promise.all([
        sb.from("shifts").select("id", { count: "exact", head: true }).eq("branch_id", shift!.branch_id).is("archived_at", null),
        sb.from("shift_closes").select("id", { count: "exact", head: true }).eq("shift_id", id).eq("status", "en-curso"),
      ]);
      if ((active ?? 0) <= 1) throw new ActionError({ code: "BAD_REQUEST", message: "La sucursal necesita al menos un turno." });
      if ((open ?? 0) > 0) throw new ActionError({ code: "BAD_REQUEST", message: "Cierra el turno antes de quitarlo." });
      check((await sb.from("shifts").update({ archived_at: new Date().toISOString() }).eq("id", id).select("id").single()).error);
      check((await sb.from("employees").update({ shift_id: null }).eq("shift_id", id)).error);
      return { ok: true };
    },
  }),

  openShift: defineAction({
    accept: "form",
    input: z.object({ branchId: uuid, shiftId: uuid, opening: money }),
    handler: async ({ branchId, shiftId, opening }, context) => {
      const { error } = await db(context)
        .from("shift_closes")
        .insert({ branch_id: branchId, shift_id: shiftId, opening, opened_by: context.locals.userId! });
      check(error, "Ese turno ya está abierto o ya se abrió hoy.");
      return { ok: true };
    },
  }),

  closeShift: defineAction({
    accept: "form",
    input: z.object({ closeId: uuid, counted: money }),
    handler: async ({ closeId, counted }, context) => {
      const { error } = await db(context)
        .from("shift_closes")
        .update({ status: "cerrado", counted })
        .eq("id", closeId)
        .select("id")
        .single();
      check(error);
      return { ok: true };
    },
  }),
};
