import { actions } from "astro:actions";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import type { ShiftTone } from "@/data/types";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pager, usePage } from "./Pager";
import { ShiftBadge } from "./ShiftBadge";

export interface EmployeeRow {
  id: string;
  initials: string;
  name: string;
  email: string;
  role: string;
  branch: string;
  shift?: { name: string; tone: ShiftTone };
  active: boolean;
}

export default function EmployeesTable({ rows, pageSize = 10 }: { rows: EmployeeRow[]; pageSize?: number }) {
  const pager = usePage(rows, pageSize);
  const [error, setError] = useState("");
  if (rows.length === 0) return <p className="card empty-state">Todavía no invitaste a nadie a tu equipo.</p>;

  async function remove(e: EmployeeRow) {
    if (!window.confirm(`¿Quitar a ${e.name} de tu equipo? Ya no podrá registrar ventas ni gastos.`)) return;
    const form = new FormData();
    form.set("id", e.id);
    const { error } = await actions.removeEmployee(form);
    if (error) setError(error.message);
    else window.location.reload();
  }

  return (
    <div>
      <div className="table-wrap">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Sucursal</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
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
                    <span className="grid">
                      {e.name}
                      <span className="text-muted-foreground text-sm">{e.email}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{e.role}</TableCell>
                <TableCell>{e.branch}</TableCell>
                <TableCell>{e.shift ? <ShiftBadge shift={e.shift} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  <span className={`chip ${e.active ? "chip-income" : "chip-neutral"}`}>
                    {e.active ? "Activo" : "Invitación pendiente"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon-sm" aria-label={`Quitar a ${e.name}`} onClick={() => remove(e)}>
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {error && (
        <p className="notice notice-error mt-3" role="alert">
          {error}
        </p>
      )}
      <Pager {...pager} onPage={pager.setPage} noun="empleados" />
    </div>
  );
}
