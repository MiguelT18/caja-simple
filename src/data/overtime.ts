import type { Supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { fail } from "./mappers";
import { recorders } from "./shared";

export type OvertimeStatus = Database["public"]["Enums"]["overtime_status"];
export const OVERTIME_STATUSES: { value: Exclude<OvertimeStatus, "pendiente">; label: string }[] = [
  { value: "pagada", label: "Pagada" },
  { value: "descontada", label: "Descontada" },
  { value: "repuesta", label: "Repuesta" },
];

export interface Overtime {
  id: string;
  closeId: string;
  personId: string | null;
  person: string;
  date: string;
  minutes: number;
  status: OvertimeStatus;
  note: string | null;
}

/**
 * Horas extra de la sucursal (private.record_overtime las anota al cerrar un turno fuera de horario): todas las
 * pendientes y las últimas decididas. RLS deja a la empleada ver solo las suyas.
 */
export async function branchOvertime(sb: Supabase, branchId: string) {
  const { data, error } = await sb
    .from("overtime")
    .select("id, close_id, person_id, business_date, minutes, status, note")
    .eq("branch_id", branchId)
    .order("business_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  fail(error);
  const rows = data ?? [];
  const people = await recorders(sb, rows.map((r) => r.person_id));
  const list = rows.map(
    (r): Overtime => ({
      id: r.id,
      closeId: r.close_id,
      personId: r.person_id,
      person: (r.person_id && [people.get(r.person_id)?.firstName, people.get(r.person_id)?.lastName].filter(Boolean).join(" ")) || "—",
      date: r.business_date,
      minutes: r.minutes,
      status: r.status,
      note: r.note,
    }),
  );
  const pending = list.filter((o) => o.status === "pendiente");
  // Lo pendiente por persona: lo que la dueña tiene por decidir.
  const owed = new Map<string, { person: string; minutes: number }>();
  for (const o of pending) {
    const key = o.personId ?? o.person;
    owed.set(key, { person: o.person, minutes: (owed.get(key)?.minutes ?? 0) + o.minutes });
  }
  return { pending, decided: list.filter((o) => o.status !== "pendiente").slice(0, 30), owed: [...owed.values()] };
}
