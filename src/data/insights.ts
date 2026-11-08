// Ideas para vender más: reglas sobre las ventas reales del negocio (nada inventado). Puras, para probarlas.
import { formatBs } from "@/lib/format";
import type { BusinessStats } from "./stats";

export const WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];
/** «los viernes», por dow (1 = lunes). */
export const weekdayName = (dow: number) => WEEKDAYS[dow - 1] ?? "";
export const hourSpan = (h: number) => `${String(h).padStart(2, "0")}:00 a ${String((h + 1) % 24).padStart(2, "0")}:00`;

export const daysSince = (date: string, today: string) => Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);

/** Promedio por día con ventas de cada día de la semana: el mejor y el peor (solo si hay al menos 2). */
export function weekdayRange(weekdays: BusinessStats["weekdays"]) {
  const avg = weekdays.filter((w) => w.days > 0).map((w) => ({ dow: w.dow, avg: w.revenue / w.days }));
  if (avg.length < 2) return null;
  const sorted = [...avg].sort((a, b) => b.avg - a.avg);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

export function peakHour(hours: BusinessStats["hours"]) {
  const total = hours.reduce((n, h) => n + h.revenue, 0);
  if (total <= 0) return null;
  const top = hours.reduce((a, b) => (b.revenue > a.revenue ? b : a));
  return { hour: top.hour, share: top.revenue / total };
}

/** Variación en % frente al período anterior; null si no hay con qué comparar. */
export const trend = (current: number, previous: number | null) => (previous && previous > 0 ? Math.round(((current - previous) / previous) * 100) : null);

export interface Idea {
  kind: "combo" | "estrella" | "quieto" | "dia" | "hora" | "ticket" | "baja";
  text: string;
  href?: string;
  linkLabel?: string;
}

export function marketingIdeas({
  stats,
  previous,
  days,
  today,
  branches,
  soldIn,
  catalogHref,
}: {
  stats: BusinessStats;
  previous: number | null;
  days: number | null;
  today: string;
  /** Sucursales del negocio con su enlace al inventario. */
  branches: { id: string; name: string; inventoryHref: string }[];
  /** Por producto, en qué sucursales está en el inventario. */
  soldIn: Map<string, Set<string>>;
  catalogHref: string;
}): Idea[] {
  const ideas: Idea[] = [];

  const pair = stats.pairs[0];
  if (pair && pair.times >= 3)
    ideas.push({
      kind: "combo",
      text: `Arma un combo con «${pair.a}» y «${pair.b}»: se vendieron juntos ${pair.times} veces.`,
      // Con los ids, el catálogo abre «Armar combo» con los dos ya elegidos.
      href: pair.aId && pair.bId ? `${catalogHref}?combo=${pair.aId},${pair.bId}` : catalogHref,
      linkLabel: pair.aId && pair.bId ? "Armar el combo" : "Ir al catálogo",
    });

  const star = stats.products[0];
  const missing = star && branches.length > 1 ? branches.find((b) => !soldIn.get(star.id)?.has(b.id)) : undefined;
  if (star && missing)
    ideas.push({
      kind: "estrella",
      text: `Tu más vendido, «${star.name}», no se vende en ${missing.name}: agrégalo a su inventario.`,
      href: missing.inventoryHref,
      linkLabel: `Inventario de ${missing.name}`,
    });

  const quiet = stats.quiet[0];
  if (quiet)
    ideas.push({
      kind: "quieto",
      text: quiet.lastSale
        ? `«${quiet.name}» lleva ${daysSince(quiet.lastSale, today)} días sin venderse y tiene ${quiet.stock} en stock: ponlo en oferta o más a la vista.`
        : `«${quiet.name}» nunca se vendió y tiene ${quiet.stock} en stock: ponlo en oferta o más a la vista.`,
    });

  const week = weekdayRange(stats.weekdays);
  if (week && week.best.avg > 0) {
    const drop = Math.round((1 - week.worst.avg / week.best.avg) * 100);
    if (drop >= 30)
      ideas.push({ kind: "dia", text: `Los ${weekdayName(week.worst.dow)} vendes ${drop} % menos que los ${weekdayName(week.best.dow)}: prueba una promoción ese día.` });
  }

  const peak = peakHour(stats.hours);
  if (peak && peak.share >= 0.15)
    ideas.push({ kind: "hora", text: `Tus ventas se juntan de ${hourSpan(peak.hour)}: ten el stock listo y a alguien más en caja a esa hora.` });

  const tickets = stats.branches
    .filter((b) => b.sales > 0)
    .map((b) => ({ ...b, name: branches.find((x) => x.id === b.id)?.name ?? "", ticket: b.revenue / b.sales }))
    .sort((a, b) => b.ticket - a.ticket);
  if (tickets.length >= 2) {
    const [best, worst] = [tickets[0], tickets[tickets.length - 1]];
    if (worst.ticket < best.ticket * 0.7)
      ideas.push({
        kind: "ticket",
        text: `En ${worst.name} cada venta deja ${formatBs(worst.ticket)}; en ${best.name}, ${formatBs(best.ticket)}: ofrece un producto extra al cobrar.`,
      });
  }

  const change = trend(
    stats.branches.reduce((n, b) => n + b.revenue, 0),
    previous,
  );
  if (change !== null && change <= -10 && days)
    ideas.push({ kind: "baja", text: `Vendiste ${-change} % menos que en los ${days} días anteriores: revisa qué productos bajaron y refuerza los que más se venden.` });

  return ideas.slice(0, 4);
}
