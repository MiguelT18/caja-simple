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

/** Historial de gastos, 10 por página. */
export default function ExpensesTable({ rows, pageSize = 10 }: { rows: ExpenseRow[]; pageSize?: number }) {
  const pager = usePage(rows, pageSize);
  if (rows.length === 0) return <p className="card empty-state">No hay gastos en los últimos 7 días.</p>;
  return (
    <div>
      <div className="table-wrap">
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
                  {dayLabel.format(new Date(`${g.date}T12:00:00Z`))} · {g.time}
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
