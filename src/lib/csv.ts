// CSV para importar productos. Acepta «,», «;» (Excel en español guarda con «;») o tabulador (lo que llega al
// pegar filas copiadas de Excel o Google Sheets), comillas y BOM.

/** Filas de celdas. El separador es el que más aparece en la primera línea. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const times = (c: string) => firstLine.split(c).length - 1;
  const sep = ["\t", ";", ","].reduce((best, c) => (times(c) > times(best) ? c : best), ",");
  // «;» y tabulador valen los dos a la vez: se pega una planilla (tabuladores) y se corrige a mano escribiendo «;»,
  // porque en un cuadro de texto la tecla Tab mueve el foco. La coma solo separa en un CSV que la usa en toda la línea
  // del encabezado, así «7,50» sigue siendo un precio.
  const isSep = (c: string) => (sep === "," ? c === "," : c === "\t" || c === ";");
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
    else if (isSep(c)) row.push(cell), (cell = "");
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
  /** Precio en la sucursal; sin él, el precio se escribe al vender. */
  price?: number;
  /** Stock inicial, el mismo en cada sucursal; sin él, la sucursal no controla el stock de ese producto. */
  stock?: number;
  /** Stock inicial de cada sucursal (id → cantidad), cuando la planilla trae una columna por sucursal. */
  stockByBranch?: Record<string, number>;
  minStock?: number;
}

export interface ImportOptions {
  /** Sin encabezado, ¿la planilla trae la columna del código de barras? (por omisión, sí) */
  barcode?: boolean;
  /** Sin encabezado, ¿trae la de la categoría? (por omisión, sí) */
  category?: boolean;
  /** Con dos o más, una columna de stock por sucursal («stock Centro», «stock Sur») en lugar de una sola. */
  branches?: { id: string; name: string }[];
}

type Column = { key: string; label: string };

/** Columnas en el orden en que se leen sin encabezado; también son los encabezados de la plantilla. */
export function importColumns({ barcode = true, category = true, branches = [] }: ImportOptions = {}): Column[] {
  const perBranch = branches.length > 1;
  return [
    { key: "name", label: "nombre" },
    ...(barcode ? [{ key: "barcode", label: "código de barras" }] : []),
    ...(category ? [{ key: "category", label: "categoría" }] : []),
    { key: "price", label: "precio" },
    ...(perBranch ? branches.map((b) => ({ key: `stock:${b.id}`, label: `stock ${b.name}` })) : [{ key: "stock", label: "stock" }]),
    { key: "minStock", label: "mínimo" },
  ];
}

/**
 * Monto escrito a mano: «12,50», «1.240,50», «12.5», «Bs 12,50». Con punto y coma, el último es el decimal;
 * un punto seguido de grupos de tres cifras es de miles («1.240» = 1240), como se escribe en Bolivia.
 * Devuelve NaN si no es un monto.
 */
export function parseMoney(text: string): number {
  let s = text.replace(/bs\.?/i, "").replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    s = s.replaceAll(decimal === "," ? "." : ",", "").replace(decimal, ".");
  } else if (lastComma >= 0) {
    s = s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replaceAll(".", "");
  }
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Encabezados que se aceptan para cada columna, ya sin tildes ni mayúsculas. */
const ALIASES: Record<string, string[]> = {
  name: ["nombre", "producto"],
  barcode: ["codigo de barras", "codigo", "barcode"],
  category: ["categoria"],
  price: ["precio", "precio de venta"],
  stock: ["stock", "cantidad"],
  minStock: ["minimo", "stock minimo"],
};

/**
 * Productos de una planilla. Con encabezado («nombre» es obligatorio), las columnas se buscan por nombre y en
 * cualquier orden; sin él, se toman en el orden de `importColumns(options)`.
 */
export function productsFromCsv(text: string, options: ImportOptions = {}): { rows: ProductRow[]; errors: string[] } {
  const table = parseCsv(text);
  const head = (table[0] ?? []).map(plain);
  const hasHeader = head.some((h) => ALIASES.name.includes(h));
  const branches = options.branches && options.branches.length > 1 ? options.branches : [];
  // «stock Sucursal Centro» o «stock Centro»: el nombre de la sucursal con o sin «Sucursal».
  const branchHeaders = (name: string) => [`stock ${plain(name)}`, `stock ${plain(name).replace(/^sucursal /, "")}`];
  const at = new Map<string, number>(
    hasHeader
      ? [
          ...Object.entries(ALIASES).map(([key, names]) => [key, head.findIndex((h) => names.includes(h))] as [string, number]),
          ...branches.map((b) => [`stock:${b.id}`, head.findIndex((h) => branchHeaders(b.name).includes(h))] as [string, number]),
        ]
      : importColumns(options).map((c, i) => [c.key, i]),
  );
  const rows: ProductRow[] = [];
  const errors: string[] = [];
  const whole = (text: string) => (/^\d{1,6}$/.test(text) ? Number(text) : NaN);
  table.slice(hasHeader ? 1 : 0).forEach((cells, i) => {
    const line = i + (hasHeader ? 2 : 1);
    const get = (key: string) => {
      const index = at.get(key) ?? -1;
      return index >= 0 ? (cells[index] ?? "").trim() : "";
    };
    const fail = (problem: string) => errors.push(`Fila ${line}: ${problem}.`);
    const name = get("name");
    const barcode = get("barcode").replace(/\s/g, "");
    if (!name) return fail("falta el nombre");
    if (name.length > 80) return fail("el nombre pasa de 80 caracteres");
    if (barcode && !/^\d{6,14}$/.test(barcode)) return fail(`«${barcode}» no es un código de barras (solo números, de 6 a 14)`);
    const priceText = get("price");
    const price = priceText ? parseMoney(priceText) : undefined;
    if (price !== undefined && !(price <= 9_999_999)) return fail(`«${priceText}» no es un precio`);
    const stockText = get("stock");
    const stock = stockText ? whole(stockText) : undefined;
    if (Number.isNaN(stock)) return fail(`el stock «${stockText}» tiene que ser un número entero de 0 o más`);
    const stockByBranch: Record<string, number> = {};
    for (const b of branches) {
      const text = get(`stock:${b.id}`);
      if (!text) continue;
      if (Number.isNaN(whole(text))) return fail(`el stock de ${b.name} («${text}») tiene que ser un número entero de 0 o más`);
      stockByBranch[b.id] = whole(text);
    }
    const minText = get("minStock");
    const minStock = minText ? whole(minText) : undefined;
    if (Number.isNaN(minStock)) return fail(`el mínimo «${minText}» tiene que ser un número entero de 0 o más`);
    if (minStock !== undefined && stock === undefined && !Object.keys(stockByBranch).length) return fail("pusiste un mínimo pero no el stock");
    rows.push({
      name,
      barcode: barcode || undefined,
      category: get("category").slice(0, 40) || undefined,
      price,
      stock,
      stockByBranch: Object.keys(stockByBranch).length ? stockByBranch : undefined,
      minStock,
    });
  });
  return { rows, errors };
}
