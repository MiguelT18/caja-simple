import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "@/data/queries";
import { saleMode } from "./catalog";

const entry = (soldIn: { price: number | null; stock: number | null }[], components?: CatalogEntry["components"]): CatalogEntry => ({
  id: "p",
  name: "P",
  attributes: {},
  components,
  soldIn: soldIn.map((s, i) => ({ branchId: `b${i}`, branch: `B${i}`, minStock: null, low: false, ...s })),
});

describe("saleMode", () => {
  it("uno nuevo sigue el tipo del negocio y, sin él, el rubro", () => {
    expect(saleMode(undefined, "tienda")).toBe("stock");
    expect(saleMode(undefined, "ropa")).toBe("free");
    expect(saleMode(undefined, "restaurante")).toBe("open");
    expect(saleMode(undefined, "restaurante", "stock")).toBe("stock");
  });

  it("uno que existe se deduce de lo que tiene en sus sucursales", () => {
    expect(saleMode(entry([{ price: 5, stock: null }, { price: 4, stock: 3 }]), "restaurante")).toBe("stock");
    expect(saleMode(entry([{ price: 5, stock: null }]), "tienda")).toBe("open");
    expect(saleMode(entry([{ price: null, stock: null }]), "tienda")).toBe("free");
    expect(saleMode(entry([], [{ productId: "x", name: "X", qty: 2 }]), "tienda")).toBe("combo");
    // Sin sucursales todavía: como uno nuevo.
    expect(saleMode(entry([]), "ropa")).toBe("free");
  });
});
