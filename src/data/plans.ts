// Planes y precios (docs/planes-de-suscripcion.md). El precio está en dólares sin impuestos; en bolivianos se calcula
// al mostrarlo y al cobrar, con el tipo de cambio del BCB del día. Nunca se guarda un precio fijo en Bs.
import { PUBLIC_UPGRADE_URL } from "astro:env/client";

export type PlanName = "Gratis" | "Negocio" | "Sucursales";

// Lo que la app aplica de cada plan; null = sin tope. La base es la que manda
// (migración plan_limits): esto solo lo muestra y tiene que coincidir con ella.
export const planLimits: Record<PlanName, { branches: number | null; historyDays: number | null; reports: boolean }> = {
  Gratis: { branches: 1, historyDays: 60, reports: false },
  Negocio: { branches: 1, historyDays: null, reports: true },
  Sucursales: { branches: null, historyDays: null, reports: true },
};

// WhatsApp donde llegan los comprobantes de pago (+591 67677457). PUBLIC_UPGRADE_URL lo reemplaza si está definida.
export const upgradeUrl: string = PUBLIC_UPGRADE_URL || "https://wa.me/59167677457";

export interface Plan {
  name: PlanName;
  audience: string;
  features: PlanFeature[];
}

export type Period = "mensual" | "anual";

// US$ sin impuestos. El cobro lo calcula la base (private.plan_usd): esto solo lo muestra y tiene que coincidir
// (plans.test.ts). El anual trae 2 meses gratis.
export const planUsd = {
  base: { mensual: 5.5, anual: 55 },
  extraBranch: { mensual: 3.5, anual: 35 },
} as const;

/** US$ sin impuestos de un plan: Negocio, o Sucursales con `extra` sucursales más allá de la primera. */
export const usdFor = (plan: PlanName, period: Period, extra = 0) =>
  plan === "Gratis" ? 0 : planUsd.base[period] + (plan === "Sucursales" ? extra : 0) * planUsd.extraBranch[period];

/**
 * Total en bolivianos con impuestos, redondeado al boliviano (igual que private.bs_total):
 * los impuestos (IVA + IT) van sobre el total facturado, por eso se divide entre (1 − tasa).
 */
export const bsTotal = (usd: number, rate: number, tax: number) => Math.round((usd * rate) / (1 - tax) + 1e-9);

/** US$ con descuento (precio fundador), redondeado a centavos como la base: round(usd × (1 − d), 2). */
export const discounted = (usd: number, discount: number) => Math.round(usd * (1 - discount) * 100 + 1e-9) / 100;

const usdFormat = (n: number) => n.toLocaleString("es-BO", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
/** «US$ 5,50», «US$ 55». */
export const usdLabel = (n: number) => `US$ ${usdFormat(n)}`;

/** Tipo de cambio y tasa con que se calcula el «hoy Bs …». */
export interface Quote {
  rate: number;
  /** Día del tipo de cambio (AAAA-MM-DD): el de hoy o, si no se pudo obtener, el último. */
  rateDate: string;
  tax: number;
}

/**
 * Precio de un plan como lo muestra la app: «US$ 5,50 + impuestos · hoy Bs 77». Sin tipo de cambio, solo dólares.
 * En Sucursales, el precio base y aparte lo de cada sucursal extra.
 */
export function priceOf(plan: PlanName, period: Period, quote?: Quote | null) {
  const per = period === "mensual" ? "al mes" : "al año";
  const bs = (usd: number) => (quote ? `Bs ${bsTotal(usd, quote.rate, quote.tax).toLocaleString("es-BO")}` : null);
  if (plan === "Gratis") return { usd: "US$ 0", detail: "Sin vencimiento", today: null };
  const base = planUsd.base[period];
  if (plan === "Negocio") return { usd: usdLabel(base), detail: `+ impuestos ${per}`, today: bs(base) && `hoy ${bs(base)}` };
  const extra = planUsd.extraBranch[period];
  return {
    usd: `${usdLabel(base)} + ${usdFormat(extra)}`,
    detail: `por sucursal extra, + impuestos ${per}`,
    today: bs(base) && `hoy ${bs(base)} + ${bs(extra)} por sucursal extra`,
  };
}

/** Lo que todavía no está hecho va con «Próximamente»: el plan no promete lo que la app no hace. */
export type PlanFeature = string | { text: string; soon: true };
const soon = (text: string): PlanFeature => ({ text, soon: true });

export const plans: Plan[] = [
  {
    name: "Gratis",
    audience: "Puesto o tienda que recién empieza",
    features: [
      "1 sucursal por negocio, negocios ilimitados",
      "Empleados ilimitados",
      "Ventas, gastos, turnos y cuadre",
      "Cobros en efectivo, QR o transferencia",
      "Inventario y stock de tu sucursal",
      "Vende aunque se corte el internet",
      "Aviso de cada cierre y si la caja no cuadra",
      "Historial de los últimos 60 días",
    ],
  },
  {
    name: "Negocio",
    audience: "Cuando quieres comparar con el mes pasado",
    features: [
      "Todo lo del plan Gratis",
      "Historial completo, sin límite de días",
      "Reportes por día, semana y mes",
      "Exporta a Excel o imprime en PDF",
    ],
  },
  {
    name: "Sucursales",
    audience: "Dueño con 2 o más locales",
    features: [
      "Todo lo del plan Negocio",
      soon("Vista consolidada de tus locales"),
      soon("Comparación entre sucursales"),
      soon("Permisos por empleado y sucursal"),
      soon("Historial de quién hizo cada cambio"),
    ],
  },
];
