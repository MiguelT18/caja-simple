import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ago, announcement, createBatcher, type LiveEvent } from "./live-core";

describe("createBatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("entrega junto lo que llega seguido, después del último", () => {
    const flush = vi.fn();
    const batch = createBatcher<number>(1500, flush);
    batch.push(1);
    vi.advanceTimersByTime(1000);
    batch.push(2);
    vi.advanceTimersByTime(1499);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledWith([1, 2]);
    batch.push(3);
    vi.advanceTimersByTime(1500);
    expect(flush).toHaveBeenLastCalledWith([3]);
  });

  it("cancel descarta lo pendiente", () => {
    const flush = vi.fn();
    const batch = createBatcher<number>(1500, flush);
    batch.push(1);
    batch.cancel();
    vi.advanceTimersByTime(5000);
    expect(flush).not.toHaveBeenCalled();
  });
});

describe("announcement", () => {
  const names = { a: "Sucursal Centro", b: "Sucursal Norte" };
  const ev = (table: string, op: string, branch = "a"): LiveEvent => ({ table, op, branch });

  it("nombra la sucursal y lo que pasó", () => {
    expect(announcement([ev("sales", "insert")], names)).toBe("Nueva venta en Sucursal Centro");
    expect(announcement([ev("sales", "insert"), ev("sales", "insert")], names)).toBe("2 ventas nuevas en Sucursal Centro");
    expect(announcement([ev("sales", "update")], names)).toBe("Venta anulada en Sucursal Centro");
    expect(announcement([ev("expenses", "insert")], names)).toBe("Nuevo gasto en Sucursal Centro");
    expect(announcement([ev("shift_closes", "insert")], names)).toBe("Turno abierto en Sucursal Centro");
  });
  it("agrupa lo mezclado", () => {
    expect(announcement([ev("sales", "insert"), ev("expenses", "insert")], names)).toBe("Cambios en Sucursal Centro");
    expect(announcement([ev("sales", "insert"), ev("sales", "insert", "b")], names)).toBe("Cambios en 2 sucursales");
  });
  it("sin nombre conocido o sin avisos", () => {
    expect(announcement([ev("sales", "insert", "x")], names)).toBe("Nueva venta en una sucursal");
    expect(announcement([], names)).toBe("");
  });
});

describe("ago", () => {
  it("redondea hacia abajo", () => {
    expect(ago(0)).toBe("hace un momento");
    expect(ago(59_999)).toBe("hace un momento");
    expect(ago(60_000)).toBe("hace 1 min");
    expect(ago(59 * 60_000)).toBe("hace 59 min");
    expect(ago(125 * 60_000)).toBe("hace 2 h");
    expect(ago(-5)).toBe("hace un momento");
  });
});
