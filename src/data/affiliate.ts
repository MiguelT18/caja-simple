// Programa de afiliados (docs/planes-de-suscripcion.md › Afiliados): lo que ve el afiliado en /app/cuenta/afiliado.
// Sin caché: son comisiones (dinero) y cambian con cada pago que se activa.
import type { Supabase } from "@/lib/supabase";
import { fail } from "./mappers";

export interface Commission {
  id: string;
  businessName: string;
  chargeBs: number;
  rate: number;
  months: number;
  amountBs: number;
  createdAt: string;
  payableAt: string;
  paidOutAt: string | null;
  /** Retenida (todavía no pasan los días desde el pago del cliente), por pagar o pagada. */
  status: "retenida" | "por pagar" | "pagada";
}

/** Comisiones del afiliado, la más reciente primero, con los totales y cuántos llegaron con su link. RLS: solo las suyas. */
export async function affiliateSummary(sb: Supabase) {
  const [rows, referrals] = await Promise.all([
    sb.from("referral_commissions").select("*").order("created_at", { ascending: false }).limit(200),
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
      payableAt: c.payable_at,
      paidOutAt: c.paid_out_at,
      status: c.paid_out_at ? "pagada" : Date.parse(c.payable_at) <= now ? "por pagar" : "retenida",
    }),
  );
  const total = (status: Commission["status"]) => commissions.filter((c) => c.status === status).reduce((sum, c) => sum + c.amountBs, 0);
  const r = referrals.data?.[0];
  return {
    commissions,
    totals: { held: total("retenida"), payable: total("por pagar"), paid: total("pagada") },
    referrals: { people: r?.people ?? 0, businesses: r?.businesses ?? 0, paying: r?.paying ?? 0 },
  };
}
