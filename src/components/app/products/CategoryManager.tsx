import { actions } from "astro:actions";
import { useState } from "react";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import type { Category } from "@/data/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { colorOf } from "./catalog";
import { confirmDialog } from "@/scripts/dialogs";

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
  const [editing, setEditing] = useState<{ id: string; name: string; error: string | null } | null>(null);

  const add = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = nameError(categories, draft);
    setError(problem);
    if (problem) return;
    setBusy(true);
    const { data, error } = await actions.saveCategory({ businessId, name: draft });
    setBusy(false);
    if (error) return setError(error.message);
    setCategories((list) => [...list, data].sort((a, b) => a.name.localeCompare(b.name, "es")));
    setDraft("");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const problem = nameError(categories, editing.name, editing.id);
    if (problem) return setEditing({ ...editing, error: problem });
    const { error } = await actions.saveCategory({ businessId, id: editing.id, name: editing.name });
    if (error) return setEditing({ ...editing, error: error.message });
    setCategories((list) => list.map((c) => (c.id === editing.id ? { ...c, name: editing.name.trim() } : c)));
    setEditing(null);
  };

  const remove = async (c: Category) => {
    if (!(await confirmDialog(`¿Borrar la categoría «${c.name}»? Sus productos quedan en «Sin categoría».`, { confirmLabel: "Borrar", danger: true }))) return;
    const { error } = await actions.deleteCategory({ id: c.id });
    if (error) return setError(error.message);
    setCategories((list) => list.filter((x) => x.id !== c.id));
    onDeleted(c.id);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11 bg-card">
          <Tags />
          Categorías
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Categorías de productos</DialogTitle>
          <DialogDescription>Arma las que use tu negocio. Sirven para filtrar el catálogo.</DialogDescription>
        </DialogHeader>

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
            <Button type="submit" className="h-10" disabled={busy}>
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

        <ul className="m-0 grid max-h-72 list-none gap-1 overflow-y-auto p-0">
          {categories.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf(i) }} aria-hidden="true" />
              {editing?.id === c.id ? (
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex gap-2">
                    <Input
                      autoFocus
                      value={editing.name}
                      aria-label={`Nuevo nombre para ${c.name}`}
                      aria-invalid={editing.error ? true : undefined}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value, error: null })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="h-9 text-base"
                      maxLength={40}
                    />
                    <Button size="sm" className="h-9" onClick={saveEdit}>
                      Guardar
                    </Button>
                  </div>
                  {editing.error && <p className="field-error">{editing.error}</p>}
                </div>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">{counts.get(c.id) ?? 0}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Renombrar ${c.name}`}
                    onClick={() => setEditing({ id: c.id, name: c.name, error: null })}
                  >
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Borrar ${c.name}`} className="hover:text-destructive" onClick={() => remove(c)}>
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
          {categories.length === 0 && <li className="px-2 py-4 text-sm text-muted-foreground">Todavía no hay categorías.</li>}
        </ul>
        <DialogFooter className="text-sm text-muted-foreground sm:justify-start">
          Al borrar una categoría, sus productos quedan en «Sin categoría».
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Campo de formulario con su error; los nombres coinciden con los de la acción. */
