// Única entrada a los datos para las páginas de /app. Ver docs/modelo-de-datos.md.
// Todas las consultas usan el cliente de Supabase de la persona: RLS decide qué filas ve.
import type { Supabase } from "@/lib/supabase";
import type {
  Branch,
  Business,
  CatalogProduct,
  Category,
  DaySummary,
  Employee,
  Expense,
  Notification,
  Person,
  Product,
  Recorder,
  Sale,
  Shift,
  ShiftClose,
} from "./types";

export type Role = "dueño" | "empleado";

/** Punto de partida al crear un negocio o una sucursal; la dueña los cambia en el mismo formulario. */
export const defaultShifts: { name: string; start: string; end: string; tone: Shift["tone"] }[] = [
  { name: "Mañana", start: "07:00", end: "14:00", tone: "morning" },
  { name: "Tarde", start: "14:00", end: "21:00", tone: "afternoon" },
  { name: "Noche", start: "21:00", end: "23:59", tone: "night" },
];

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
export const isLowStock = (p: { stock: number; minStock: number }) => p.stock <= p.minStock;
export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

// Fechas: el día del negocio se cuenta en hora de Bolivia (igual que private.today() en la base).
const TIME_ZONE = "America/La_Paz";
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
const clock = (iso: string) =>
  new Intl.DateTimeFormat("es-BO", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
/** Los 7 días que terminan hoy, del más antiguo al más reciente. */
const lastWeek = (end: string) => Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));

// Conversión de filas ------------------------------------------------------

type Tables = import("@/lib/database.types").Database["public"]["Tables"];
type Row<T extends keyof Tables> = Tables[T]["Row"];

const toBusiness = (b: Row<"businesses">): Business => ({ id: b.id, slug: b.slug, name: b.name, ownerId: b.owner_id, plan: b.plan });
const toBranch = (b: Row<"branches">): Branch => ({
  id: b.id,
  businessId: b.business_id,
  slug: b.slug,
  name: b.name,
  address: b.address,
  imagePath: b.image_path ?? undefined,
});
const toShift = (s: Row<"shifts">): Shift => ({
  id: s.id,
  branchId: s.branch_id,
  name: s.name,
  start: s.start_time.slice(0, 5),
  end: s.end_time.slice(0, 5),
  tone: s.tone,
  archived: s.archived_at !== null,
});
// El nombre es de la persona: se trae de su perfil con el empleado.
const EMPLOYEE_COLUMNS = "*, profile:profiles(first_name, last_name)";
type EmployeeRow = Row<"employees"> & { profile: { first_name: string; last_name: string } | null };

export const toEmployee = (e: EmployeeRow): Employee => ({
  id: e.id,
  businessId: e.business_id,
  branchId: e.branch_id,
  shiftId: e.shift_id ?? undefined,
  personId: e.person_id ?? undefined,
  email: e.email,
  firstName: e.profile?.first_name || e.email,
  lastName: e.profile?.last_name ?? "",
  jobTitle: e.job_title,
  status: e.status,
});
const toPerson = (p: Row<"profiles">): Person => ({
  id: p.id,
  firstName: p.first_name,
  lastName: p.last_name,
  email: p.email,
  avatarUrl: p.avatar_url ?? undefined,
});

function fail(error: { message: string } | null) {
  if (error) throw new Error(`Error al consultar la base de datos: ${error.message}`);
}

// Sesión -------------------------------------------------------------------

/** Perfil y negocios de la persona: los que tiene como dueña y en los que trabaja. */
export async function loadSession(sb: Supabase, userId: string): Promise<SessionData> {
  const [profile, businesses, employments, inbox, unread] = await Promise.all([
    sb.from("profiles").select("*").eq("id", userId).single(),
    sb.from("businesses").select("*, branches(*)").order("created_at"),
    sb.from("employees").select(EMPLOYEE_COLUMNS).eq("person_id", userId).eq("status", "activo"),
    sb.from("notifications").select("*, employee:employees(status)").order("created_at", { ascending: false }).limit(20),
    sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  fail(profile.error);
  fail(businesses.error);
  fail(employments.error);
  fail(inbox.error);
  fail(unread.error);

  const memberships = (businesses.data ?? []).map(({ branches, ...b }): Membership => {
    const employee = employments.data?.find((e) => e.business_id === b.id);
    const owner = b.owner_id === userId;
    return {
      business: toBusiness(b),
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
  const notifications = (inbox.data ?? []).map(
    (n) =>
      ({
        id: n.id,
        kind: n.kind,
        createdAt: n.created_at,
        read: n.read_at !== null,
        data: n.data,
        employeeId: n.employee_id ?? undefined,
        pending: n.employee?.status === "invitado",
      }) as Notification,
  );
  return { user: toPerson(profile.data!), memberships, notifications, unread: unread.count ?? 0 };
}

const session = (locals: Locals) => {
  if (!locals.session) throw new Error("Sin sesión: el middleware carga la sesión en /app");
  return locals.session;
};

export const currentUser = (locals: Locals) => session(locals).user;
export const myBusinesses = (locals: Locals) => session(locals).memberships;
export const inbox = (locals: Locals) => ({ notifications: session(locals).notifications, unread: session(locals).unread });

/** Para /app/cuenta: el perfil, si tiene la verificación en dos pasos activa y si entra con contraseña o solo con Google. */
export async function accountSettings(locals: Locals) {
  const [{ data: factors }, { data: user }] = await Promise.all([locals.supabase.auth.mfa.listFactors(), locals.supabase.auth.getUser()]);
  return {
    user: session(locals).user,
    totpFactorId: factors?.totp[0]?.id,
    hasPassword: user.user?.identities?.some((i) => i.provider === "email") ?? false,
  };
}
export const membership = (locals: Locals, businessSlug: string) =>
  myBusinesses(locals).find((m) => m.business.slug === businessSlug);

// Rutas

export const businessHref = (b: Business) => `/app/${b.slug}`;
export const branchHref = (b: Business, br: Branch, section = "") => `/app/${b.slug}/sucursales/${br.slug}${section && `/${section}`}`;

/** Dónde entra cada rol: la dueña al resumen del negocio; la empleada a registrar venta en su sucursal. */
export const entryHref = (m: Membership) =>
  m.role === "dueño" || !m.branches[0] ? businessHref(m.business) : branchHref(m.business, m.branches[0], "registrar-venta");

/** Secciones de sucursal que ve cada rol ("" es el resumen de la sucursal). */
export const branchSections = (role: Role) =>
  role === "dueño" ? ["", "registrar-venta", "gastos", "inventario", "turnos"] : ["registrar-venta", "gastos", "inventario", "turnos"];

// Consultas compartidas ----------------------------------------------------

const totalsBy = (pairs: [string, number][]) => {
  const totals = new Map<string, number>();
  for (const [key, value] of pairs) totals.set(key, (totals.get(key) ?? 0) + value);
  return [...totals].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
};

export const expensesByCategory = (list: Expense[]) => totalsBy(list.map((g) => [g.category, g.amount]));

/** Nombres de quienes registraron movimientos. RLS solo deja ver a quien comparte negocio. */
async function recorders(sb: Supabase, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const map = new Map<string, Recorder>();
  if (unique.length === 0) return map;
  const { data, error } = await sb.from("profiles").select("id, first_name, last_name").in("id", unique);
  fail(error);
  for (const p of data ?? []) map.set(p.id, { firstName: p.first_name, lastName: p.last_name });
  return map;
}
const unknownRecorder: Recorder = { firstName: "—", lastName: "" };

/** URL firmada para cada foto (los buckets son privados). */
async function imageUrls(sb: Supabase, paths: (string | null | undefined)[], bucket = "product-images") {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  const map = new Map<string, string>();
  if (list.length === 0) return map;
  const { data } = await sb.storage.from(bucket).createSignedUrls(list, 60 * 60);
  for (const item of data ?? []) if (item.signedUrl && item.path) map.set(item.path, item.signedUrl);
  return map;
}

/** Fotos de las fachadas de un negocio (enlaces firmados por una hora), por id de sucursal. Solo pide las que tienen foto. */
export async function branchImages(locals: Locals, m: Membership) {
  const urls = await imageUrls(locals.supabase, m.branches.map((b) => b.imagePath), "branch-images");
  return new Map(m.branches.flatMap((b) => (b.imagePath && urls.has(b.imagePath) ? [[b.id, urls.get(b.imagePath)!]] : [])));
}

/** Ventas y gastos de los últimos 7 días en esas sucursales. */
async function movements(sb: Supabase, branchIds: string[], from: string) {
  const [sales, expenses] = await Promise.all([
    sb.from("sale_totals").select("*").in("branch_id", branchIds).gte("business_date", from).order("occurred_at", { ascending: false }),
    sb.from("expenses").select("*").in("branch_id", branchIds).gte("business_date", from).order("occurred_at", { ascending: false }),
  ]);
  fail(sales.error);
  fail(expenses.error);
  const people = await recorders(sb, [...(sales.data ?? []), ...(expenses.data ?? [])].map((m) => m.recorded_by));

  const saleList: Sale[] = (sales.data ?? []).map((s) => ({
    id: s.sale_id,
    branchId: s.branch_id,
    date: s.business_date,
    time: clock(s.occurred_at),
    shiftId: s.shift_id,
    recordedBy: (s.recorded_by && people.get(s.recorded_by)) || unknownRecorder,
    items: s.items ?? 0,
    total: Number(s.total ?? 0),
  }));
  const expenseList: Expense[] = (expenses.data ?? []).map((g) => ({
    id: g.id,
    branchId: g.branch_id,
    date: g.business_date,
    time: clock(g.occurred_at),
    shiftId: g.shift_id,
    recordedBy: (g.recorded_by && people.get(g.recorded_by)) || unknownRecorder,
    concept: g.concept,
    category: g.category,
    amount: Number(g.amount),
  }));
  return { sales: saleList, expenses: expenseList };
}

/** Cierres de hoy y los que siguen abiertos de otro día (un turno nocturno abierto ayer). */
async function closesOf(sb: Supabase, branchIds: string[], date: string) {
  const { data, error } = await sb
    .from("shift_closes")
    .select("*")
    .in("branch_id", branchIds)
    .or(`business_date.eq.${date},status.eq.en-curso`);
  fail(error);
  return data ?? [];
}

type CloseRow = Row<"shift_closes">;

const cashStatus = (closes: CloseRow[], expectedOf: (shiftId: string) => number): "cuadra" | "descuadre" | "en-curso" | "sin-abrir" => {
  if (closes.length === 0) return "sin-abrir";
  if (closes.some((c) => c.status === "cerrado" && Number(c.counted) !== expectedOf(c.shift_id))) return "descuadre";
  return closes.some((c) => c.status === "en-curso") ? "en-curso" : "cuadra";
};

// Sucursal -----------------------------------------------------------------

/** Todo lo que necesita una página de sucursal, ya filtrado a esa sucursal. null si no hay acceso. */
export async function branchContext(locals: Locals, businessSlug: string, branchSlug: string) {
  const m = membership(locals, businessSlug);
  const branch = m?.branches.find((br) => br.slug === branchSlug);
  if (!m || !branch) return null;
  const sb = locals.supabase;
  const day = today();
  const week = lastWeek(day);

  const [shiftRows, inventory, staffRows, categoryRows, closes, moves, soldItems] = await Promise.all([
    sb.from("shifts").select("*").eq("branch_id", branch.id).order("start_time"),
    sb.from("inventory").select("price, stock, min_stock, products(*, categories(name))").eq("branch_id", branch.id),
    sb.from("employees").select(EMPLOYEE_COLUMNS).eq("branch_id", branch.id).order("created_at"),
    sb.from("categories").select("id, name").eq("business_id", m.business.id).order("name"),
    closesOf(sb, [branch.id], day),
    movements(sb, [branch.id], week[0]),
    sb
      .from("sale_items")
      .select("qty, unit_price, products(categories(name)), sales!inner(branch_id, business_date)")
      .eq("sales.branch_id", branch.id)
      .eq("sales.business_date", day),
  ]);
  fail(shiftRows.error);
  fail(inventory.error);
  fail(staffRows.error);
  fail(categoryRows.error);
  fail(soldItems.error);

  const allShifts = (shiftRows.data ?? []).map(toShift);
  const shifts = allShifts.filter((s) => !s.archived);
  const images = await imageUrls(sb, (inventory.data ?? []).map((i) => i.products?.image_path ?? null));
  const products: Product[] = (inventory.data ?? [])
    .filter((i) => i.products)
    .map((i) => {
      const p = i.products!;
      return {
        id: p.id,
        name: p.name,
        categoryId: p.category_id ?? undefined,
        category: p.categories?.name,
        barcode: p.barcode ?? undefined,
        image: p.image_path ? images.get(p.image_path) : undefined,
        price: Number(i.price),
        stock: i.stock,
        minStock: i.min_stock,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const categories: Category[] = categoryRows.data ?? [];
  const staff = (staffRows.data ?? []).map(toEmployee);

  const sales = moves.sales.filter((s) => s.date === day);
  const expenses = moves.expenses.filter((g) => g.date === day);
  const salesTotal = sum(sales.map((s) => s.total));
  const expensesTotal = sum(expenses.map((g) => g.amount));

  // Incluye los turnos quitados: las ventas viejas los siguen nombrando.
  const shiftById = (id: string) => allShifts.find((s) => s.id === id)!;
  const productById = (id: string) => products.find((p) => p.id === id);

  const shiftTotals = (shiftId: string) => {
    // El abierto (aunque sea de ayer) manda; si no, el de hoy. Sus movimientos son los de su día.
    const row = closes.find((c) => c.shift_id === shiftId && c.status === "en-curso") ?? closes.find((c) => c.shift_id === shiftId && c.business_date === day);
    const date = row?.business_date ?? day;
    const salesOfShift = sum(moves.sales.filter((s) => s.shiftId === shiftId && s.date === date).map((s) => s.total));
    const expensesOfShift = sum(moves.expenses.filter((g) => g.shiftId === shiftId && g.date === date).map((g) => g.amount));
    const opening = Number(row?.opening ?? 0);
    const expected = opening + salesOfShift - expensesOfShift;
    const close: ShiftClose = {
      shiftId,
      status: row?.status ?? "pendiente",
      opening,
      difference: row?.status === "cerrado" ? Number(row.counted) - expected : undefined,
    };
    return { close, closeId: row?.id, openedOn: date, sales: salesOfShift, expenses: expensesOfShift, expected };
  };

  const weekSummary: DaySummary[] = week.map((date) => ({
    date,
    sales: sum(moves.sales.filter((s) => s.date === date).map((s) => s.total)),
    expenses: sum(moves.expenses.filter((g) => g.date === date).map((g) => g.amount)),
  }));

  const salesByCategory = () =>
    totalsBy(
      (soldItems.data ?? []).map((item): [string, number] => [
        item.products?.categories?.name ?? "Sin categoría",
        item.qty * Number(item.unit_price),
      ]),
    );

  // El turno abierto es el que se usa al registrar una venta o un gasto.
  const openClose = closes.find((c) => c.status === "en-curso");
  const currentShift = openClose ? shiftById(openClose.shift_id) : undefined;

  return {
    ...m,
    membership: m,
    branch,
    today: day,
    shifts,
    currentShift,
    products,
    categories,
    employees: staff,
    sales,
    expenses,
    expenseHistory: moves.expenses,
    salesTotal,
    expensesTotal,
    weekSummary,
    shiftById,
    productById,
    shiftTotals,
    salesByCategory,
  };
}

/** Lo que muestra la barra del turno (abajo, en toda página de sucursal): el turno abierto o cómo abrir uno. */
export function shiftBarData(ctx: NonNullable<Awaited<ReturnType<typeof branchContext>>>) {
  const href = (section: string) => branchHref(ctx.business, ctx.branch, section);
  const shift = ctx.currentShift;
  if (!shift) return { branchName: ctx.branch.name, shiftsHref: href("turnos") };
  const totals = ctx.shiftTotals(shift.id);
  return {
    branchName: ctx.branch.name,
    shiftsHref: href("turnos"),
    saleHref: href("registrar-venta"),
    shift: { name: shift.name, tone: shift.tone, start: shift.start, end: shift.end },
    openedOn: totals.openedOn,
    sales: totals.sales,
    expected: totals.expected,
  };
}

export type ShiftBarData = ReturnType<typeof shiftBarData>;

/** Color de una sucursal: el mismo que en «Sucursales» (por su orden en el negocio). */
export const branchColor = (m: Membership, branchId: string) =>
  `var(--color-branch-${(Math.max(0, m.branches.findIndex((b) => b.id === branchId)) % 6) + 1})`;

// Negocio ------------------------------------------------------------------

export interface CatalogEntry extends Omit<CatalogProduct, "businessId"> {
  /** En qué sucursales se vende, con su stock ahí. */
  soldIn: { branchId: string; branch: string; price: number; stock: number; minStock: number; low: boolean }[];
}

/** Todo lo que necesita una página del negocio (solo dueña). null si no es dueña. */
export async function businessContext(locals: Locals, businessSlug: string) {
  const m = membership(locals, businessSlug);
  if (!m || m.role !== "dueño") return null;
  const sb = locals.supabase;
  const { business } = m;
  const branchIds = m.branches.map((b) => b.id);
  const day = today();

  const [shiftRows, productRows, categoryRows, inventory, staffRows, closes, moves, branchImages] = await Promise.all([
    sb.from("shifts").select("*").in("branch_id", branchIds).order("start_time"),
    sb.from("products").select("*, categories(name)").eq("business_id", business.id).order("name"),
    sb.from("categories").select("id, name").eq("business_id", business.id).order("name"),
    sb.from("inventory").select("*").eq("business_id", business.id),
    sb.from("employees").select(EMPLOYEE_COLUMNS).eq("business_id", business.id).order("created_at"),
    closesOf(sb, branchIds, day),
    // Desde ayer: un turno nocturno abierto ayer sigue sumando a su caja.
    movements(sb, branchIds, addDays(day, -1)),
    imageUrls(sb, m.branches.map((b) => b.imagePath), "branch-images"),
  ]);
  fail(shiftRows.error);
  fail(productRows.error);
  fail(categoryRows.error);
  fail(inventory.error);
  fail(staffRows.error);

  const shifts = (shiftRows.data ?? []).map(toShift).filter((s) => !s.archived);
  const staff = (staffRows.data ?? []).map(toEmployee);
  const stock = inventory.data ?? [];

  const branchSummary = m.branches.map((branch) => {
    const branchSales = moves.sales.filter((s) => s.branchId === branch.id);
    const branchExpenses = moves.expenses.filter((g) => g.branchId === branch.id);
    const sales = branchSales.filter((s) => s.date === day);
    const expenses = branchExpenses.filter((g) => g.date === day);
    const expectedOf = (shiftId: string) => {
      const close = closes.find((c) => c.shift_id === shiftId && c.status === "en-curso") ?? closes.find((c) => c.shift_id === shiftId);
      const date = close?.business_date ?? day;
      return (
        Number(close?.opening ?? 0) +
        sum(branchSales.filter((s) => s.shiftId === shiftId && s.date === date).map((s) => s.total)) -
        sum(branchExpenses.filter((g) => g.shiftId === shiftId && g.date === date).map((g) => g.amount))
      );
    };
    return {
      branch,
      image: branch.imagePath ? branchImages.get(branch.imagePath) : undefined,
      href: branchHref(business, branch),
      employees: staff.filter((e) => e.branchId === branch.id).length,
      shifts: shifts.filter((s) => s.branchId === branch.id),
      sales: sum(sales.map((s) => s.total)),
      expenses: sum(expenses.map((g) => g.amount)),
      salesCount: sales.length,
      cash: cashStatus(
        closes.filter((c) => c.branch_id === branch.id),
        expectedOf,
      ),
      lowStock: stock.filter((i) => i.branch_id === branch.id && isLowStock({ stock: i.stock, minStock: i.min_stock })).length,
    };
  });

  const images = await imageUrls(sb, (productRows.data ?? []).map((p) => p.image_path));
  const catalog: CatalogEntry[] = (productRows.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    categoryId: p.category_id ?? undefined,
    category: p.categories?.name,
    barcode: p.barcode ?? undefined,
    image: p.image_path ? images.get(p.image_path) : undefined,
    soldIn: m.branches.flatMap((branch) => {
      const item = stock.find((i) => i.branch_id === branch.id && i.product_id === p.id);
      return item
        ? [
            {
              branchId: branch.id,
              branch: branch.name,
              price: Number(item.price),
              stock: item.stock,
              minStock: item.min_stock,
              low: isLowStock({ stock: item.stock, minStock: item.min_stock }),
            },
          ]
        : [];
    }),
  }));

  return {
    ...m,
    membership: m,
    branchSummary,
    catalog,
    categories: (categoryRows.data ?? []) as Category[],
    employees: staff,
    shifts,
    branchById: (id: string) => m.branches.find((b) => b.id === id),
    shiftById: (id?: string) => shifts.find((s) => s.id === id),
    salesTotal: sum(branchSummary.map((b) => b.sales)),
    expensesTotal: sum(branchSummary.map((b) => b.expenses)),
  };
}
