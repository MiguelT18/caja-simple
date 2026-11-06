// Consultas que usan tanto la página de sucursal como la del negocio.
import { getMany, setMany } from "@/lib/cache";
import { clock } from "@/lib/dates";
import type { Supabase } from "@/lib/supabase";
import { fail } from "./mappers";
import type { Membership } from "./session";
import { cents, shiftCash } from "./cash";
import type { Branch, Business, ClosedShift, Expense, Order, Recorder, Sale, SaleLine, StockMove } from "./types";

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

/**
 * URL firmada para cada foto (los buckets son privados). Por defecto vale un día: la misma URL todo el día deja que
 * el navegador reuse la foto y que Vender, abierta un turno entero, no se quede con enlaces vencidos.
 */
export async function imageUrls(sb: Supabase, paths: (string | null | undefined)[], bucket = "product-images", hours = 24) {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  const map = new Map<string, string>();
  if (list.length === 0) return map;
  // Se guardan en Redis hasta 10 min antes de vencer. Las rutas solo salen de filas que RLS ya dejó leer.
  const key = (path: string) => `img:${bucket}:${path}`;
  const hits = await getMany(list.map(key));
  list.forEach((path, i) => hits[i] && map.set(path, hits[i]));
  const missing = list.filter((path) => !map.has(path));
  if (missing.length === 0) return map;
  const { data } = await sb.storage.from(bucket).createSignedUrls(missing, hours * 60 * 60);
  const fresh: [string, string][] = [];
  for (const item of data ?? [])
    if (item.signedUrl && item.path) {
      map.set(item.path, item.signedUrl);
      fresh.push([key(item.path), item.signedUrl]);
    }
  await setMany(fresh, (hours * 60 - 10) * 60);
  return map;
}

/** Logos de los negocios (enlaces firmados por un día), por id de negocio. Solo pide los que tienen logo. */
export async function businessImages(locals: App.Locals, businesses: Business[]) {
  const urls = await imageUrls(locals.supabase, businesses.map((b) => b.imagePath), "branch-images");
  return new Map(businesses.flatMap((b) => (b.imagePath && urls.has(b.imagePath) ? [[b.id, urls.get(b.imagePath)!]] : [])));
}

/**
 * Foto de fondo del encabezado: la de la sucursal (si se pasa) o la del negocio, con su view-transition-name.
 * Sin foto, nada: el encabezado queda con su degradado de siempre.
 */
export async function headerBackdrop(locals: App.Locals, m: Membership, branch?: Branch) {
  const owner = branch ?? m.business;
  if (!owner.imagePath) return {};
  const url = (await imageUrls(locals.supabase, [owner.imagePath], "branch-images")).get(owner.imagePath);
  return url ? { image: url, transition: `${branch ? "branch" : "biz"}-${owner.id}` } : {};
}

/** Fotos de las fachadas de un negocio (enlaces firmados por un día), por id de sucursal. Solo pide las que tienen foto. */
export async function branchImages(locals: App.Locals, m: Membership) {
  const urls = await imageUrls(locals.supabase, m.branches.map((b) => b.imagePath), "branch-images");
  return new Map(m.branches.flatMap((b) => (b.imagePath && urls.has(b.imagePath) ? [[b.id, urls.get(b.imagePath)!]] : [])));
}

/** Enlaces firmados de los comprobantes de esas ventas, por ruta. */
// Una hora: son comprobantes de pago.
export const receiptUrls = (sb: Supabase, sales: Sale[]) => imageUrls(sb, sales.map((s) => s.receiptPath), "sale-receipts", 1);

/** Ventas y gastos desde `from` (y hasta `to`, si viene) en esas sucursales. */
export async function movements(sb: Supabase, branchIds: string[], from: string, to?: string) {
  // Sin `to`, hasta hoy: ningún movimiento tiene un día del negocio futuro.
  const until = to ?? "9999-12-31";
  const [sales, expenses] = await Promise.all([
    sb.from("sale_totals").select("*").in("branch_id", branchIds).gte("business_date", from).lte("business_date", until).order("occurred_at", { ascending: false }),
    sb.from("expenses").select("*").in("branch_id", branchIds).gte("business_date", from).lte("business_date", until).order("occurred_at", { ascending: false }),
  ]);
  fail(sales.error);
  fail(expenses.error);
  const people = await recorders(sb, [...(sales.data ?? []), ...(expenses.data ?? [])].map((m) => m.recorded_by));
  const recordedBy = (id: string | null) => (id && people.get(id)) || unknownRecorder;

  const saleList: Sale[] = (sales.data ?? []).map((s) => ({
    id: s.sale_id,
    branchId: s.branch_id,
    date: s.business_date,
    time: clock(s.occurred_at),
    shiftId: s.shift_id,
    recordedBy: recordedBy(s.recorded_by),
    recordedById: s.recorded_by,
    items: s.items ?? 0,
    // Anulada: no suma en ningún total, pero se sigue viendo con lo que valía.
    total: s.voided_at ? 0 : Number(s.total ?? 0),
    voided: s.voided_at ? Number(s.total ?? 0) : null,
    payment: s.payment_method ?? "efectivo",
    receiptPath: s.receipt_path ?? null,
  }));
  const expenseList: Expense[] = (expenses.data ?? []).map((g) => ({
    id: g.id,
    branchId: g.branch_id,
    date: g.business_date,
    time: clock(g.occurred_at),
    shiftId: g.shift_id,
    recordedBy: recordedBy(g.recorded_by),
    recordedById: g.recorded_by,
    concept: g.concept,
    category: g.category,
    amount: g.voided_at ? 0 : Number(g.amount),
    voided: g.voided_at ? Number(g.amount) : null,
  }));
  return { sales: saleList, expenses: expenseList };
}

/** Cierres de hoy y los que siguen abiertos de otro día (un turno nocturno abierto ayer). */
export async function closesOf(sb: Supabase, branchIds: string[], date: string) {
  const { data, error } = await sb
    .from("shift_closes")
    .select("*")
    .in("branch_id", branchIds)
    .or(`business_date.eq.${date},status.eq.en-curso`);
  fail(error);
  return data ?? [];
}

/** Lo que se vendió en cada venta de la sucursal entre `from` y `to`, por id de venta. */
export async function saleLines(sb: Supabase, branchId: string, from: string, to: string) {
  const { data, error } = await sb
    .from("sale_items")
    .select("sale_id, qty, unit_price, products(name), sales!inner(branch_id, business_date)")
    .eq("sales.branch_id", branchId)
    .gte("sales.business_date", from)
    .lte("sales.business_date", to);
  fail(error);
  const map = new Map<string, SaleLine[]>();
  for (const i of data ?? [])
    map.set(i.sale_id, [...(map.get(i.sale_id) ?? []), { name: i.products?.name ?? "Producto quitado", qty: i.qty, price: Number(i.unit_price) }]);
  return map;
}

/** Cierres de turno terminados entre `from` y `to`, con quién abrió, quién cerró y la diferencia. Los más recientes primero. */
export async function closesBetween(sb: Supabase, branchId: string, from: string, to: string) {
  const [{ data, error }, moves] = await Promise.all([
    sb
      .from("shift_closes")
      .select("*")
      .eq("branch_id", branchId)
      .eq("status", "cerrado")
      .gte("business_date", from)
      .lte("business_date", to)
      .order("business_date", { ascending: false })
      .order("closed_at", { ascending: false }),
    movements(sb, [branchId], from, to),
  ]);
  fail(error);
  const rows = data ?? [];
  const people = await recorders(sb, rows.flatMap((c) => [c.opened_by, c.closed_by]));
  const name = (id: string | null) => (id && people.get(id)?.firstName) || "—";
  return rows.map((c): ClosedShift => {
    const cash = shiftCash([c], moves, c.shift_id, c.business_date);
    return {
      id: c.id,
      shiftId: c.shift_id,
      date: c.business_date,
      closedAt: c.closed_at,
      openedBy: name(c.opened_by),
      closedBy: name(c.closed_by),
      closedById: c.closed_by,
      expected: cash.expected,
      counted: Number(c.counted),
      difference: cents(Number(c.counted) - cash.expected),
      note: c.note,
      reopened: c.reopened_at !== null,
    };
  });
}

/** Entradas, mermas y ajustes de stock de la sucursal, los más recientes primero (máximo 200). */
export async function stockMoves(sb: Supabase, branchId: string) {
  const { data, error } = await sb
    .from("stock_movements")
    .select("id, kind, qty, reason, recorded_by, occurred_at, products(name)")
    .eq("branch_id", branchId)
    .order("occurred_at", { ascending: false })
    .limit(200);
  fail(error);
  const people = await recorders(sb, (data ?? []).map((m) => m.recorded_by));
  return (data ?? []).map(
    (m): StockMove => ({
      id: m.id,
      kind: m.kind,
      qty: m.qty,
      reason: m.reason,
      product: m.products?.name ?? "Producto quitado",
      by: (m.recorded_by && people.get(m.recorded_by)?.firstName) || "—",
      at: m.occurred_at,
    }),
  );
}

/** El último monto contado al cerrar un turno en la sucursal: el siguiente turno parte de ahí. */
export async function lastCount(sb: Supabase, branchId: string) {
  const { data, error } = await sb
    .from("shift_closes")
    .select("counted, shift_id")
    .eq("branch_id", branchId)
    .eq("status", "cerrado")
    .order("closed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  fail(error);
  return data ? { counted: Number(data.counted), shiftId: data.shift_id } : undefined;
}

/** Pedidos abiertos de la sucursal (sin cobrar), los más antiguos primero. Nunca van a la caché. */
export async function openOrders(sb: Supabase, branchId: string): Promise<Order[]> {
  const { data, error } = await sb.from("orders").select("id, label, items").eq("branch_id", branchId).is("sale_id", null).order("created_at");
  fail(error);
  return (data ?? []).map((o) => ({ id: o.id, label: o.label, items: o.items as Order["items"] }));
}

/** Nombre del pedido de cada venta cobrada como pedido, por id de venta, entre `from` y `to` (fecha de caja). */
export async function orderLabels(sb: Supabase, branchId: string, from: string, to: string) {
  const { data, error } = await sb
    .from("orders")
    .select("sale_id, label, sales!inner(business_date)")
    .eq("branch_id", branchId)
    .gte("sales.business_date", from)
    .lte("sales.business_date", to);
  fail(error);
  return new Map((data ?? []).map((o) => [o.sale_id!, o.label]));
}
