// Gastos fijos, pendientes y pagos de una o varias sucursales. Siempre frescos: no van a la caché.
import { clock, dayOf } from "@/lib/dates";
import { nextOccurrence, payableOrder, type Frequency } from "@/lib/payables";
import type { Supabase } from "@/lib/supabase";
import { fail } from "./mappers";
import { recorders, unknownRecorder } from "./shared";
import type { Recorder } from "./types";

export interface Payable {
  id: string;
  branchId: string;
  concept: string;
  category: string;
  /** El día que tocaba pagar: con esa fecha queda el gasto al pagarlo. */
  owedOn: string;
  dueOn: string | null;
  amount: number;
  paid: number;
  balance: number;
  /** Viene de un gasto fijo (lo generó la base). */
  fixed: boolean;
  /** El gasto fijo que lo generó (sus períodos sin pagar se ven en Gastos fijos). */
  fixedId: string | null;
  createdById: string | null;
  /** Es el sueldo de esta ficha: esa persona confirma que se lo pagaron. */
  employeeId: string | null;
  /** Quién lo paga: la sucursal (de la caja) o solo la dueña. Lo decide ella. */
  payer: Payer;
  /** Es el reembolso de un pago de bolsillo (a employeeId). */
  reimbursement: boolean;
}

export type Payer = "sucursal" | "dueña";

export interface FixedExpense {
  id: string;
  branchId: string;
  concept: string;
  category: string;
  amount: number;
  frequency: Frequency;
  startsOn: string;
  graceDays: number | null;
  employeeId: string | null;
  payer: Payer;
  next: string;
}

/** Un pago hecho fuera de la caja: no es un gasto de ningún turno. */
export interface OutsidePayment {
  id: string;
  branchId: string;
  concept: string;
  category: string;
  owedOn: string;
  amount: number;
  /** Día (en Bolivia) y hora del pago. */
  paidOn: string;
  time: string;
  paidById: string | null;
  paidBy: Recorder;
}

/**
 * Lo que falta pagar en esas sucursales, sus gastos fijos (RLS: solo la dueña los ve) y, si viene `range`,
 * los pagos fuera de la caja hechos en esos días.
 */
export async function payables(sb: Supabase, branchIds: string[], today: string, range?: { from: string; to: string }) {
  const [open, fixed, outside, settled] = await Promise.all([
    sb.from("pending_balances").select("*").in("branch_id", branchIds).is("canceled_at", null).gt("balance", 0),
    sb.from("fixed_expenses").select("*").in("branch_id", branchIds).is("archived_at", null).order("concept"),
    range
      ? sb
          .from("pending_payments")
          .select("id, branch_id, amount, paid_at, paid_by, pending_expenses(concept, category, owed_on)")
          .in("branch_id", branchIds)
          .is("expense_id", null)
          .is("voided_at", null)
          // Bolivia es UTC−4 todo el año (sin horario de verano).
          .gte("paid_at", `${range.from}T00:00:00-04:00`)
          .lte("paid_at", `${range.to}T23:59:59.999-04:00`)
          .order("paid_at", { ascending: false })
      : undefined,
    // Saldados en el rango (por el día que tocaba): los «completados» de Por pagar.
    range
      ? sb
          .from("pending_balances")
          .select("*")
          .in("branch_id", branchIds)
          .is("canceled_at", null)
          .lte("balance", 0)
          .gte("owed_on", range.from)
          .lte("owed_on", range.to)
          .order("owed_on", { ascending: false })
      : undefined,
  ]);
  fail(settled?.error ?? null);
  fail(open.error);
  fail(fixed.error);
  fail(outside?.error ?? null);

  const toPayable = (p: NonNullable<typeof open.data>[number]): Payable => ({
      id: p.id!,
      branchId: p.branch_id!,
      concept: p.concept!,
      category: p.category!,
      owedOn: p.owed_on!,
      dueOn: p.due_on,
      amount: Number(p.amount),
      paid: Number(p.paid ?? 0),
      balance: Number(p.balance ?? p.amount),
      fixed: p.fixed_expense_id !== null,
      fixedId: p.fixed_expense_id,
      createdById: p.created_by,
      employeeId: p.employee_id,
      payer: p.payer === "dueña" ? "dueña" : "sucursal",
      reimbursement: !!p.reimbursement,
    });
  const pending = (open.data ?? []).map(toPayable).sort(payableOrder);

  const fixedList: FixedExpense[] = (fixed.data ?? []).map((f) => ({
    id: f.id,
    branchId: f.branch_id,
    concept: f.concept,
    category: f.category,
    amount: Number(f.amount),
    frequency: f.frequency,
    startsOn: f.starts_on,
    graceDays: f.grace_days,
    employeeId: f.employee_id,
    payer: f.payer === "dueña" ? "dueña" : "sucursal",
    next: nextOccurrence(f.starts_on, f.frequency, today),
  }));

  const people = await recorders(sb, (outside?.data ?? []).map((x) => x.paid_by));
  const outsideList: OutsidePayment[] = (outside?.data ?? []).flatMap((x) =>
    x.pending_expenses
      ? [
          {
            id: x.id,
            branchId: x.branch_id,
            concept: x.pending_expenses.concept,
            category: x.pending_expenses.category,
            owedOn: x.pending_expenses.owed_on,
            amount: Number(x.amount),
            paidOn: dayOf(x.paid_at),
            time: clock(x.paid_at),
            paidById: x.paid_by,
            paidBy: (x.paid_by && people.get(x.paid_by)) || unknownRecorder,
          },
        ]
      : [],
  );

  return { pending, fixed: fixedList, outside: outsideList, settled: (settled?.data ?? []).map(toPayable) };
}

/** Lo pagado de los pendientes desde `from` (día de Bolivia), de la caja o fuera, sin lo anulado. */
export async function paidSince(sb: Supabase, branchIds: string[], from: string) {
  const { data, error } = await sb
    .from("pending_payments")
    .select("amount, expenses(voided_at)")
    .in("branch_id", branchIds)
    .is("voided_at", null)
    .gte("paid_at", `${from}T00:00:00-04:00`);
  fail(error);
  return (data ?? []).filter((x) => !x.expenses?.voided_at).reduce((s, x) => s + Number(x.amount), 0);
}
