import type { ShiftTone } from "@/data/mock";
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
export default function MovementsTable({ rows, pageSize = 6 }: { rows: Movement[]; pageSize?: number }) {
  const pager = usePage(rows, pageSize);
  return (
    <div>
      <div className="card table-wrap">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hora</TableHead>
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
