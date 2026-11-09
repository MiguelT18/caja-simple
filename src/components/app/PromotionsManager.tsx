// Promociones del negocio: lista con su estado de hoy y diálogo para crear o editar. La base aplica el descuento al vender.
import { actions } from "astro:actions";
import { useMemo, useState } from "react";
import { BadgePercent, Lock, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import type { Promotion } from "@/data/promotions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppDialog } from "./AppDialog";
import { Field, safeAction } from "./products/form";
import { productsLabel, promoBadge, promoLabel, promoStatus, statusLabel, whenLabel, type PromoKind } from "@/lib/promos";
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

export default function PromotionsManager({
  businessId,
  promotions,
  products,
  branches,
  today,
  canEdit,
  planHref,
}: {
  businessId: string;
  promotions: Promotion[];
  products: Option[];
  branches: Option[];
  today: string;
  canEdit: boolean;
  planHref: string;
}) {
  const [editing, setEditing] = useState<Promotion | "new" | null>(null);
  const productName = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  const toggle = async (p: Promotion) => {
    const { error } = await safeAction(() => actions.togglePromotion({ id: p.id, active: !p.active }));
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

  return (
    <div className="grid gap-4">
      {canEdit ? (
        <div>
          <Button className="h-11" onClick={() => setEditing("new")} disabled={products.length === 0}>
            <Plus />
            Nueva promoción
          </Button>
          {products.length === 0 && <p className="field-hint mt-2">Primero agrega productos al catálogo.</p>}
        </div>
      ) : (
        <p className="notice flex flex-wrap items-center gap-2">
          <Lock className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          Las promociones son de los planes pagos. Las que ya tienes se ven, pero no se aplican al vender.{" "}
          <a href={planHref} className="font-semibold underline">
            Ver planes
          </a>
        </p>
      )}

      {promotions.length === 0 ? (
        <div className="grid justify-items-center gap-2 rounded-xl border border-dashed p-8 text-center">
          <BadgePercent className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
          <p className="font-semibold">Todavía no hay promociones</p>
          <p className="max-w-prose text-sm text-muted-foreground">
            Crea un descuento para algunos productos: por un tiempo, sin fecha límite o solo ciertos días, como «todos los viernes».
          </p>
        </div>
      ) : (
        <ul role="list" className="grid gap-3">
          {promotions.map((p) => {
            const status = promoStatus(p, today);
            const names = p.productIds.map((id) => productName.get(id)).filter(Boolean) as string[];
            const where = !p.branchIds ? "Todas las sucursales" : p.branchIds.map((id) => branchName.get(id) ?? "Sucursal quitada").join(", ");
            return (
              <li key={p.id} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip chip-income num">{promoBadge(p)}</span>
                    <h2 className="font-bold [overflow-wrap:anywhere]">{p.name}</h2>
                    <span className={`chip ${status === "hoy" ? "chip-income" : status === "vencida" ? "chip-warning" : "chip-neutral"}`}>{statusLabel[status]}</span>
                  </div>
                  <p className="text-sm">{promoLabel(p)} · {whenLabel(p)}</p>
                  <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    {productsLabel(names.length)}: {names.slice(0, 4).join(", ")}
                    {names.length > 4 && ` y ${names.length - 4} más`}
                    {branches.length > 1 && ` · ${where}`}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="h-10" onClick={() => setEditing(p)} aria-label={`Editar «${p.name}»`}>
                      <Pencil />
                      Editar
                    </Button>
                    <Button variant="outline" size="sm" className="h-10" onClick={() => toggle(p)} aria-label={`${p.active ? "Pausar" : "Activar"} «${p.name}»`}>
                      {p.active ? <Pause /> : <Play />}
                      {p.active ? "Pausar" : "Activar"}
                    </Button>
                    <Button variant="outline" size="sm" className="h-10" onClick={() => remove(p)} aria-label={`Borrar «${p.name}»`}>
                      <Trash2 />
                      Borrar
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
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
