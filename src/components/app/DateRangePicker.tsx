import { useId, useRef, useState } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import { es } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// Los días viajan como AAAA-MM-DD (igual que la URL y la base); el calendario trabaja con Date a medianoche local.
const toDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const pad = (n: number) => String(n).padStart(2, "0");
const toDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const dayFormat = new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", year: "numeric" });
const shortFormat = new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short" });
const show = (day: string, format = dayFormat) => format.format(toDate(day)).replaceAll(".", "");

interface Props {
  /** Para el <label for> de afuera. */
  id?: string;
  from: string;
  to: string;
  /** Con hora: el rango empieza y termina a esa hora (HH:MM). Si vienen, el interruptor arranca encendido. */
  fromTime?: string;
  toTime?: string;
  /** Ofrece «Incluir hora». */
  withTime?: boolean;
  min?: string;
  max?: string;
  /** Nombres de los campos ocultos; los de la hora son `${fromName}Hora` y `${toName}Hora`. */
  fromName?: string;
  toName?: string;
  /** «Aplicar» también envía el formulario que lo contiene (filtros por la URL). */
  submitOnApply?: boolean;
}

/**
 * Rango de días como el de Notion: dos campos (Inicio y Fin) arriba, el calendario debajo y, si se pide, la hora.
 * El primer clic fija el inicio y el segundo el fin; tocar un campo elige cuál cambia el próximo clic.
 * Escribe campos ocultos, así sirve en cualquier <form> (GET o Actions).
 */
export default function DateRangePicker({
  id,
  from: initialFrom,
  to: initialTo,
  fromTime: initialFromTime,
  toTime: initialToTime,
  withTime = false,
  min,
  max,
  fromName = "desde",
  toName = "hasta",
  submitOnApply = false,
}: Props) {
  const uid = useId();
  const hidden = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [editing, setEditing] = useState<"from" | "to">("from");
  const [month, setMonth] = useState(() => toDate(initialTo));
  const [timeOn, setTimeOn] = useState(withTime && !!(initialFromTime || initialToTime));
  const [fromTime, setFromTime] = useState(initialFromTime ?? "00:00");
  const [toTime, setToTime] = useState(initialToTime ?? "23:59");

  function pick(date: Date) {
    const day = toDay(date);
    if (editing === "from") {
      setFrom(day);
      if (day > to) setTo(day);
      setEditing("to");
    } else if (day < from) {
      // Un fin antes del inicio se toma como inicio nuevo y se sigue eligiendo el fin.
      setFrom(day);
    } else {
      setTo(day);
      setEditing("from");
    }
  }

  function focusField(which: "from" | "to") {
    setEditing(which);
    setMonth(toDate(which === "from" ? from : to));
  }

  function apply() {
    setOpen(false);
    // Tras el render, para que los campos ocultos ya tengan lo elegido.
    if (submitOnApply) setTimeout(() => hidden.current?.closest("form")?.requestSubmit());
  }

  const summary = (day: string, time: string) => `${show(day, shortFormat)}${timeOn ? `, ${time}` : ""}`;
  const text = `${summary(from, fromTime)} → ${summary(to, toTime)}`;

  const field = (which: "from" | "to") => {
    const day = which === "from" ? from : to;
    const active = editing === which;
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => focusField(which)}
          aria-pressed={active}
          aria-label={`${which === "from" ? "Inicio" : "Fin"}: ${show(day)}. ${active ? "El próximo día que elijas cambia este." : "Elegir este para cambiarlo."}`}
          className={cn(
            "flex h-9 min-w-0 flex-1 items-center rounded-md border px-2.5 text-left text-sm tabular-nums",
            active ? "border-ring ring-[3px] ring-ring/30" : "border-input hover:bg-accent",
          )}
        >
          {show(day)}
        </button>
        {timeOn && (
          <Input
            type="time"
            aria-label={which === "from" ? "Hora de inicio" : "Hora de fin"}
            value={which === "from" ? fromTime : toTime}
            onChange={(e) => (which === "from" ? setFromTime : setToTime)(e.target.value || (which === "from" ? "00:00" : "23:59"))}
            className="h-9 w-28 tabular-nums"
          />
        )}
      </div>
    );
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" id={id} className="input flex w-full items-center gap-2 text-left" aria-label={`Días: ${text}. Cambiar`}>
            <CalendarDays size={18} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate tabular-nums">{text}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-0">
          <div className="grid gap-1.5 border-b p-2">
            {field("from")}
            <ArrowRight size={12} strokeWidth={1.75} aria-hidden="true" className="mx-auto text-muted-foreground" />
            {field("to")}
          </div>
          <Calendar
            mode="range"
            locale={es}
            selected={{ from: toDate(from), to: toDate(to) }}
            onDayClick={(date, modifiers) => !modifiers.disabled && pick(date)}
            month={month}
            onMonthChange={setMonth}
            disabled={[...(max ? [{ after: toDate(max) }] : []), ...(min ? [{ before: toDate(min) }] : [])]}
            className="mx-auto p-2 [--cell-size:--spacing(7)] pointer-coarse:[--cell-size:--spacing(9)]"
          />
          <div className="flex items-center justify-between gap-3 border-t p-2">
            {withTime ? (
              <div className="flex items-center gap-2">
                <Switch id={`${uid}-time`} checked={timeOn} onCheckedChange={setTimeOn} />
                <Label htmlFor={`${uid}-time`}>Incluir hora</Label>
              </div>
            ) : (
              <span />
            )}
            <Button type="button" size="sm" onClick={apply}>
              Aplicar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <span ref={hidden} hidden>
        <input type="hidden" name={fromName} value={from} />
        <input type="hidden" name={toName} value={to} />
        {timeOn && <input type="hidden" name={`${fromName}Hora`} value={fromTime} />}
        {timeOn && <input type="hidden" name={`${toName}Hora`} value={toTime} />}
      </span>
    </>
  );
}
