import { describe, expect, it } from "vitest";
import { addDays, boliviaNow, inShiftWindow, inRange, lastWeek, openFrom, parseRange, periodStart, shiftProgress } from "./dates";

const at = (minutes: number) => ({ date: "2026-11-03", minutes });
const params = (q: string) => new URLSearchParams(q);

describe("addDays y lastWeek", () => {
  it("cruza meses y años", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("da los 7 días que terminan en el día pedido", () => {
    expect(lastWeek("2026-11-03")).toEqual(["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
  });
});

describe("boliviaNow", () => {
  it("usa UTC−4 aunque en UTC ya sea el día siguiente", () => {
    expect(boliviaNow(new Date("2026-11-04T02:30:00Z"))).toEqual({ date: "2026-11-03", minutes: 22 * 60 + 30 });
  });
});

describe("inShiftWindow", () => {
  const day = { start: "07:00", end: "14:00" };
  const night = { start: "22:00", end: "06:00" };
  it("abre 15 minutos antes y cierra a la hora de fin", () => {
    expect(inShiftWindow(day, at(6 * 60 + 44))).toBe(false);
    expect(inShiftWindow(day, at(6 * 60 + 45))).toBe(true);
    expect(inShiftWindow(day, at(13 * 60 + 59))).toBe(true);
    expect(inShiftWindow(day, at(14 * 60))).toBe(false);
  });
  it("cruza la medianoche", () => {
    expect(inShiftWindow(night, at(23 * 60))).toBe(true);
    expect(inShiftWindow(night, at(3 * 60))).toBe(true);
    expect(inShiftWindow(night, at(12 * 60))).toBe(false);
  });
  it("openFrom da la vuelta a la medianoche", () => {
    expect(openFrom({ start: "00:10" })).toBe("23:55");
  });
});

describe("shiftProgress", () => {
  it("sigue contando un turno nocturno abierto ayer", () => {
    const p = shiftProgress({ start: "22:00", end: "06:00" }, "2026-11-02", at(60));
    expect(p).toEqual({ elapsed: 180, total: 480, late: false });
  });
});

describe("parseRange", () => {
  const end = "2026-11-03";
  it("sin parámetros, los últimos 7 días", () => {
    expect(parseRange(params(""), end)).toEqual({ from: "2026-10-28", to: end, days: 7 });
  });
  it("ignora fechas inválidas", () => {
    expect(parseRange(params("desde=2026-02-30&hasta=hola"), end)).toEqual({ from: "2026-10-28", to: end, days: 7 });
  });
  it("da vuelta un rango al revés", () => {
    expect(parseRange(params("desde=2026-11-03&hasta=2026-11-01"), end)).toEqual({ from: "2026-11-01", to: "2026-11-03", days: 3 });
  });
  it("recorta al máximo de días desde «hasta»", () => {
    expect(parseRange(params("desde=2025-01-01&hasta=2026-11-03"), end, 92)).toEqual({ from: addDays(end, -91), to: end, days: 92 });
  });
});

describe("periodStart", () => {
  it("da el día, el lunes de la semana o el 1 del mes", () => {
    expect(periodStart("2026-11-04", "dia")).toBe("2026-11-04");
    expect(periodStart("2026-11-04", "semana")).toBe("2026-11-02"); // miércoles → lunes
    expect(periodStart("2026-11-08", "semana")).toBe("2026-11-02"); // domingo → lunes anterior
    expect(periodStart("2026-11-02", "semana")).toBe("2026-11-02");
    expect(periodStart("2026-11-04", "mes")).toBe("2026-11-01");
  });
});

describe("rango con hora", () => {
  it("lee las horas válidas y completa la que falta", () => {
    const r = parseRange(params("desde=2026-11-01&hasta=2026-11-03&desdeHora=08:30"), "2026-11-03");
    expect([r.fromTime, r.toTime]).toEqual(["08:30", "23:59"]);
    expect(parseRange(params("desdeHora=25:00&hastaHora=18:00"), "2026-11-03").fromTime).toBe("00:00");
    expect(parseRange(params(""), "2026-11-03").fromTime).toBeUndefined();
  });

  it("incluye los extremos y deja fuera lo de antes o después", () => {
    const r = { from: "2026-11-01", to: "2026-11-03", fromTime: "08:00", toTime: "18:00" };
    expect(inRange(r, "2026-11-01", "08:00")).toBe(true);
    expect(inRange(r, "2026-11-01", "07:59")).toBe(false);
    expect(inRange(r, "2026-11-02", "23:00")).toBe(true);
    expect(inRange(r, "2026-11-03", "18:01")).toBe(false);
    expect(inRange({ from: "2026-11-01", to: "2026-11-03" }, "2026-11-03", "23:59")).toBe(true);
  });
});
