import { beforeEach, describe, expect, it } from "vitest";
import { enqueue, flush, queued, type QueuedSale } from "./sale-queue";

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as Storage;

const sale = (saleId: string): QueuedSale => ({ saleId, branchId: "b", shiftId: "s", payment: "efectivo", items: [{ productId: "p", qty: 1 }], total: 5, at: 0 });

describe("cola de ventas", () => {
  beforeEach(() => store.clear());

  it("no duplica la misma venta", () => {
    enqueue(sale("a"));
    enqueue(sale("a"));
    expect(queued()).toHaveLength(1);
  });

  it("envía en orden, marca las rechazadas y para al cortarse la red", async () => {
    ["a", "b", "c"].forEach((id) => enqueue(sale(id)));
    const results: Record<string, "ok" | "offline" | { error: string }> = { a: "ok", b: { error: "Turno cerrado" }, c: "offline" };
    expect(await flush(async (s) => results[s.saleId])).toBe(1);
    expect(queued().map((s) => [s.saleId, s.error])).toEqual([
      ["b", "Turno cerrado"],
      ["c", undefined],
    ]);
    // Las rechazadas no se reintentan solas.
    const tried: string[] = [];
    await flush(async (s) => (tried.push(s.saleId), "ok"));
    expect(tried).toEqual(["c"]);
  });
});
