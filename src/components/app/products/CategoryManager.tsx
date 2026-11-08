import { actions } from "astro:actions";
import { useRef, useState } from "react";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import type { Category } from "@/data/types";
import { Button } from "@/components/ui/button";
import { AppDialog } from "../AppDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { colorOf } from "./catalog";
import { safeAction } from "./form";
import { announce, confirmDialog } from "@/scripts/dialogs";

const nameError = (categories: Category[], name: string, exceptId?: string) => {
  const clean = name.trim();
  if (!clean) return "Escribe un nombre para la categoría.";
  if (clean.length > 40) return "Usa 40 caracteres o menos.";
  const taken = categories.some((c) => c.id !== exceptId && c.name.toLowerCase() === clean.toLowerCase());
  return taken ? `Ya existe la categoría «${clean}».` : null;
};

export function CategoryManager({
  businessId,
  categories,
  setCategories,
  onDeleted,
  counts,
}: {
  businessId: string;
  categories: Category[];
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  onDeleted: (id: string) => void;
  counts: Map<string, number>;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; error: string | null; busy?: boolean } | null>(null);
  const list = useRef<HTMLUListElement>(null);

  /** Tras renombrar o borrar, el foco pasa a un botón que sigue en pantalla (si no, cae al <body>). */
  const focusRow = (id: string | undefined, role: "rename" | "delete" = "rename") =>
    requestAnimationFrame(() => {
      const target =
        (id && list.current?.querySelector<HTMLElement>(`[data-category="${id}"] [data-role="${role}"]`)) ||
        list.current?.querySelector<HTMLElement>("[data-role=rename]") ||
        document.getElementById("new-category");
      target?.focus();
    });

  const add = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = nameError(categories, draft);
    setError(problem);
    if (problem || busy) return;
    setBusy(true);
    const { data, error } = await safeAction(() => actions.saveCategory({ businessId, name: draft }));
    setBusy(false);
    if (error || !data) return setError(error?.message ?? "No se pudo guardar.");
    setCategories((list) => [...list, data].sort((a, b) => a.name.localeCompare(b.name, "es")));
    setDraft("");
    announce(`Categoría «${data.name}» agregada.`);
  };

  const saveEdit = async () => {
    if (!editing || editing.busy) return;
    const problem = nameError(categories, editing.name, editing.id);
    if (problem) return setEditing({ ...editing, error: problem });
    setEditing({ ...editing, busy: true });
    const { error } = await safeAction(() => actions.saveCategory({ businessId, id: editing.id, name: editing.name }));
    if (error) return setEditing({ ...editing, busy: false, error: error.message });
    setCategories((list) => list.map((c) => (c.id === editing.id ? { ...c, name: editing.name.trim() } : c)));
    setEditing(null);
    focusRow(editing.id);
  };

  const remove = async (c: Category) => {
    if (!(await confirmDialog(`¿Borrar la categoría «${c.name}»? Sus productos quedan en «Sin categoría».`, { confirmLabel: "Borrar", danger: true }))) return;
    const { error } = await safeAction(() => actions.deleteCategory({ id: c.id }));
    if (error) return setError(error.message);
    const index = categories.findIndex((x) => x.id === c.id);
    const neighbor = categories[index + 1] ?? categories[index - 1];
    setCategories((list) => list.filter((x) => x.id !== c.id));
    onDeleted(c.id);
    announce(`Categoría «${c.name}» borrada.`);
    focusRow(neighbor?.id, "delete");
  };

  return (
    <AppDialog
      title="Categorías de productos"
      description="Arma las que use tu negocio. Sirven para filtrar el catálogo."
      trigger={
        <Button variant="outline" className="h-11 bg-card">
          <Tags />
          Categorías
        </Button>
      }
      contentProps={{
        // Escape mientras se renombra: cancela el cambio y no cierra todo el diálogo.
        onEscapeKeyDown: (e) => {
          if (!editing) return;
          e.preventDefault();
          const id = editing.id;
          setEditing(null);
          focusRow(id);
        },
      }}
    >

        <form onSubmit={add} className="grid gap-2" noValidate>
          <Label htmlFor="new-category">Nueva categoría</Label>
          <div className="flex gap-2">
            <Input
              id="new-category"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              placeholder="Ej.: Embutidos"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "new-category-error" : undefined}
              className="h-10 text-base"
              maxLength={40}
            />
            <Button type="submit" className="h-10" aria-disabled={busy || undefined} aria-busy={busy || undefined}>
              <Plus />
              Agregar
            </Button>
          </div>
          {error && (
            <p id="new-category-error" className="field-error">
              {error}
            </p>
          )}
        </form>

        <ul ref={list} className="m-0 grid max-h-72 list-none gap-1 overflow-y-auto p-0">
          {categories.map((c, i) => (
            <li key={c.id} data-category={c.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf(i) }} aria-hidden="true" />
              {editing?.id === c.id ? (
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex gap-2">
                    <Input
                      autoFocus
                      value={editing.name}
                      aria-label={`Nuevo nombre para ${c.name}`}
                      aria-invalid={editing.error ? true : undefined}
                      aria-describedby={editing.error ? `rename-${c.id}-error` : undefined}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value, error: null })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                      }}
                      className="h-9 text-base"
                      maxLength={40}
                    />
                    <Button size="sm" className="h-9" onClick={saveEdit} aria-disabled={editing.busy || undefined} aria-busy={editing.busy || undefined}>
                      {editing.busy ? "Guardando…" : "Guardar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9"
                      onClick={() => {
                        setEditing(null);
                        focusRow(c.id);
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                  {editing.error && (
                    <p id={`rename-${c.id}-error`} className="field-error">
                      {editing.error}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {counts.get(c.id) ?? 0}
                    <span className="sr-only"> {(counts.get(c.id) ?? 0) === 1 ? "producto" : "productos"}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    data-role="rename"
                    aria-label={`Renombrar ${c.name}`}
                    onClick={() => setEditing({ id: c.id, name: c.name, error: null })}
                  >
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" data-role="delete" aria-label={`Borrar ${c.name}`} className="hover:text-destructive" onClick={() => remove(c)}>
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
          {categories.length === 0 && <li className="px-2 py-4 text-sm text-muted-foreground">Todavía no hay categorías.</li>}
        </ul>
        <p className="m-0 text-sm text-muted-foreground">Al borrar una categoría, sus productos quedan en «Sin categoría».</p>
    </AppDialog>
  );
}

/** Campo de formulario con su error; los nombres coinciden con los de la acción. */
