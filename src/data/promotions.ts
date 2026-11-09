// Promociones del negocio (migración promotions). Se leen frescas: cambian lo que se cobra.
import type { Supabase } from "@/lib/supabase";
import { appliesOn, type Promo } from "@/lib/promos";
import { fail } from "./mappers";

export interface Promotion extends Promo {
  id: string;
  name: string;
  productIds: string[];
}

/** Todas las del negocio, las más nuevas primero. */
export async function businessPromotions(sb: Supabase, businessId: string): Promise<Promotion[]> {
  const { data, error } = await sb
    .from("promotions")
    .select("*, promotion_products(product_id)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  fail(error);
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    percent: p.percent === null ? null : Number(p.percent),
    price: p.price === null ? null : Number(p.price),
    buy: p.buy,
    pay: p.pay,
    branchIds: p.branch_ids,
    weekdays: p.weekdays,
    startsOn: p.starts_on,
    endsOn: p.ends_on,
    active: p.active,
    productIds: p.promotion_products.map((x) => x.product_id),
  }));
}

/** Las que valen `day` en la sucursal, por producto (para mostrar el descuento al vender). */
export async function promotionsToday(sb: Supabase, businessId: string, branchId: string, day: string) {
  const byProduct: Record<string, Promotion[]> = {};
  for (const p of await businessPromotions(sb, businessId))
    if (appliesOn(p, day, branchId)) for (const id of p.productIds) (byProduct[id] ??= []).push(p);
  return byProduct;
}
