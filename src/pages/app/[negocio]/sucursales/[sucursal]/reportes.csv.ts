// Exportar las ventas y gastos de la sucursal en un rango de días, para abrir en Excel. Plan Negocio o superior.
import type { APIRoute } from "astro";
import { planLimits } from "@/data/plans";
import { membership, movements } from "@/data/queries";
import { fail } from "@/data/mappers";
import { parseRange, today } from "@/lib/dates";
import { paymentLabel, toCsv } from "@/lib/format";

export const GET: APIRoute = async ({ locals, params, url }) => {
  const m = membership(locals, params.negocio!);
  const branch = m?.branches.find((b) => b.slug === params.sucursal);
  if (!m || !branch || m.role !== "dueño") return new Response("No encontrado", { status: 404 });
  if (!planLimits[m.business.plan].reports) return new Response("Exportar es del plan Negocio.", { status: 403 });

  const { from, to } = parseRange(url.searchParams, today(), 366);
  const [moves, shifts] = await Promise.all([
    movements(locals.supabase, [branch.id], from, to),
    locals.supabase.from("shifts").select("id, name").eq("branch_id", branch.id),
  ]);
  fail(shifts.error);
  const shiftName = new Map((shifts.data ?? []).map((s) => [s.id, s.name]));
  const who = (r: { firstName: string; lastName: string }) => `${r.firstName} ${r.lastName}`.trim();

  const rows = [
    ...moves.sales.map((s) => [s.date, s.time, "Venta", `${s.items} productos`, shiftName.get(s.shiftId) ?? "", paymentLabel[s.payment], s.voided ?? s.total, s.voided === null ? "" : "Sí", who(s.recordedBy)]),
    ...moves.expenses.map((g) => [g.date, g.time, "Gasto", `${g.concept} (${g.category})`, shiftName.get(g.shiftId) ?? "", "", -(g.voided ?? g.amount), g.voided === null ? "" : "Sí", who(g.recordedBy)]),
  ].sort((a, b) => `${a[0]} ${a[1]}`.localeCompare(`${b[0]} ${b[1]}`));

  const csv = toCsv([["Fecha", "Hora", "Tipo", "Detalle", "Turno", "Método de pago", "Monto (Bs)", "Anulada", "Registró"], ...rows]);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${branch.slug}-${from}-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
};
