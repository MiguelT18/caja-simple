import { describe, expect, it } from "vitest";
import { byPeriod, cashStatus, cents, shiftCash, sum, totalsBy } from "./cash";
import type { Row } from "./mappers";
import type { Expense, Sale } from "./types";

const close = (c: Partial<Row<"shift_closes">>) => ({ id: "c", branch_id: "b", shift_id: "s1", business_date: "2026-11-03", status: "en-curso", opening: 100, counted: null, ...c }) as Row<"shift_closes">;
const sale = (s: Partial<Sale>) => ({ id: "v", branchId: "b", date: "2026-11-03", time: "10:00", shiftId: "s1", total: 0, items: 1, payment: "efectivo", ...s }) as Sale;
const expense = (g: Partial<Expense>) => ({ id: "g", branchId: "b", date: "2026-11-03", time: "10:00", shiftId: "s1", amount: 0, concept: "", category: "", ...g }) as Expense;

describe("cuentas", () => {
  it("cents corrige el error de coma flotante", () => {
    expect(cents(0.1 + 0.2)).toBe(0.3);
    expect(sum([])).toBe(0);
  });
  it("totalsBy suma por clave, de mayor a menor", () => {
    expect(totalsBy([["a", 1], ["b", 5], ["a", 2]])).toEqual([{ name: "b", value: 5 }, { name: "a", value: 3 }]);
  });
});

describe("shiftCash", () => {
  const moves = {
    sales: [sale({ total: 50.1 }), sale({ total: 0.2 }), sale({ total: 30, payment: "qr" }), sale({ total: 99, shiftId: "s2" }), sale({ total: 7, date: "2026-11-02" })],
    expenses: [expense({ amount: 20 })],
  };
  it("esperado = apertura + ventas en efectivo − gastos del día del turno", () => {
    const cash = shiftCash([close({})], moves, "s1", "2026-11-03");
    expect(cash).toMatchObject({ opening: 100, expenses: 20, expected: 130.3 });
    expect(cents(cash.sales)).toBe(80.3); // el QR cuenta en lo vendido, no en la caja
  });
  it("un turno abierto ayer usa los movimientos de ayer", () => {
    const cash = shiftCash([close({ business_date: "2026-11-02" })], moves, "s1", "2026-11-03");
    expect(cash).toMatchObject({ date: "2026-11-02", sales: 7, expected: 107 });
  });
  it("sin cierre, todo en 0", () => {
    expect(shiftCash([], moves, "s3", "2026-11-03").expected).toBe(0);
  });
});

describe("cashStatus", () => {
  it("sin cierres, sin abrir", () => expect(cashStatus([], () => 0)).toBe("sin-abrir"));
  it("abierto, en curso", () => expect(cashStatus([close({})], () => 0)).toBe("en-curso"));
  it("cerrado igual al esperado, cuadra", () => expect(cashStatus([close({ status: "cerrado", counted: 130.3 })], () => 130.3)).toBe("cuadra"));
  it("cerrado distinto, descuadre", () => expect(cashStatus([close({ status: "cerrado", counted: 130 })], () => 130.3)).toBe("descuadre"));
});

describe("byPeriod", () => {
  it("agrupa por semana, suma al centavo y no cuenta las anuladas", () => {
    const sales = [sale({ date: "2026-11-02", total: 0.1, voided: null }), sale({ date: "2026-11-08", total: 0.2, voided: null }), sale({ date: "2026-11-09", total: 0, voided: 5 })];
    const expenses = [expense({ date: "2026-11-04", amount: 3 })];
    expect(byPeriod(sales, expenses, "semana")).toEqual([
      { date: "2026-11-02", sales: 0.3, expenses: 3, count: 2 },
      { date: "2026-11-09", sales: 0, expenses: 0, count: 0 },
    ]);
  });
});
