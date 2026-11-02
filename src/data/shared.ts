// Consultas que usan tanto la página de sucursal como la del negocio.
import { getMany, setMany } from "@/lib/cache";
import { clock } from "@/lib/dates";
import type { Supabase } from "@/lib/supabase";
import { fail } from "./mappers";
import type { Membership } from "./session";
import type { Expense, Recorder, Sale } from "./types";

/** Nombres de quienes registraron movimientos. RLS solo deja ver a quien comparte negocio. */
async function recorders(sb: Supabase, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const map = new Map<string, Recorder>();
  if (unique.length === 0) return map;
  const { data, error } = await sb.from("profiles").select("id, first_name, last_name").in("id", unique);
  fail(error);
  for (const p of data ?? []) map.set(p.id, { firstName: p.first_name, lastName: p.last_name });
  return map;
}
const unknownRecorder: Recorder = { firstName: "—", lastName: "" };

/** URL firmada para cada foto (los buckets son privados). */
export async function imageUrls(sb: Supabase, paths: (string | null | undefined)[], bucket = "product-images") {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  const map = new Map<string, string>();
  if (list.length === 0) return map;
  // Las URLs firmadas se guardan 50 min (vencen a los 60). Las rutas solo salen de filas que RLS ya dejó leer.
  const key = (path: string) => `img:${bucket}:${path}`;
  const hits = await getMany(list.map(key));
  list.forEach((path, i) => hits[i] && map.set(path, hits[i]));
  const missing = list.filter((path) => !map.has(path));
  if (missing.length === 0) return map;
  const { data } = await sb.storage.from(bucket).createSignedUrls(missing, 60 * 60);
  const fresh: [string, string][] = [];
  for (const item of data ?? [])
    if (item.signedUrl && item.path) {
      map.set(item.path, item.signedUrl);
      fresh.push([key(item.path), item.signedUrl]);
    }
  await setMany(fresh, 50 * 60);
  return map;
}

/** Fotos de las fachadas de un negocio (enlaces firmados por una hora), por id de sucursal. Solo pide las que tienen foto. */
export async function branchImages(locals: App.Locals, m: Membership) {
  const urls = await imageUrls(locals.supabase, m.branches.map((b) => b.imagePath), "branch-images");
  return new Map(m.branches.flatMap((b) => (b.imagePath && urls.has(b.imagePath) ? [[b.id, urls.get(b.imagePath)!]] : [])));
}

/** Ventas y gastos desde `from` en esas sucursales. */
export async function movements(sb: Supabase, branchIds: string[], from: string) {
  const [sales, expenses] = await Promise.all([
    sb.from("sale_totals").select("*").in("branch_id", branchIds).gte("business_date", from).order("occurred_at", { ascending: false }),
    sb.from("expenses").select("*").in("branch_id", branchIds).gte("business_date", from).order("occurred_at", { ascending: false }),
  ]);
  fail(sales.error);
  fail(expenses.error);
  const people = await recorders(sb, [...(sales.data ?? []), ...(expenses.data ?? [])].map((m) => m.recorded_by));
  const recordedBy = (id: string | null) => (id && people.get(id)) || unknownRecorder;

  const saleList: Sale[] = (sales.data ?? []).map((s) => ({
    id: s.sale_id,
    branchId: s.branch_id,
    date: s.business_date,
    time: clock(s.occurred_at),
    shiftId: s.shift_id,
    recordedBy: recordedBy(s.recorded_by),
    items: s.items ?? 0,
    total: Number(s.total ?? 0),
  }));
  const expenseList: Expense[] = (expenses.data ?? []).map((g) => ({
    id: g.id,
    branchId: g.branch_id,
    date: g.business_date,
    time: clock(g.occurred_at),
    shiftId: g.shift_id,
    recordedBy: recordedBy(g.recorded_by),
    concept: g.concept,
    category: g.category,
    amount: Number(g.amount),
  }));
  return { sales: saleList, expenses: expenseList };
}

/** Cierres de hoy y los que siguen abiertos de otro día (un turno nocturno abierto ayer). */
export async function closesOf(sb: Supabase, branchIds: string[], date: string) {
  const { data, error } = await sb
    .from("shift_closes")
    .select("*")
    .in("branch_id", branchIds)
    .or(`business_date.eq.${date},status.eq.en-curso`);
  fail(error);
  return data ?? [];
}
