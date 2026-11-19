import { actions } from "astro:actions";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import type { ProductField, ProductFormConfig, ProductSection } from "@/data/types";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { AppDialog } from "../AppDialog";
import { Field, safeAction, selectClass } from "./form";
import { refreshRegions } from "@/scripts/refresh";
import { toast } from "@/scripts/dialogs";

export const SECTIONS: { id: ProductSection; label: string; hint: string }[] = [
  { id: "photo", label: "Foto", hint: "Se ve en el catálogo y al vender." },
  { id: "barcode", label: "Código de barras", hint: "Para buscarlo o escanearlo al vender." },
  { id: "description", label: "Descripción", hint: "Se ve al abrir el producto." },
  { id: "extra", label: "Más datos", hint: "Los campos propios de tu negocio." },
];

export const MODES = [
  { value: "stock", label: "Con stock", hint: "Cuento las unidades" },
  { value: "open", label: "Sin stock", hint: "Un plato o un servicio" },
  { value: "free", label: "Precio al vender", hint: "Prenda única: el precio se escribe al cobrar" },
] as const;

const KINDS: { value: ProductField["kind"]; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "select", label: "Lista de opciones" },
];

type Draft = { id: string; label: string; kind: ProductField["kind"]; options: string };

/**
 * «Personalizar»: cómo se arma la página de producto en este negocio (businesses.product_form). Vale para todos los
 * productos y para todos los que administran el negocio.
 */
export function ProductFormSettings({ businessId, config }: { businessId: string; config: ProductFormConfig }) {
  const [open, setOpen] = useState(false);
  const fresh = () => ({
    defaultMode: config.defaultMode ?? "",
    hidden: new Set(config.hidden ?? []),
    fields: (config.fields ?? []).map((f) => ({ ...f, options: (f.options ?? []).join(", ") })) as Draft[],
  });
  const [state, setState] = useState(fresh);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const setField = (i: number, change: Partial<Draft>) => setState((s) => ({ ...s, fields: s.fields.map((f, j) => (j === i ? { ...f, ...change } : f)) }));
  const moveField = (i: number, by: number) =>
    setState((s) => {
      const fields = [...s.fields];
      [fields[i], fields[i + by]] = [fields[i + by], fields[i]];
      return { ...s, fields };
    });

  async function save() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const { error } = await safeAction(() =>
      actions.saveProductForm({
        businessId,
        defaultMode: state.defaultMode || undefined,
        hidden: [...state.hidden],
        fields: state.fields.map((f) => ({
          id: f.id,
          label: f.label,
          kind: f.kind,
          options: f.kind === "select" ? f.options.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
        })),
      } as never),
    );
    setBusy(false);
    if (error) {
      // Los errores de zod de un arreglo llegan por campo («fields»): se muestra el primero, en línea.
      const fields = "fields" in error ? (error.fields as Record<string, string[] | undefined>) : undefined;
      return setMessage(Object.values(fields ?? {})[0]?.[0] ?? error.message);
    }
    setOpen(false);
    await refreshRegions();
    toast("Listo: la página de producto quedó como la armaste.", "success");
  }

  return (
    <AppDialog
      title="Personalizar la página de producto"
      description="Elige qué se muestra al crear y editar productos en este negocio. Vale para todos los productos."
      size="lg"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setState(fresh());
        setMessage("");
      }}
      trigger={
        <Button type="button" variant="outline" className="h-11 bg-card">
          <SlidersHorizontal />
          Personalizar
        </Button>
      }
    >
      <div className="grid min-w-0 gap-6">
        <Field id="settings-mode" label="Tipo por defecto al crear">
          <select
            id="settings-mode"
            className={selectClass}
            value={state.defaultMode}
            onChange={(e) => setState((s) => ({ ...s, defaultMode: e.target.value as typeof s.defaultMode }))}
          >
            <option value="">El de tu rubro</option>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}: {m.hint.toLowerCase()}
              </option>
            ))}
          </select>
        </Field>

        <fieldset className="m-0 grid min-w-0 gap-1 border-0 p-0">
          <legend className="mb-2 p-0 text-sm font-semibold">Secciones</legend>
          {SECTIONS.map((section) => (
            <label key={section.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-[var(--color-surface-hover)]">
              <span className="grid min-w-0 flex-1">
                <span className="text-sm font-semibold">{section.label}</span>
                <span className="text-sm text-[var(--color-text-muted)]">{section.hint}</span>
              </span>
              <Switch
                checked={!state.hidden.has(section.id)}
                onCheckedChange={(on) =>
                  setState((s) => {
                    const hidden = new Set(s.hidden);
                    on ? hidden.delete(section.id) : hidden.add(section.id);
                    return { ...s, hidden };
                  })
                }
                aria-label={`Mostrar ${section.label}`}
              />
            </label>
          ))}
          <p className="field-hint m-0 px-2">Una sección oculta se muestra igual en un producto que ya tiene ese dato.</p>
        </fieldset>

        <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
          <legend className="mb-2 p-0 text-sm font-semibold">Campos propios</legend>
          <p className="field-hint m-0">Datos que tu negocio quiere anotar en cada producto: talla, marca, color, ingredientes…</p>
          {state.fields.length > 0 && (
            <ol className="m-0 grid list-none gap-2 p-0">
              {state.fields.map((f, i) => (
                <li key={f.id} className="grid min-w-0 gap-2 rounded-lg bg-[var(--color-surface-muted)] p-3">
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
                    <input
                      className="input"
                      value={f.label}
                      maxLength={30}
                      placeholder="Ej.: Talla"
                      aria-label={`Nombre del campo ${i + 1}`}
                      onChange={(e) => setField(i, { label: e.target.value })}
                    />
                    <select
                      className={`${selectClass} max-sm:col-span-2 max-sm:row-start-2`}
                      value={f.kind}
                      aria-label={`Tipo del campo ${f.label || i + 1}`}
                      onChange={(e) => setField(i, { kind: e.target.value as Draft["kind"] })}
                    >
                      {KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center">
                      <button type="button" className="icon-btn size-11" aria-label={`Subir ${f.label || "el campo"}`} disabled={i === 0} onClick={() => moveField(i, -1)}>
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn size-11"
                        aria-label={`Bajar ${f.label || "el campo"}`}
                        disabled={i === state.fields.length - 1}
                        onClick={() => moveField(i, 1)}
                      >
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn size-11 hover:text-[var(--color-expense)]"
                        aria-label={`Quitar ${f.label || "el campo"}`}
                        onClick={() => setState((s) => ({ ...s, fields: s.fields.filter((_, j) => j !== i) }))}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {f.kind === "select" && (
                    <input
                      className="input"
                      value={f.options}
                      placeholder="Opciones separadas por coma. Ej.: S, M, L, XL"
                      aria-label={`Opciones de ${f.label || "la lista"}`}
                      onChange={(e) => setField(i, { options: e.target.value })}
                    />
                  )}
                </li>
              ))}
            </ol>
          )}
          {state.fields.length < 20 && (
            <Button
              type="button"
              variant="outline"
              className="h-11 justify-self-start"
              onClick={() => setState((s) => ({ ...s, fields: [...s.fields, { id: crypto.randomUUID().slice(0, 8), label: "", kind: "text", options: "" }] }))}
            >
              <Plus />
              Agregar campo
            </Button>
          )}
          <p className="field-hint m-0">Al quitar un campo, sus datos se borran de cada producto la próxima vez que lo guardes.</p>
        </fieldset>

        {message && (
          <p className="notice notice-error m-0" role="alert">
            {message}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={save} aria-disabled={busy || undefined} aria-busy={busy || undefined}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </div>
    </AppDialog>
  );
}
