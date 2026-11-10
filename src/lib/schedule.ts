// Días hábiles: el mismo cálculo que private.shift_closed_reason (migración 20261110020333_business_days.sql).
import { addDays, boliviaNow } from "./dates";

export interface ScheduleShift {
  id: string;
  name: string;
  start: string; // HH:MM
  end: string;
  /** Días ISO (1 = lunes … 7 = domingo); null = todos. */
  weekdays: number[] | null;
}
/** Horario de un día de la semana; sin horas, ese día la sucursal no abre. Sin fila para un día, abre todo el día. */
export interface BranchHours {
  dow: number;
  open: string | null;
  close: string | null;
}
/** Cierre de una fecha: todo el día (sin horas ni turnos), de tal hora a tal hora, o solo algunos turnos. */
export interface Closure {
  id: string;
  day: string; // AAAA-MM-DD
  start: string | null;
  end: string | null;
  shiftIds: string[] | null;
  note: string | null;
}

export const DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

/** Día ISO de la semana (1 = lunes … 7 = domingo) de una fecha AAAA-MM-DD. */
export const isoDow = (date: string) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** ¿Alcanza el cierre a este turno? */
export const closureHits = (c: Closure, s: ScheduleShift) =>
  c.start !== null && c.end !== null ? s.start >= c.start && s.start < c.end : c.shiftIds ? c.shiftIds.includes(s.id) : true;

/** Fecha de caja del turno si se abre ahora (como private.shift_date): un nocturno pasada la medianoche es de ayer. */
export function shiftDate(s: { start: string; end: string }, now = boliviaNow()) {
  const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  return minutes(s.end) < minutes(s.start) && now.minutes < minutes(s.end) ? addDays(now.date, -1) : now.date;
}

/** Por qué el turno no trabaja el día `date`, o null si trabaja. */
export function closedReason(s: ScheduleShift, date: string, hours: BranchHours[], closures: Closure[]): string | null {
  const dow = isoDow(date);
  const day = DAY_NAMES[dow - 1];
  const closure = closures.find((c) => c.day === date && closureHits(c, s));
  if (closure) return `Cerrado${closure.start ? ` de ${closure.start} a ${closure.end}` : ""}${closure.note?.trim() ? `: ${closure.note.trim()}` : ""}`;
  const h = hours.find((x) => x.dow === dow);
  if (h) {
    if (h.open === null || h.close === null) return `La sucursal no abre los ${day}`;
    if (s.start < h.open || s.start >= h.close) return `Los ${day} la sucursal abre de ${h.open} a ${h.close}`;
  }
  if (s.weekdays && !s.weekdays.includes(dow)) return `El turno ${s.name.toLowerCase()} no trabaja los ${day}`;
  return null;
}
