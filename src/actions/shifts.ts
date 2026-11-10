// Turnos.
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { cents, shiftCash } from "@/data/cash";
import { movements } from "@/data/shared";
import { formatBs } from "@/lib/format";
import { check, db, money, name, optional, time, tone, uuid } from "./shared";

/** Días ISO marcados en el formulario; los 7 (o ninguno marcado: el formulario lo impide) = null, todos los días. */
const weekdays = z
  .array(z.coerce.number().int().min(1).max(7))
  .min(1, "Elige al menos un día")
  .transform((d) => (new Set(d).size >= 7 ? null : [...new Set(d)].sort()));

const note = optional.pipe(z.string().max(300, "Máximo 300 caracteres").optional());

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
      weekdays,
    }).refine((s) => s.start !== s.end, { message: "La hora de fin no puede ser igual a la de inicio", path: ["end"] }),
    handler: async ({ branchId, id, name, start, end, tone, weekdays }, context) => {
      const sb = db(context);
      const fields = { name, start_time: start, end_time: end, tone, weekdays };
      const { error } = id
        ? await sb.from("shifts").update(fields).eq("id", id).select("id").single()
        : await sb.from("shifts").insert({ branch_id: branchId, ...fields }).select("id").single();
      check(error, `Ya hay un turno llamado «${name}» en esta sucursal.`);
      return { ok: true };
    },
  }),

  /**
   * Horario semanal de la sucursal: una fila por día. «opens» trae los días que abre; un día que abre sin horas abre
   * todo el día (sin fila). Reemplaza el horario entero.
   */
  saveBranchHours: defineAction({
    accept: "form",
    input: z
      .object({
        branchId: uuid,
        opens: z.array(z.coerce.number().int().min(1).max(7)).default([]),
        open: z.array(z.string().nullish()).length(7),
        close: z.array(z.string().nullish()).length(7),
      })
      .transform(({ branchId, opens, open, close }, ctx) => {
        const rows = [];
        for (let i = 0; i < 7; i++) {
          const dow = i + 1;
          const from = open[i] || null;
          const to = close[i] || null;
          if (!opens.includes(dow)) rows.push({ branch_id: branchId, dow, open_time: null, close_time: null });
          else if (from || to) {
            if (!from || !to || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to) || to <= from) {
              ctx.addIssue({ code: "custom", message: "La hora de cierre tiene que ser después de la de apertura", path: ["close"] });
              return z.NEVER;
            }
            rows.push({ branch_id: branchId, dow, open_time: from, close_time: to });
          }
        }
        return { branchId, rows };
      }),
    handler: async ({ branchId, rows }, context) => {
      const sb = db(context);
      check((await sb.from("branch_hours").delete().eq("branch_id", branchId)).error);
      if (rows.length) check((await sb.from("branch_hours").insert(rows)).error);
      return { ok: true };
    },
  }),

  /** Cierre de una fecha (feriado): todo el día, de tal hora a tal hora o solo algunos turnos. Solo la dueña (RLS). */
  addClosure: defineAction({
    input: z
      .object({
        branchId: uuid,
        day: z.iso.date({ error: "Fecha no válida" }),
        start: time.nullable().default(null),
        end: time.nullable().default(null),
        shiftIds: z.array(uuid).min(1, "Elige al menos un turno").nullable().default(null),
        note: z.string().trim().max(80, "Máximo 80 caracteres").nullable().default(null),
      })
      .refine((c) => (c.start === null) === (c.end === null) && (c.start === null || c.end! > c.start), {
        message: "La hora de fin tiene que ser después de la de inicio",
        path: ["end"],
      })
      .refine((c) => c.start === null || c.shiftIds === null, { message: "Elige horas o turnos, no las dos cosas", path: ["shiftIds"] }),
    handler: async ({ branchId, day, start, end, shiftIds, note }, context) => {
      const { error } = await db(context)
        .from("branch_closures")
        .insert({ branch_id: branchId, day, start_time: start, end_time: end, shift_ids: shiftIds, note: note || null })
        .select("id")
        .single();
      check(error);
      return { ok: true };
    },
  }),

  deleteClosure: defineAction({
    input: z.object({ id: uuid }),
    handler: async ({ id }, context) => {
      check((await db(context).from("branch_closures").delete().eq("id", id).select("id").single()).error);
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
        // Fecha de caja, estado y quién abrió los pone la base (private.on_shift_open).
        .insert({ branch_id: branchId, shift_id: shiftId, opening });
      check(error, "Ese turno ya está abierto o ya se abrió hoy.");
      return { ok: true };
    },
  }),

  closeShift: defineAction({
    accept: "form",
    input: z.object({ closeId: uuid, counted: money, note }),
    handler: async ({ closeId, counted, note }, context) => {
      const sb = db(context);
      const { data: row, error } = await sb
        .from("shift_closes")
        .update({ status: "cerrado", counted, note: note ?? null })
        .eq("id", closeId)
        .select("*")
        .single();
      check(error);
      // Cómo cerró la caja, con el mismo cálculo de la pantalla (y del aviso a la dueña): un aviso de unos segundos.
      const cash = shiftCash([row!], await movements(sb, [row!.branch_id], row!.business_date, row!.business_date), row!.shift_id, row!.business_date);
      const difference = cents(counted - cash.expected);
      return {
        toast:
          difference === 0
            ? { message: "Turno cerrado: la caja cuadró.", tone: "success" as const }
            : { message: `Turno cerrado: ${difference > 0 ? "sobran" : "faltan"} ${formatBs(Math.abs(difference))}.`, tone: "warning" as const },
      };
    },
  }),

  /** La nota de un cierre (por qué no cuadró). La escribe quien cerró o la dueña, también después. */
  saveCloseNote: defineAction({
    accept: "form",
    input: z.object({ closeId: uuid, note }),
    handler: async ({ closeId, note }, context) => {
      check((await db(context).rpc("set_close_note", { p_close: closeId, p_note: note ?? "" })).error);
      return { ok: true };
    },
  }),

  /** Quien trabaja en el turno pide reabrirlo: la dueña recibe un aviso y lo acepta o lo rechaza (answerReopen). */
  requestReopen: defineAction({
    accept: "form",
    input: z.object({ closeId: uuid, reason: optional.pipe(z.string().trim().max(200, "Máximo 200 caracteres").optional()) }),
    handler: async ({ closeId, reason }, context) => {
      check((await db(context).rpc("request_reopen", { p_close: closeId, p_reason: reason })).error);
      return { ok: true };
    },
  }),

  /** La dueña responde un pedido de reapertura; al aceptar, el turno se reabre (mismas reglas que reopenShift). */
  answerReopen: defineAction({
    accept: "form",
    input: z.object({ requestId: uuid, accept: z.enum(["true", "false"]).transform((v) => v === "true") }),
    handler: async ({ requestId, accept }, context) => {
      check((await db(context).rpc("answer_reopen", { p_request: requestId, p_accept: accept })).error);
      return { ok: true };
    },
  }),

  /** Reabre el último cierre de un turno (de hoy o de ayer), si se cerró por error. Solo la dueña. */
  reopenShift: defineAction({
    accept: "form",
    input: z.object({ closeId: uuid }),
    handler: async ({ closeId }, context) => {
      check((await db(context).rpc("reopen_shift", { p_close: closeId })).error);
      return { ok: true };
    },
  }),
};
