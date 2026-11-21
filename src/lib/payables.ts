// Cuentas puras de los gastos fijos y los pendientes (ver supabase/migrations/*_fixed_expenses_payables.sql).
import { addDays, shortDate } from "./dates";

export type Frequency = "semanal" | "quincenal" | "mensual";

export const frequencyLabel: Record<Frequency, string> = { semanal: "Cada semana", quincenal: "Cada 15 días", mensual: "Cada mes" };

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** El período `n` de un gasto fijo. Como en la base: siempre desde el primero, así el 31 cae el 30 o el 28 y vuelve al 31. */
export function occurrence(startsOn: string, frequency: Frequency, n: number) {
  if (frequency !== "mensual") return addDays(startsOn, n * (frequency === "semanal" ? 7 : 14));
  const [y, m, d] = startsOn.split("-").map(Number);
  const month = m - 1 + n;
  const lastDay = new Date(Date.UTC(y, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, month, Math.min(d, lastDay), 12)).toISOString().slice(0, 10);
}

/** El próximo pago después de hoy (el de hoy ya es un pendiente). */
export function nextOccurrence(startsOn: string, frequency: Frequency, today: string) {
  if (startsOn > today) return startsOn;
  let n = Math.floor(daysBetween(startsOn, today) / (frequency === "mensual" ? 31 : frequency === "semanal" ? 7 : 14));
  while (occurrence(startsOn, frequency, n) <= today) n++;
  return occurrence(startsOn, frequency, n);
}

/** Cómo está el vencimiento, en texto (nunca solo con color). */
export function dueState(dueOn: string | null, today: string): { tone: "late" | "soon" | "later" | "none"; label: string } {
  if (!dueOn) return { tone: "none", label: "Sin vencimiento" };
  const days = daysBetween(today, dueOn);
  if (days < 0) return { tone: "late", label: days === -1 ? "Venció ayer" : `Venció hace ${-days} días` };
  if (days === 0) return { tone: "soon", label: "Vence hoy" };
  if (days === 1) return { tone: "soon", label: "Vence mañana" };
  return { tone: days <= 7 ? "soon" : "later", label: `Vence el ${shortDate(dueOn)}` };
}

/** Primero lo vencido, después lo que vence antes y al final lo que no tiene fecha (por el día que tocaba). */
export const payableOrder = (a: { dueOn: string | null; owedOn: string }, b: { dueOn: string | null; owedOn: string }) =>
  (a.dueOn ?? "9999-12-31").localeCompare(b.dueOn ?? "9999-12-31") || a.owedOn.localeCompare(b.owedOn);
