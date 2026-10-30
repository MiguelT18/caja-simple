// Única entrada a los datos para las páginas de /app. Ver docs/modelo-de-datos.md.
// shortcut: datos de ejemplo en memoria y sin control de acceso real; cuando exista backend,
// estas funciones consultan la base de datos y el rol se valida en el servidor.
import {
  branches,
  businesses,
  catalog,
  employees,
  expenseHistory,
  fullName,
  inventory,
  isLowStock,
  me,
  pastDates,
  pastSales,
  sales,
  shiftCloses,
  shifts,
  sum,
  TODAY,
  type Branch,
  type Business,
  type CatalogProduct,
  type DaySummary,
  type Employee,
  type Expense,
  type Product,
  type Sale,
} from "./mock";

export type Role = "dueño" | "empleado";

export interface Membership {
  business: Business;
  role: Role;
  /** Sucursales a las que la persona tiene acceso en este negocio. */
  branches: Branch[];
  /** Su ficha de empleado, si trabaja ahí. */
  employee?: Employee;
}

export const currentUser = () => me;

/** Negocios de la persona: los que tiene como dueña y en los que trabaja. */
export function myBusinesses(): Membership[] {
  const owned: Membership[] = businesses
    .filter((b) => b.ownerId === me.id)
    .map((business) => ({ business, role: "dueño", branches: branches.filter((br) => br.businessId === business.id) }));
  const employed: Membership[] = employees
    .filter((e) => e.personId === me.id && !owned.some((m) => m.business.id === e.businessId))
    .map((employee) => ({
      business: businesses.find((b) => b.id === employee.businessId)!,
      role: "empleado",
      branches: branches.filter((br) => br.id === employee.branchId),
      employee,
    }));
  return [...owned, ...employed];
}

export function membership(businessSlug: string): Membership {
  const m = myBusinesses().find((m) => m.business.slug === businessSlug);
  if (!m) throw new Error(`No tienes acceso al negocio «${businessSlug}»`);
  return m;
}

// Rutas

export const businessHref = (b: Business) => `/app/${b.slug}`;
export const branchHref = (b: Business, br: Branch, section = "") => `/app/${b.slug}/sucursales/${br.slug}${section && `/${section}`}`;

/** Dónde entra cada rol: la dueña al resumen del negocio; la empleada a registrar venta en su sucursal. */
export const entryHref = (m: Membership) =>
  m.role === "dueño" ? businessHref(m.business) : branchHref(m.business, m.branches[0], "registrar-venta");

/** Secciones de sucursal que ve cada rol ("" es el resumen de la sucursal). */
export const branchSections = (role: Role) =>
  role === "dueño" ? ["", "registrar-venta", "gastos", "inventario", "turnos"] : ["registrar-venta", "gastos", "inventario", "turnos"];

/** Para getStaticPaths: solo se generan las páginas que el rol puede ver. */
export const appPaths = {
  business: () => myBusinesses().filter((m) => m.role === "dueño").map((m) => ({ params: { negocio: m.business.slug } })),
  branch: (section: string) =>
    myBusinesses()
      .filter((m) => branchSections(m.role).includes(section))
      .flatMap((m) => m.branches.map((br) => ({ params: { negocio: m.business.slug, sucursal: br.slug } }))),
};

// Sucursal

const dayTotals = (branchId: string) => {
  const branchSales = sales.filter((s) => s.branchId === branchId);
  const prices = new Map(inventory.filter((i) => i.branchId === branchId).map((i) => [i.productId, i.price]));
  const saleTotal = (sale: Sale) => sum(sale.items.map((item) => (prices.get(item.productId) ?? 0) * item.qty));
  const todayExpenses = expenseHistory.filter((g) => g.branchId === branchId && g.date === TODAY);
  return {
    sales: branchSales,
    saleTotal,
    expenses: todayExpenses,
    salesTotal: sum(branchSales.map(saleTotal)),
    expensesTotal: sum(todayExpenses.map((g) => g.amount)),
  };
};

const cashStatus = (branchId: string): "cuadra" | "descuadre" | "en-curso" => {
  const closes = shiftCloses.filter((c) => c.branchId === branchId);
  if (closes.some((c) => c.status === "cerrado" && c.difference !== 0)) return "descuadre";
  return closes.some((c) => c.status === "en-curso") ? "en-curso" : "cuadra";
};

const totalsBy = (pairs: [string, number][]) => {
  const totals = new Map<string, number>();
  for (const [key, value] of pairs) totals.set(key, (totals.get(key) ?? 0) + value);
  return [...totals].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
};

export const expensesByCategory = (list: Expense[]) => totalsBy(list.map((g) => [g.category, g.amount]));

/** Todo lo que necesita una página de sucursal, ya filtrado a esa sucursal. */
export function branchContext(businessSlug: string, branchSlug: string) {
  const m = membership(businessSlug);
  const branch = m.branches.find((br) => br.slug === branchSlug);
  if (!branch) throw new Error(`No tienes acceso a la sucursal «${branchSlug}»`);

  const branchShifts = shifts.filter((s) => s.branchId === branch.id);
  const products: Product[] = inventory
    .filter((i) => i.branchId === branch.id)
    .map((i) => {
      const { businessId, ...product } = catalog.find((p) => p.id === i.productId)!;
      return { ...product, price: i.price, stock: i.stock, minStock: i.minStock };
    });
  const staff = employees.filter((e) => e.branchId === branch.id);
  const day = dayTotals(branch.id);

  const shiftById = (id: string) => branchShifts.find((s) => s.id === id)!;
  const productById = (id: string) => products.find((p) => p.id === id)!;
  const employeeById = (id: string) => staff.find((e) => e.id === id)!;

  const shiftTotals = (shiftId: string) => {
    const close = shiftCloses.find((c) => c.shiftId === shiftId)!;
    const salesTotal = sum(day.sales.filter((s) => s.shiftId === shiftId).map(day.saleTotal));
    const expensesTotal = sum(day.expenses.filter((g) => g.shiftId === shiftId).map((g) => g.amount));
    return { close, sales: salesTotal, expenses: expensesTotal, expected: close.opening + salesTotal - expensesTotal };
  };

  const branchHistory = expenseHistory.filter((g) => g.branchId === branch.id);
  const weekSummary: DaySummary[] = [
    ...pastDates.map((date, i) => ({
      date,
      sales: pastSales[branch.id][i],
      expenses: sum(branchHistory.filter((g) => g.date === date).map((g) => g.amount)),
    })),
    { date: TODAY, sales: day.salesTotal, expenses: day.expensesTotal },
  ];

  const salesByCategory = () =>
    totalsBy(
      day.sales.flatMap((s) =>
        s.items.map((item): [string, number] => {
          const product = productById(item.productId);
          return [product.category, product.price * item.qty];
        }),
      ),
    );

  return {
    ...m,
    membership: m,
    branch,
    shifts: branchShifts,
    // El turno en curso es el que se usa al registrar una venta o un gasto.
    currentShift: branchShifts.find((s) => shiftCloses.some((c) => c.shiftId === s.id && c.status === "en-curso")) ?? branchShifts[0],
    products,
    employees: staff,
    sales: day.sales,
    expenses: day.expenses,
    expenseHistory: branchHistory,
    salesTotal: day.salesTotal,
    expensesTotal: day.expensesTotal,
    weekSummary,
    saleTotal: day.saleTotal,
    shiftById,
    productById,
    employeeById,
    shiftTotals,
    salesByCategory,
  };
}

// Negocio

export interface CatalogEntry extends Omit<CatalogProduct, "businessId"> {
  /** En qué sucursales se vende, con su stock ahí. */
  soldIn: { branch: string; price: number; stock: number; low: boolean }[];
}

/** Todo lo que necesita una página del negocio (solo dueña). */
export function businessContext(businessSlug: string) {
  const m = membership(businessSlug);
  if (m.role !== "dueño") throw new Error("Solo la dueña ve las páginas del negocio");
  const { business } = m;

  const branchSummary = m.branches.map((branch) => {
    const day = dayTotals(branch.id);
    return {
      branch,
      href: branchHref(business, branch),
      employees: employees.filter((e) => e.branchId === branch.id).length,
      shifts: shifts.filter((s) => s.branchId === branch.id),
      sales: day.salesTotal,
      expenses: day.expensesTotal,
      salesCount: day.sales.length,
      cash: cashStatus(branch.id),
      lowStock: inventory.filter((i) => i.branchId === branch.id && isLowStock(i)).length,
    };
  });

  const catalogEntries: CatalogEntry[] = catalog
    .filter((p) => p.businessId === business.id)
    .map(({ businessId, ...product }) => ({
      ...product,
      soldIn: m.branches.flatMap((branch) => {
        const item = inventory.find((i) => i.branchId === branch.id && i.productId === product.id);
        return item ? [{ branch: branch.name, price: item.price, stock: item.stock, low: isLowStock(item) }] : [];
      }),
    }));

  const staff = employees.filter((e) => e.businessId === business.id);

  return {
    ...m,
    membership: m,
    branchSummary,
    catalog: catalogEntries,
    employees: staff,
    branchById: (id: string) => m.branches.find((b) => b.id === id)!,
    shiftById: (id: string) => shifts.find((s) => s.id === id)!,
    salesTotal: sum(branchSummary.map((b) => b.sales)),
    expensesTotal: sum(branchSummary.map((b) => b.expenses)),
  };
}

export { fullName, isLowStock, sum };
