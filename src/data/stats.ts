// Estadísticas del Resumen del negocio. Se agregan en la base (public.business_stats); aquí se arma el rango y se
// mapea. Nunca van a la caché: son ventas.
import type { Supabase } from "@/lib/supabase";
import { addDays } from "@/lib/dates";
import { fail } from "./mappers";

export type StatsPeriod = "30" | "60" | "90" | "anio" | "todo";

export interface BusinessStats {
  products: { id: string; name: string; qty: number; revenue: number }[];
  branches: { id: string; revenue: number; sales: number }[];
  hours: { hour: number; revenue: number }[];
  /** dow: 1 = lunes … 7 = domingo. days: días distintos con ventas, para comparar promedios. */
  weekdays: { dow: number; revenue: number; days: number }[];
  /** aId/bId: para armar el combo desde la idea (llegan desde la migración de combos). */
  pairs: { a: string; b: string; aId?: string; bId?: string; times: number }[];
  quiet: { id: string; name: string; stock: number; lastSale: string | null }[];
}

/** Períodos que se ofrecen según el plan: Gratis ve solo sus días de historial. */
export const statsPeriods = (historyDays: number | null): { value: StatsPeriod; label: string }[] =>
  historyDays === null
    ? [
        { value: "30", label: "30 días" },
        { value: "90", label: "90 días" },
        { value: "anio", label: "Este año" },
        { value: "todo", label: "Todo" },
      ]
    : [
        { value: "30", label: "30 días" },
        { value: "60", label: `${historyDays} días` },
      ];

/**
 * Rango del período que termina hoy y, si tiene sentido, el anterior del mismo largo (para la tendencia).
 * Un período que el plan no ofrece cae en 30 días. «Todo» y el período que toca el borde del historial no tienen anterior.
 */
export function statsRange(asked: string | null, today: string, historyDays: number | null) {
  const offered = statsPeriods(historyDays).map((p) => p.value);
  const period: StatsPeriod = offered.includes(asked as StatsPeriod) ? (asked as StatsPeriod) : "30";
  const days =
    period === "todo" ? null
    : period === "anio" ? Math.round((Date.parse(today) - Date.parse(`${today.slice(0, 4)}-01-01`)) / 86_400_000) + 1
    : period === "60" ? historyDays!
    : Number(period);
  const from = days === null ? "2000-01-01" : addDays(today, -(days - 1));
  const prev =
    days === null || (historyDays !== null && days * 2 > historyDays) ? undefined : { from: addDays(from, -days), to: addDays(from, -1), days };
  return { period, from, to: today, days, prev };
}

const num = (v: unknown) => Number(v ?? 0);

export function toStats(raw: unknown): BusinessStats {
  const r = (raw ?? {}) as Record<string, Record<string, unknown>[] | undefined>;
  return {
    products: (r.products ?? []).map((p) => ({ id: String(p.id), name: String(p.name), qty: num(p.qty), revenue: num(p.revenue) })),
    branches: (r.branches ?? []).map((b) => ({ id: String(b.id), revenue: num(b.revenue), sales: num(b.sales) })),
    hours: (r.hours ?? []).map((h) => ({ hour: num(h.hour), revenue: num(h.revenue) })),
    weekdays: (r.weekdays ?? []).map((w) => ({ dow: num(w.dow), revenue: num(w.revenue), days: num(w.days) })),
    pairs: (r.pairs ?? []).map((p) => ({ a: String(p.a), b: String(p.b), aId: p.aId ? String(p.aId) : undefined, bId: p.bId ? String(p.bId) : undefined, times: num(p.times) })),
    quiet: (r.quiet ?? []).map((q) => ({ id: String(q.id), name: String(q.name), stock: num(q.stock), lastSale: (q.last_sale as string | null) ?? null })),
  };
}

/** El período y, si hay, el total vendido en el anterior. */
export async function businessStats(sb: Supabase, businessId: string, range: ReturnType<typeof statsRange>) {
  const call = (from: string, to: string) => sb.rpc("business_stats", { p_business: businessId, p_from: from, p_to: to });
  const [now, before] = await Promise.all([call(range.from, range.to), range.prev ? call(range.prev.from, range.prev.to) : undefined]);
  fail(now.error);
  fail(before?.error ?? null);
  const stats = toStats(now.data);
  const previous = before ? toStats(before.data).branches.reduce((n, b) => n + b.revenue, 0) : null;
  return { stats, previous };
}
