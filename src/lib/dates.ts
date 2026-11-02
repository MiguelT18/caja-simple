// Fechas: el día del negocio se cuenta en hora de Bolivia (igual que private.today() en la base).
import { overnight } from "./format";

export const TIME_ZONE = "America/La_Paz";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });
const clockFormat = new Intl.DateTimeFormat("es-BO", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const stampFormat = new Intl.DateTimeFormat("es-BO", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Hoy (AAAA-MM-DD) en Bolivia. */
export const today = () => dayFormat.format(new Date());

/** «14:05». */
export const clock = (iso: string) => clockFormat.format(new Date(iso));

/** «31 oct, 14:05». */
export const stamp = (iso: string) => stampFormat.format(new Date(iso));

export const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Los 7 días que terminan en `end`, del más antiguo al más reciente. */
export const lastWeek = (end: string) => Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));

/** Fecha (AAAA-MM-DD) y minuto del día en hora de Bolivia, igual que el día del negocio. */
export function boliviaNow(at = new Date()) {
  const p = Object.fromEntries(partsFormat.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Cuánto va del horario de un turno abierto el día `openedOn` (cruza la medianoche si termina antes de empezar).
 * `elapsed` se queda entre 0 y `total`; `late` dice si ya pasó la hora de cierre.
 */
export function shiftProgress(s: { start: string; end: string }, openedOn: string, now = boliviaNow()) {
  const start = minutesOf(s.start);
  const total = minutesOf(s.end) - start + (overnight(s) ? 1440 : 0);
  const days = Math.round((Date.parse(now.date) - Date.parse(openedOn)) / 86_400_000);
  const raw = days * 1440 + now.minutes - start;
  return { elapsed: Math.min(Math.max(raw, 0), total), total, late: raw > total };
}
