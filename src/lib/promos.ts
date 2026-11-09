// Promociones: la misma cuenta que private.promo_discount (migración promotions). La base es la que cobra; esto solo
// muestra el descuento al vender y describe la promoción.
import { formatBs, plural } from "./format";

export type PromoKind = "percent" | "price" | "bundle";

export interface Promo {
  kind: PromoKind;
  percent: number | null;
  price: number | null;
  buy: number | null;
  pay: number | null;
  /** null = todas las sucursales. */
  branchIds: string[] | null;
  /** ISO: 1 = lunes … 7 = domingo; null = todos los días. */
  weekdays: number[] | null;
  startsOn: string | null;
  endsOn: string | null;
  active: boolean;
}

/** Día ISO de una fecha «AAAA-MM-DD» (1 = lunes … 7 = domingo). */
export const isoWeekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() || 7;

/** ¿Vale la promoción ese día en esa sucursal? (sin mirar el plan ni los productos). */
export function appliesOn(p: Promo, date: string, branchId: string) {
  return (
    p.active &&
    (!p.branchIds || p.branchIds.includes(branchId)) &&
    (!p.startsOn || date >= p.startsOn) &&
    (!p.endsOn || date <= p.endsOn) &&
    (!p.weekdays || p.weekdays.includes(isoWeekday(date)))
  );
}

/** Lo que descuenta en una línea de `qty` unidades a `price` (en Bs, con centavos). */
export function lineDiscount(p: Promo, qty: number, price: number) {
  const amount =
    p.kind === "percent"
      ? Math.round(qty * price * (p.percent ?? 0)) / 100
      : p.kind === "price"
        ? Math.max(0, price - (p.price ?? price)) * qty
        : Math.floor(qty / (p.buy ?? Infinity)) * ((p.buy ?? 0) - (p.pay ?? 0)) * price;
  return Math.round(Math.min(amount, qty * price) * 100) / 100;
}

/** La que más descuenta (no se suman). */
export function bestDiscount<T extends Promo>(promos: T[], qty: number, price: number) {
  let best: { promo: T; discount: number } | null = null;
  for (const promo of promos) {
    const discount = lineDiscount(promo, qty, price);
    if (discount > 0 && discount > (best?.discount ?? 0)) best = { promo, discount };
  }
  return best;
}

/** «−20%», «Bs 8,00», «3x2». */
export function promoBadge(p: Promo) {
  if (p.kind === "percent") return `−${p.percent}%`;
  if (p.kind === "price") return formatBs(p.price ?? 0);
  return `${p.buy}x${p.pay}`;
}

/** «20% de descuento», «A Bs 8,00 cada uno», «Lleva 3, paga 2». */
export function promoLabel(p: Promo) {
  if (p.kind === "percent") return `${p.percent}% de descuento`;
  if (p.kind === "price") return `A ${formatBs(p.price ?? 0)} cada uno`;
  return `Lleva ${p.buy}, paga ${p.pay}`;
}

const dateFormat = new Intl.DateTimeFormat("es-BO", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
/** «30 de noviembre de 2026». */
const fullDate = (date: string) => dateFormat.format(new Date(`${date}T12:00:00Z`));

const DAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

/** «Todos los viernes · hasta el 30 de noviembre de 2026», «Todos los días · sin fecha límite». */
export function whenLabel(p: Promo) {
  const days = !p.weekdays || p.weekdays.length === 7
    ? "Todos los días"
    : `Los ${new Intl.ListFormat("es", { type: "conjunction" }).format([...p.weekdays].sort().map((d) => DAYS[d - 1]))}`;
  const range = p.endsOn
    ? `${p.startsOn ? `del ${fullDate(p.startsOn)} ` : ""}hasta el ${fullDate(p.endsOn)}`
    : p.startsOn
      ? `desde el ${fullDate(p.startsOn)}, sin fecha límite`
      : "sin fecha límite";
  return `${days} · ${range}`;
}

export type PromoStatus = "hoy" | "programada" | "otro-dia" | "vencida" | "pausada";

/** El estado de hoy, sin mirar la sucursal (para la lista de la dueña). */
export function promoStatus(p: Promo, today: string): PromoStatus {
  if (!p.active) return "pausada";
  if (p.endsOn && today > p.endsOn) return "vencida";
  if (p.startsOn && today < p.startsOn) return "programada";
  return !p.weekdays || p.weekdays.includes(isoWeekday(today)) ? "hoy" : "otro-dia";
}

export const statusLabel: Record<PromoStatus, string> = {
  hoy: "Vale hoy",
  programada: "Programada",
  "otro-dia": "Hoy no aplica",
  vencida: "Vencida",
  pausada: "Pausada",
};

/** «3 productos». */
export const productsLabel = (n: number) => plural(n, "producto", "productos");
