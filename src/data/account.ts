// Exportar tus datos (Tu cuenta › Descargar tus datos): todo lo tuyo y de tus negocios, tal como está en la base.
import { fail } from "./mappers";

const PAGE = 1000; // el máximo de filas que PostgREST devuelve por consulta

/** Lee todas las páginas de una consulta (las ventas de un año pasan de 1000 filas). */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    fail(error);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return rows;
  }
}

export async function exportMyData(locals: App.Locals) {
  const sb = locals.supabase;
  const me = locals.userId!;
  const [profile, jobs, businesses] = await Promise.all([
    sb.from("profiles").select("*").eq("id", me).single(),
    sb.from("employees").select("*").eq("person_id", me),
    sb.from("businesses").select("*").eq("owner_id", me),
  ]);
  fail(profile.error);
  fail(jobs.error);
  fail(businesses.error);

  const owned = await Promise.all(
    (businesses.data ?? []).map(async (business) => {
      // El cast solo une los tipos de las tablas para TypeScript: todas tienen business_id e id, y van tal cual al JSON.
      const byBusiness = (table: "branches" | "categories" | "products" | "inventory" | "employees" | "stock_movements") =>
        all((from, to) => sb.from(table as "products").select("*").eq("business_id", business.id).order("id").range(from, to));
      const branches = await byBusiness("branches");
      const ids = branches.map((b) => b.id);
      const byBranch = (table: "shifts" | "expenses" | "shift_closes" | "orders") =>
        all((from, to) => sb.from(table as "shifts").select("*").in("branch_id", ids).order("id").range(from, to));
      const [categories, products, inventory, employees, stockMovements, shifts, expenses, shiftCloses, orders, sales] = await Promise.all([
        byBusiness("categories"),
        byBusiness("products"),
        byBusiness("inventory"),
        byBusiness("employees"),
        byBusiness("stock_movements"),
        byBranch("shifts"),
        byBranch("expenses"),
        byBranch("shift_closes"),
        byBranch("orders"),
        all((from, to) => sb.from("sales").select("*, sale_items(*)").in("branch_id", ids).order("id").range(from, to)),
      ]);
      return { ...business, branches, categories, products, inventory, employees, shifts, sales, expenses, shiftCloses, stockMovements, orders };
    }),
  );

  return { exportedAt: new Date().toISOString(), profile: profile.data, jobs: jobs.data ?? [], businesses: owned };
}
