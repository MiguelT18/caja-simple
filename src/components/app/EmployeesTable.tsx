import { actions } from "astro:actions";
import { Check, Ellipsis, Store, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ShiftTone } from "@/data/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pager, usePage } from "./Pager";
import { ShiftBadge } from "./ShiftBadge";
import { Field, selectClass, useActionForm } from "./products/form";
import { confirmDialog } from "@/scripts/dialogs";

export interface EmployeeRow {
  id: string;
  initials: string;
  name: string;
  email: string;
  role: string;
  branchId: string;
  branch: string;
  shiftId?: string;
  shift?: { name: string; tone: ShiftTone };
  active: boolean;
}

interface BranchOption {
  id: string;
  name: string;
}

interface ShiftOption {
  id: string;
  branchId: string;
  name: string;
  start: string;
  end: string;
  tone: ShiftTone;
}

interface Props {
  rows: EmployeeRow[];
  branches: BranchOption[];
  shifts: ShiftOption[];
  pageSize?: number;
}

export default function EmployeesTable({ rows, branches, shifts, pageSize = 10 }: Props) {
  const pager = usePage(rows, pageSize);
  const [error, setError] = useState("");
  // Persona y sucursal elegidas en el menú: abre el diálogo para confirmar el turno.
  const [moving, setMoving] = useState<{ employee: EmployeeRow; branch: BranchOption } | null>(null);
  if (rows.length === 0) return <p className="card empty-state">Todavía no invitaste a nadie a tu equipo.</p>;

  async function remove(e: EmployeeRow) {
    if (!(await confirmDialog(`¿Quitar a ${e.name} de tu equipo? Ya no podrá registrar ventas ni gastos.`, { confirmLabel: "Quitar", danger: true }))) return;
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
                  {/* modal={false}: el menú abre un diálogo; así Radix no deja la página bloqueada al cerrarlo. */}
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Opciones de ${e.name}`}>
                        <Ellipsis />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Asignar a sucursal</DropdownMenuLabel>
                      {branches.map((b) => {
                        const current = b.id === e.branchId;
                        return (
                          <DropdownMenuItem key={b.id} onSelect={() => setMoving({ employee: e, branch: b })}>
                            <Store />
                            <span className="min-w-0 flex-1 truncate" title={b.name}>{b.name}</span>
                            {current && (
                              <>
                                <Check className="text-foreground" />
                                <span className="sr-only">(actual)</span>
                              </>
                            )}
                          </DropdownMenuItem>
                        );
                      })}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => remove(e)}>
                        <Trash2 />
                        Quitar del equipo
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
      {moving && (
        <AssignDialog
          key={`${moving.employee.id}-${moving.branch.id}`}
          employee={moving.employee}
          branch={moving.branch}
          shifts={shifts.filter((s) => s.branchId === moving.branch.id)}
          onClose={() => setMoving(null)}
        />
      )}
    </div>
  );
}

/** Confirma el cambio de sucursal eligiendo el turno, que es de cada sucursal. También sirve para cambiar solo el turno. */
function AssignDialog({ employee, branch, shifts, onClose }: { employee: EmployeeRow; branch: BranchOption; shifts: ShiftOption[]; onClose: () => void }) {
  const save = useActionForm((form) => actions.reassignEmployee(form) as never);
  const same = branch.id === employee.branchId;
  // Propone el turno actual si sigue en la misma sucursal; si cambia, uno del mismo momento del día.
  const suggested = (same && shifts.find((s) => s.id === employee.shiftId)) || shifts.find((s) => s.tone === employee.shift?.tone) || shifts[0];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{same ? `Cambiar turno de ${employee.name}` : `Asignar a ${employee.name} a ${branch.name}`}</DialogTitle>
          <DialogDescription>
            {same ? `Sigue en ${branch.name}.` : `Deja ${employee.branch} y pasa a trabajar en ${branch.name}.`} Elige su turno en esta sucursal.
          </DialogDescription>
        </DialogHeader>
        {shifts.length === 0 ? (
          <p className="notice m-0">{branch.name} todavía no tiene turnos. Créalos en Turnos de esa sucursal y vuelve a intentarlo.</p>
        ) : (
          <form className="grid min-w-0 gap-4" onSubmit={save.onSubmit} noValidate>
            <input type="hidden" name="id" value={employee.id} />
            <input type="hidden" name="branchId" value={branch.id} />
            <Field id="assign-shift" label="Turno" error={save.errors.shiftId}>
              <select id="assign-shift" name="shiftId" className={selectClass} defaultValue={suggested?.id} required>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.start}–{s.end}
                  </option>
                ))}
              </select>
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
              <Button type="submit" disabled={save.busy}>
                {save.busy ? "Guardando…" : same ? "Cambiar turno" : "Asignar"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
