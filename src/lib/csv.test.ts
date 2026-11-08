import { describe, expect, it } from "vitest";
import { importColumns, parseCsv, parseMoney, productsFromCsv } from "./csv";

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
  it("separa por tabulador al pegar desde una planilla", () => {
    expect(parseCsv("nombre\tprecio\nLeche 1 L\t7,50")).toEqual([
      ["nombre", "precio"],
      ["Leche 1 L", "7,50"],
    ]);
  });
  it("acepta «;» escrito a mano en filas pegadas con tabulador", () => {
    expect(parseCsv("nombre\tprecio\nLeche 1 L\t7,50\nPan; 0,50")).toEqual([
      ["nombre", "precio"],
      ["Leche 1 L", "7,50"],
      ["Pan", " 0,50"],
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
    expect(errors).toEqual(["Fila 2: falta el nombre.", "Fila 3: «12ab» no es un código de barras (solo números, de 6 a 14)."]);
  });
});

describe("parseMoney", () => {
  it("lee montos como se escriben en Bolivia y en Excel", () => {
    expect(parseMoney("12,50")).toBe(12.5);
    expect(parseMoney("1.240,50")).toBe(1240.5);
    expect(parseMoney("1,240.50")).toBe(1240.5);
    expect(parseMoney("1.240")).toBe(1240);
    expect(parseMoney("12.5")).toBe(12.5);
    expect(parseMoney("Bs 12,50")).toBe(12.5);
    expect(parseMoney("7")).toBe(7);
  });
  it("rechaza lo que no es un monto", () => {
    expect(parseMoney("doce")).toBeNaN();
    expect(parseMoney("-5")).toBeNaN();
    expect(parseMoney("1,2,3")).toBeNaN();
  });
});

describe("productsFromCsv con precio y stock", () => {
  it("lee precio, stock y mínimo", () => {
    const { rows, errors } = productsFromCsv("nombre\tprecio\tstock\tstock mínimo\nLeche 1 L\tBs 7,50\t24\t6\nPan\t0,50\t\t");
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { name: "Leche 1 L", price: 7.5, stock: 24, minStock: 6 },
      { name: "Pan", price: 0.5 },
    ]);
  });
  it("reporta precio, stock y mínimo inválidos", () => {
    const { errors } = productsFromCsv("nombre;precio;stock;minimo\nA;doce;;\nB;1;2,5;\nC;1;;3");
    expect(errors).toEqual([
      "Fila 2: «doce» no es un precio.",
      "Fila 3: el stock «2,5» tiene que ser un número entero de 0 o más.",
      "Fila 4: pusiste un mínimo pero no el stock.",
    ]);
  });
});

describe("productsFromCsv sin encabezado y por sucursal", () => {
  const branches = [
    { id: "b1", name: "Sucursal Centro" },
    { id: "b2", name: "Sucursal Sur" },
  ];
  it("sin código ni categoría, lee nombre, precio y stock (como en la ayuda del cuadro)", () => {
    const { rows, errors } = productsFromCsv("Leche 1 L; 7,50; 24\nPan de batalla; 0,50", { barcode: false, category: false });
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { name: "Leche 1 L", price: 7.5, stock: 24 },
      { name: "Pan de batalla", price: 0.5 },
    ]);
  });
  it("con varias sucursales, una columna de stock por sucursal", () => {
    expect(importColumns({ barcode: false, category: false, branches }).map((c) => c.label)).toEqual([
      "nombre",
      "precio",
      "stock Sucursal Centro",
      "stock Sucursal Sur",
      "mínimo",
    ]);
    const { rows } = productsFromCsv("Leche 1 L; 7,50; 24; 10; 4", { barcode: false, category: false, branches });
    expect(rows).toEqual([{ name: "Leche 1 L", price: 7.5, stockByBranch: { b1: 24, b2: 10 }, minStock: 4 }]);
  });
  it("con encabezado, reconoce «stock Centro» sin la palabra Sucursal", () => {
    const { rows, errors } = productsFromCsv("nombre;precio;stock Centro;stock sur\nLeche;7;24;", { branches });
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ name: "Leche", price: 7, stockByBranch: { b1: 24 } }]);
  });
});
