import type { ShiftTone } from "@/data/types";
import { formatBs } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pager, usePage } from "./Pager";
import { ShiftBadge } from "./ShiftBadge";

export interface ExpenseRow {
  id: string;
  date: string;
  time: string;
  concept: string;
  category: string;
  shift: { name: string; tone: ShiftTone };
  by: string;
  amount: number;
}

const dayLabel = new Intl.DateTimeFormat("es-BO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const when = (g: ExpenseRow) => `${dayLabel.format(new Date(`${g.date}T12:00:00Z`))} · ${g.time}`;

/** Historial de gastos, 10 por página. En un contenedor angosto (celular) es una lista; desde 42rem, la tabla. */
export default function ExpensesTable({ rows, pageSize = 10 }: { rows: ExpenseRow[]; pageSize?: number }) {
  const pager = usePage(rows, pageSize);
  if (rows.length === 0) return <p className="card empty-state">No hay gastos en los últimos 7 días.</p>;
  return (
    <div className="@container">
      {/* Lista: concepto y monto arriba; cuándo y quién debajo; categoría y turno al pie. */}
      <ul className="m-0 grid list-none gap-1 p-0 @2xl:hidden" aria-label="Historial de gastos">
        {pager.pageItems.map((g) => (
          <li key={g.id} className="grid gap-1.5 rounded-md py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{g.concept}</span>
              <span className="amount-expense shrink-0 font-bold tabular-nums">{formatBs(g.amount, "−")}</span>
            </div>
            <p className="m-0 text-sm text-muted-foreground tabular-nums">
              {when(g)}
              {g.by && ` · ${g.by}`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <span className="chip chip-neutral">{g.category}</span>
              <ShiftBadge shift={g.shift} />
            </div>
          </li>
        ))}
      </ul>
      <div className="table-wrap hidden @2xl:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Concepto</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Registró</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pager.pageItems.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                  {when(g)}
                </TableCell>
                <TableCell>{g.concept}</TableCell>
                <TableCell>
                  <span className="chip chip-neutral">{g.category}</span>
                </TableCell>
                <TableCell>
                  <ShiftBadge shift={g.shift} />
                </TableCell>
                <TableCell className="text-muted-foreground">{g.by}</TableCell>
                <TableCell className="amount-expense text-right tabular-nums">{formatBs(g.amount, "−")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager {...pager} onPage={pager.setPage} noun="gastos" />
    </div>
  );
}
