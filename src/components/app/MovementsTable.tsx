import type { ShiftTone } from "@/data/types";
import { formatBs } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pager, usePage } from "./Pager";
import { ShiftBadge } from "./ShiftBadge";

export interface Movement {
  id: string;
  time: string;
  label: string;
  shift: { name: string; tone: ShiftTone };
  by: string;
  amount: number;
  kind: "sale" | "expense";
}

/** Movimientos del día (ventas y gastos), los más recientes primero. */
export default function MovementsTable({
  rows,
  pageSize = 6,
  empty = "Todavía no hay ventas ni gastos hoy.",
  timeLabel = "Hora",
}: {
  rows: Movement[];
  pageSize?: number;
  empty?: string;
  /** «Cuándo» si `time` lleva también el día. */
  timeLabel?: string;
}) {
  const pager = usePage(rows, pageSize);
  if (rows.length === 0) return <p className="card empty-state">{empty}</p>;
  return (
    <div>
      <div className="table-wrap">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{timeLabel}</TableHead>
              <TableHead>Movimiento</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Registró</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pager.pageItems.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-muted-foreground tabular-nums">{m.time}</TableCell>
                <TableCell>{m.label}</TableCell>
                <TableCell>
                  <ShiftBadge shift={m.shift} />
                </TableCell>
                <TableCell className="text-muted-foreground">{m.by}</TableCell>
                <TableCell className={`text-right tabular-nums ${m.kind === "sale" ? "amount-income" : "amount-expense"}`}>
                  {formatBs(m.amount, m.kind === "sale" ? "+" : "−")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager {...pager} onPage={pager.setPage} noun="movimientos" />
    </div>
  );
}
