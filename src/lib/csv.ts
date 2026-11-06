// CSV para importar productos. Acepta «,» o «;» (Excel en español guarda con «;»), comillas y BOM.

/** Filas de celdas. El separador se deduce de la primera línea. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === sep) row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += c;
  }
  if (cell !== "" || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase().replace(/[\s_]+/g, " ");

export interface ProductRow {
  name: string;
  barcode?: string;
  category?: string;
}

/**
 * Productos de un CSV con encabezado: «nombre» (obligatorio), «código de barras» y «categoría».
 * Sin encabezado reconocible, las columnas se toman en ese orden.
 */
export function productsFromCsv(text: string): { rows: ProductRow[]; errors: string[] } {
  const table = parseCsv(text);
  const head = (table[0] ?? []).map(plain);
  const find = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const hasHeader = find("nombre", "producto") >= 0;
  const col = hasHeader
    ? { name: find("nombre", "producto"), barcode: find("codigo de barras", "codigo", "barcode"), category: find("categoria") }
    : { name: 0, barcode: 1, category: 2 };
  const rows: ProductRow[] = [];
  const errors: string[] = [];
  table.slice(hasHeader ? 1 : 0).forEach((cells, i) => {
    const line = i + (hasHeader ? 2 : 1);
    const get = (at: number) => (at >= 0 ? (cells[at] ?? "").trim() : "");
    const name = get(col.name);
    const barcode = get(col.barcode).replace(/\s/g, "");
    if (!name) return errors.push(`Fila ${line}: falta el nombre.`);
    if (name.length > 80) return errors.push(`Fila ${line}: el nombre pasa de 80 caracteres.`);
    if (barcode && !/^\d{6,14}$/.test(barcode)) return errors.push(`Fila ${line}: el código de barras solo lleva números (6 a 14).`);
    rows.push({ name, barcode: barcode || undefined, category: get(col.category).slice(0, 40) || undefined });
  });
  return { rows, errors };
}
