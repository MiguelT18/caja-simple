// Datos de las páginas del negocio (solo la dueña): resumen por sucursal, catálogo y equipo.
import { businessVersion, cached } from "@/lib/cache";
import { addDays, today } from "@/lib/dates";
import { cashStatus, comboStock, isLowStock, shiftCash, sum } from "./cash";
import { COMBO_PARTS, EMPLOYEE_COLUMNS, fail, toCatalogProduct, toEmployee, toShift } from "./mappers";
import { branchHref } from "./routes";
import { membership } from "./session";
import { closesOf, headerBackdrop, imageUrls, movements } from "./shared";
import type { CatalogProduct, Category } from "./types";

export interface CatalogEntry extends Omit<CatalogProduct, "businessId"> {
  /** En qué sucursales se vende, con su stock ahí. */
  soldIn: { branchId: string; branch: string; price: number | null; stock: number | null; minStock: number | null; low: boolean }[];
}

/** Todo lo que necesita una página del negocio (solo dueña). null si no es dueña. */
export async function businessContext(locals: App.Locals, businessSlug: string) {
  const m = membership(locals, businessSlug);
  if (!m || m.role !== "dueño") return null;
  const sb = locals.supabase;
  const { business } = m;
  const branchIds = m.branches.map((b) => b.id);
  const day = today();

  // Turnos, catálogo, categorías y equipo cambian poco: van a la caché. Stock y movimientos, siempre frescos.
  const slow = () =>
    Promise.all([
      sb.from("shifts").select("*").in("branch_id", branchIds).order("position"),
      sb.from("products").select(`*, categories(name), ${COMBO_PARTS}`).eq("business_id", business.id).order("name"),
      sb.from("categories").select("id, name").eq("business_id", business.id).order("name"),
      sb.from("employees").select(EMPLOYEE_COLUMNS).eq("business_id", business.id).order("created_at"),
    ]).then(([shifts, products, categories, staff]) => {
      fail(shifts.error);
      fail(products.error);
      fail(categories.error);
      fail(staff.error);
      return { shifts: shifts.data ?? [], products: products.data ?? [], categories: categories.data ?? [], staff: staff.data ?? [] };
    });
  const [rows, inventory, closes, moves, branchImages, backdrop] = await Promise.all([
    cached(`b:${locals.userId}:${business.id}`, 600, slow, () => [businessVersion(business.id)]),
    sb.from("inventory").select("*").eq("business_id", business.id),
    closesOf(sb, branchIds, day),
    // Desde ayer: un turno nocturno abierto ayer sigue sumando a su caja.
    movements(sb, branchIds, addDays(day, -1)),
    imageUrls(sb, m.branches.map((b) => b.imagePath), "branch-images"),
    // Foto del encabezado (PageHeader): junto con lo demás, sin sumar una vuelta a la base.
    headerBackdrop(locals, m),
  ]);
  fail(inventory.error);
  const shiftRows = { data: rows.shifts };
  const productRows = { data: rows.products };
  const categoryRows = { data: rows.categories };
  const staffRows = { data: rows.staff };

  const shifts = (shiftRows.data ?? []).map(toShift).filter((s) => !s.archived);
  const staff = (staffRows.data ?? []).map(toEmployee);
  const stock = inventory.data ?? [];
  const lowStock = (i: (typeof stock)[number]) => isLowStock({ stock: i.stock, minStock: i.min_stock });

  const branchSummary = m.branches.map((branch) => {
    const branchMoves = { sales: moves.sales.filter((s) => s.branchId === branch.id), expenses: moves.expenses.filter((g) => g.branchId === branch.id) };
    const sales = branchMoves.sales.filter((s) => s.date === day);
    const expenses = branchMoves.expenses.filter((g) => g.date === day);
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
        (shiftId) => shiftCash(closes, branchMoves, shiftId, day).expected,
      ),
      lowStock: stock.filter((i) => i.branch_id === branch.id && lowStock(i)).length,
    };
  });

  const images = await imageUrls(sb, (productRows.data ?? []).map((p) => p.image_path));
  const catalog: CatalogEntry[] = (productRows.data ?? []).map((p) => {
    const product = toCatalogProduct(p, images);
    return {
      ...product,
      soldIn: m.branches.flatMap((branch) => {
        const item = stock.find((i) => i.branch_id === branch.id && i.product_id === p.id);
        if (!item) return [];
        const here = (id: string) => stock.find((i) => i.branch_id === branch.id && i.product_id === id)?.stock;
        return [{
          branchId: branch.id,
          branch: branch.name,
          price: item.price === null ? null : Number(item.price),
          // Un combo alcanza para lo que alcancen sus productos en esa sucursal.
          stock: product.components ? comboStock(product.components, here) : item.stock,
          minStock: item.min_stock,
          low: lowStock(item),
        }];
      }),
    };
  });

  return {
    ...m,
    membership: m,
    backdrop,
    branchSummary,
    catalog,
    categories: (categoryRows.data ?? []) as Category[],
    employees: staff,
    shifts,
    branchById: (id: string) => m.branches.find((b) => b.id === id),
    shiftById: (id?: string) => shifts.find((s) => s.id === id),
    // Últimas ventas de hoy (ya vienen de la más nueva a la más vieja), para el resumen en vivo.
    recentSales: moves.sales.filter((s) => s.date === day).slice(0, 5),
    salesTotal: sum(branchSummary.map((b) => b.sales)),
    expensesTotal: sum(branchSummary.map((b) => b.expenses)),
  };
}

/** Para el checklist de inicio: ¿alguna vez se abrió un turno o se vendió en el negocio? */
export async function firstSteps(locals: App.Locals, branchIds: string[]) {
  const sb = locals.supabase;
  const [opened, sold] = await Promise.all([
    sb.from("shift_closes").select("id").in("branch_id", branchIds).limit(1),
    sb.from("sales").select("id").in("branch_id", branchIds).limit(1),
  ]);
  fail(opened.error);
  fail(sold.error);
  return { opened: (opened.data?.length ?? 0) > 0, sold: (sold.data?.length ?? 0) > 0 };
}
