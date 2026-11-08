// La sesión de la persona: perfil, negocios a los que pertenece y bandeja de avisos.
// La carga el middleware una vez por petición (locals.session); las páginas la leen con estas funciones.
import { businessVersion, cached, userVersion } from "@/lib/cache";
import { today } from "@/lib/dates";
import type { Supabase } from "@/lib/supabase";
import { EMPLOYEE_COLUMNS, fail, toBranch, toBusiness, toEmployee, toPerson, toShift } from "./mappers";
import type { Branch, Business, Employee, Notification, Person, Shift } from "./types";

export type Role = "dueño" | "empleado";

export interface Membership {
  business: Business;
  role: Role;
  /** Sucursales a las que la persona tiene acceso en este negocio. */
  branches: Branch[];
  /** Su ficha de empleado, si trabaja ahí. */
  employee?: Employee;
}

export interface SessionData {
  user: Person;
  memberships: Membership[];
  /** Los avisos más recientes de la bandeja y cuántos hay sin leer en total. */
  notifications: Notification[];
  unread: number;
}

type Locals = App.Locals;

export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

/** Punto de partida al crear un negocio o una sucursal; la dueña los cambia en el mismo formulario. */
export const defaultShifts: { name: string; start: string; end: string; tone: Shift["tone"] }[] = [
  { name: "Mañana", start: "07:00", end: "14:00", tone: "morning" },
  { name: "Tarde", start: "14:00", end: "21:00", tone: "afternoon" },
  { name: "Noche", start: "21:00", end: "23:59", tone: "night" },
];

/** Perfil y negocios de la persona: los que tiene como dueña y en los que trabaja. */
export async function loadSession(sb: Supabase, userId: string): Promise<SessionData> {
  // Perfil y negocios cambian poco: van a la caché. Los avisos, siempre frescos.
  const rows = () =>
    Promise.all([
      sb.from("profiles").select("*").eq("id", userId).single(),
      sb.from("businesses").select("*, branches(*)").order("created_at"),
      sb.from("employees").select(EMPLOYEE_COLUMNS).eq("person_id", userId).eq("status", "activo"),
    ]).then(([profile, businesses, employments]) => {
      fail(profile.error);
      fail(businesses.error);
      fail(employments.error);
      return { profile: profile.data!, businesses: businesses.data ?? [], employments: employments.data ?? [] };
    });
  const [{ profile, businesses, employments }, inbox, unread] = await Promise.all([
    cached(`s:${userId}`, 600, rows, (r) => [userVersion(userId), ...r.businesses.map((b) => businessVersion(b.id))]),
    sb.from("notifications").select("*, employee:employees(status), reopen:reopen_requests(status), join:join_requests(status)").order("created_at", { ascending: false }).limit(60),
    sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  fail(inbox.error);
  fail(unread.error);

  const memberships = businesses.map(({ branches, ...b }): Membership => {
    const employee = employments.find((e) => e.business_id === b.id);
    const owner = b.owner_id === userId;
    // El cron baja el plan a Gratis una vez al día; mientras tanto, vencido ya cuenta como Gratis (como en la base).
    const expired = b.plan_until !== null && b.plan_until < today();
    return {
      business: {
        ...toBusiness(b),
        plan: expired ? "Gratis" : b.plan,
        planUntil: expired ? undefined : (b.plan_until ?? undefined),
        trial: (!expired && b.trial) || undefined,
      },
      role: owner ? "dueño" : "empleado",
      branches: branches
        .filter((br) => owner || br.id === employee?.branch_id)
        .sort((x, y) => x.created_at.localeCompare(y.created_at))
        .map(toBranch),
      employee: employee && toEmployee(employee),
    };
  });
  // Primero los negocios propios, después donde trabaja.
  memberships.sort((a, b) => (a.role === b.role ? 0 : a.role === "dueño" ? -1 : 1));
  // Los avisos guardan el nombre de la sucursal, no su id: se busca entre las que ves en ese negocio.
  // shortcut: si la sucursal cambió de nombre después del aviso, ese aviso lleva al negocio; guardar branch_id en notifications si molesta.
  const branchOf = (businessId: string | null, name: unknown) =>
    typeof name === "string" ? memberships.find((m) => m.business.id === businessId)?.branches.find((b) => b.name === name)?.id : undefined;
  const notifications = (inbox.data ?? []).map(
    (n) =>
      ({
        id: n.id,
        kind: n.kind,
        businessId: n.business_id ?? undefined,
        branchId: branchOf(n.business_id, (n.data as { branch?: unknown } | null)?.branch),
        createdAt: n.created_at,
        read: n.read_at !== null,
        data: n.data,
        employeeId: n.employee_id ?? undefined,
        requestId: n.reopen_request_id ?? n.join_request_id ?? undefined,
        pending:
          n.kind === "reopen_request" || n.kind === "reopen_sent"
            ? n.reopen?.status === "pendiente"
            : n.kind === "join_request"
              ? n.join?.status === "pendiente"
              : n.employee?.status === "invitado",
      }) as unknown as Notification,
  );
  return { user: toPerson(profile), memberships, notifications, unread: unread.count ?? 0 };
}

const session = (locals: Locals) => {
  if (!locals.session) throw new Error("Sin sesión: el middleware carga la sesión en /app");
  return locals.session;
};

export const currentUser = (locals: Locals) => session(locals).user;
export const myBusinesses = (locals: Locals) => session(locals).memberships;
export const inbox = (locals: Locals) => ({ notifications: session(locals).notifications, unread: session(locals).unread });
export const membership = (locals: Locals, businessSlug: string) => myBusinesses(locals).find((m) => m.business.slug === businessSlug);

/** Para /app/cuenta: el perfil, si tiene la verificación en dos pasos activa y si entra con contraseña o solo con Google. */
export async function accountSettings(locals: Locals) {
  const [{ data: factors }, { data: user }] = await Promise.all([locals.supabase.auth.mfa.listFactors(), locals.supabase.auth.getUser()]);
  // Donde trabaja como empleada: puede cambiar su turno entre los vigentes de su sucursal.
  const jobs = myBusinesses(locals).filter((m) => m.role === "empleado" && m.employee && m.branches[0]);
  const { data: shiftRows } = jobs.length
    ? await locals.supabase.from("shifts").select("*").in("branch_id", jobs.map((m) => m.branches[0].id)).is("archived_at", null).order("start_time")
    : { data: [] };
  return {
    user: session(locals).user,
    jobs: jobs.map((m) => ({
      business: m.business,
      branch: m.branches[0],
      employee: m.employee!,
      shifts: (shiftRows ?? []).filter((s) => s.branch_id === m.branches[0].id).map(toShift),
    })),
    totpFactorId: factors?.totp[0]?.id,
    hasPassword: user.user?.identities?.some((i) => i.provider === "email") ?? false,
  };
}
