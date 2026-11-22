import { actions } from "astro:actions";
import { Archive, CalendarDays, CircleAlert, CircleCheck, Clock, Ellipsis, Pencil, Plus, Repeat, UserRound, X } from "lucide-react";
import { useState } from "react";
import type { FixedExpense, Payable } from "@/data/payables";
import { shortDate } from "@/lib/dates";
import { formatBs } from "@/lib/format";
import { dueState, frequencyLabel, type Frequency } from "@/lib/payables";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { confirmDialog, toast } from "@/scripts/dialogs";
import { refreshRegions } from "@/scripts/refresh";
import { AppDialog } from "./AppDialog";
import { Field, MoneyInput, safeAction, useActionForm } from "./products/form";

const ICON = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
const DUE_ICON = { late: CircleAlert, soon: Clock, later: CalendarDays, none: null };
const DUE_CLASS = { late: "text-[var(--color-expense)] font-semibold", soon: "text-[var(--color-warning)] font-semibold", later: "text-muted-foreground", none: "text-muted-foreground" };

type Staff = { id: string; name: string };

type Dialog =
  | { kind: "pay"; item: Payable }
  | { kind: "edit"; item: Payable }
  | { kind: "new" }
  | { kind: "fixed"; item?: FixedExpense }
  | null;

/**
 * Lo que falta pagar en una sucursal y, para la dueña, sus gastos fijos. Se paga de la caja (con el turno abierto
 * de quien trabaja aquí) o fuera de ella. Al pagar, el gasto queda con el día que tocaba (la base lo pone).
 */
export default function PayablesCard({
  branchId,
  title = "Por pagar",
  pending,
  fixed,
  today,
  userId,
  isOwner,
  canAdd,
  cashShift,
  categories = [],
  settled = [],
  staff = [],
  myEmployeeId = null,
}: {
  branchId: string;
  title?: string;
  pending: Payable[];
  /** Solo la dueña los ve (RLS); vacío para el resto. */
  fixed: FixedExpense[];
  today: string;
  userId: string;
  isOwner: boolean;
  /** Puede anotar pendientes: la dueña o quien trabaja en la sucursal. */
  canAdd: boolean;
  /** El turno abierto de quien trabaja aquí: habilita «De la caja». */
  cashShift: { id: string; name: string } | null;
  categories?: string[];
  /** Saldados en el rango: la lista «Saldados», plegada. */
  settled?: Payable[];
  /** Fichas de la sucursal: «Sueldo de» en los gastos fijos y el nombre en cada sueldo. */
  staff?: Staff[];
  /** La ficha de quien mira, si trabaja aquí: su sueldo lo confirma ella («Me pagaron»). */
  myEmployeeId?: string | null;
}) {
  const staffName = (id: string | null) => staff.find((e) => e.id === id)?.name;
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const total = pending.reduce((s, p) => s + p.balance, 0);
  const late = pending.filter((p) => dueState(p.dueOn, today).tone === "late").length;

  async function cancel(p: Payable) {
    const ok = await confirmDialog(
      p.paid > 0 ? `Lo pagado (${formatBs(p.paid)}) queda registrado; el resto deja de deberse.` : `«${p.concept}» deja de aparecer como pendiente.`,
      { title: "¿Cancelar el pendiente?", confirmLabel: "Cancelar pendiente", danger: true },
    );
    if (!ok) return;
    const { error } = await safeAction(() => actions.cancelPendingExpense({ pendingId: p.id }));
    if (error) return toast(error.message, "error");
    toast("Pendiente cancelado.", "success");
    await refreshRegions();
  }

  async function archive(f: FixedExpense) {
    const ok = await confirmDialog(`«${f.concept}» deja de generar pendientes. Lo que ya se debe sigue a la vista.`, {
      title: "¿Quitar el gasto fijo?",
      confirmLabel: "Quitar gasto fijo",
      danger: true,
    });
    if (!ok) return;
    const { error } = await safeAction(() => actions.archiveFixedExpense({ fixedId: f.id }));
    if (error) return toast(error.message, "error");
    toast("Gasto fijo quitado.", "success");
    await refreshRegions();
  }

  return (
    <div className="grid gap-4">
      <section className="card grid gap-3 p-5 max-[480px]:p-4" aria-labelledby={`payables-${branchId}`}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="grid gap-0.5">
            <h2 id={`payables-${branchId}`} className="card-title m-0">
              {title}
            </h2>
            <p className="m-0 text-sm text-muted-foreground">
              {pending.length === 0 ? (
                "No hay nada pendiente."
              ) : (
                <>
                  <span className="num font-semibold text-foreground">{formatBs(total)}</span>
                  {` en ${pending.length === 1 ? "1 pago" : `${pending.length} pagos`}`}
                  {late > 0 && ` · ${late === 1 ? "1 vencido" : `${late} vencidos`}`}
                </>
              )}
            </p>
          </div>
          {canAdd && (
            <Button type="button" variant="outline" size="sm" onClick={() => setDialog({ kind: "new" })}>
              <Plus />
              Anotar pendiente
            </Button>
          )}
        </div>

        {pending.length > 0 && (
          <ul className="m-0 grid list-none divide-y divide-[var(--color-border)] p-0">
            {pending.map((p) => {
              const due = dueState(p.dueOn, today);
              const DueIcon = DUE_ICON[due.tone];
              const canCancel = isOwner || p.createdById === userId;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="grid min-w-0 flex-1 basis-56 gap-1">
                    <span className="inline-flex flex-wrap items-center gap-1.5 font-semibold [overflow-wrap:anywhere]">
                      {p.concept}
                      {p.fixed && (
                        <span className="chip chip-neutral">
                          <Repeat size={12} strokeWidth={1.75} aria-hidden="true" />
                          Fijo
                        </span>
                      )}
                      {p.employeeId && staffName(p.employeeId) && (
                        <span className="chip chip-info">
                          <UserRound size={12} strokeWidth={1.75} aria-hidden="true" />
                          {p.employeeId === myEmployeeId ? "Tu sueldo" : staffName(p.employeeId)}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 text-sm">
                      <span className={`inline-flex items-center gap-1 ${DUE_CLASS[due.tone]}`}>
                        {DueIcon && <DueIcon {...ICON} />}
                        {due.label}
                      </span>
                      <span className="text-muted-foreground">· tocaba el {shortDate(p.owedOn)}</span>
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="grid text-right">
                      <span className="num font-bold">{formatBs(p.balance)}</span>
                      {p.paid > 0 && <span className="num text-xs text-muted-foreground">pagado {formatBs(p.paid)} de {formatBs(p.amount)}</span>}
                    </span>
                    {(isOwner || cashShift || p.employeeId === myEmployeeId) && (
                      <Button type="button" size="sm" onClick={() => setDialog({ kind: "pay", item: p })}>
                        {p.employeeId && p.employeeId === myEmployeeId ? "Me pagaron" : isOwner ? "Pagar" : "Saldar"}
                      </Button>
                    )}
                    {(isOwner || canCancel) && (
                      // modal={false}: el menú abre un diálogo; así Radix no deja la página bloqueada al cerrarlo.
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Opciones de ${p.concept}`}>
                            <Ellipsis />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isOwner && (
                            <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", item: p })}>
                              <Pencil />
                              Corregir monto o vencimiento
                            </DropdownMenuItem>
                          )}
                          {canCancel && (
                            <DropdownMenuItem variant="destructive" onSelect={() => cancel(p)}>
                              <X />
                              Cancelar pendiente
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {settled.length > 0 && (
          <details className="group border-t border-[var(--color-border)] pt-3">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
              <CircleCheck {...ICON} />
              Saldados ({settled.length}) · {formatBs(settled.reduce((s, p) => s + p.amount, 0))}
            </summary>
            <ul className="m-0 grid list-none divide-y divide-[var(--color-border)] p-0">
              {settled.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <span className="font-semibold">{p.concept}</span>
                    <span className="text-muted-foreground"> · tocaba el {shortDate(p.owedOn)}</span>
                  </span>
                  <span className="num">{formatBs(p.amount)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {isOwner && (
        <section className="card grid gap-3 p-5 max-[480px]:p-4" aria-labelledby={`fixed-${branchId}`}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="grid gap-0.5">
              <h2 id={`fixed-${branchId}`} className="card-title m-0">
                Gastos fijos
              </h2>
              <p className="m-0 text-sm text-muted-foreground">Alquiler, sueldos, luz, agua… Cada período se suma solo a Por pagar.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setDialog({ kind: "fixed" })}>
              <Plus />
              Agregar gasto fijo
            </Button>
          </div>
          {fixed.length > 0 && (
            <ul className="m-0 grid list-none divide-y divide-[var(--color-border)] p-0">
              {fixed.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                  <div className="grid min-w-0 flex-1 basis-48 gap-0.5">
                    <span className="font-semibold [overflow-wrap:anywhere]">{f.concept}</span>
                    <span className="text-sm text-muted-foreground">
                      {frequencyLabel[f.frequency]} · próximo el {shortDate(f.next)}
                      {f.employeeId && staffName(f.employeeId) && ` · sueldo de ${staffName(f.employeeId)}`}
                    </span>
                  </div>
                  <span className="ml-auto num font-semibold">{formatBs(f.amount)}</span>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Opciones de ${f.concept}`}>
                        <Ellipsis />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setDialog({ kind: "fixed", item: f })}>
                        <Pencil />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => archive(f)}>
                        <Archive />
                        Quitar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <datalist id={`payable-categories-${branchId}`}>
        {[...new Set(["Alquiler", "Sueldos", "Servicios", "Proveedores", ...categories])].map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {dialog?.kind === "pay" && (
        <PayDialog key={dialog.item.id} item={dialog.item} cashShift={cashShift} isOwner={isOwner} ownSalary={!!dialog.item.employeeId && dialog.item.employeeId === myEmployeeId} onClose={close} />
      )}
      {dialog?.kind === "edit" && <EditDialog key={dialog.item.id} item={dialog.item} onClose={close} />}
      {dialog?.kind === "new" && <NewDialog branchId={branchId} onClose={close} />}
      {dialog?.kind === "fixed" && <FixedDialog branchId={branchId} item={dialog.item} today={today} staff={staff} onClose={close} />}
    </div>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <p className="notice notice-error m-0" role="alert">
      {message}
    </p>
  ) : null;
}

function Footer({ onClose, busy, submitProps, label }: { onClose: () => void; busy: boolean; submitProps: object; label: string }) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" {...submitProps}>
        {busy ? "Guardando…" : label}
      </Button>
    </DialogFooter>
  );
}

/**
 * Pagar todo o una parte (la dueña). Quien trabaja aquí salda completo y de la caja; su propio sueldo
 * también lo confirma si se lo pagó la dueña. La base exige lo mismo. El id del pago nace al abrir.
 */
function PayDialog({
  item,
  cashShift,
  isOwner,
  ownSalary,
  onClose,
}: {
  item: Payable;
  cashShift: { id: string; name: string } | null;
  isOwner: boolean;
  ownSalary: boolean;
  onClose: () => void;
}) {
  const [paymentId] = useState(() => crypto.randomUUID());
  const outsideAllowed = isOwner || ownSalary;
  const [from, setFrom] = useState<"caja" | "fuera">(cashShift ? "caja" : "fuera");
  const save = useActionForm(
    (form) => actions.payPendingExpense(form) as never,
    onClose,
    (form) => (Number(form.get("amount")) < item.balance ? "Pago parcial registrado." : `«${item.concept}» quedó saldado.`),
  );
  const sources = [
    ...(cashShift ? [{ value: "caja" as const, label: `De la caja del turno ${cashShift.name.toLowerCase()}`, hint: "Resta del efectivo esperado de hoy." }] : []),
    ...(outsideAllowed
      ? [
          ownSalary && !isOwner
            ? { value: "fuera" as const, label: "Me pagó la dueña", hint: "No sale de la caja: no toca ningún turno." }
            : { value: "fuera" as const, label: "Fuera de la caja", hint: "Plata de la dueña o del banco: no toca ningún turno." },
        ]
      : []),
  ];
  return (
    <AppDialog title={ownSalary ? `Confirmar ${item.concept}` : `${isOwner ? "Pagar" : "Saldar"} ${item.concept}`} description={`Queda registrado con el día que tocaba: ${shortDate(item.owedOn)}.`} onClose={onClose}>
      <form className="grid min-w-0 gap-4" onSubmit={save.onSubmit} noValidate>
        <input type="hidden" name="paymentId" value={paymentId} />
        <input type="hidden" name="pendingId" value={item.id} />
        {from === "caja" && cashShift && <input type="hidden" name="shiftId" value={cashShift.id} />}
        {isOwner ? (
          <Field id="pay-amount" label="Monto" error={save.errors.amount} hint={`Falta ${formatBs(item.balance)}. Puedes pagar una parte.`}>
            <MoneyInput id="pay-amount" name="amount" min="0.01" max={item.balance} defaultValue={item.balance} required />
          </Field>
        ) : (
          <>
            {/* Se salda completo: el monto no se edita. */}
            <input type="hidden" name="amount" value={item.balance} />
            <p className="m-0 grid gap-0.5">
              <span className="text-sm text-muted-foreground">Monto</span>
              <span className="num text-xl font-bold">{formatBs(item.balance)}</span>
            </p>
          </>
        )}
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-semibold">De dónde sale la plata</legend>
          {sources.map((s) => (
            <label key={s.value} className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm">
              <input type="radio" name="from" value={s.value} checked={from === s.value} onChange={() => setFrom(s.value)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]" />
              <span className="grid gap-0.5">
                <span className="font-semibold">{s.label}</span>
                <span className="text-muted-foreground">{s.hint}</span>
              </span>
            </label>
          ))}
          {!cashShift && <p className="field-hint">Para pagar de la caja, hazlo desde Gastos de la sucursal con tu turno abierto.</p>}
          {sources.length === 0 && <p className="field-error">Abre tu turno para saldarlo de la caja.</p>}
          {save.errors.from && <p className="field-error">{save.errors.from}</p>}
        </fieldset>
        <ErrorNotice message={save.message} />
        <Footer onClose={onClose} busy={save.busy} submitProps={save.submitProps} label={ownSalary ? "Confirmar pago" : isOwner ? "Registrar pago" : "Saldar"} />
      </form>
    </AppDialog>
  );
}

function EditDialog({ item, onClose }: { item: Payable; onClose: () => void }) {
  const save = useActionForm((form) => actions.updatePendingExpense(form) as never, onClose, "Pendiente actualizado.");
  return (
    <AppDialog title={`Corregir ${item.concept}`} description={`Tocaba el ${shortDate(item.owedOn)}.`} onClose={onClose}>
      <form className="grid min-w-0 gap-4" onSubmit={save.onSubmit} noValidate>
        <input type="hidden" name="pendingId" value={item.id} />
        <Field id="edit-pending-amount" label="Monto" error={save.errors.amount} hint={item.paid > 0 ? `Ya se pagó ${formatBs(item.paid)}.` : "Si la factura llegó distinta."}>
          <MoneyInput id="edit-pending-amount" name="amount" min="0.01" defaultValue={item.amount} required />
        </Field>
        <Field id="edit-pending-due" label="Vence el (opcional)" error={save.errors.dueOn}>
          <input id="edit-pending-due" name="dueOn" type="date" className="input" min={item.owedOn} defaultValue={item.dueOn ?? ""} />
        </Field>
        <ErrorNotice message={save.message} />
        <Footer onClose={onClose} busy={save.busy} submitProps={save.submitProps} label="Guardar cambios" />
      </form>
    </AppDialog>
  );
}

function NewDialog({ branchId, onClose }: { branchId: string; onClose: () => void }) {
  const [pendingId] = useState(() => crypto.randomUUID());
  const save = useActionForm((form) => actions.createPendingExpense(form) as never, onClose, "Pendiente anotado.");
  return (
    <AppDialog title="Anotar pendiente" description="Un gasto que hoy no se pudo pagar. Cuando se pague, quedará registrado con la fecha de hoy." onClose={onClose}>
      <form className="grid min-w-0 gap-4" onSubmit={save.onSubmit} noValidate>
        <input type="hidden" name="pendingId" value={pendingId} />
        <input type="hidden" name="branchId" value={branchId} />
        <Field id="new-pending-concept" label="Concepto" error={save.errors.concept}>
          <input id="new-pending-concept" name="concept" className="input" placeholder="Ej.: Pago al proveedor de leche" maxLength={120} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="new-pending-category" label="Categoría" error={save.errors.category}>
            <input id="new-pending-category" name="category" className="input" list={`payable-categories-${branchId}`} placeholder="Ej.: Proveedores" maxLength={40} required />
          </Field>
          <Field id="new-pending-amount" label="Monto" error={save.errors.amount}>
            <MoneyInput id="new-pending-amount" name="amount" min="0.01" required />
          </Field>
        </div>
        <Field id="new-pending-due" label="Vence el (opcional)" error={save.errors.dueOn} hint="Déjalo vacío si puede esperar.">
          <input id="new-pending-due" name="dueOn" type="date" className="input" />
        </Field>
        <ErrorNotice message={save.message} />
        <Footer onClose={onClose} busy={save.busy} submitProps={save.submitProps} label="Anotar pendiente" />
      </form>
    </AppDialog>
  );
}

function FixedDialog({ branchId, item, today, staff, onClose }: { branchId: string; item?: FixedExpense; today: string; staff: Staff[]; onClose: () => void }) {
  const [fixedId] = useState(() => item?.id ?? crypto.randomUUID());
  const save = useActionForm(
    (form) => (item ? actions.updateFixedExpense(form) : actions.createFixedExpense(form)) as never,
    onClose,
    item ? "Gasto fijo actualizado." : "Gasto fijo agregado.",
  );
  return (
    <AppDialog
      title={item ? `Editar ${item.concept}` : "Agregar gasto fijo"}
      description={item ? "Cambia los próximos períodos; lo que ya se debe queda como está." : "Cada período aparece solo en Por pagar, con el monto habitual."}
      onClose={onClose}
    >
      <form className="grid min-w-0 gap-4" onSubmit={save.onSubmit} noValidate>
        <input type="hidden" name="fixedId" value={fixedId} />
        {!item && <input type="hidden" name="branchId" value={branchId} />}
        <Field id="fixed-concept" label="Concepto" error={save.errors.concept}>
          <input id="fixed-concept" name="concept" className="input" placeholder="Ej.: Alquiler del local" defaultValue={item?.concept} maxLength={120} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="fixed-category" label="Categoría" error={save.errors.category}>
            <input id="fixed-category" name="category" className="input" list={`payable-categories-${branchId}`} placeholder="Ej.: Alquiler" defaultValue={item?.category} maxLength={40} required />
          </Field>
          <Field id="fixed-amount" label="Monto habitual" error={save.errors.amount}>
            <MoneyInput id="fixed-amount" name="amount" min="0.01" defaultValue={item?.amount} required />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="fixed-frequency" label="Cada cuánto" error={save.errors.frequency}>
            <select id="fixed-frequency" name="frequency" className="input" defaultValue={item?.frequency ?? "mensual"}>
              {(Object.keys(frequencyLabel) as Frequency[]).map((f) => (
                <option key={f} value={f}>
                  {frequencyLabel[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="fixed-starts" label="Primer pago" error={save.errors.startsOn} hint="Si ya pasó, se suman los períodos que faltan.">
            <input id="fixed-starts" name="startsOn" type="date" className="input" defaultValue={item?.startsOn ?? today} required />
          </Field>
        </div>
        {staff.length > 0 && (
          <Field id="fixed-employee" label="Sueldo de (opcional)" error={save.errors.employeeId} hint="Esa persona confirma cuando se lo pagaron.">
            <select id="fixed-employee" name="employeeId" className="input" defaultValue={item?.employeeId ?? ""}>
              <option value="">Nadie: no es un sueldo</option>
              {staff.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field id="fixed-grace" label="Días para pagar (opcional)" error={save.errors.graceDays} hint="Ej.: 10 si la luz vence 10 días después. Vacío: sin vencimiento.">
          <input id="fixed-grace" name="graceDays" type="number" inputMode="numeric" min="0" max="365" step="1" className="input num" defaultValue={item?.graceDays ?? ""} />
        </Field>
        <ErrorNotice message={save.message} />
        <Footer onClose={onClose} busy={save.busy} submitProps={save.submitProps} label={item ? "Guardar cambios" : "Agregar gasto fijo"} />
      </form>
    </AppDialog>
  );
}
