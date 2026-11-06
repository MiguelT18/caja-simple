import { describe, expect, it } from "vitest";
import { differenceLabel, formatBs, initials, overnight, plural, toCsv } from "./format";

describe("format", () => {
  it("formatBs usa coma decimal, punto de miles y signo", () => {
    expect(formatBs(1240)).toBe("Bs 1.240,00");
    expect(formatBs(-5.5)).toBe("−Bs 5,50");
    expect(formatBs(3, "+")).toBe("+Bs 3,00");
  });
  it("differenceLabel dice si sobra o falta", () => {
    expect(differenceLabel(5)).toBe("Sobran Bs 5,00");
    expect(differenceLabel(-2)).toBe("Faltan Bs 2,00");
  });
  it("plural, initials y overnight", () => {
    expect(plural(1, "venta", "ventas")).toBe("1 venta");
    expect(plural(0, "venta", "ventas")).toBe("0 ventas");
    expect(initials("ana", "")).toBe("A");
    expect(overnight({ start: "22:00", end: "06:00" })).toBe(true);
    expect(overnight({ start: "07:00", end: "14:00" })).toBe(false);
  });
});

describe("toCsv", () => {
  it("usa ; y coma decimal, y escapa comillas, ; y saltos de línea", () => {
    expect(toCsv([["Detalle", "Monto"], ['Pan "grande"; 2', 12.5], ["a\nb", 3]])).toBe('﻿Detalle;Monto\r\n"Pan ""grande""; 2";12,50\r\n"a\nb";3,00\r\n');
  });
});

describe("toCsv y fórmulas", () => {
  it("no deja que un texto se lea como fórmula, pero sí los montos negativos", () => {
    expect(toCsv([["=HYPERLINK(1)", -2]])).toBe("﻿'=HYPERLINK(1);-2,00\r\n");
  });
});
