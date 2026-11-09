// Los mismos casos que se prueban contra private.promo_discount.
import { describe, expect, it } from "vitest";
import { appliesOn, bestDiscount, lineDiscount, promoBadge, promoStatus, whenLabel, type Promo } from "./promos";

const base: Promo = { kind: "percent", percent: null, price: null, buy: null, pay: null, branchIds: null, weekdays: null, startsOn: null, endsOn: null, active: true };
const pct = (percent: number, extra: Partial<Promo> = {}): Promo => ({ ...base, kind: "percent", percent, ...extra });
const special = (price: number): Promo => ({ ...base, kind: "price", price });
const bundle = (buy: number, pay: number): Promo => ({ ...base, kind: "bundle", buy, pay });

describe("lineDiscount", () => {
  it("porcentaje, con centavos redondeados", () => {
    expect(lineDiscount(pct(20), 2, 10)).toBe(4);
    expect(lineDiscount(pct(15), 1, 10.55)).toBe(1.58);
  });
  it("precio especial: la diferencia por unidad; nunca negativo", () => {
    expect(lineDiscount(special(8), 3, 10)).toBe(6);
    expect(lineDiscount(special(12), 3, 10)).toBe(0);
  });
  it("lleva 3, paga 2: solo los grupos completos", () => {
    expect(lineDiscount(bundle(3, 2), 7, 10)).toBe(20);
    expect(lineDiscount(bundle(3, 2), 2, 10)).toBe(0);
    expect(lineDiscount(bundle(2, 1), 4, 7.5)).toBe(15);
  });
});

describe("bestDiscount", () => {
  it("gana la que más descuenta", () => {
    const best = bestDiscount([pct(10), special(8), bundle(3, 2)], 3, 10);
    expect(best?.discount).toBe(10);
    expect(best?.promo.kind).toBe("bundle");
  });
  it("sin descuento, null", () => {
    expect(bestDiscount([bundle(3, 2)], 1, 10)).toBeNull();
  });
});

describe("appliesOn", () => {
  // 2026-11-13 es viernes; 2026-11-12, jueves.
  it("días de la semana", () => {
    const fridays = pct(20, { weekdays: [5] });
    expect(appliesOn(fridays, "2026-11-13", "b1")).toBe(true);
    expect(appliesOn(fridays, "2026-11-12", "b1")).toBe(false);
    expect(appliesOn(pct(20, { weekdays: [7] }), "2026-11-15", "b1")).toBe(true);
  });
  it("sucursales, fechas y pausa", () => {
    expect(appliesOn(pct(20, { branchIds: ["b1"] }), "2026-11-13", "b2")).toBe(false);
    expect(appliesOn(pct(20, { endsOn: "2026-11-12" }), "2026-11-13", "b1")).toBe(false);
    expect(appliesOn(pct(20, { startsOn: "2026-11-14" }), "2026-11-13", "b1")).toBe(false);
    expect(appliesOn(pct(20, { endsOn: "2026-11-13" }), "2026-11-13", "b1")).toBe(true);
    expect(appliesOn(pct(20, { active: false }), "2026-11-13", "b1")).toBe(false);
  });
});

describe("textos", () => {
  it("insignia, cuándo y estado", () => {
    expect(promoBadge(bundle(3, 2))).toBe("3x2");
    expect(promoBadge(pct(20))).toBe("−20%");
    expect(whenLabel(pct(20, { weekdays: [5] }))).toBe("Los viernes · sin fecha límite");
    expect(whenLabel(pct(20, { endsOn: "2026-11-30" }))).toBe("Todos los días · hasta el 30 de noviembre de 2026");
    expect(promoStatus(pct(20, { weekdays: [5] }), "2026-11-12")).toBe("otro-dia");
    expect(promoStatus(pct(20, { endsOn: "2026-11-01" }), "2026-11-12")).toBe("vencida");
  });
});
