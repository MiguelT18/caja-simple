import { describe, expect, it } from "vitest";
import { cellsToGrid, gridToCsv, importColumns, parseCsv, productsFromCsv, type GridRow } from "./csv";

const columns = importColumns({ barcode: false, category: true });

describe("tabla de importar", () => {
  it("salta filas vacías y lleva cada error a su fila de la tabla", () => {
    const grid: GridRow[] = [{ name: "Leche", price: "7,50" }, {}, { price: "3" }, { name: "Pan; francés", stock: "x" }];
    const { text, lines } = gridToCsv(columns, grid);
    expect(lines).toEqual([0, 2, 3]);
    const { rows, errors } = productsFromCsv(text);
    expect(rows).toEqual([{ name: "Leche", price: 7.5, barcode: undefined, category: undefined, stock: undefined, stockByBranch: undefined, minStock: undefined }]);
    // Fila 3 de la planilla = lines[1] = fila 2 de la tabla (índice 2); fila 4 = índice 3.
    expect(errors).toEqual(["Fila 3: falta el nombre.", "Fila 4: el stock «x» tiene que ser un número entero de 0 o más."]);
  });

  it("lee lo pegado por posición desde una columna, o por encabezado", () => {
    expect(cellsToGrid(parseCsv("7,50\t10\n3\t"), columns, 2)).toEqual([{ price: "7,50", stock: "10" }, { price: "3", stock: "" }]);
    expect(cellsToGrid(parseCsv("precio;producto\n5;Té"), columns)).toEqual([{ price: "5", name: "Té" }]);
  });
});
