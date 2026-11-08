import { actions } from "astro:actions";
import { useMemo, useState } from "react";
import { ClipboardPaste, Download, FileUp, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { AppDialog } from "../AppDialog";
import { importColumns, productsFromCsv, type ImportOptions } from "@/lib/csv";
import { formatBs, toCsv } from "@/lib/format";
import { toast } from "@/scripts/dialogs";
import { refreshRegions } from "@/scripts/refresh";
import { Field, FilePicker, safeAction } from "./form";

const SHOWN_ERRORS = 8;
const SHOWN_ROWS = 5;
const MAX_ROWS = 500;
const SAMPLE = "Ejemplo, bórrala:";

type Branch = { id: string; name: string };

/** Dos filas de ejemplo con las columnas pedidas: para el cuadro de texto y para la plantilla. */
function sampleRows(options: ImportOptions) {
  const examples = [
    { name: "Leche 1 L", barcode: "7790001234567", category: "Lácteos", price: "7,50", stock: ["24", "10", "6", "12"], minStock: "6" },
    { name: "Pan de batalla", barcode: "", category: "Panadería", price: "0,50", stock: [] as string[], minStock: "" },
  ];
  return examples.map((e) =>
    importColumns(options).map(({ key }) => {
      if (key.startsWith("stock")) {
        const i = key === "stock" ? 0 : (options.branches ?? []).findIndex((b) => `stock:${b.id}` === key);
        return e.stock[i % 4] ?? "";
      }
      return e[key as "name" | "barcode" | "category" | "price" | "minStock"];
    }),
  );
}

function downloadTemplate(options: ImportOptions) {
  const rows = sampleRows(options).map(([name, ...rest]) => [`${SAMPLE} ${name}`, ...rest]);
  const csv = toCsv([importColumns(options).map((c) => c.label), ...rows]);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: "plantilla-productos.csv" }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Importa productos pegando o escribiendo filas, o subiendo un CSV: vista previa en el navegador y alta en lote con
 * `importProducts`. Con sucursales marcadas, entran también a su inventario con el precio y el stock de cada fila
 * (el mismo en todas, o una columna de stock por sucursal).
 */
export function ImportProducts({ businessId, branches }: { businessId: string; branches: Branch[] }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"paste" | "file">("paste");
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // Con una sola sucursal, lo importado queda listo para vender ahí sin tener que marcarla.
  const [branchIds, setBranchIds] = useState<string[]>(branches.length === 1 ? [branches[0].id] : []);
  const [stockMode, setStockMode] = useState<"same" | "each">("each");
  // El código de barras y la categoría son opcionales: sin encabezado, solo se leen si se marcan.
  const [withBarcode, setWithBarcode] = useState(false);
  const [withCategory, setWithCategory] = useState(false);

  const chosen = branches.filter((b) => branchIds.includes(b.id));
  const perBranch = stockMode === "each" && chosen.length > 1;
  const chosenKey = chosen.map((b) => b.id).join();
  const options = useMemo<ImportOptions>(
    () => ({ barcode: withBarcode, category: withCategory, branches: perBranch ? chosen : [] }),
    // `chosen` cambia con `chosenKey`: un arreglo nuevo en cada render no debe volver a leer las filas.
    [withBarcode, withCategory, perBranch, chosenKey],
  );
  const columns = importColumns(options);
  const placeholder = sampleRows(options)
    .map((cells) => cells.join("; ").replace(/(; )+$/, ""))
    .join("\n");

  const { rows, errors } = useMemo(() => {
    const parsed = productsFromCsv(text, options);
    // Las filas de ejemplo de la plantilla nunca entran al catálogo, aunque se hayan olvidado de borrarlas.
    return { rows: parsed.rows.filter((r) => !r.name.startsWith(SAMPLE)), errors: parsed.errors };
  }, [text, options]);

  const hasStock = rows.some((r) => r.stock !== undefined || r.stockByBranch);
  const hasPriceOrStock = hasStock || rows.some((r) => r.price !== undefined);
  const tooMany = rows.length > MAX_ROWS;
  const ready = rows.length > 0 && !tooMany;

  const [fileName, setFileName] = useState("");
  function reset() {
    setText("");
    setMessage("");
    setFileName("");
  }

  async function read(file?: File) {
    reset();
    if (!file) return;
    setFileName(file.name);
    if (file.size > 1_000_000) return setMessage("El archivo pesa más de 1 MB. Divídelo en partes.");
    setText(await file.text());
  }

  async function submit() {
    if (busy || !ready) return;
    setBusy(true);
    const { data, error } = await safeAction(() => actions.importProducts({ businessId, rows, branchIds }));
    setBusy(false);
    if (error) return setMessage(error.message);
    const where = data.stocked && chosen.length ? ` y quedaron listos en ${chosen.length === 1 ? chosen[0].name : `${chosen.length} sucursales`}` : "";
    const skipped = data.skipped.length ? ` ${data.skipped.length} ya estaban en el catálogo y no se repitieron.` : "";
    setOpen(false);
    reset();
    toast(`Se importaron ${data.imported} productos${where}.${skipped}`, "success");
    await refreshRegions();
  }

  const toggleBranch = (id: string, on: boolean) => setBranchIds((list) => (on ? [...list, id] : list.filter((b) => b !== id)));
  const stockOf = (r: (typeof rows)[number]) => (r.stockByBranch ? chosen.map((b) => r.stockByBranch![b.id] ?? "—").join(" / ") : (r.stock ?? "—"));

  return (
    <>
      <Button variant="outline" className="h-11" onClick={() => setOpen(true)}>
        <FileUp />
        Importar
      </Button>
      <AppDialog
        title="Importar productos"
        description="Las categorías nuevas se crean y los productos que ya tienes no se repiten."
        size="lg"
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >

          {branches.length > 0 && (
            <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
              <legend className="mb-1 p-0 text-sm font-semibold">¿A qué sucursales entran?</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {branches.length > 1 && (
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold sm:min-h-0">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--color-primary)]"
                      checked={branchIds.length === branches.length}
                      onChange={(e) => setBranchIds(e.target.checked ? branches.map((b) => b.id) : [])}
                    />
                    Todas
                  </label>
                )}
                {branches.map((b) => (
                  <label key={b.id} className="inline-flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
                    <input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={branchIds.includes(b.id)} onChange={(e) => toggleBranch(b.id, e.target.checked)} />
                    {b.name}
                  </label>
                ))}
              </div>
              <p className="field-hint m-0">
                {chosen.length
                  ? "Entran al inventario con el precio y el stock de cada fila. Sin precio se cobra al vender; sin stock, no se controla. Lo que ya está en una sucursal no se toca."
                  : "Sin sucursal, solo se crea el catálogo: el precio y el stock se ponen después en cada sucursal."}
              </p>
              {chosen.length > 1 && (
                <div role="radiogroup" aria-label="Stock de cada sucursal" className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
                  {([
                    ["each", "Un stock por sucursal"],
                    ["same", "El mismo stock en todas"],
                  ] as const).map(([value, label]) => (
                    <label key={value} className="inline-flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
                      <input
                        type="radio"
                        name="import-stock-mode"
                        className="size-5 accent-[var(--color-primary)]"
                        checked={stockMode === value}
                        onChange={() => setStockMode(value)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )}

          {/* Celular: el selector a todo el ancho (dos mitades de 44 px) y la plantilla debajo. */}
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
            <div className="grid grid-cols-2 rounded-full border p-0.5 sm:inline-grid" role="group" aria-label="Cómo cargarlos">
              {([
                ["paste", "Pegar o escribir", ClipboardPaste],
                ["file", "Subir archivo", FileUp],
              ] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={source === value}
                  onClick={() => {
                    setSource(value);
                    reset();
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold whitespace-nowrap text-[var(--color-text-muted)] aria-pressed:bg-[var(--color-text)] aria-pressed:text-[var(--color-surface)] sm:min-h-9"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            <Button variant="ghost" type="button" className="max-sm:h-11 max-sm:border max-sm:bg-[var(--color-surface)]" onClick={() => downloadTemplate(options)}>
              <Download />
              Descargar plantilla
            </Button>
          </div>

          <div className="grid min-w-0 gap-2 rounded-lg bg-[var(--color-surface-muted)] p-3 text-sm">
            <p className="m-0 font-semibold">Columnas, en este orden</p>
            <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Orden de las columnas">
              {columns.map((c, i) => (
                <li key={c.key} className="rounded-full bg-[var(--color-surface)] px-2.5 py-0.5 text-xs font-semibold">
                  <span className="num text-[var(--color-text-muted)]">{i + 1}.</span> {c.label}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <label className="inline-flex min-h-11 items-center gap-2 sm:min-h-0">
                <input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={withBarcode} onChange={(e) => setWithBarcode(e.target.checked)} />
                Con código de barras
              </label>
              <label className="inline-flex min-h-11 items-center gap-2 sm:min-h-0">
                <input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={withCategory} onChange={(e) => setWithCategory(e.target.checked)} />
                Con categoría
              </label>
            </div>
            <p className="field-hint m-0">
              Las columnas vacías del final se pueden omitir. Si la primera fila trae encabezados (como la plantilla), las columnas se leen por su nombre, en
              cualquier orden.
            </p>
          </div>

          {source === "paste" ? (
            <Field id="import-paste" label="Filas" hint="Una fila por línea y las columnas separadas con punto y coma (;). También puedes pegar filas copiadas de Excel o Google Sheets.">
              <textarea
                id="import-paste"
                className="input min-h-36 font-mono text-base"
                rows={6}
                spellCheck={false}
                value={text}
                placeholder={placeholder}
                onChange={(e) => {
                  setText(e.target.value);
                  setMessage("");
                }}
              />
            </Field>
          ) : (
            <Field id="import-file" label="Archivo CSV">
              <FilePicker
                id="import-file"
                accept=".csv,text/csv"
                icon={<FileUp />}
                label="Elegir archivo CSV"
                hint="Desde Excel: Guardar como › CSV."
                fileName={fileName}
                onChange={(e) => read(e.target.files?.[0])}
              />
            </Field>
          )}

          <div aria-live="polite" className="grid min-w-0 gap-3 text-sm">
            {rows.length > 0 && (
              <div className="grid min-w-0 gap-2">
                <p className="m-0">
                  <strong>{rows.length}</strong> {rows.length === 1 ? "producto listo" : "productos listos"} para importar
                  {rows.length > SHOWN_ROWS ? `. Los primeros ${SHOWN_ROWS}:` : ":"}
                </p>
                <p className="m-0 text-xs text-[var(--color-text-muted)] sm:hidden">Desliza la tabla para ver todas las columnas.</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[26rem] text-left">
                    <thead className="text-[var(--color-text-muted)]">
                      <tr className="border-b">
                        <th className="py-1.5 pr-3 font-semibold">Nombre</th>
                        {withBarcode && <th className="py-1.5 pr-3 font-semibold">Código</th>}
                        {withCategory && <th className="py-1.5 pr-3 font-semibold">Categoría</th>}
                        <th className="py-1.5 pr-3 text-right font-semibold">Precio</th>
                        <th className="py-1.5 text-right font-semibold">{perBranch ? `Stock (${chosen.map((b) => b.name).join(" / ")})` : "Stock"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, SHOWN_ROWS).map((r, i) => (
                        <tr key={i}>
                          <td className="max-w-48 truncate py-1.5 pr-3">{r.name}</td>
                          {withBarcode && <td className="num py-1.5 pr-3">{r.barcode ?? "—"}</td>}
                          {withCategory && <td className="py-1.5 pr-3 text-[var(--color-text-muted)]">{r.category ?? "—"}</td>}
                          <td className="num py-1.5 pr-3 text-right">{r.price === undefined ? "Al vender" : formatBs(r.price)}</td>
                          <td className="num py-1.5 text-right">{stockOf(r)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > SHOWN_ROWS && <p className="m-0 text-[var(--color-text-muted)]">Y {rows.length - SHOWN_ROWS} más.</p>}
              </div>
            )}
            {chosen.length > 1 && stockMode === "same" && hasStock && (
              <p className="notice m-0 flex gap-2 bg-[var(--color-warning-soft)] text-[var(--color-warning)]">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  El stock de cada fila se copia a las {chosen.length} sucursales marcadas. Si cada local tiene su propio stock, elige «Un stock por sucursal».
                </span>
              </p>
            )}
            {!chosen.length && branches.length > 0 && hasPriceOrStock && (
              <p className="notice m-0 flex gap-2 bg-[var(--color-warning-soft)] text-[var(--color-warning)]">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>Las filas traen precio o stock, pero no marcaste ninguna sucursal: se van a ignorar.</span>
              </p>
            )}
            {errors.length > 0 && (
              <div className="notice m-0 bg-[var(--color-warning-soft)] text-[var(--color-warning)]">
                <p className="m-0 font-semibold">{errors.length === 1 ? "1 fila no se va a importar:" : `${errors.length} filas no se van a importar:`}</p>
                <ul className="m-0 mt-1 pl-5">
                  {errors.slice(0, SHOWN_ERRORS).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                  {errors.length > SHOWN_ERRORS && <li>Y {errors.length - SHOWN_ERRORS} más.</li>}
                </ul>
              </div>
            )}
            {(message || tooMany) && (
              <p className="notice notice-error m-0" role="alert">
                {message || `Máximo ${MAX_ROWS} productos a la vez. Divídelos en partes.`}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} aria-disabled={busy || !ready || undefined} aria-busy={busy || undefined}>
              {busy ? "Importando…" : rows.length ? `Importar ${rows.length}` : "Importar"}
            </Button>
          </DialogFooter>
      </AppDialog>
    </>
  );
}
