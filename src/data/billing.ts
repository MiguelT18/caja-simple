// Cobro de planes (docs/planes-de-suscripcion.md): tipo de cambio del día, tasa de impuestos, datos de pago y los
// cobros de un negocio. Nada va a la caché: el tipo de cambio cambia cada día y un cobro es dinero.
import type { Supabase } from "@/lib/supabase";
import { today } from "@/lib/dates";
import type { Quote } from "./plans";
import { fail } from "./mappers";
import type { PlanCharge } from "./types";

/** Tipo de cambio para el «hoy Bs …»: el de hoy o el último disponible. Sin tipo de cambio todavía, null. Sirve sin sesión. */
export async function currentQuote(sb: Supabase): Promise<Quote | null> {
  const [rate, settings] = await Promise.all([
    sb.from("exchange_rates").select("date, usd_bob").lte("date", today()).order("date", { ascending: false }).limit(1).maybeSingle(),
    sb.from("billing_settings").select("tax_rate").maybeSingle(),
  ]);
  if (!rate.data || !settings.data) return null;
  return { rate: Number(rate.data.usd_bob), rateDate: rate.data.date, tax: Number(settings.data.tax_rate) };
}

/** Datos para pagar (los carga un administrador con SQL en billing_settings). */
export async function paymentDetails(sb: Supabase) {
  const { data, error } = await sb.from("billing_settings").select("qr_image_url, bank_details, card_note").maybeSingle();
  fail(error);
  return { qrImageUrl: data?.qr_image_url ?? null, bankDetails: data?.bank_details ?? null, cardNote: data?.card_note ?? null };
}

/** Los cobros del negocio, el más reciente primero. RLS: solo la dueña los ve. */
export async function planCharges(sb: Supabase, businessId: string): Promise<PlanCharge[]> {
  const { data, error } = await sb.from("plan_charges").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(20);
  fail(error);
  const now = Date.now();
  return (data ?? []).map((c) => ({
    id: c.id,
    plan: c.plan as PlanCharge["plan"],
    period: c.period,
    extraBranches: c.extra_branches,
    usd: Number(c.usd),
    rate: Number(c.rate),
    rateDate: c.rate_date,
    taxRate: Number(c.tax_rate),
    amountBs: c.amount_bs,
    method: c.method,
    createdAt: c.created_at,
    expiresAt: c.expires_at,
    paidAt: c.paid_at,
    status: c.paid_at ? "pagado" : Date.parse(c.expires_at) > now ? "pendiente" : "vencido",
  }));
}
