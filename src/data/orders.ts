// Pedidos pendientes (/app/[negocio]/pedidos): los encargos abiertos de las sucursales, con su adelanto, y lo que la
// dueña envió y falta recibir. Siempre frescos: no van a la caché (son caja y stock).
import type { Supabase } from "@/lib/supabase";
import { cents } from "./cash";
import { fail } from "./mappers";
import { openOrders, stockDeliveries } from "./shared";
import type { Branch, Order, StockDelivery } from "./types";

export interface PendingOrder extends Order {
  branch: Branch;
  /** Líneas con nombre y precio (el del pedido o el de la sucursal hoy). */
  lines: { name: string; qty: number; price: number }[];
  total: number;
  /** Lo que falta cobrar: total menos adelanto. */
  balance: number;
}

export async function pendingOrders(sb: Supabase, branches: Branch[]) {
  const ids = branches.map((b) => b.id);
  const [orderLists, deliveryLists, { data: stock, error }] = await Promise.all([
    Promise.all(branches.map((b) => openOrders(sb, b.id))),
    Promise.all(branches.map((b) => stockDeliveries(sb, b.id))),
    sb.from("inventory").select("branch_id, product_id, price, products(name)").in("branch_id", ids),
  ]);
  fail(error);
  const item = new Map((stock ?? []).map((i) => [`${i.branch_id}:${i.product_id}`, { name: i.products?.name ?? "Producto quitado", price: Number(i.price ?? 0) }]));
  const orders = branches
    .flatMap((branch, k) =>
      orderLists[k].map((o): PendingOrder => {
        const lines = o.items.map((l) => {
          const known = item.get(`${branch.id}:${l.productId}`);
          return { name: known?.name ?? "Producto quitado", qty: l.qty, price: l.price ?? known?.price ?? 0 };
        });
        const total = cents(lines.reduce((s, l) => s + l.qty * l.price, 0));
        return { ...o, branch, lines, total, balance: cents(total - (o.deposit ?? 0)) };
      }),
    )
    // Primero los que tienen fecha (los más próximos), después los demás.
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const deliveries = branches
    .flatMap((branch, k) => deliveryLists[k].map((d): StockDelivery & { branch: Branch } => ({ ...d, branch })))
    .filter((d) => d.qty > 0);
  return { orders, deliveries };
}
