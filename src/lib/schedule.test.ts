import { describe, expect, it } from "vitest";
import { closedReason, isoDow, shiftDate, type Closure, type ScheduleShift } from "./schedule";

const morning: ScheduleShift = { id: "m", name: "Mañana", start: "08:00", end: "13:00", weekdays: null };
const afternoon: ScheduleShift = { id: "t", name: "Tarde", start: "14:00", end: "20:00", weekdays: [1, 2, 3, 4, 5] };
const closure = (c: Partial<Closure>): Closure => ({ id: "c", day: "2026-11-11", start: null, end: null, shiftIds: null, note: null, ...c });
// 2026-11-11 es miércoles; 2026-11-14, sábado; 2026-11-15, domingo.

describe("isoDow", () => {
  it("lunes = 1, domingo = 7", () => {
    expect(isoDow("2026-11-09")).toBe(1);
    expect(isoDow("2026-11-15")).toBe(7);
  });
});

describe("closedReason", () => {
  it("sin horario, cierres ni días: trabaja", () => {
    expect(closedReason(morning, "2026-11-15", [], [])).toBeNull();
  });
  it("días del turno", () => {
    expect(closedReason(afternoon, "2026-11-11", [], [])).toBeNull();
    expect(closedReason(afternoon, "2026-11-14", [], [])).toBe("El turno tarde no trabaja los sábados");
  });
  it("horario semanal: compara la hora de inicio", () => {
    const hours = [{ dow: 6, open: "08:00", close: "13:00" }, { dow: 7, open: null, close: null }];
    expect(closedReason(morning, "2026-11-14", hours, [])).toBeNull();
    expect(closedReason({ ...afternoon, weekdays: null }, "2026-11-14", hours, [])).toBe("Los sábados la sucursal abre de 08:00 a 13:00");
    expect(closedReason(morning, "2026-11-15", hours, [])).toBe("La sucursal no abre los domingos");
  });
  it("cierre de todo el día, con motivo", () => {
    expect(closedReason(morning, "2026-11-11", [], [closure({ note: " Feriado " })])).toBe("Cerrado: Feriado");
    expect(closedReason(morning, "2026-11-12", [], [closure({})])).toBeNull();
  });
  it("cierre de tal hora a tal hora", () => {
    const c = [closure({ start: "12:00", end: "18:00" })];
    expect(closedReason(morning, "2026-11-11", [], c)).toBeNull();
    expect(closedReason(afternoon, "2026-11-11", [], c)).toBe("Cerrado de 12:00 a 18:00");
  });
  it("cierre de algunos turnos", () => {
    const c = [closure({ shiftIds: ["m"] })];
    expect(closedReason(morning, "2026-11-11", [], c)).toBe("Cerrado");
    expect(closedReason(afternoon, "2026-11-11", [], c)).toBeNull();
  });
});

describe("shiftDate", () => {
  const night = { start: "22:00", end: "06:00" };
  it("un nocturno abierto pasada la medianoche es del día anterior", () => {
    expect(shiftDate(night, { date: "2026-11-11", minutes: 30 })).toBe("2026-11-10");
    expect(shiftDate(night, { date: "2026-11-11", minutes: 21 * 60 + 50 })).toBe("2026-11-11");
    expect(shiftDate(morning, { date: "2026-11-11", minutes: 30 })).toBe("2026-11-11");
  });
});
