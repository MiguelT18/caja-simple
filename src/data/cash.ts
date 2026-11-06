// Cuentas de la caja: funciones puras sobre movimientos y cierres ya cargados (sin consultas).
import type { Row } from "./mappers";
import type { Expense, Sale } from "./types";
import { periodStart, type Period } from "@/lib/dates";

export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
/** Redondea a centavos: 0.1 + 0.2 no da 0.3 exacto, y la caja se compara al centavo. */
export const cents = (amount: number) => Math.round(amount * 100) / 100;
/** Sin control de stock (null) nunca está bajo. */
export const isLowStock = (p: { stock: number | null; minStock: number | null }) => p.stock !== null && p.minStock !== null && p.stock <= p.minStock;

/** Suma por clave, de mayor a menor: [{ name, value }]. */
export const totalsBy = (pairs: [string, number][]) => {
  const totals = new Map<string, number>();
  for (const [key, value] of pairs) totals.set(key, (totals.get(key) ?? 0) + value);
  return [...totals].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
};

export const expensesByCategory = (list: Expense[]) => totalsBy(list.filter((g) => g.voided === null).map((g) => [g.category, g.amount]));

type CloseRow = Row<"shift_closes">;

/**
 * La caja de un turno: el cierre que manda (el abierto, aunque sea de ayer; si no, el de hoy) y,
 * con los movimientos de su día, lo vendido (todo y en efectivo), lo gastado y lo esperado en caja.
 * Mismo cálculo que private.on_shift_closed_notify() en la base.
 */
export function shiftCash(closes: CloseRow[], moves: { sales: Sale[]; expenses: Expense[] }, shiftId: string, day: string) {
  const row =
    closes.find((c) => c.shift_id === shiftId && c.status === "en-curso") ?? closes.find((c) => c.shift_id === shiftId && c.business_date === day);
  const date = row?.business_date ?? day;
  const shiftSales = moves.sales.filter((s) => s.shiftId === shiftId && s.date === date);
  const sales = sum(shiftSales.map((s) => s.total));
  // Al cajón solo entra el efectivo: QR y transferencia no se cuentan en el arqueo.
  const cash = sum(shiftSales.filter((s) => s.payment === "efectivo").map((s) => s.total));
  const expenses = sum(moves.expenses.filter((g) => g.shiftId === shiftId && g.date === date).map((g) => g.amount));
  const opening = Number(row?.opening ?? 0);
  return { row, date, opening, sales, cash, expenses, expected: cents(opening + cash - expenses) };
}

/** Estado de la caja de una sucursal hoy, a partir de sus cierres. */
export const cashStatus = (closes: CloseRow[], expectedOf: (shiftId: string) => number): "cuadra" | "descuadre" | "en-curso" | "sin-abrir" => {
  if (closes.length === 0) return "sin-abrir";
  if (closes.some((c) => c.status === "cerrado" && cents(Number(c.counted)) !== expectedOf(c.shift_id))) return "descuadre";
  return closes.some((c) => c.status === "en-curso") ? "en-curso" : "cuadra";
};

/** Ventas, gastos y cantidad de ventas (sin anuladas) por período, del más antiguo al más reciente. */
export function byPeriod(sales: Sale[], expenses: Expense[], period: Period) {
  const rows = new Map<string, { date: string; sales: number; expenses: number; count: number }>();
  const row = (date: string) => {
    const key = periodStart(date, period);
    if (!rows.has(key)) rows.set(key, { date: key, sales: 0, expenses: 0, count: 0 });
    return rows.get(key)!;
  };
  for (const s of sales) {
    const r = row(s.date);
    r.sales = cents(r.sales + s.total);
    if (s.voided === null) r.count++;
  }
  for (const g of expenses) {
    const r = row(g.date);
    r.expenses = cents(r.expenses + g.amount);
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}
