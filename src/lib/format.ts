const bs = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** «Bs 1.240,00». Con `sign`, antepone + o − (DESIGN.md: los montos llevan signo); sin él, solo los negativos llevan −. */
export function formatBs(amount: number, sign?: "+" | "−") {
  return `${sign ?? (amount < 0 ? "−" : "")}Bs ${bs.format(Math.abs(amount))}`;
}

export const initials = (first: string, last: string) => `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();

/** «1 producto», «3 productos». */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** ¿Termina al día siguiente? (22:00–06:00) */
export const overnight = (s: { start: string; end: string }) => s.end < s.start;

/** «07:00–14:00»; si cruza la medianoche, «22:00–06:00 +1» (con `long`, «… (termina al día siguiente)»). */
export const shiftHours = (s: { start: string; end: string }, long = false) =>
  `${s.start}–${s.end}${overnight(s) ? (long ? " (termina al día siguiente)" : " +1") : ""}`;

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const boliviaParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/La_Paz",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Fecha (AAAA-MM-DD) y minuto del día en hora de Bolivia, igual que el día del negocio. */
export function boliviaNow(at = new Date()) {
  const p = Object.fromEntries(boliviaParts.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** «2 h 10 min», «45 min». */
export const duration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
};

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
