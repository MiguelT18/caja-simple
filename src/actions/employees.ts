// Empleados y avisos.
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { bump, businessVersion, userVersion } from "@/lib/cache";
import { check, db, limit, name, uuid } from "./shared";

export const employees = {
  inviteEmployee: defineAction({
    accept: "form",
    // `person` es lo escrito en el campo (nombre o correo). Si se eligió a alguien de las sugerencias encontrado
    // por nombre, llega `personId` y se invita por su cuenta; si no, `person` tiene que ser un correo completo.
    input: z
      .object({
        businessId: uuid,
        branchId: uuid,
        shiftId: z.uuid("Elige un turno"),
        person: z.string().trim().min(1, "Escribe su nombre o su correo").max(160),
        personId: z.union([uuid, z.literal("")]).optional(),
        jobTitle: name(60, "Escribe el puesto"),
      })
      .superRefine((v, ctx) => {
        if (!v.personId && !z.email().safeParse(v.person).success)
          ctx.addIssue({ code: "custom", path: ["person"], message: "Elige a la persona de la lista o escribe su correo completo." });
      }),
    handler: async ({ businessId, branchId, shiftId, person, personId, jobTitle }, context) => {
      const sb = db(context);
      // Invitar a un correo sin cuenta manda un correo: el límite evita usar la app para mandar spam.
      await limit(context, "invite", 10, 60 * 60);
      const { data: shift } = await sb.from("shifts").select("branch_id").eq("id", shiftId).single();
      if (shift?.branch_id !== branchId)
        throw new ActionError({ code: "BAD_REQUEST", message: "Ese turno es de otra sucursal. Elige uno de la sucursal seleccionada." });
      // La invitación queda pendiente hasta que la persona la acepte desde su bandeja. Con cuenta, le llega el aviso;
      // sin cuenta, la base le manda el correo de invitación (send-invite) y el aviso llega al crear la cuenta.
      // Por cuenta, el correo va vacío y lo completa la base (private.link_invited_employee): la dueña no lo conoce.
      const { error } = await sb
        .from("employees")
        .insert({
          business_id: businessId,
          branch_id: branchId,
          shift_id: shiftId,
          ...(personId ? { person_id: personId, email: "" } : { email: person.toLowerCase() }),
          job_title: jobTitle,
        })
        .select("id")
        .single();
      check(error, "Esa persona ya está en tu equipo.");
      return { ok: true };
    },
  }),

  /**
   * Sugerencias de cuentas al escribir el nombre o el correo de quien se invita. La base acota quién puede buscar
   * y qué ve: por nombre, el correo llega enmascarado (`byEmail: false`).
   */
  searchPeople: defineAction({
    input: z.object({ businessId: uuid, query: z.string().trim().max(120), page: z.number().int().min(1).max(1000).default(1) }),
    handler: async ({ businessId, query, page }, context) => {
      if (query.length < 3) return { people: [], total: 0, page };
      // El límite evita recorrer las cuentas de todos a fuerza de búsquedas.
      await limit(context, "search", 30, 60);
      const { data, error } = await db(context).rpc("search_people", { p_business: businessId, p_query: query, p_page: page });
      check(error);
      return {
        // La base devuelve 5 por página y el total en cada fila.
        people: (data ?? []).map((p) => ({
          id: p.id,
          email: p.email,
          byEmail: p.by_email,
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

  /** Pedir unirse a un negocio de Buscar. La base revisa que esté en la lista y que la persona no esté ya. */
  requestJoin: defineAction({
    accept: "form",
    input: z.object({
      businessId: uuid,
      branchId: z.union([uuid, z.literal("")]).optional().transform((v) => v || undefined),
      message: z.string().trim().max(300, "Usa 300 caracteres o menos").nullish().transform((v) => v || undefined),
    }),
    handler: async ({ businessId, branchId, message }, context) => {
      // Cada pedido le llega a la dueña como aviso y push: el límite evita usarlo para molestar.
      await limit(context, "join", 10, 60 * 60);
      const { error } = await db(context).rpc("request_join", { p_business: businessId, p_branch: branchId, p_message: message });
      check(error);
      return { ok: true };
    },
  }),

  /** La dueña responde: al aceptar elige sucursal, turno y puesto, y la persona entra activa al equipo. */
  answerJoin: defineAction({
    accept: "form",
    input: z
      .object({
        requestId: uuid,
        accept: z.enum(["true", "false"]).transform((v) => v === "true"),
        branchId: z.union([uuid, z.literal("")]).optional(),
        shiftId: z.union([uuid, z.literal("")]).optional(),
        jobTitle: z.string().trim().max(60).nullish(),
      })
      .superRefine((v, ctx) => {
        if (!v.accept) return;
        if (!v.branchId) ctx.addIssue({ code: "custom", path: ["branchId"], message: "Elige una sucursal" });
        if (!v.shiftId) ctx.addIssue({ code: "custom", path: ["shiftId"], message: "Elige un turno" });
        if (!v.jobTitle) ctx.addIssue({ code: "custom", path: ["jobTitle"], message: "Escribe el puesto" });
      }),
    handler: async ({ requestId, accept, branchId, shiftId, jobTitle }, context) => {
      const sb = db(context);
      const { data: request } = await sb.from("join_requests").select("business_id, person_id").eq("id", requestId).maybeSingle();
      const { error } = await sb.rpc("answer_join", {
        p_request: requestId,
        p_accept: accept,
        p_branch: branchId || undefined,
        p_shift: shiftId || undefined,
        p_job_title: jobTitle ?? undefined,
      });
      check(error);
      // A la persona le aparece el negocio sin esperar a que venza su sesión en caché.
      if (request && accept) await Promise.all([bump(businessVersion(request.business_id)), bump(userVersion(request.person_id))]);
      return { ok: true };
    },
  }),

  markNotificationsRead: defineAction({
    accept: "form",
    // Sin `id`, marca todos; con `id` repetido, solo esos (los que se vieron en la bandeja).
    input: z.object({ id: z.array(uuid).max(100).optional() }),
    handler: async ({ id }, context) => {
      let query = db(context).from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
      if (id?.length) query = query.in("id", id);
      const { error } = await query;
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
      // Los pedidos para unirse sin responder, también: el aviso es lo que lleva a la dueña a responderlos.
      const [invites, joins] = await Promise.all([
        sb.from("notifications").select("id, employee:employees!inner(status)").eq("employee.status", "invitado"),
        sb.from("notifications").select("id, join:join_requests!inner(status)").eq("join.status", "pendiente"),
      ]);
      check(invites.error ?? joins.error);
      const keep = [...(invites.data ?? []), ...(joins.data ?? [])].map((n) => n.id);
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
      // Invitar a un correo sin cuenta manda un correo: el límite evita usar la app para mandar spam.
      await limit(context, "invite", 10, 60 * 60);
      const { data: shift } = await sb.from("shifts").select("branch_id").eq("id", shiftId).single();
      if (shift?.branch_id !== branchId)
        throw new ActionError({ code: "BAD_REQUEST", message: "Ese turno es de otra sucursal. Elige uno de la sucursal seleccionada." });
      const { error } = await sb.from("employees").update({ branch_id: branchId, shift_id: shiftId }).eq("id", id).select("id").single();
      check(error);
      return { ok: true };
    },
  }),

  /** La dueña pasa el negocio a alguien del equipo; ella queda en su lugar (private.transfer_ownership). */
  transferOwnership: defineAction({
    accept: "form",
    input: z.object({ id: uuid }),
    handler: async ({ id }, context) => {
      check((await db(context).rpc("transfer_ownership", { p_employee: id })).error);
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
