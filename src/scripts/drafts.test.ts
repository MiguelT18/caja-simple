import { describe, expect, it } from "vitest";
import { collect, snapshotOf, type DraftField } from "./drafts";

const field = (f: Partial<DraftField>): DraftField => ({ id: "", name: "x", type: "text", value: "", ...f });

describe("borradores", () => {
  it("guarda solo lo que cambió, sin contraseñas, archivos ni ocultos", () => {
    const start = [
      field({ id: "name", name: "name" }),
      field({ name: "price" }),
      field({ name: "price", value: "" }),
      field({ name: "priceBranch", type: "checkbox", checked: true }),
      field({ name: "pw", type: "password" }),
      field({ name: "businessId", type: "hidden", value: "b1" }),
    ];
    const initial = snapshotOf(start);
    const now = [
      field({ id: "name", name: "name", value: "Leche" }),
      field({ name: "price" }),
      field({ name: "price", value: "7.5" }),
      field({ name: "priceBranch", type: "checkbox", checked: false }),
      field({ name: "pw", type: "password", value: "secreta" }),
      field({ name: "businessId", type: "hidden", value: "b2" }),
    ];
    // Los campos sin id van por nombre y posición: el segundo precio no se confunde con el primero.
    expect(collect(now, initial)).toEqual({ name: "Leche", "price#1": "7.5", "priceBranch#0": false });
  });

  it("sin cambios no hay borrador", () => {
    const fields = [field({ id: "a", name: "a", value: "hola" })];
    expect(collect(fields, snapshotOf(fields))).toEqual({});
  });
});
