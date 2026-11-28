import { describe, expect, it } from "vitest";
import { hoursLabel } from "./format";

describe("hoursLabel", () => {
  it("horas y minutos", () => {
    expect(hoursLabel(85)).toBe("1 h 25 min");
    expect(hoursLabel(45)).toBe("45 min");
    expect(hoursLabel(120)).toBe("2 h");
    expect(hoursLabel(0)).toBe("0 min");
  });
});
