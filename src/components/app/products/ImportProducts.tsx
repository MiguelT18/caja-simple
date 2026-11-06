import { actions } from "astro:actions";
import { useState } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { productsFromCsv, type ProductRow } from "@/lib/csv";
import { toast } from "@/scripts/dialogs";
import { refreshRegions } from "@/scripts/refresh";
import { Field, safeAction } from "./form";

const SHOWN_ERRORS = 8;

/** Importa productos desde un CSV: vista previa en el navegador y alta en lote con `importProducts`. */
export function ImportProducts({ businessId }: { businessId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setRows([]);
    setErrors([]);
    setMessage("");
  }

  async function read(file?: File) {
    reset();
    if (!file) return;
    if (file.size > 1_000_000) return setMessage("El archivo pesa más de 1 MB. Divídelo en partes.");
    const parsed = productsFromCsv(await file.text());
    setRows(parsed.rows);
    setErrors(parsed.errors);
    if (parsed.rows.length > 500) setMessage("Máximo 500 productos por archivo. Divídelo en partes.");
    else if (!parsed.rows.length && !parsed.errors.length) setMessage("El archivo está vacío.");
  }

  async function submit() {
    if (busy || !rows.length || rows.length > 500) return;
    setBusy(true);
    const { data, error } = await safeAction(() => actions.importProducts({ businessId, rows }));
    setBusy(false);
    if (error) return setMessage(error.message);
    const skipped = data.skipped.length ? ` ${data.skipped.length} ya estaban en el catálogo y se saltaron.` : "";
    setOpen(false);
    toast(`Se importaron ${data.imported} productos.${skipped}`, "success");
    await refreshRegions();
  }

  return (
    <>
      <Button variant="outline" className="h-11" onClick={() => setOpen(true)}>
        <FileUp />
        Importar CSV
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Importar productos</DialogTitle>
            <DialogDescription>
              Un CSV con las columnas «nombre», «código de barras» y «categoría» (las dos últimas son opcionales). Desde Excel: Guardar como › CSV.
              Las categorías nuevas se crean, y los productos que ya tienes se saltan.
            </DialogDescription>
          </DialogHeader>
          <Field id="import-file" label="Archivo CSV">
            <input id="import-file" type="file" accept=".csv,text/csv" className="input" onChange={(e) => read(e.target.files?.[0])} />
          </Field>
          <div aria-live="polite" className="grid gap-2 text-sm">
            {rows.length > 0 && (
              <p className="m-0">
                <strong>{rows.length}</strong> {rows.length === 1 ? "producto listo" : "productos listos"} para importar
                {rows.length <= 3 ? `: ${rows.map((r) => r.name).join(", ")}.` : `, desde «${rows[0].name}» hasta «${rows.at(-1)!.name}».`}
              </p>
            )}
            {errors.length > 0 && (
              <div className="notice m-0 bg-[var(--color-warning-soft)] text-[var(--color-warning)]">
                <p className="m-0 font-semibold">
                  {errors.length === 1 ? "1 fila no se va a importar:" : `${errors.length} filas no se van a importar:`}
                </p>
                <ul className="m-0 mt-1 pl-5">
                  {errors.slice(0, SHOWN_ERRORS).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                  {errors.length > SHOWN_ERRORS && <li>Y {errors.length - SHOWN_ERRORS} más.</li>}
                </ul>
              </div>
            )}
            {message && (
              <p className="notice notice-error m-0" role="alert">
                {message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} aria-disabled={busy || !rows.length || rows.length > 500 || undefined} aria-busy={busy || undefined}>
              {busy ? "Importando…" : rows.length ? `Importar ${rows.length}` : "Importar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
