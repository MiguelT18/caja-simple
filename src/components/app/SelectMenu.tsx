// Selector con menú desplegable propio y buscador, para las islas React: la misma pieza que SelectMenu.astro (botón con
// aspecto de campo y, pegada a él, una lista que se filtra al escribir). Para cuando un <select> se queda corto (opciones
// con foto o datos, listas largas).
//
//   <SelectMenu id="product-category" name="categoryId" options={…} defaultValue={…} renderOption={(o) => <Fila {...o} />} />
//
// Con `name` manda el valor en un campo oculto (lo leen el formulario, los borradores y el aviso de cambios sin guardar).
// `value` + `onValueChange` lo controlan desde fuera (p. ej. «Agregar un producto», que vuelve a vacío al elegir).
// Búsqueda: sin mayúsculas ni tildes, cada palabra al comienzo de una palabra de `label` + `keywords` (si no hay nada,
// en cualquier parte), y primero lo que empieza con lo escrito.
import { ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SelectMenuOption {
  value: string;
  label: string;
  /** Texto extra que también se busca (categoría, código…). */
  keywords?: string;
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function SelectMenu<T extends SelectMenuOption>({
  id,
  name,
  options,
  value: controlled,
  defaultValue = "",
  onValueChange,
  renderOption,
  placeholder = "Elige una opción",
  searchPlaceholder = "Buscar",
  noun = "opciones",
  emptyText,
  disabled,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
}: {
  /** Del botón: el <label htmlFor> de Field lo nombra. */
  id: string;
  name?: string;
  options: T[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string, option: T | undefined) => void;
  /** Cómo se ve cada opción (y lo elegido, en el campo). Sin esto, su `label`. */
  renderOption?: (option: T) => ReactNode;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Qué se elige, en plural y minúscula: «productos». Para el buscador y los anuncios. */
  noun?: string;
  /** Si no hay ninguna opción. */
  emptyText?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const uid = useId();
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const chosen = options.find((o) => o.value === value);
  const show = (o: T) => (renderOption ? renderOption(o) : o.label);

  const matches = useMemo(() => {
    const q = fold(query.trim());
    const words = q.split(/\s+/).filter(Boolean);
    const byName = (a: T, b: T) => fold(a.label).localeCompare(fold(b.label));
    if (!words.length) return [...options].sort(byName);
    const hay = (o: T) => " " + fold([o.label, o.keywords].filter(Boolean).join(" "));
    let found = options.filter((o) => words.every((w) => hay(o).includes(" " + w)));
    if (!found.length) found = options.filter((o) => words.every((w) => hay(o).includes(w)));
    const rank = (o: T) => (fold(o.label).startsWith(q) ? 0 : (" " + fold(o.label)).includes(" " + words[0]) ? 1 : 2);
    return found.sort((a, b) => rank(a) - rank(b) || byName(a, b));
  }, [options, query]);

  // Lo resaltado sigue a la búsqueda: lo primero que coincide o, sin buscar, lo elegido.
  useEffect(() => {
    if (!open) return;
    setActive(query.trim() ? (matches[0]?.value ?? null) : (chosen?.value ?? matches[0]?.value ?? null));
  }, [open, query, matches, chosen?.value]);

  // Un borrador restaurado o un reset del formulario cambian el campo oculto desde fuera: el estado lo sigue.
  useEffect(() => {
    const input = hidden.current;
    if (!input || controlled !== undefined) return;
    const pull = () => setOwn(input.value);
    const form = input.form;
    const later = () => setTimeout(pull);
    input.addEventListener("change", pull);
    form?.addEventListener("reset", later);
    return () => {
      input.removeEventListener("change", pull);
      form?.removeEventListener("reset", later);
    };
  }, [controlled]);

  // Debajo del campo; si no cabe, arriba. Se recalcula al desplazar: la lista es fija y el campo se mueve.
  const place = () => {
    const t = trigger.current;
    const p = panel.current;
    if (!t || !p) return;
    const rect = t.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return setOpen(false);
    p.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - rect.width - 8))}px`;
    p.style.width = `${Math.min(rect.width, innerWidth - 16)}px`;
    const height = p.offsetHeight;
    const below = rect.bottom + 4 + height <= innerHeight || rect.top - 4 - height < 0;
    p.style.top = `${below ? rect.bottom + 4 : rect.top - 4 - height}px`;
  };

  useLayoutEffect(() => {
    const p = panel.current;
    if (!p) return;
    if (!open) {
      if (p.matches(":popover-open")) p.hidePopover();
      return;
    }
    p.showPopover();
    place();
    search.current?.focus();
    let frame = 0;
    const follow = (event: Event) => {
      if (p.contains(event.target as Node)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    document.addEventListener("scroll", follow, { capture: true, passive: true });
    addEventListener("resize", follow);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", follow, { capture: true });
      removeEventListener("resize", follow);
    };
  }, [open]);

  // La lista cambia de alto al filtrar: se vuelve a ubicar (arriba o abajo).
  useLayoutEffect(() => {
    if (open) place();
  }, [matches.length, open]);

  useEffect(() => {
    if (active) document.getElementById(`${uid}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, uid]);

  const close = (focusTrigger = false) => {
    setOpen(false);
    setQuery("");
    if (focusTrigger) trigger.current?.focus();
  };

  const choose = (o: T) => {
    if (controlled === undefined) setOwn(o.value);
    onValueChange?.(o.value, o);
    close(true);
    // El campo oculto se actualiza al renderizar: después, el aviso de cambio para el formulario (borrador, «Sin guardar»).
    requestAnimationFrame(() => hidden.current?.dispatchEvent(new Event("change", { bubbles: true })));
  };

  const onKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const at = matches.findIndex((o) => o.value === active);
    const go = (i: number) => {
      event.preventDefault();
      setActive(matches[i]?.value ?? null);
    };
    if (event.key === "ArrowDown" && matches.length) go((at + 1) % matches.length);
    else if (event.key === "ArrowUp" && matches.length) go((at - 1 + matches.length) % matches.length);
    else if (event.key === "PageDown" && matches.length) go(Math.min(at + 5, matches.length - 1));
    else if (event.key === "PageUp" && matches.length) go(Math.max(at - 5, 0));
    else if (event.key === "Enter") {
      event.preventDefault();
      if (at >= 0) choose(matches[at]);
    } else if (event.key === "Escape") {
      // Cierra solo la lista, no el diálogo.
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") close();
  };

  const empty = options.length === 0;

  return (
    <div className="min-w-0">
      {name && <input ref={hidden} type="hidden" name={name} id={`${id}-value`} value={value} />}
      <button
        ref={trigger}
        type="button"
        id={id}
        className="input flex min-h-14 cursor-pointer items-center justify-between gap-2 text-start disabled:cursor-not-allowed disabled:opacity-60"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${uid}-panel`}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        disabled={disabled || empty}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="min-w-0 flex-1">
          {chosen ? show(chosen) : <span className="text-muted-foreground">{empty && emptyText ? emptyText : placeholder}</span>}
        </span>
        <ChevronDown
          className={cn("size-[18px] shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", open && "rotate-180")}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
      <div
        ref={panel}
        id={`${uid}-panel`}
        popover="manual"
        className="fixed inset-auto m-0 rounded-[0.75rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-[var(--color-text)] shadow-[var(--shadow-md)]"
      >
        {/* La lupa se centra contra el campo solo (sin el padding del contenedor). .input no está en una capa y le gana
            a pl-*: el espacio para la lupa va en style. */}
        <div className="px-1 pt-1 pb-2">
          <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          <input
            ref={search}
            type="search"
            className="input"
            style={{ paddingLeft: "2.25rem" }}
            placeholder={searchPlaceholder}
            aria-label={`Buscar ${noun}`}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={`${uid}-list`}
            aria-activedescendant={active ? `${uid}-${active}` : undefined}
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            onBlur={() => setTimeout(() => !panel.current?.contains(document.activeElement) && close())}
          />
          </div>
        </div>
        <ul id={`${uid}-list`} role="listbox" aria-label={noun} className="m-0 max-h-[min(20rem,50vh)] list-none overflow-y-auto p-0">
          {matches.map((o) => (
            <li
              key={o.value}
              id={`${uid}-${o.value}`}
              role="option"
              aria-selected={o.value === active}
              // El clic no le quita el foco al buscador (si no, el blur cerraría la lista antes del clic).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              onMouseMove={() => o.value !== active && setActive(o.value)}
              // La opción activa: además del fondo, una barra (no solo color).
              className="flex min-h-12 cursor-pointer items-center rounded-[0.5rem] px-2.5 py-1.5 aria-selected:bg-[var(--color-surface-muted)] aria-selected:shadow-[inset_3px_0_0_var(--color-primary)]"
            >
              <span className="block min-w-0 flex-1">{show(o)}</span>
            </li>
          ))}
        </ul>
        {matches.length === 0 && <p className="m-0 p-3 text-sm text-muted-foreground">Nada coincide con «{query.trim()}».</p>}
        <p className="sr-only" aria-live="polite">
          {query.trim() ? `${matches.length} ${matches.length === 1 ? "resultado" : "resultados"}` : ""}
        </p>
      </div>
    </div>
  );
}
