import { describe, expect, it } from "vitest";
import { dueState, nextOccurrence, occurrence, payableOrder } from "./payables";

describe("gastos fijos", () => {
  it("cuenta los meses desde el primero, como la base", () => {
    expect([0, 1, 2, 5].map((n) => occurrence("2026-08-31", "mensual", n))).toEqual(["2026-08-31", "2026-09-30", "2026-10-31", "2027-01-31"]);
    expect(occurrence("2026-01-31", "mensual", 1)).toBe("2026-02-28");
    expect(occurrence("2026-10-20", "quincenal", 2)).toBe("2026-11-17");
    expect(occurrence("2026-11-02", "semanal", 1)).toBe("2026-11-09");
    expect(occurrence("2026-11-30", "diario", 2)).toBe("2026-12-02");
  });

  it("da el próximo pago después de hoy", () => {
    expect(nextOccurrence("2026-08-31", "mensual", "2026-11-21")).toBe("2026-11-30");
    expect(nextOccurrence("2026-08-31", "mensual", "2026-10-31")).toBe("2026-11-30");
    expect(nextOccurrence("2026-10-20", "quincenal", "2026-11-17")).toBe("2026-12-01");
    expect(nextOccurrence("2026-12-05", "semanal", "2026-11-21")).toBe("2026-12-05");
    expect(nextOccurrence("2026-11-01", "diario", "2026-11-21")).toBe("2026-11-22");
  });
});

describe("pendientes", () => {
  it("dice el vencimiento en texto", () => {
    expect(dueState(null, "2026-11-21")).toEqual({ tone: "none", label: "Sin vencimiento" });
    expect(dueState("2026-11-18", "2026-11-21")).toEqual({ tone: "late", label: "Venció hace 3 días" });
    expect(dueState("2026-11-20", "2026-11-21").label).toBe("Venció ayer");
    expect(dueState("2026-11-21", "2026-11-21")).toEqual({ tone: "soon", label: "Vence hoy" });
    expect(dueState("2026-12-15", "2026-11-21").tone).toBe("later");
  });

  it("ordena lo vencido primero y lo sin fecha al final", () => {
    const list = [
      { id: "sin fecha", dueOn: null, owedOn: "2026-11-01" },
      { id: "después", dueOn: "2026-12-01", owedOn: "2026-11-20" },
      { id: "vencido", dueOn: "2026-11-05", owedOn: "2026-11-01" },
    ];
    expect(list.sort(payableOrder).map((p) => p.id)).toEqual(["vencido", "después", "sin fecha"]);
  });
});
