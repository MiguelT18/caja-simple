// Datos de una página de sucursal y de su barra del turno.
import { businessVersion, cached } from "@/lib/cache";
import { inShiftWindow, lastWeek, minutesUntilOpen, openFrom, today } from "@/lib/dates";
import { cents, shiftCash, sum, totalsBy } from "./cash";
import { EMPLOYEE_COLUMNS, fail, toCatalogProduct, toEmployee, toShift } from "./mappers";
import { branchHref } from "./routes";
import { membership, type Membership } from "./session";
import { closesOf, headerBackdrop, imageUrls, lastCount, movements } from "./shared";
import type { Category, DaySummary, Product, Sale, ShiftClose } from "./types";

/** Todo lo que necesita una página de sucursal, ya filtrado a esa sucursal. null si no hay acceso. */
/** `range` (ver parseRange) cambia el historial de ventas y gastos; sin él, los últimos 7 días. */
export async function branchContext(locals: App.Locals, businessSlug: string, branchSlug: string, range?: { from: string; to: string }) {
  const m = membership(locals, businessSlug);
  const branch = m?.branches.find((br) => br.slug === branchSlug);
  if (!m || !branch) return null;
  const sb = locals.supabase;
  const day = today();
  const week = lastWeek(day);

  // Turnos, equipo y categorías cambian poco: van a la caché. Stock, cierres y movimientos, siempre frescos.
  const slow = () =>
    Promise.all([
      sb.from("shifts").select("*").eq("branch_id", branch.id).order("start_time"),
      sb.from("employees").select(EMPLOYEE_COLUMNS).eq("branch_id", branch.id).order("created_at"),
      sb.from("categories").select("id, name").eq("business_id", m.business.id).order("name"),
    ]).then(([shifts, staff, categories]) => {
      fail(shifts.error);
      fail(staff.error);
      fail(categories.error);
      return { shifts: shifts.data ?? [], staff: staff.data ?? [], categories: categories.data ?? [] };
    });
  const [rows, inventory, [closes, moves], soldItems, history, previous, backdrop, reopenRows] = await Promise.all([
    cached(`br:${locals.userId}:${branch.id}`, 600, slow, () => [businessVersion(m.business.id)]),
    sb.from("inventory").select("price, stock, min_stock, products(*, categories(name))").eq("branch_id", branch.id),
    // Desde el día del turno abierto si es más viejo que la semana: su esperado se calcula con sus movimientos.
    closesOf(sb, [branch.id], day).then(async (closes) => {
      const openDates = closes.filter((c) => c.status === "en-curso").map((c) => c.business_date);
      const from = [week[0], ...openDates].sort()[0];
      return [closes, await movements(sb, [branch.id], from)] as const;
    }),
    sb
      .from("sale_items")
      .select("qty, unit_price, products(categories(name)), sales!inner(branch_id, business_date)")
      .eq("sales.branch_id", branch.id)
      .eq("sales.business_date", day),
    range ? movements(sb, [branch.id], range.from, range.to) : undefined,
    lastCount(sb, branch.id),
    // Foto del encabezado (PageHeader): junto con lo demás, sin sumar una vuelta a la base.
    headerBackdrop(locals, m, branch),
    // Pedidos de reapertura sin responder (RLS: los propios, o todos si es la dueña).
    sb.from("reopen_requests").select("close_id").eq("branch_id", branch.id).eq("status", "pendiente"),
  ]);
  fail(inventory.error);
  fail(reopenRows.error);
  /** Cierres con un pedido de reapertura esperando a la dueña. */
  const reopenPending = new Set((reopenRows.data ?? []).map((r) => r.close_id));
  fail(soldItems.error);
  const shiftRows = { data: rows.shifts };
  const staffRows = { data: rows.staff };
  const categoryRows = { data: rows.categories };

  const allShifts = (shiftRows.data ?? []).map(toShift);
  const shifts = allShifts.filter((s) => !s.archived);
  const images = await imageUrls(sb, (inventory.data ?? []).map((i) => i.products?.image_path ?? null));
  const products: Product[] = (inventory.data ?? [])
    .flatMap((i) => (i.products ? [{ ...toCatalogProduct(i.products, images), price: i.price === null ? null : Number(i.price), stock: i.stock, minStock: i.min_stock }] : []))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const categories: Category[] = categoryRows.data ?? [];
  const staff = (staffRows.data ?? []).map(toEmployee);

  const sales = moves.sales.filter((s) => s.date === day);
  const expenses = moves.expenses.filter((g) => g.date === day);

  // Incluye los turnos quitados: las ventas viejas los siguen nombrando.
  const shiftById = (id: string) => allShifts.find((s) => s.id === id)!;
  const productById = (id: string) => products.find((p) => p.id === id);

  const shiftTotals = (shiftId: string) => {
    const cash = shiftCash(closes, moves, shiftId, day);
    const close: ShiftClose = {
      shiftId,
      status: cash.row?.status ?? "pendiente",
      opening: cash.opening,
      difference: cash.row?.status === "cerrado" ? cents(Number(cash.row.counted) - cash.expected) : undefined,
    };
    return {
      close,
      closeId: cash.row?.id,
      openedOn: cash.date,
      openedAt: cash.row?.opened_at,
      sales: cash.sales,
      cash: cash.cash,
      expenses: cash.expenses,
      expected: cash.expected,
    };
  };

  /**
   * ¿Puede esta persona anular o editar el movimiento? Solo para mostrar los botones: la base decide
   * (la dueña siempre; quien lo registró, mientras ese turno sigue abierto).
   */
  const canCorrect = (mv: { recordedById: string | null; shiftId: string; date: string; voided: number | null }) =>
    mv.voided === null &&
    (m.role === "dueño" ||
      (mv.recordedById === locals.userId && closes.some((c) => c.status === "en-curso" && c.shift_id === mv.shiftId && c.business_date === mv.date)));

  /**
   * Comprobante de una venta por QR o transferencia: su enlace, si falta, y si esta persona lo puede adjuntar
   * (solo para mostrar el botón: la base decide; quien la registró o la dueña).
   */
  const receiptOf = (s: Sale, urls: Map<string, string>) => {
    const missing = s.payment !== "efectivo" && !s.receiptPath && s.voided === null;
    return {
      receipt: s.receiptPath ? urls.get(s.receiptPath) : undefined,
      missingReceipt: missing,
      canAttach: missing && (m.role === "dueño" || s.recordedById === locals.userId),
    };
  };

  const weekSummary: DaySummary[] = week.map((date) => ({
    date,
    sales: sum(moves.sales.filter((s) => s.date === date).map((s) => s.total)),
    expenses: sum(moves.expenses.filter((g) => g.date === date).map((g) => g.amount)),
  }));

  const salesByCategory = () =>
    totalsBy(
      (soldItems.data ?? []).map((item): [string, number] => [item.products?.categories?.name ?? "Sin categoría", item.qty * Number(item.unit_price)]),
    );

  // El turno abierto es el que se usa al registrar una venta o un gasto.
  const openClose = closes.find((c) => c.status === "en-curso");
  const currentShift = openClose ? shiftById(openClose.shift_id) : undefined;

  return {
    ...m,
    membership: m,
    backdrop,
    branch,
    today: day,
    shifts,
    currentShift,
    products,
    categories,
    employees: staff,
    sales,
    expenses,
    salesHistory: (history ?? moves).sales,
    expenseHistory: (history ?? moves).expenses,
    /** Lo contado en el último cierre de la sucursal: la apertura sugerida del siguiente turno. */
    lastCount: previous && { counted: previous.counted, shiftName: shiftById(previous.shiftId)?.name },
    salesTotal: sum(sales.map((s) => s.total)),
    expensesTotal: sum(expenses.map((g) => g.amount)),
    weekSummary,
    shiftById,
    productById,
    shiftTotals,
    reopenPending,
    canCorrect,
    receiptOf,
    salesByCategory,
  };
}

/** Lo que muestra la barra del turno (abajo, en toda página de sucursal): el turno abierto o cómo abrir uno. */
export function shiftBarData(ctx: NonNullable<Awaited<ReturnType<typeof branchContext>>>) {
  const href = (section: string) => branchHref(ctx.business, ctx.branch, section);
  const shift = ctx.currentShift;
  // La foto de la sucursal (la misma del encabezado) en el arte de la barra.
  const image = "image" in ctx.backdrop ? ctx.backdrop.image : undefined;
  if (!shift) {
    // La empleada ve solo su turno (si tiene); la dueña, todos. Se ofrece solo el que está en su horario: se abre o, si ya
    // se cerró hoy, se reabre (la dueña directo; la empleada lo pide y la dueña decide). Fuera de horario, desde cuándo.
    // La base decide igual (horario y turno propio): su error sale en un toast.
    const own = ctx.role !== "dueño" ? ctx.shifts.find((s) => s.id === ctx.membership.employee?.shiftId) : undefined;
    const candidates = own ? [own] : ctx.shifts;
    const now = candidates.find((s) => inShiftWindow(s));
    if (!now) {
      const next = [...candidates].sort((a, b) => minutesUntilOpen(a) - minutesUntilOpen(b)).at(0);
      return { branchName: ctx.branch.name, image, shiftsHref: href("turnos"), wait: next && { shiftName: next.name, from: openFrom(next) } };
    }
    const closed = ctx.shiftTotals(now.id);
    if (closed.close.status === "cerrado" && closed.closeId) {
      return {
        branchName: ctx.branch.name, image, shiftsHref: href("turnos"),
        reopen: { closeId: closed.closeId, shiftName: now.name, pending: ctx.reopenPending.has(closed.closeId), direct: ctx.role === "dueño" },
      };
    }
    return {
      branchName: ctx.branch.name, image, shiftsHref: href("turnos"),
      open: {
        branchId: ctx.branch.id,
        shifts: [{ id: now.id, name: now.name, start: now.start, end: now.end, selected: true }],
        opening: ctx.lastCount?.counted,
      },
    };
  }
  const totals = ctx.shiftTotals(shift.id);
  return {
    branchName: ctx.branch.name,
    image,
    shiftsHref: href("turnos"),
    saleHref: href("registrar-venta"),
    shift: { name: shift.name, tone: shift.tone, start: shift.start, end: shift.end },
    openedOn: totals.openedOn,
    // Un turno olvidado: más de 24 h abierto.
    stale: !!totals.openedAt && Date.now() - Date.parse(totals.openedAt) > 24 * 60 * 60 * 1000,
    opening: totals.close.opening,
    sales: totals.sales,
    cash: totals.cash,
    expenses: totals.expenses,
    expected: totals.expected,
  };
}

export type ShiftBarData = ReturnType<typeof shiftBarData>;

/** Quién trabaja en la sucursal: la dueña primero y las empleadas activas, sin correos (private.branch_team). */
export async function branchTeam(locals: App.Locals, m: Membership, branchId: string) {
  const rows = await cached(
    `team:${locals.userId}:${branchId}`,
    600,
    async () => {
      const { data, error } = await locals.supabase.rpc("branch_team", { p_branch: branchId });
      fail(error);
      return data ?? [];
    },
    () => [businessVersion(m.business.id)],
  );
  return rows.map((r) => ({
    personId: r.person_id,
    firstName: r.first_name,
    lastName: r.last_name,
    avatarUrl: r.avatar_url ?? undefined,
    jobTitle: r.job_title ?? "",
    shiftId: r.shift_id ?? undefined,
    isOwner: r.is_owner,
  }));
}
