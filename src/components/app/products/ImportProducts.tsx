import { actions } from "astro:actions";
import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { CircleCheck, Download, FileUp, ImagePlus, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { AppDialog } from "../AppDialog";
import { cellsToGrid, gridToCsv, importColumns, parseCsv, productsFromCsv, type GridRow, type ImportOptions } from "@/lib/csv";
import { toCsv } from "@/lib/format";
import { toast } from "@/scripts/dialogs";
import { refreshRegions } from "@/scripts/refresh";
import { FilePicker, safeAction, useStoredState } from "./form";
import { confirmDiscard, draftKey } from "@/scripts/drafts";
import { shrinkImage } from "@/scripts/shrink-image";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
type Photo = { file: File; url: string };

const SHOWN_ERRORS = 8;
const MAX_ROWS = 500;
const START_ROWS = 3;
const emptyRows = (n: number): GridRow[] => Array.from({ length: n }, () => ({}));

/** Encabezado visible de cada columna (las claves de la planilla van en minúscula). */
const headerOf = (label: string) => (label === "precio" ? "Precio (Bs)" : label[0].toUpperCase() + label.slice(1));
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
  // La tabla: una fila por producto, una celda por columna. Las celdas se guardan por la clave de su columna, así
  // marcar o desmarcar «código de barras» no mueve lo ya escrito.
  // La tabla y las opciones quedan como borrador en este equipo hasta importar (o descartar); las fotos no.
  const key = (part: string) => draftKey("import", businessId, part);
  const [grid, setGrid, clearGrid] = useStoredState<GridRow[]>(key("grid"), emptyRows(START_ROWS));
  const tableRef = useRef<HTMLTableElement>(null);
  // La foto de cada fila (mismo índice que grid). No va en el CSV: se sube después del alta, una por producto.
  const [photos, setPhotos] = useState<(Photo | undefined)[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // Con una sola sucursal, lo importado queda listo para vender ahí sin tener que marcarla.
  const [branchIds, setBranchIds, clearBranchIds] = useStoredState<string[]>(key("branches"), branches.length === 1 ? [branches[0].id] : []);
  const [stockMode, setStockMode, clearStockMode] = useStoredState<"same" | "each">(key("stock-mode"), "each");
  // El código de barras y la categoría son opcionales: sin encabezado, solo se leen si se marcan.
  const [withBarcode, setWithBarcode, clearBarcode] = useStoredState(key("barcode"), false);
  const [withCategory, setWithCategory, clearCategory] = useStoredState(key("category"), false);

  const chosen = branches.filter((b) => branchIds.includes(b.id));
  const perBranch = stockMode === "each" && chosen.length > 1;
  const chosenKey = chosen.map((b) => b.id).join();
  const options = useMemo<ImportOptions>(
    () => ({ barcode: withBarcode, category: withCategory, branches: perBranch ? chosen : [] }),
    // `chosen` cambia con `chosenKey`: un arreglo nuevo en cada render no debe volver a leer las filas.
    [withBarcode, withCategory, perBranch, chosenKey],
  );
  const columns = importColumns(options);
  const examples = sampleRows(options)[0];

  // Se valida con las mismas reglas que un CSV; cada error vuelve a su fila de la tabla.
  const { rows, errors, rowErrors, filled } = useMemo(() => {
    const { text, lines } = gridToCsv(columns, grid);
    const parsed = productsFromCsv(text, options);
    const rowErrors = new Map<number, string>();
    const errors = parsed.errors.map((e) =>
      e.replace(/^Fila (\d+): (.*)$/, (_, n: string, problem: string) => {
        const at = lines[Number(n) - 2];
        rowErrors.set(at, problem[0].toUpperCase() + problem.slice(1));
        return `Fila ${at + 1}: ${problem}`;
      }),
    );
    // Las filas de ejemplo de la plantilla nunca entran al catálogo, aunque se hayan olvidado de borrarlas.
    return { rows: parsed.rows.filter((r) => !r.name.startsWith(SAMPLE)), errors, rowErrors, filled: new Set(lines) };
    // `columns` sale de `options`.
  }, [grid, options]);

  const hasStock = rows.some((r) => r.stock !== undefined || r.stockByBranch);
  const hasPriceOrStock = hasStock || rows.some((r) => r.price !== undefined);
  const tooMany = rows.length > MAX_ROWS;
  const ready = rows.length > 0 && !tooMany;

  const [fileName, setFileName] = useState("");
  function clearPhotos() {
    for (const p of photos) if (p) URL.revokeObjectURL(p.url);
    setPhotos([]);
  }

  /** Vacía la tabla y las opciones y borra el borrador: tras importar o al descartar. */
  function reset() {
    clearPhotos();
    clearGrid();
    clearBranchIds();
    clearStockMode();
    clearBarcode();
    clearCategory();
    setMessage("");
    setFileName("");
  }

  async function cancel() {
    if (grid.some((r) => Object.values(r).some((v) => v?.trim())) || photos.some(Boolean)) {
      if (!(await confirmDiscard())) return;
      reset();
    }
    setOpen(false);
  }

  const focusCell = (row: number, col: number) =>
    requestAnimationFrame(() => tableRef.current?.querySelector<HTMLInputElement>(`[data-cell="${row}:${col}"]`)?.focus());

  function setCell(row: number, key: string, value: string) {
    setMessage("");
    setGrid((g) => g.map((r, i) => (i === row ? { ...r, [key]: value } : r)));
  }

  function addRow() {
    setGrid((g) => [...g, {}]);
    focusCell(grid.length, 0);
  }

  function removeRow(row: number) {
    if (photos[row]) URL.revokeObjectURL(photos[row]!.url);
    setPhotos((list) => list.filter((_, i) => i !== row));
    setGrid((g) => (g.length === 1 ? emptyRows(1) : g.filter((_, i) => i !== row)));
    focusCell(Math.max(0, Math.min(row, grid.length - 2)), 0);
  }

  /** Las filas de un CSV o lo pegado entran a la tabla; con encabezado, las columnas opcionales se marcan solas. */
  function load(table: string[][], at: { row: number; col: number }) {
    const head = table[0]?.map((h) => h.trim().toLowerCase()) ?? [];
    const hasHeader = head.includes("nombre") || head.includes("producto");
    if (hasHeader && head.some((h) => h.startsWith("código") || h.startsWith("codigo") || h === "barcode")) setWithBarcode(true);
    if (hasHeader && head.some((h) => h.startsWith("categor"))) setWithCategory(true);
    // Con encabezado, cada columna va a la suya (también las opcionales, que se acaban de marcar); sin él, por posición.
    const all = importColumns({ barcode: true, category: true, branches: options.branches });
    const incoming = cellsToGrid(table, hasHeader ? all : columns, hasHeader ? 0 : at.col);
    setMessage("");
    setGrid((g) => {
      const next = [...g];
      incoming.forEach((cells, i) => (next[at.row + i] = { ...next[at.row + i], ...cells }));
      return next.length > at.row + incoming.length ? next : [...next, {}];
    });
  }

  async function read(file?: File) {
    setMessage("");
    if (!file) return;
    setFileName(file.name);
    if (file.size > 1_000_000) return setMessage("El archivo pesa más de 1 MB. Divídelo en partes.");
    const table = parseCsv(await file.text());
    clearPhotos();
    setGrid([]);
    load(table, { row: 0, col: 0 });
  }

  // Pegar varias celdas (de Excel, Sheets o un CSV): se reparten desde la celda donde se pega, hacia la derecha y abajo.
  function paste(event: ClipboardEvent<HTMLInputElement>, row: number, col: number) {
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\n;]/.test(text.trim())) return;
    event.preventDefault();
    load(parseCsv(text), { row, col });
  }

  // Flechas arriba/abajo y Enter: a la misma columna de la fila de al lado (Enter en la última agrega una).
  function move(event: KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    if (event.key === "ArrowDown" || event.key === "Enter") {
      event.preventDefault();
      if (row === grid.length - 1) setGrid((g) => [...g, {}]);
      focusCell(row + 1, col);
    } else if (event.key === "ArrowUp" && row > 0) {
      event.preventDefault();
      focusCell(row - 1, col);
    }
  }

  async function pickPhoto(row: number, input: HTMLInputElement) {
    const original = input.files?.[0];
    input.value = "";
    if (!original) return;
    const file = await shrinkImage(original, 640);
    const problem = !IMAGE_TYPES.includes(file.type) ? "Elige una foto JPG, PNG o WebP." : file.size > 2 * 1024 * 1024 ? "La foto pesa más de 2 MB. Elige una más liviana." : "";
    if (problem) return setMessage(`Fila ${row + 1}: ${problem}`);
    setMessage("");
    setPhotos((list) => {
      const next = [...list];
      if (next[row]) URL.revokeObjectURL(next[row]!.url);
      next[row] = { file, url: URL.createObjectURL(file) };
      return next;
    });
  }

  /** Sube las fotos de los productos recién creados, de a tres. Devuelve cuántas no se pudieron subir. */
  async function uploadPhotos(created: Record<string, string>) {
    const jobs = grid.flatMap((row, i) => {
      const id = created[(row.name ?? "").trim().toLowerCase()];
      return photos[i] && id ? [{ id, file: photos[i]!.file }] : [];
    });
    let failed = 0;
    let firstError = "";
    for (let i = 0; i < jobs.length; i += 3) {
      await Promise.all(
        jobs.slice(i, i + 3).map(async ({ id, file }) => {
          const form = new FormData();
          form.set("businessId", businessId);
          form.set("id", id);
          form.set("image", file);
          const { error } = await safeAction(() => actions.productImage(form));
          if (error) (failed++, (firstError ||= error.message));
        }),
      );
    }
    return { failed, firstError };
  }

  async function submit() {
    if (busy || !ready) return;
    setBusy(true);
    const { data, error } = await safeAction(() => actions.importProducts({ businessId, rows, branchIds }));
    if (error) {
      setBusy(false);
      return setMessage(error.message);
    }
    const { failed, firstError } = await uploadPhotos(data.created);
    setBusy(false);
    const where = data.stocked && chosen.length ? ` y quedaron listos en ${chosen.length === 1 ? chosen[0].name : `${chosen.length} sucursales`}` : "";
    const skipped = data.skipped.length ? ` ${data.skipped.length} ya estaban en el catálogo y no se repitieron.` : "";
    setOpen(false);
    reset();
    const photoNote = failed ? ` ${failed === 1 ? "1 foto no se subió" : `${failed} fotos no se subieron`} (${firstError}); agrégalas desde el producto.` : "";
    toast(`Se importaron ${data.imported} productos${where}.${skipped}${photoNote}`, failed ? "warning" : "success");
    await refreshRegions();
  }

  const toggleBranch = (id: string, on: boolean) => setBranchIds((list) => (on ? [...list, id] : list.filter((b) => b !== id)));
  const numeric = (key: string) => key !== "name" && key !== "category";

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
          // Al cerrar (Esc, la X) lo escrito queda como borrador; solo se pierden las fotos.
          if (!next) setMessage("");
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

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="font-semibold">Columnas opcionales:</span>
            <label className="inline-flex min-h-11 items-center gap-2 sm:min-h-0">
              <input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={withBarcode} onChange={(e) => setWithBarcode(e.target.checked)} />
              Código de barras
            </label>
            <label className="inline-flex min-h-11 items-center gap-2 sm:min-h-0">
              <input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={withCategory} onChange={(e) => setWithCategory(e.target.checked)} />
              Categoría
            </label>
          </div>

          <div className="grid min-w-0 gap-2">
            <p id="import-grid-hint" className="field-hint m-0">
              Escribe un producto por fila, o pega celdas copiadas de Excel o Google Sheets en la primera casilla: se reparten solas. Solo el nombre es
              obligatorio; sin precio se cobra al vender y sin stock no se controla. Enter o las flechas pasan de fila. La foto es opcional: toca el
              cuadro de la fila.
            </p>
            <div className="max-h-[22rem] overflow-auto rounded-lg border">
              <table ref={tableRef} className="w-full min-w-[36rem] border-collapse text-left text-sm" aria-describedby="import-grid-hint">
                <caption className="sr-only">Productos para importar: una fila por producto</caption>
                <thead className="sticky top-0 z-10 bg-[var(--color-surface-muted)]">
                  <tr>
                    <th scope="col" className="w-10 px-2 py-2 text-center font-semibold text-[var(--color-text-muted)]">
                      <span className="sr-only">Fila</span>#
                    </th>
                    <th scope="col" className="w-12 px-2 py-2 font-semibold">
                      Foto
                    </th>
                    {columns.map((c) => (
                      <th key={c.key} scope="col" className={`px-2 py-2 font-semibold ${numeric(c.key) ? "text-right" : ""}`}>
                        {headerOf(c.label)}
                        {c.key === "name" && (
                          <span aria-hidden="true" className="text-[var(--color-expense)]">
                            {" "}*
                          </span>
                        )}
                      </th>
                    ))}
                    <th scope="col" className="w-10 px-2 py-2">
                      <span className="sr-only">Estado y quitar</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grid.map((row, ri) => {
                    const problem = rowErrors.get(ri);
                    const ok = filled.has(ri) && !problem;
                    return (
                      <tr key={ri} className={`border-t ${problem ? "bg-[var(--color-warning-soft)]" : ""}`}>
                        <th scope="row" className="num px-2 text-center font-normal text-[var(--color-text-muted)]">
                          {ri + 1}
                        </th>
                        <td className="p-1">
                          {/* El label hace de botón: abre la galería o la cámara. */}
                          <label
                            className="grid size-10 cursor-pointer place-items-center overflow-hidden rounded-md border bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-focus)] hover:border-[var(--color-primary)]"
                            title={photos[ri] ? "Cambiar foto" : "Agregar foto"}
                          >
                            <input
                              type="file"
                              accept={IMAGE_TYPES.join(",")}
                              className="sr-only"
                              aria-label={`${photos[ri] ? "Cambiar la foto" : "Agregar una foto"}, fila ${ri + 1}`}
                              onChange={(e) => pickPhoto(ri, e.target)}
                            />
                            {photos[ri] ? <img src={photos[ri]!.url} alt="" className="size-full object-cover" /> : <ImagePlus className="size-5" aria-hidden="true" />}
                          </label>
                        </td>
                        {columns.map((c, ci) => (
                          <td key={c.key} className="p-1">
                            <input
                              data-cell={`${ri}:${ci}`}
                              className={`input h-10 min-w-0 px-2 text-base ${numeric(c.key) ? "num text-right" : ""} ${c.key === "name" ? "min-w-40" : "min-w-24"}`}
                              inputMode={c.key === "price" ? "decimal" : numeric(c.key) ? "numeric" : undefined}
                              aria-label={`${headerOf(c.label)}, fila ${ri + 1}`}
                              aria-invalid={problem ? true : undefined}
                              aria-describedby={problem ? `import-row-${ri}-error` : undefined}
                              placeholder={ri === 0 && examples[ci] ? `Ej.: ${examples[ci]}` : undefined}
                              value={row[c.key] ?? ""}
                              onChange={(e) => setCell(ri, c.key, e.target.value)}
                              onPaste={(e) => paste(e, ri, ci)}
                              onKeyDown={(e) => move(e, ri, ci)}
                            />
                          </td>
                        ))}
                        <td className="px-1">
                          <div className="flex items-center justify-end gap-1">
                            {ok && <CircleCheck className="size-4 text-[var(--color-income)]" aria-label={`Fila ${ri + 1} lista`} />}
                            {problem && <TriangleAlert className="size-4 text-[var(--color-warning)]" aria-hidden="true" />}
                            <button
                              type="button"
                              className="icon-btn size-9"
                              aria-label={`Quitar la fila ${ri + 1}`}
                              onClick={() => removeRow(ri)}
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {grid.map((_, ri) =>
              rowErrors.has(ri) ? (
                <p key={ri} id={`import-row-${ri}-error`} className="sr-only">
                  {rowErrors.get(ri)}
                </p>
              ) : null,
            )}
            <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Button variant="outline" type="button" className="h-11" onClick={addRow}>
                <Plus />
                Agregar fila
              </Button>
              <div className="sm:ml-auto sm:min-w-64">
                <FilePicker
                  id="import-file"
                  accept=".csv,text/csv"
                  icon={<FileUp />}
                  label="Subir un CSV"
                  hint="Se carga en la tabla para revisarlo."
                  fileName={fileName}
                  onChange={(e) => read(e.target.files?.[0])}
                />
              </div>
              <Button variant="ghost" type="button" className="max-sm:h-11 max-sm:border max-sm:bg-[var(--color-surface)]" onClick={() => downloadTemplate(options)}>
                <Download />
                Plantilla CSV
              </Button>
            </div>
          </div>

          <div aria-live="polite" className="grid min-w-0 gap-3 text-sm">
            <p className="m-0">
              {rows.length ? (
                <>
                  <strong>{rows.length}</strong> {rows.length === 1 ? "producto listo" : "productos listos"} para importar.
                </>
              ) : (
                "Todavía no hay productos listos."
              )}
            </p>
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
            <Button variant="outline" onClick={cancel}>
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
