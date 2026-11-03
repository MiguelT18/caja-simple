// Datos de una página de sucursal y de su barra del turno.
import { businessVersion, cached } from "@/lib/cache";
import { lastWeek, today } from "@/lib/dates";
import { cents, shiftCash, sum, totalsBy } from "./cash";
import { EMPLOYEE_COLUMNS, fail, toCatalogProduct, toEmployee, toShift } from "./mappers";
import { branchHref } from "./routes";
import { membership } from "./session";
import { closesOf, imageUrls, movements } from "./shared";
import type { Category, DaySummary, Product, ShiftClose } from "./types";

/** Todo lo que necesita una página de sucursal, ya filtrado a esa sucursal. null si no hay acceso. */
export async function branchContext(locals: App.Locals, businessSlug: string, branchSlug: string) {
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
  const [rows, inventory, closes, moves, soldItems] = await Promise.all([
    cached(`br:${locals.userId}:${branch.id}`, 600, slow, () => [businessVersion(m.business.id)]),
    sb.from("inventory").select("price, stock, min_stock, products(*, categories(name))").eq("branch_id", branch.id),
    closesOf(sb, [branch.id], day),
    movements(sb, [branch.id], week[0]),
    sb
      .from("sale_items")
      .select("qty, unit_price, products(categories(name)), sales!inner(branch_id, business_date)")
      .eq("sales.branch_id", branch.id)
      .eq("sales.business_date", day),
  ]);
  fail(inventory.error);
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
    return { close, closeId: cash.row?.id, openedOn: cash.date, sales: cash.sales, expenses: cash.expenses, expected: cash.expected };
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
    branch,
    today: day,
    shifts,
    currentShift,
    products,
    categories,
    employees: staff,
    sales,
    expenses,
    salesHistory: moves.sales,
    expenseHistory: moves.expenses,
    salesTotal: sum(sales.map((s) => s.total)),
    expensesTotal: sum(expenses.map((g) => g.amount)),
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
    opening: totals.close.opening,
    sales: totals.sales,
    expenses: totals.expenses,
    expected: totals.expected,
  };
}

export type ShiftBarData = ReturnType<typeof shiftBarData>;
