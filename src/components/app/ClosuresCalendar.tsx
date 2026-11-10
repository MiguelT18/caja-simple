// Calendario de cierres de la sucursal (feriados y días sueltos): marca los días cerrados y, para la dueña, abre un
// diálogo para cerrar un día (todo el día, de tal hora a tal hora o solo algunos turnos) o quitar el cierre.
// La base decide si un turno abre (private.shift_closed_reason); esto solo lo muestra y lo edita.
import { actions } from "astro:actions";
import { useState } from "react";
import { CalendarX2, Trash2 } from "lucide-react";
import { es } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { closedReason, closureHits, type BranchHours, type Closure, type ScheduleShift } from "@/lib/schedule";
import { confirmDialog, toast } from "@/scripts/dialogs";
import { refreshRegions } from "@/scripts/refresh";
import { AppDialog } from "./AppDialog";
import { Field, safeAction } from "./products/form";

interface Props {
  branchId: string;
  today: string;
  isOwner: boolean;
  shifts: ScheduleShift[];
  hours: BranchHours[];
  closures: Closure[];
}

type Kind = "day" | "hours" | "shifts";

const pad = (n: number) => String(n).padStart(2, "0");
const toDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const longFormat = new Intl.DateTimeFormat("es-BO", { weekday: "long", day: "numeric", month: "long" });
const longDay = (day: string) => longFormat.format(toDate(day));

/** Qué cierra: «Todo el día», «De 14:00 a 18:00» o «Turnos: Mañana». */
function closureLabel(c: Closure, shifts: ScheduleShift[]) {
  const what = c.start
    ? `De ${c.start} a ${c.end}`
    : c.shiftIds
      ? `Turnos: ${c.shiftIds.map((id) => shifts.find((s) => s.id === id)?.name ?? "quitado").join(", ")}`
      : "Todo el día";
  return c.note ? `${what} · ${c.note}` : what;
}

export default function ClosuresCalendar({ branchId, today, isOwner, shifts, hours, closures }: Props) {
  const [day, setDay] = useState<string>();
  const upcoming = closures.filter((c) => c.day >= today);
  const closedDays = new Set(upcoming.map((c) => c.day));
  // Días en que, por el horario semanal y los días de cada turno, no trabaja ningún turno.
  const weekClosed = (date: Date) => shifts.length > 0 && shifts.every((s) => closedReason(s, toDay(date), hours, []) !== null);

  const remove = async (c: Closure) => {
    if (!(await confirmDialog(`¿Quitar el cierre del ${longDay(c.day)}?`, { confirmLabel: "Quitar", danger: true }))) return;
    const { error } = await safeAction(() => actions.deleteClosure({ id: c.id }));
    if (error) return toast(error.message, "error");
    await refreshRegions();
    toast("Cierre quitado.", "success");
  };

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-[auto_minmax(0,1fr)] md:items-start md:gap-6">
      {/* La tarjeta mide lo que el calendario: la leyenda (w-0 min-w-full) se acomoda a ese ancho sin ensancharla. */}
      <div className="card grid w-full min-w-0 justify-items-center gap-3 p-3 sm:p-4 md:w-fit">
        <Calendar
          mode="single"
          locale={es}
          weekStartsOn={1}
          selected={day ? toDate(day) : undefined}
          onSelect={(date) => date && isOwner && setDay(toDay(date))}
          disabled={isOwner ? { before: toDate(today) } : true}
          // Celdas de 36 a 44 px según el ancho: caben siete a 320 px sin scroll y se tocan bien con el dedo.
          className="max-w-full bg-transparent p-0 [--cell-size:clamp(2.25rem,calc((100vw-6rem)/7),2.75rem)]"
          modifiers={{ closed: (date) => closedDays.has(toDay(date)), weekClosed }}
          modifiersClassNames={{
            // Fondo, color y un punto debajo del número: no se comunica solo con color.
            closed:
              "[&>button]:bg-[color-mix(in_oklab,var(--color-expense)_14%,transparent)] [&>button]:font-bold [&>button]:text-[var(--color-expense)] [&>button]:after:absolute [&>button]:after:bottom-1 [&>button]:after:left-1/2 [&>button]:after:size-1.5 [&>button]:after:-translate-x-1/2 [&>button]:after:rounded-full [&>button]:after:bg-current",
            weekClosed: "[&>button]:text-muted-foreground [&>button]:line-through",
          }}
          labels={{
            labelDayButton: (date, m) => {
              const d = toDay(date);
              const notes = upcoming.filter((c) => c.day === d).map((c) => closureLabel(c, shifts));
              return [longDay(d), notes.length ? `cerrado: ${notes.join("; ")}` : m.weekClosed ? "no trabaja ningún turno" : ""]
                .filter(Boolean)
                .join(", ");
            },
          }}
        />
        <div className="grid w-0 min-w-full gap-2 border-t pt-3 text-sm text-muted-foreground">
          {isOwner && <p className="m-0 font-medium text-foreground">Toca un día para cerrarlo.</p>}
          <ul className="m-0 grid list-none gap-1.5 p-0" role="list">
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-[var(--color-expense)]" />
              Cerrado ese día (feriado o cierre)
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="min-w-2 shrink-0 text-center text-xs leading-none line-through">7</span>
              Ningún turno trabaja por el horario semanal
            </li>
          </ul>
        </div>
      </div>

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">Próximos cierres</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay feriados ni días cerrados por delante.</p>
        ) : (
          <ul className="grid gap-2" role="list">
            {upcoming.map((c) => (
              <li key={c.id} className="card flex items-center gap-3 px-4 py-3">
                <CalendarX2 size={18} strokeWidth={1.75} className="shrink-0 text-[var(--color-expense)]" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-semibold first-letter:uppercase">{c.day === today ? "Hoy" : longDay(c.day)}</span>
                  <span className="block text-muted-foreground [overflow-wrap:anywhere]">{closureLabel(c, shifts)}</span>
                </span>
                {isOwner && (
                  <Button type="button" variant="ghost" size="icon" aria-label={`Quitar el cierre del ${longDay(c.day)}`} onClick={() => remove(c)}>
                    <Trash2 size={16} strokeWidth={1.75} />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {day && <ClosureDialog branchId={branchId} day={day} shifts={shifts} existing={upcoming.filter((c) => c.day === day)} onClose={() => setDay(undefined)} onRemove={remove} />}
    </div>
  );
}

function ClosureDialog({
  branchId,
  day,
  shifts,
  existing,
  onClose,
  onRemove,
}: {
  branchId: string;
  day: string;
  shifts: ScheduleShift[];
  existing: Closure[];
  onClose: () => void;
  onRemove: (c: Closure) => void;
}) {
  const [kind, setKind] = useState<Kind>("day");
  const [start, setStart] = useState("13:00");
  const [end, setEnd] = useState("23:59");
  const [chosen, setChosen] = useState(new Set<string>());
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const hit = (s: ScheduleShift) =>
    closureHits({ id: "", day, start: kind === "hours" ? start : null, end: kind === "hours" ? end : null, shiftIds: kind === "shifts" ? [...chosen] : null, note: null }, s);

  const submit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors({});
    setMessage("");
    const { error } = await safeAction(() =>
      actions.addClosure({
        branchId,
        day,
        start: kind === "hours" ? start : null,
        end: kind === "hours" ? end : null,
        shiftIds: kind === "shifts" ? [...chosen] : null,
        note: note.trim() || null,
      }),
    );
    if (!error) {
      onClose();
      await refreshRegions();
      toast(`Listo: cerrado el ${longDay(day)}.`, "success");
      return;
    }
    setBusy(false);
    const fields = "fields" in error ? (error.fields as Record<string, string[] | undefined>) : undefined;
    if (fields && Object.keys(fields).length > 0) setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v?.[0] ?? ""])));
    else setMessage(error.message);
  };

  const kinds: { value: Kind; label: string }[] = [
    { value: "day", label: "Todo el día" },
    { value: "hours", label: "De tal hora a tal hora" },
    { value: "shifts", label: "Solo algunos turnos" },
  ];

  return (
    <AppDialog title={`Cerrar el ${longDay(day)}`} description="Ese día no abren los turnos que alcance el cierre. Quien administra el negocio puede abrirlos igual, confirmándolo." onClose={onClose}>
      {existing.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Ya cerrado</h3>
          <ul className="grid gap-2" role="list">
            {existing.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{closureLabel(c, shifts)}</span>
                <Button type="button" variant="ghost" onClick={() => onRemove(c)}>
                  <Trash2 size={16} strokeWidth={1.75} />
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="grid gap-4" onSubmit={submit} noValidate>
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-semibold">Qué se cierra</legend>
          {kinds.map((k) => (
            <label key={k.value} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="size-5 shrink-0 accent-[var(--color-primary)]" />
              {k.label}
            </label>
          ))}
        </fieldset>

        {kind === "hours" && (
          <div className="grid grid-cols-2 gap-3">
            <Field id="closure-start" label="Desde" error={errors.start}>
              <Input id="closure-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field id="closure-end" label="Hasta" error={errors.end}>
              <Input id="closure-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
            <p className="field-hint col-span-2">No abre ningún turno que empiece en ese rango.</p>
          </div>
        )}

        {kind === "shifts" && (
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-semibold">Turnos que no abren</legend>
            {shifts.map((s) => (
              <label key={s.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={chosen.has(s.id)}
                  onChange={() => setChosen((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(s.id)) next.add(s.id);
                    return next;
                  })}
                  className="size-5 shrink-0 accent-[var(--color-primary)]"
                />
                {s.name} <span className="text-muted-foreground">· {s.start} a {s.end}</span>
              </label>
            ))}
            {errors.shiftIds && <p className="field-error">{errors.shiftIds}</p>}
          </fieldset>
        )}

        <Field id="closure-note" label="Motivo (opcional)" error={errors.note} hint="Ej.: Feriado de Todos Santos, inventario.">
          <Input id="closure-note" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {shifts.length > 0 && (
          <p className="text-sm text-muted-foreground">
            No abren: {shifts.filter(hit).map((s) => s.name).join(", ") || "ninguno"}.
          </p>
        )}
        {message && (
          <p className="notice notice-error" role="alert">
            {message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" aria-disabled={busy}>
            {busy ? "Guardando…" : "Cerrar el día"}
          </Button>
        </div>
      </form>
    </AppDialog>
  );
}
