// Empleados y avisos.
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { bump, businessVersion } from "@/lib/cache";
import { check, db, limit, name, uuid } from "./shared";

export const employees = {
  inviteEmployee: defineAction({
    accept: "form",
    input: z.object({
      businessId: uuid,
      branchId: uuid,
      shiftId: z.uuid("Elige un turno"),
      email: z.email("Ingresa un correo válido").trim().toLowerCase(),
      jobTitle: name(60, "Escribe el puesto"),
    }),
    handler: async ({ businessId, branchId, shiftId, email, jobTitle }, context) => {
      const sb = db(context);
      const { data: shift } = await sb.from("shifts").select("branch_id").eq("id", shiftId).single();
      if (shift?.branch_id !== branchId)
        throw new ActionError({ code: "BAD_REQUEST", message: "Ese turno es de otra sucursal. Elige uno de la sucursal seleccionada." });
      // La base exige que el correo tenga cuenta y deja la invitación pendiente hasta que la persona la acepte.
      // shortcut: el aviso llega solo a la bandeja de la app, no por correo.
      const { error } = await sb
        .from("employees")
        .insert({
          business_id: businessId,
          branch_id: branchId,
          shift_id: shiftId,
          email,
          job_title: jobTitle,
        })
        .select("id")
        .single();
      check(error, "Esa persona ya está en tu equipo.");
      return { ok: true };
    },
  }),

  /** Sugerencias de cuentas al escribir el correo de quien se invita. La base acota quién puede buscar y qué ve. */
  searchPeople: defineAction({
    input: z.object({ businessId: uuid, query: z.string().trim().max(120), page: z.number().int().min(1).max(1000).default(1) }),
    handler: async ({ businessId, query, page }, context) => {
      if (query.length < 3) return { people: [], total: 0, page };
      // Busca cuentas por correo: el límite evita raspar los correos de todos.
      await limit(context, "search", 30, 60);
      const { data, error } = await db(context).rpc("search_people", { p_business: businessId, p_query: query, p_page: page });
      check(error);
      return {
        // La base devuelve 5 por página y el total en cada fila.
        people: (data ?? []).map((p) => ({
          email: p.email,
          name: `${p.first_name} ${p.last_name}`.trim(),
          avatarUrl: p.avatar_url ?? undefined,
        })),
        total: Number(data?.[0]?.total ?? 0),
        page,
      };
    },
  }),

  respondInvitation: defineAction({
    accept: "form",
    input: z.object({ employeeId: uuid, accept: z.enum(["true", "false"]).transform((v) => v === "true") }),
    handler: async ({ employeeId, accept }, context) => {
      const sb = db(context);
      // Al rechazar, la persona nunca llega a ver el negocio: el middleware no lo invalidaría y el equipo de la dueña quedaría viejo.
      const { data: invite } = await sb.from("employees").select("business_id").eq("id", employeeId).maybeSingle();
      const { error } = await sb.rpc("respond_invitation", { p_employee: employeeId, p_accept: accept });
      check(error);
      if (invite) await bump(businessVersion(invite.business_id));
      return { ok: true };
    },
  }),

  markNotificationsRead: defineAction({
    accept: "form",
    handler: async (_input, context) => {
      const { error } = await db(context).from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
      check(error);
      return { ok: true };
    },
  }),

  deleteNotification: defineAction({
    accept: "form",
    input: z.object({ id: uuid }),
    handler: async ({ id }, context) => {
      // RLS («Borrar tus avisos») solo deja borrar los propios.
      check((await db(context).from("notifications").delete().eq("id", id)).error);
      return { ok: true };
    },
  }),

  clearNotifications: defineAction({
    accept: "form",
    handler: async (_input, context) => {
      const sb = db(context);
      // Las invitaciones sin responder se quedan: borrarlas dejaría a la persona sin forma de aceptar.
      const { data: pending, error } = await sb.from("notifications").select("id, employee:employees!inner(status)").eq("employee.status", "invitado");
      check(error);
      const keep = (pending ?? []).map((n) => n.id);
      let query = sb.from("notifications").delete().not("id", "is", null);
      if (keep.length) query = query.not("id", "in", `(${keep.join(",")})`);
      check((await query).error);
      return { ok: true };
    },
  }),

  /** Cambia la sucursal (y el turno, que es de la sucursal) de alguien del equipo. */
  reassignEmployee: defineAction({
    accept: "form",
    input: z.object({ id: uuid, branchId: uuid, shiftId: z.uuid("Elige un turno") }),
    handler: async ({ id, branchId, shiftId }, context) => {
      const sb = db(context);
      const { data: shift } = await sb.from("shifts").select("branch_id").eq("id", shiftId).single();
      if (shift?.branch_id !== branchId)
        throw new ActionError({ code: "BAD_REQUEST", message: "Ese turno es de otra sucursal. Elige uno de la sucursal seleccionada." });
      const { error } = await sb.from("employees").update({ branch_id: branchId, shift_id: shiftId }).eq("id", id).select("id").single();
      check(error);
      return { ok: true };
    },
  }),

  removeEmployee: defineAction({
    accept: "form",
    input: z.object({ id: uuid }),
    handler: async ({ id }, context) => {
      const { error } = await db(context).from("employees").delete().eq("id", id);
      check(error);
      return { ok: true };
    },
  }),
};
