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

/** Promoción de fundadores vigente. */
export interface FounderPromo {
  slots: number;
  left: number;
  /** 0,5 = 50%. */
  discount: number;
  months: number;
  /** Con negocio: último día con precio fundador de ese negocio (si ya lo es). */
  until: string | null;
}

/**
 * La promo de fundadores como la cuenta la base (founder_promo): los cupos reales, sin caché. null si está apagada,
 * o si ya no quedan cupos y este negocio no la tiene. Sirve sin sesión.
 */
export async function founderPromo(sb: Supabase, businessId?: string): Promise<FounderPromo | null> {
  const { data, error } = await sb.rpc("founder_promo", businessId ? { p_business: businessId } : {});
  fail(error);
  const row = data?.[0];
  if (!row) return null;
  const until = row.founder_until && row.founder_until >= today() ? row.founder_until : null;
  const left = Math.max(0, row.slots - row.taken);
  if (!until && (!row.active || left === 0)) return null;
  return { slots: row.slots, left, discount: Number(row.discount), months: row.months, until };
}

/** Negocios que la persona ve, para /planes (ahí el middleware no carga la sesión). Vencido cuenta como Gratis, como en la base. */
export async function ownedBusinesses(sb: Supabase, userId: string) {
  const { data, error } = await sb.from("businesses").select("slug, name, plan, plan_until, trial, owner_id").order("created_at");
  fail(error);
  const rows = data ?? [];
  const owned = rows
    .filter((b) => b.owner_id === userId)
    .map((b) => {
      const expired = b.plan_until !== null && b.plan_until < today();
      return { slug: b.slug, name: b.name, plan: expired ? ("Gratis" as const) : b.plan, planUntil: expired ? null : b.plan_until, trial: !expired && b.trial };
    });
  return { owned, worksElsewhere: rows.length > owned.length };
}

/** Datos para pagar (los carga un administrador con SQL en billing_settings). */
export async function paymentDetails(sb: Supabase) {
  const { data, error } = await sb.from("billing_settings").select("qr_image_url, bank_details, card_note").maybeSingle();
  fail(error);
  // Sin uno en la base, el QR del BCP de public/pagos (vence el 07/11/2028): el recorte para la página y el
  // póster liviano para descargar. Si la base tiene otro, sirve para las dos cosas.
  return {
    qrImageUrl: data?.qr_image_url ?? "/pagos/qr-codigo.webp",
    qrDownloadUrl: data?.qr_image_url ?? "/pagos/qr-descarga.jpg",
    bankDetails: data?.bank_details ?? null,
    cardNote: data?.card_note ?? null,
  };
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
    discount: Number(c.discount),
    createdAt: c.created_at,
    expiresAt: c.expires_at,
    paidAt: c.paid_at,
    status: c.paid_at ? "pagado" : Date.parse(c.expires_at) > now ? "pendiente" : "vencido",
  }));
}
