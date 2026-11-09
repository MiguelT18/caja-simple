import { describe, expect, it } from "vitest";
import { countAt, parseKeys, stepAt, typedAt } from "./demo-play";

describe("stepAt", () => {
  const durations = [500, 1000];
  it("ubica el paso y su avance", () => {
    expect(stepAt(durations, 0)).toEqual({ step: 0, progress: 0 });
    expect(stepAt(durations, 250)).toEqual({ step: 0, progress: 0.5 });
    expect(stepAt(durations, 1000)).toEqual({ step: 1, progress: 0.5 });
  });
  it("pasado el final queda en el último paso, completo", () => {
    expect(stepAt(durations, 1500)).toEqual({ step: 2, progress: 1 });
    expect(stepAt(durations, 99999)).toEqual({ step: 2, progress: 1 });
  });
});

describe("typedAt", () => {
  it("escribe de a poco y nunca se pasa", () => {
    expect(typedAt("Garrafa", 0)).toBe("");
    expect(typedAt("Garrafa", 0.5)).toBe("Garr");
    expect(typedAt("Garrafa", 1)).toBe("Garrafa");
    expect(typedAt("Garrafa", 2)).toBe("Garrafa");
  });
});

describe("countAt", () => {
  const keys = parseKeys("7@1,14@2,31.5@4");
  it("lee las claves", () => expect(keys).toEqual([[7, 1], [14, 2], [31.5, 4]]));
  it("antes de la primera clave muestra el inicio", () => expect(countAt(keys, 0, 0, 0.9)).toBe(0));
  it("sube durante el paso de cada clave", () => {
    expect(countAt(keys, 0, 1, 0)).toBe(0);
    expect(countAt(keys, 0, 1, 1)).toBe(7);
    expect(countAt(keys, 0, 2, 0)).toBe(7);
    expect(countAt(keys, 0, 2, 1)).toBe(14);
  });
  it("entre claves se queda en la anterior", () => expect(countAt(keys, 0, 3, 0.5)).toBe(14));
  it("al final llega al último valor", () => expect(countAt(keys, 0, 9, 1)).toBe(31.5));
});
