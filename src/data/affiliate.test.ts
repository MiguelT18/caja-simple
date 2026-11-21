import { describe, expect, it } from "vitest";
import { commissionsByPeriod, type Commission } from "./affiliate";

const c = (date: string, chargeBs: number, amountBs: number) => ({ date, chargeBs, amountBs }) as Commission;

describe("commissionsByPeriod", () => {
  it("rellena los días vacíos y suma cada día", () => {
    const rows = commissionsByPeriod([c("2026-11-02", 64, 19), c("2026-11-02", 51, 15)], "2026-11-01", "2026-11-03", "dia");
    expect(rows).toEqual([
      { date: "2026-11-01", sales: 0, expenses: 0 },
      { date: "2026-11-02", sales: 115, expenses: 34 },
      { date: "2026-11-03", sales: 0, expenses: 0 },
    ]);
  });

  it("agrupa por mes, cruzando el año", () => {
    const rows = commissionsByPeriod([c("2026-12-31", 64, 19), c("2027-01-15", 644, 193)], "2026-11-20", "2027-01-20", "mes");
    expect(rows.map((r) => [r.date, r.expenses])).toEqual([["2026-11-01", 0], ["2026-12-01", 19], ["2027-01-01", 193]]);
  });

  it("agrupa por semana desde el lunes", () => {
    const rows = commissionsByPeriod([c("2026-11-12", 64, 19)], "2026-11-10", "2026-11-20", "semana");
    expect(rows.map((r) => r.date)).toEqual(["2026-11-09", "2026-11-16"]);
    expect(rows[0].expenses).toBe(19);
  });
});
