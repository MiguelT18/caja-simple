import { describe, expect, it } from "vitest";
import { MENU_MAX, MENU_MIN, menuWidth } from "./sidebar";

describe("menuWidth", () => {
  it("lee la cookie dentro de los límites", () => {
    expect(menuWidth("260")).toBe(260);
    expect(menuWidth("50")).toBe(MENU_MIN);
    expect(menuWidth("9999")).toBe(MENU_MAX);
  });
  it("sin cookie o con basura, el ancho de siempre", () => {
    expect(menuWidth(undefined)).toBeUndefined();
    expect(menuWidth("")).toBeUndefined();
    expect(menuWidth("abc")).toBeUndefined();
  });
});
