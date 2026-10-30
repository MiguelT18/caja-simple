import type { ShiftTone } from "@/data/mock";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pager, usePage } from "./Pager";
import { ShiftBadge } from "./ShiftBadge";

export interface EmployeeRow {
  id: string;
  initials: string;
  name: string;
  role: string;
  branch: string;
  shift: { name: string; tone: ShiftTone };
  active: boolean;
}

export default function EmployeesTable({ rows, pageSize = 10 }: { rows: EmployeeRow[]; pageSize?: number }) {
  const pager = usePage(rows, pageSize);
  return (
    <div>
      <div className="card table-wrap">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Sucursal</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pager.pageItems.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <span className="inline-flex items-center gap-3 whitespace-nowrap">
                    <span className="avatar-initials" aria-hidden="true">
                      {e.initials}
                    </span>
                    {e.name}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{e.role}</TableCell>
                <TableCell>{e.branch}</TableCell>
                <TableCell>
                  <ShiftBadge shift={e.shift} />
                </TableCell>
                <TableCell>
                  <span className={`chip ${e.active ? "chip-income" : "chip-neutral"}`}>
                    {e.active ? "Activo" : "Invitación pendiente"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager {...pager} onPage={pager.setPage} noun="empleados" />
    </div>
  );
}
