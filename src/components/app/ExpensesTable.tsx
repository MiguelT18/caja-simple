import { actions } from "astro:actions";
import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ShiftTone } from "@/data/types";
import { formatBs } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { AppDialog } from "./AppDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableCaption, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { confirmDialog, toast } from "@/scripts/dialogs";
import { refreshRegions } from "@/scripts/refresh";
import { Pager, usePage } from "./Pager";
import { ShiftBadge } from "./ShiftBadge";
import { Field, safeAction, useActionForm } from "./products/form";

export interface ExpenseRow {
  id: string;
  date: string;
  time: string;
  concept: string;
  category: string;
  shift: { name: string; tone: ShiftTone };
  by: string;
  amount: number;
  /** Anulado: se ve tachado, con su rótulo, y no suma. */
  voided?: boolean;
  /** Muestra «Editar» y «Eliminar» (la base decide igual). */
  canEdit?: boolean;
}

const dayLabel = new Intl.DateTimeFormat("es-BO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const when = (g: ExpenseRow) => `${dayLabel.format(new Date(`${g.date}T12:00:00Z`))} · ${g.time}`;

/** Historial de gastos, 10 por página. En un contenedor angosto (celular) es una lista; desde 42rem, la tabla. */
export default function ExpensesTable({
  rows,
  pageSize = 10,
  categories = [],
  empty = "No hay gastos en los últimos 7 días.",
}: {
  rows: ExpenseRow[];
  pageSize?: number;
  /** Sugerencias para la categoría al editar. */
  categories?: string[];
  empty?: string;
}) {
  const pager = usePage(rows, pageSize);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  if (rows.length === 0) return <p className="card empty-state">{empty}</p>;
  const withActions = rows.some((g) => g.canEdit);

  async function remove(g: ExpenseRow) {
    const ok = await confirmDialog(`«${g.concept}» por ${formatBs(g.amount)} queda registrado como anulado y deja de contar en la caja.`, {
      title: "¿Eliminar el gasto?",
      confirmLabel: "Eliminar gasto",
      danger: true,
    });
    if (!ok) return;
    const { error } = await safeAction(() => actions.voidExpense({ expenseId: g.id }));
    if (error) return toast(error.message, "error");
    toast("Gasto eliminado.", "success");
    await refreshRegions();
  }

  const menu = (g: ExpenseRow) =>
    g.canEdit && (
      // modal={false}: el menú abre un diálogo; así Radix no deja la página bloqueada al cerrarlo.
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Opciones del gasto ${g.concept}`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(g)}>
            <Pencil />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => remove(g)}>
            <Trash2 />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  const amountClass = (g: ExpenseRow) => (g.voided ? "text-muted-foreground line-through" : "amount-expense");
  const amount = (g: ExpenseRow) => (
    <>
      {g.voided && <span className="sr-only">Anulado, no cuenta: </span>}
      {formatBs(g.amount, "−")}
    </>
  );
  const voidedChip = (g: ExpenseRow) => g.voided && <span className="chip chip-warning">Anulado</span>;
  return (
    <div className="@container">
      {/* Lista: concepto y monto arriba; cuándo y quién debajo; categoría y turno al pie. */}
      <ul className="m-0 grid list-none gap-1 p-0 @2xl:hidden" aria-label="Historial de gastos">
        {pager.pageItems.map((g) => (
          <li key={g.id} className="grid gap-1.5 rounded-md py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{g.concept}</span>
              <span className="inline-flex shrink-0 items-center gap-1">
                <span className={`${amountClass(g)} font-bold tabular-nums`}>{amount(g)}</span>
                {menu(g)}
              </span>
            </div>
            <p className="m-0 text-sm text-muted-foreground tabular-nums">
              {when(g)}
              {g.by && ` · ${g.by}`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <span className="chip chip-neutral">{g.category}</span>
              <ShiftBadge shift={g.shift} />
              {voidedChip(g)}
            </div>
          </li>
        ))}
      </ul>
      <div className="table-wrap hidden @2xl:block">
        <Table label="Gastos">
          <TableCaption className="sr-only">Gastos</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Concepto</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Registró</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              {withActions && (
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pager.pageItems.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                  {when(g)}
                </TableCell>
                <TableCell>
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {g.concept}
                    {voidedChip(g)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="chip chip-neutral">{g.category}</span>
                </TableCell>
                <TableCell>
                  <ShiftBadge shift={g.shift} />
                </TableCell>
                <TableCell className="text-muted-foreground">{g.by}</TableCell>
                <TableCell className={`${amountClass(g)} text-right tabular-nums`}>{amount(g)}</TableCell>
                {withActions && <TableCell className="text-right">{menu(g)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager {...pager} onPage={pager.setPage} noun="gastos" />
      {editing && <EditDialog key={editing.id} expense={editing} categories={categories} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Corrige concepto, categoría o monto. Turno, fecha y quién lo registró no cambian. */
function EditDialog({ expense, categories, onClose }: { expense: ExpenseRow; categories: string[]; onClose: () => void }) {
  const save = useActionForm((form) => actions.updateExpense(form) as never, onClose, (form) => `Gasto «${form.get("concept") ?? expense.concept}» actualizado.`);
  return (
    <AppDialog title="Editar gasto" description={`${when(expense)} · turno ${expense.shift.name.toLowerCase()}`} onClose={onClose}>
        <form className="grid min-w-0 gap-4" onSubmit={save.onSubmit} noValidate>
          <input type="hidden" name="expenseId" value={expense.id} />
          <Field id="edit-concept" label="Concepto" error={save.errors.concept}>
            <input id="edit-concept" name="concept" className="input" defaultValue={expense.concept} maxLength={120} required />
          </Field>
          <Field id="edit-category" label="Categoría" error={save.errors.category}>
            <input id="edit-category" name="category" className="input" list="edit-categories" defaultValue={expense.category} maxLength={40} required />
          </Field>
          <datalist id="edit-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Field id="edit-amount" label="Monto (Bs)" error={save.errors.amount}>
            <input id="edit-amount" name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" className="input num" defaultValue={expense.amount} required />
          </Field>
          {save.message && (
            <p className="notice notice-error m-0" role="alert">
              {save.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" {...save.submitProps}>
              {save.busy ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
    </AppDialog>
  );
}
