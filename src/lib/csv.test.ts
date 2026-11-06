import { describe, expect, it } from "vitest";
import { parseCsv, productsFromCsv } from "./csv";

describe("parseCsv", () => {
  it("separa por coma o punto y coma, con comillas, BOM y CRLF", () => {
    expect(parseCsv('﻿a;b\r\n"x;y";"di ""hola"""\r\n')).toEqual([
      ["a", "b"],
      ["x;y", 'di "hola"'],
    ]);
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
  it("salta las filas vacías", () => {
    expect(parseCsv("a\n\n,\nb\n")).toEqual([["a"], ["b"]]);
  });
});

describe("productsFromCsv", () => {
  it("lee el encabezado sin importar tildes ni orden", () => {
    const { rows, errors } = productsFromCsv("Categoría;Nombre;Código de barras\nLácteos;Leche 1 L;7790001234567\n;Pan;");
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { name: "Leche 1 L", barcode: "7790001234567", category: "Lácteos" },
      { name: "Pan", barcode: undefined, category: undefined },
    ]);
  });
  it("sin encabezado usa nombre, código, categoría", () => {
    expect(productsFromCsv("Arroz,123456,Granos").rows).toEqual([{ name: "Arroz", barcode: "123456", category: "Granos" }]);
  });
  it("reporta las filas inválidas con su número", () => {
    const { rows, errors } = productsFromCsv("nombre,codigo\n,123456\nAzúcar,12ab");
    expect(rows).toEqual([]);
    expect(errors).toEqual(["Fila 2: falta el nombre.", "Fila 3: el código de barras solo lleva números (6 a 14)."]);
  });
});
