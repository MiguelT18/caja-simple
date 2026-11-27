// Promociones del negocio: lista con su estado de hoy y diálogo para crear o editar. La base aplica el descuento al vender.
import { actions } from "astro:actions";
import { useMemo, useState } from "react";
import { BadgePercent, CalendarClock, CalendarDays, CalendarX, CircleAlert, CircleCheck, Ellipsis, Package, Pause, Pencil, Plus, Store, Trash2 } from "lucide-react";
import type { Promotion } from "@/data/promotions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AppDialog } from "./AppDialog";
import { Field, safeAction } from "./products/form";
import { productsLabel, promoBadge, promoLabel, promoStatus, statusLabel, whenLabel, type PromoKind, type PromoStatus } from "@/lib/promos";
import { confirmDialog, toast } from "@/scripts/dialogs";
import { refreshRegions } from "@/scripts/refresh";

type Option = { id: string; name: string };
const DAYS = [
  [1, "L", "Lunes"],
  [2, "M", "Martes"],
  [3, "X", "Miércoles"],
  [4, "J", "Jueves"],
  [5, "V", "Viernes"],
  [6, "S", "Sábado"],
  [7, "D", "Domingo"],
] as const;
const KINDS: { kind: PromoKind; label: string; hint: string }[] = [
  { kind: "percent", label: "Porcentaje", hint: "Ej.: 20% menos" },
  { kind: "price", label: "Precio especial", hint: "Ej.: a Bs 8 cada uno" },
  { kind: "bundle", label: "Lleva y paga", hint: "Ej.: lleva 3, paga 2" },
];

/** El estado con ícono y texto (nunca solo color); lo que vale hoy, primero. */
const STATUS: Record<PromoStatus, { icon: typeof CircleCheck; chip: string; order: number }> = {
  hoy: { icon: CircleCheck, chip: "chip-income", order: 0 },
  "otro-dia": { icon: CalendarX, chip: "chip-neutral", order: 1 },
  programada: { icon: CalendarClock, chip: "chip-info", order: 2 },
  pausada: { icon: Pause, chip: "chip-neutral", order: 3 },
  vencida: { icon: CircleAlert, chip: "chip-warning", order: 4 },
};

export default function PromotionsManager({
  businessId,
  promotions,
  products,
  branches,
  today,
}: {
  businessId: string;
  promotions: Promotion[];
  products: Option[];
  branches: Option[];
  today: string;
}) {
  const [editing, setEditing] = useState<Promotion | "new" | null>(null);
  const productName = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  const [toggling, setToggling] = useState<string | null>(null);
  const toggle = async (p: Promotion) => {
    setToggling(p.id);
    const { error } = await safeAction(() => actions.togglePromotion({ id: p.id, active: !p.active }));
    setToggling(null);
    if (error) return toast(error.message, "error");
    await refreshRegions();
    toast(p.active ? `«${p.name}» quedó en pausa.` : `«${p.name}» volvió a estar activa.`, "success");
  };
  const remove = async (p: Promotion) => {
    if (!(await confirmDialog(`Las ventas que ya la usaron conservan su descuento.`, { title: `¿Borrar «${p.name}»?`, confirmLabel: "Borrar", danger: true }))) return;
    const { error } = await safeAction(() => actions.deletePromotion({ id: p.id }));
    if (error) return toast(error.message, "error");
    await refreshRegions();
    toast(`Promoción «${p.name}» borrada.`, "success");
  };

  const sorted = [...promotions].sort((a, b) => STATUS[promoStatus(a, today)].order - STATUS[promoStatus(b, today)].order);
  const validToday = promotions.filter((p) => promoStatus(p, today) === "hoy").length;
  // Activas: las que se pueden aplicar (hoy u otro día); desactivadas: en pausa o vencidas.
  const isOff = (p: Promotion) => ["pausada", "vencida"].includes(promoStatus(p, today));
  const active = sorted.filter((p) => !isOff(p));
  const inactive = sorted.filter(isOff);
  const card = (p: Promotion) => {
              const status = promoStatus(p, today);
              const { icon: StatusIcon, chip } = STATUS[status];
              const off = status === "pausada" || status === "vencida";
              const names = p.productIds.map((id) => productName.get(id)).filter(Boolean) as string[];
              const where = !p.branchIds ? "Todas las sucursales" : p.branchIds.map((id) => branchName.get(id) ?? "Sucursal quitada").join(", ");
              const switchId = `promo-active-${p.id}`;
              return (
                <li key={p.id} className="flex flex-col gap-4 rounded-[var(--radius-panel)] bg-card p-4">
                  <div className="flex items-start gap-4">
                    {/* El descuento es el arte: lo primero que se lee. En pausa o vencida, atenuado (el texto no). */}
                    <span
                      className={`grid size-[4.5rem] shrink-0 place-items-center rounded-[0.375rem] bg-[var(--color-income-soft)] px-1 text-center text-[length:var(--text-xl)] leading-none font-extrabold tracking-[-0.02em] text-[var(--color-income)] num ${off ? "opacity-45" : ""}`}
                      aria-hidden="true"
                    >
                      {promoBadge(p)}
                    </span>
                    <div className="grid min-w-0 flex-1 gap-1.5">
                      <h3 className="m-0 text-[length:var(--text-lg)] leading-[var(--text-lg-lh)] font-bold [overflow-wrap:anywhere]">{p.name}</h3>
                      <span className={`chip ${chip} justify-self-start`}>
                        <StatusIcon size={12} strokeWidth={1.75} aria-hidden="true" />
                        {statusLabel[status]}
                      </span>
                      <p className="m-0 text-sm font-semibold">{promoLabel(p)}</p>
                    </div>
                  </div>

                  <ul role="list" className="m-0 grid list-none gap-1.5 p-0 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>{whenLabel(p)}</span>
                    </li>
                    <li className="flex items-start gap-2 [overflow-wrap:anywhere]">
                      <Package className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>
                        <span className="font-semibold text-foreground">{productsLabel(names.length)}</span>
                        {names.length > 0 && `: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` y ${names.length - 3} más` : ""}`}
                      </span>
                    </li>
                    {branches.length > 1 && (
                      <li className="flex items-start gap-2 [overflow-wrap:anywhere]">
                        <Store className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span>{where}</span>
                      </li>
                    )}
                  </ul>

                  {/* Acciones por peso: el interruptor y Editar a la vista; Borrar, en el menú. */}
                  <div className="mt-auto flex items-center gap-2 border-t border-[var(--color-border)] pt-3">
                    {status === "vencida" ? (
                      // Vencida: pausarla no cambia nada; vuelve a valer cambiando las fechas.
                      <p className="mr-auto m-0 text-sm text-muted-foreground">Cambia las fechas para volver a usarla.</p>
                    ) : (
                      <label htmlFor={switchId} className="mr-auto flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold">
                        <Switch id={switchId} checked={p.active} disabled={toggling === p.id} onCheckedChange={() => toggle(p)} aria-label={`Activa: «${p.name}»`} />
                        {p.active ? "Activa" : "En pausa"}
                      </label>
                    )}
                    <Button variant="outline" size="sm" className="h-10" onClick={() => setEditing(p)}>
                      <Pencil />
                      Editar<span className="sr-only"> «{p.name}»</span>
                    </Button>
                    {/* modal={false}: el menú abre un diálogo; así Radix no deja la página bloqueada al cerrarlo. */}
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="size-10" aria-label={`Más opciones de «${p.name}»`}>
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem variant="destructive" onSelect={() => remove(p)}>
                          <Trash2 />
                          Borrar promoción
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
  };
  const create = (
    <Button className="h-11" onClick={() => setEditing("new")} disabled={products.length === 0}>
      <Plus />
      Nueva promoción
    </Button>
  );

  return (
    <div className="grid gap-8">
      {promotions.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-[var(--radius-panel)] border border-dashed border-[var(--color-border-strong)] p-8 text-center">
          <span className="grid size-14 place-items-center rounded-[0.375rem] bg-[var(--color-income-soft)] text-[var(--color-income)]" aria-hidden="true">
            <BadgePercent className="size-7" strokeWidth={1.75} />
          </span>
          <p className="m-0 text-lg font-bold">Todavía no hay promociones</p>
          <p className="m-0 max-w-prose text-sm text-muted-foreground">Un descuento para algunos productos: por un tiempo, sin fecha límite o solo ciertos días, como «todos los viernes».</p>
          {create}
          {products.length === 0 && <p className="field-hint m-0">Primero agrega productos al catálogo.</p>}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{promotions.length === 1 ? "1 promoción" : `${promotions.length} promociones`}</span>
              {` · ${validToday === 1 ? "1 vale hoy" : `${validToday} valen hoy`}`}
            </p>
            {create}
          </div>
          <Section id="promos-active" title="Activas" count={active.length} empty="Ninguna promoción activa: las desactivadas esperan abajo.">
            {active.map(card)}
          </Section>
          {inactive.length > 0 && (
            <Section id="promos-inactive" title="Desactivadas" count={inactive.length} hint="En pausa o vencidas: no se aplican al vender.">
              {inactive.map(card)}
            </Section>
          )}
        </>
      )}

      {editing && (
        <PromotionForm
          businessId={businessId}
          promo={editing === "new" ? null : editing}
          products={products}
          branches={branches}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Section({ id, title, count, hint, empty, children }: { id: string; title: string; count: number; hint?: string; empty?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3" aria-labelledby={id}>
      <div className="grid gap-0.5">
        <h2 id={id} className="m-0 flex items-baseline gap-2 text-[length:var(--text-2xl)] leading-[var(--text-2xl-lh)] font-extrabold tracking-[-0.02em]">
          {title}
          <span className="num text-base font-semibold text-muted-foreground">{count}</span>
        </h2>
        {hint && <p className="m-0 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {count === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul role="list" className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,21rem),1fr))] gap-4 p-0">
          {children}
        </ul>
      )}
    </section>
  );
}

function PromotionForm({
  businessId,
  promo,
  products,
  branches,
  onClose,
}: {
  businessId: string;
  promo: Promotion | null;
  products: Option[];
  branches: Option[];
  onClose: () => void;
}) {
  const [name, setName] = useState(promo?.name ?? "");
  const [kind, setKind] = useState<PromoKind>(promo?.kind ?? "percent");
  const [percent, setPercent] = useState(promo?.percent?.toString() ?? "");
  const [price, setPrice] = useState(promo?.price?.toString() ?? "");
  const [buy, setBuy] = useState(promo?.buy?.toString() ?? "3");
  const [pay, setPay] = useState(promo?.pay?.toString() ?? "2");
  const [chosen, setChosen] = useState(new Set(promo?.productIds ?? []));
  const [query, setQuery] = useState("");
  const [allBranches, setAllBranches] = useState(!promo?.branchIds);
  const [branchIds, setBranchIds] = useState(new Set(promo?.branchIds ?? []));
  const [days, setDays] = useState(new Set<number>(promo?.weekdays ?? []));
  const [startsOn, setStartsOn] = useState(promo?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(promo?.endsOn ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  }, [products, query]);
  const flip = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (!next.delete(value)) next.add(value);
    return next;
  };
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

  const submit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors({});
    setMessage("");
    const { error } = await safeAction(() =>
      actions.savePromotion({
        businessId,
        id: promo?.id,
        name,
        kind,
        percent: kind === "percent" ? num(percent) : undefined,
        price: kind === "price" ? num(price) : undefined,
        buy: kind === "bundle" ? num(buy) : undefined,
        pay: kind === "bundle" ? num(pay) : undefined,
        productIds: [...chosen],
        branchIds: allBranches || branches.length < 2 ? null : [...branchIds],
        weekdays: days.size === 0 ? null : [...days],
        startsOn: startsOn || null,
        endsOn: endsOn || null,
      }),
    );
    if (!error) {
      onClose();
      await refreshRegions();
      toast(promo ? "Promoción guardada." : `Promoción «${name.trim()}» creada.`, "success");
      return;
    }
    setBusy(false);
    const fields = "fields" in error ? (error.fields as Record<string, string[] | undefined>) : undefined;
    if (fields && Object.keys(fields).length > 0) {
      setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v?.[0] ?? ""])));
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-promo-form] [aria-invalid="true"]')?.focus());
    } else setMessage(error.message);
  };

  return (
    <AppDialog title={promo ? `Editar «${promo.name}»` : "Nueva promoción"} description="El descuento se aplica solo al vender, en los días y sucursales que elijas." size="lg" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-5" noValidate data-promo-form>
        <Field id="promo-name" label="Nombre" error={errors.name} hint="Lo ve quien vende, en el detalle de la venta.">
          <Input id="promo-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ej.: Viernes de lácteos" />
        </Field>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-semibold">Descuento</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {KINDS.map((k) => (
              <label key={k.kind} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[var(--color-primary-soft)]">
                <input type="radio" name="kind" value={k.kind} checked={kind === k.kind} onChange={() => setKind(k.kind)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]" />
                <span className="grid">
                  <span className="text-sm font-semibold">{k.label}</span>
                  <span className="text-xs text-muted-foreground">{k.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {kind === "percent" && (
            <Field id="promo-percent" label="Porcentaje de descuento (%)" error={errors.percent}>
              <Input id="promo-percent" type="number" inputMode="numeric" min={1} max={99} value={percent} onChange={(e) => setPercent(e.target.value)} className="max-w-40" />
            </Field>
          )}
          {kind === "price" && (
            <Field id="promo-price" label="Precio de la promoción (Bs, por unidad)" error={errors.price} hint="Si el precio de una sucursal ya es menor, se cobra ese.">
              <Input id="promo-price" type="number" inputMode="decimal" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="max-w-40" />
            </Field>
          )}
          {kind === "bundle" && (
            <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
              <Field id="promo-buy" label="Lleva" error={errors.buy}>
                <Input id="promo-buy" type="number" inputMode="numeric" min={2} max={20} value={buy} onChange={(e) => setBuy(e.target.value)} />
              </Field>
              <Field id="promo-pay" label="Paga" error={errors.pay}>
                <Input id="promo-pay" type="number" inputMode="numeric" min={1} value={pay} onChange={(e) => setPay(e.target.value)} />
              </Field>
            </div>
          )}
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold">
            Productos <span className="font-normal text-muted-foreground">· {chosen.size === 1 ? "1 producto elegido" : `${chosen.size} productos elegidos`}</span>
          </legend>
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto" aria-label="Buscar producto" />
          <ul role="list" className="max-h-60 overflow-y-auto rounded-lg border p-1" aria-invalid={errors.productIds ? true : undefined} aria-describedby={errors.productIds ? "promo-products-error" : undefined} tabIndex={-1}>
            {shown.map((p) => (
              <li key={p.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted">
                  <input type="checkbox" checked={chosen.has(p.id)} onChange={() => setChosen((s) => flip(s, p.id))} className="size-5 shrink-0 accent-[var(--color-primary)]" />
                  <span className="text-sm [overflow-wrap:anywhere]">{p.name}</span>
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="p-3 text-sm text-muted-foreground">Ningún producto coincide con «{query}».</li>}
          </ul>
          {errors.productIds && (
            <p id="promo-products-error" className="field-error">
              {errors.productIds}
            </p>
          )}
        </fieldset>

        {branches.length > 1 && (
          <fieldset className="grid gap-1">
            <legend className="mb-2 text-sm font-semibold">Sucursales</legend>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
              <input type="checkbox" checked={allBranches} onChange={(e) => setAllBranches(e.target.checked)} className="size-5 shrink-0 accent-[var(--color-primary)]" />
              Todas, también las que abras después
            </label>
            {!allBranches &&
              branches.map((b) => (
                <label key={b.id} className="flex min-h-11 cursor-pointer items-center gap-3 pl-8 text-sm">
                  <input type="checkbox" checked={branchIds.has(b.id)} onChange={() => setBranchIds((s) => flip(s, b.id))} className="size-5 shrink-0 accent-[var(--color-primary)]" />
                  {b.name}
                </label>
              ))}
            {errors.branchIds && <p className="field-error">{errors.branchIds}</p>}
          </fieldset>
        )}

        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold">
            Días <span className="font-normal text-muted-foreground">· {days.size === 0 || days.size === 7 ? "todos los días" : `${days.size} por semana`}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(([n, short, long]) => (
              <button
                key={n}
                type="button"
                aria-pressed={days.has(n)}
                aria-label={long}
                title={long}
                onClick={() => setDays((s) => flip(s, n))}
                className="size-11 rounded-full border text-sm font-semibold aria-pressed:border-[var(--color-primary)] aria-pressed:bg-[var(--color-primary)] aria-pressed:text-[var(--color-on-primary)]"
              >
                {short}
              </button>
            ))}
          </div>
          <p className="field-hint">Sin ninguno marcado, vale todos los días.</p>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="promo-from" label="Desde (opcional)" error={errors.startsOn} hint="Vacío: desde hoy.">
            <Input id="promo-from" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
          <Field id="promo-to" label="Hasta (opcional)" error={errors.endsOn} hint="Vacío: sin fecha límite.">
            <Input id="promo-to" type="date" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} />
          </Field>
        </div>

        {message && (
          <p className="field-error" role="alert">
            {message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" className="h-11" aria-disabled={busy || undefined} aria-busy={busy || undefined}>
            {promo ? "Guardar cambios" : "Crear promoción"}
          </Button>
        </div>
      </form>
    </AppDialog>
  );
}
