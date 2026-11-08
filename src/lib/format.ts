const bs = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** «Bs 1.240,00». Con `sign`, antepone + o − (DESIGN.md: los montos llevan signo); sin él, solo los negativos llevan −. */
export function formatBs(amount: number, sign?: "+" | "−") {
  return `${sign ?? (amount < 0 ? "−" : "")}Bs ${bs.format(Math.abs(amount))}`;
}

/** Diferencia del cierre de caja: «Sobran Bs 5,00» o «Faltan Bs 5,00». */
export const differenceLabel = (d: number) => `${d > 0 ? "Sobran" : "Faltan"} ${formatBs(Math.abs(d))}`;

export const initials = (first: string, last: string) => `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();

/** Color del avatar sin foto: siempre el mismo para la misma persona (uno de los 6 de sucursales, con su par oscuro). */
export function avatarColor(seed: string) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `var(--color-branch-${(hash % 6) + 1})`;
}

/** «1 producto», «3 productos». */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** ¿Termina al día siguiente? (22:00–06:00) */
export const overnight = (s: { start: string; end: string }) => s.end < s.start;

/** «07:00–14:00»; si cruza la medianoche, «22:00–06:00 +1» (con `long`, «… (termina al día siguiente)»). */
export const shiftHours = (s: { start: string; end: string }, long = false) =>
  `${s.start}–${s.end}${overnight(s) ? (long ? " (termina al día siguiente)" : " +1") : ""}`;

/** «2 h 10 min», «45 min». */
export const duration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
};

/** Cómo se pagó una venta. */
export const paymentLabel = { efectivo: "Efectivo", qr: "QR", transferencia: "Transferencia" } as const;

/**
 * CSV para Excel en español: BOM (para los acentos), separador «;» y montos con coma decimal.
 * shortcut: CSV y no .xlsx; si piden un Excel con formato, agregar una librería.
 */
export function toCsv(rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    // Un texto que empieza con = + - @ Excel lo correría como fórmula: se antepone «'».
    const text = typeof v === "number" ? v.toFixed(2).replace(".", ",") : /^[=+\-@]/.test(v) ? `'${v}` : v;
    return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return "\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
