const bs = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** «Bs 1.240,00». Con `sign`, antepone + o − (DESIGN.md: los montos llevan signo); sin él, solo los negativos llevan −. */
export function formatBs(amount: number, sign?: "+" | "−") {
  return `${sign ?? (amount < 0 ? "−" : "")}Bs ${bs.format(Math.abs(amount))}`;
}

export const initials = (first: string, last: string) => `${first[0]}${last[0]}`.toUpperCase();
