// Programa de afiliados (docs/planes-de-suscripcion.md › Afiliados): lo que ve el afiliado en /app/cuenta/afiliado.
// Sin caché: son comisiones (dinero) y cambian con cada pago que se activa.
import type { Supabase } from "@/lib/supabase";
import { addDays, boliviaNow, periodStart, type Period } from "@/lib/dates";
import { fail } from "./mappers";

export interface Commission {
  id: string;
  businessName: string;
  chargeBs: number;
  rate: number;
  months: number;
  amountBs: number;
  createdAt: string;
  /** Día del pago del cliente en hora de Bolivia (AAAA-MM-DD). */
  date: string;
  payableAt: string;
  paidOutAt: string | null;
  /** Retenida (todavía no pasan los días desde el pago del cliente), por pagar o pagada. */
  status: "retenida" | "por pagar" | "pagada";
}

const total = (list: Commission[], status?: Commission["status"]) =>
  list.filter((c) => !status || c.status === status).reduce((sum, c) => sum + c.amountBs, 0);

/** Siguiente período después de `start` (que ya es el inicio de uno). */
const nextPeriod = (start: string, period: Period) =>
  period === "dia" ? addDays(start, 1) : period === "semana" ? addDays(start, 7) : addDays(`${start.slice(0, 8)}28`, 7).slice(0, 8) + "01";

/**
 * Lo pagado por los referidos y la comisión por período, de `from` a `to`, con los períodos vacíos en cero para que el
 * gráfico muestre el tiempo seguido. Forma de WeekChart: `sales` = pagado, `expenses` = comisión.
 */
export function commissionsByPeriod(list: Commission[], from: string, to: string, period: Period) {
  const rows = new Map<string, { date: string; sales: number; expenses: number }>();
  for (let d = periodStart(from, period); d <= to; d = nextPeriod(d, period)) rows.set(d, { date: d, sales: 0, expenses: 0 });
  for (const c of list) {
    const r = rows.get(periodStart(c.date, period));
    if (!r) continue;
    r.sales += c.chargeBs;
    r.expenses += c.amountBs;
  }
  return [...rows.values()];
}

/** Comisiones del afiliado, la más reciente primero, con los totales y cuántos llegaron con su link. RLS: solo las suyas. */
export async function affiliateSummary(sb: Supabase, range: { from: string; to: string }) {
  const [rows, referrals] = await Promise.all([
    // shortcut: trae hasta 1000 comisiones y filtra el rango en JS; pasar el rango a la consulta si un afiliado llega a tantas.
    sb.from("referral_commissions").select("*").order("created_at", { ascending: false }).limit(1000),
    sb.rpc("affiliate_referrals"),
  ]);
  fail(rows.error);
  fail(referrals.error);
  const now = Date.now();
  const commissions = (rows.data ?? []).map(
    (c): Commission => ({
      id: c.id,
      businessName: c.business_name,
      chargeBs: c.charge_bs,
      rate: Number(c.rate),
      months: c.months,
      amountBs: c.amount_bs,
      createdAt: c.created_at,
      date: boliviaNow(new Date(c.created_at)).date,
      payableAt: c.payable_at,
      paidOutAt: c.paid_out_at,
      status: c.paid_out_at ? "pagada" : Date.parse(c.payable_at) <= now ? "por pagar" : "retenida",
    }),
  );
  const inRange = commissions.filter((c) => c.date >= range.from && c.date <= range.to);
  const r = referrals.data?.[0];
  return {
    commissions,
    inRange,
    totals: { held: total(commissions, "retenida"), payable: total(commissions, "por pagar"), paid: total(commissions, "pagada") },
    range: {
      charged: inRange.reduce((sum, c) => sum + c.chargeBs, 0),
      commission: total(inRange),
      payments: inRange.length,
      businesses: new Set(inRange.map((c) => c.businessName)).size,
      byStatus: (["retenida", "por pagar", "pagada"] as const).map((s) => ({ status: s, value: total(inRange, s) })),
    },
    referrals: { people: r?.people ?? 0, businesses: r?.businesses ?? 0, paying: r?.paying ?? 0 },
  };
}
