import { actions } from "astro:actions";
import { Check, Clock, Crown, Ellipsis, Store, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ShiftTone } from "@/data/types";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { AppDialog } from "./AppDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pager, usePage } from "./Pager";
import { ShiftBadge } from "./ShiftBadge";
import { Avatar } from "./Avatar";
import { Field, safeAction, selectClass, useActionForm } from "./products/form";
import { refreshRegions } from "@/scripts/refresh";
import { confirmDialog, flashToast, toast } from "@/scripts/dialogs";

export interface EmployeeRow {
  id: string;
  /** Decide el color del avatar (la persona, si ya tiene cuenta). */
  avatarSeed: string;
  name: string;
  email: string;
  role: string;
  branchId: string;
  branch: string;
  shiftIds: string[];
  shifts: { name: string; tone: ShiftTone }[];
  /** Minutos antes del inicio y después del cierre en los que abre sus turnos. */
  openEarlyMin: number;
  openLateMin: number;
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
  /** Nombre del negocio, para la confirmación de pasar la propiedad. */
  business: string;
  branches: BranchOption[];
  shifts: ShiftOption[];
  pageSize?: number;
}

export default function EmployeesTable({ rows, business, branches, shifts, pageSize = 10 }: Props) {
  const pager = usePage(rows, pageSize);
  // Persona y sucursal elegidas en el menú: abre el diálogo para elegir sus turnos.
  const [moving, setMoving] = useState<{ employee: EmployeeRow; branch: BranchOption } | null>(null);
  if (rows.length === 0) return <p className="card empty-state">Todavía no invitaste a nadie a tu equipo.</p>;

  async function remove(e: EmployeeRow) {
    if (
      !(await confirmDialog(`Ya no podrá entrar a ${business} ni registrar ventas o gastos. Lo que registró se queda.`, {
        title: `¿Quitar a ${e.name} del equipo?`,
        confirmLabel: "Quitar del equipo",
        danger: true,
      }))
    )
      return;
    const form = new FormData();
    form.set("id", e.id);
    const { error } = await safeAction(() => actions.removeEmployee(form));
    // El aviso flotante se ve aunque la tabla tenga scroll (abajo de la tabla quedaba lejos de la fila).
    if (error) toast(error.message, "error");
    else {
      toast(`${e.name} ya no está en tu equipo.`, "success");
      await refreshRegions();
    }
  }

  async function transfer(e: EmployeeRow) {
    const ok = await confirmDialog(
      `${e.name} será la dueña de ${business}: administrará sucursales, equipo, catálogo y el plan. Tú quedas en el equipo, en su sucursal y turno, y ya no podrás administrar el negocio. Solo ${e.name} podrá devolverte la propiedad.`,
      { title: `¿Pasar ${business} a ${e.name}?`, confirmLabel: "Sí, pasar la propiedad", danger: true },
    );
    if (!ok) return;
    const form = new FormData();
    form.set("id", e.id);
    const { error } = await safeAction(() => actions.transferOwnership(form));
    if (error) return toast(error.message, "error");
    // Ya no es dueña: las páginas del negocio dejan de estar a su alcance. Vuelve a «Tus negocios».
    flashToast(`${e.name} ahora es la dueña de ${business}.`);
    location.assign("/app");
  }

  return (
    <div>
      <div className="table-wrap">
        <Table label="Empleados">
          <TableCaption className="sr-only">Tu equipo</TableCaption>
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
                    <Avatar seed={e.avatarSeed} />
                    <span className="grid">
                      {e.name}
                      <span className="text-muted-foreground text-sm">{e.email}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{e.role}</TableCell>
                <TableCell>{e.branch}</TableCell>
                <TableCell>
                  {e.shifts.length ? (
                    <span className="flex flex-wrap gap-1">
                      {e.shifts.map((s) => <ShiftBadge key={s.name} shift={s} />)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
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
                      <DropdownMenuItem onSelect={() => setMoving({ employee: e, branch: { id: e.branchId, name: e.branch } })}>
                        <Clock />
                        Cambiar turnos
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
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
                      {/* Solo a quien ya aceptó la invitación: tiene cuenta para entrar como dueña. */}
                      {e.active && (
                        <DropdownMenuItem onSelect={() => transfer(e)}>
                          <Crown />
                          Pasarle la propiedad del negocio
                        </DropdownMenuItem>
                      )}
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

/** Elige los turnos (uno o más) de la persona en la sucursal: la suya, para cambiar solo los turnos, u otra, para pasarla ahí. */
function AssignDialog({ employee, branch, shifts, onClose }: { employee: EmployeeRow; branch: BranchOption; shifts: ShiftOption[]; onClose: () => void }) {
  const save = useActionForm((form) => actions.reassignEmployee(form) as never, onClose, `Cambios de ${employee.name} guardados.`);
  const same = branch.id === employee.branchId;
  // En su sucursal, marca sus turnos; si cambia, los del mismo momento del día (o el primero).
  const tones = new Set(employee.shifts.map((s) => s.tone));
  const suggested = same
    ? shifts.filter((s) => employee.shiftIds.includes(s.id))
    : shifts.filter((s) => tones.has(s.tone)).slice(0, 1);
  const checked = new Set((suggested.length ? suggested : shifts.slice(0, 1)).map((s) => s.id));
  return (
    <AppDialog
      title={same ? `Turnos de ${employee.name}` : `Asignar a ${employee.name} a ${branch.name}`}
      description={`${same ? `Sigue en ${branch.name}.` : `Deja ${employee.branch} y pasa a trabajar en ${branch.name}.`} Marca uno o más turnos: abre y cierra la caja en cualquiera de ellos, dentro de su margen. Si abre antes o tarde, te avisamos.`}
      onClose={onClose}
    >
        {shifts.length === 0 ? (
          <p className="notice m-0">{branch.name} todavía no tiene turnos. Créalos en Turnos de esa sucursal y vuelve a intentarlo.</p>
        ) : (
          <form className="grid min-w-0 gap-4" onSubmit={save.onSubmit} noValidate>
            <input type="hidden" name="id" value={employee.id} />
            <input type="hidden" name="branchId" value={branch.id} />
            <fieldset className="grid gap-1" aria-describedby={save.errors.shiftIds ? "assign-shifts-error" : undefined}>
              <legend className="mb-1 text-sm font-semibold">Turnos</legend>
              {shifts.map((s) => (
                <label key={s.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" name="shiftIds" value={s.id} defaultChecked={checked.has(s.id)} className="size-5 shrink-0 accent-[var(--color-primary)]" />
                  {s.name} <span className="text-muted-foreground num">· {s.start}–{s.end}</span>
                </label>
              ))}
              {save.errors.shiftIds && <p id="assign-shifts-error" className="field-error">{save.errors.shiftIds}</p>}
            </fieldset>
            {/* Fuera de este margen pide horas extra y te llega el aviso para aceptar o rechazar. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="assign-early" label="Abre desde (min antes)" error={save.errors.openEarlyMin} hint="Antes de la hora de inicio.">
                <input id="assign-early" name="openEarlyMin" type="number" inputMode="numeric" step="1" min="0" max="240" className="input num" defaultValue={employee.openEarlyMin} required />
              </Field>
              <Field id="assign-late" label="Hasta (min después)" error={save.errors.openLateMin} hint="Después de la hora de cierre.">
                <input id="assign-late" name="openLateMin" type="number" inputMode="numeric" step="1" min="0" max="240" className="input num" defaultValue={employee.openLateMin} required />
              </Field>
            </div>
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
                {save.busy ? "Guardando…" : same ? "Guardar turnos" : "Asignar"}
              </Button>
            </DialogFooter>
          </form>
        )}
    </AppDialog>
  );
}
