import { describe, expect, it } from "vitest";
import { fallbackType, fitSize } from "./shrink-image";

describe("fitSize", () => {
  it("achica el lado mayor a max y respeta la proporción", () => {
    expect(fitSize(4000, 3000, 640)).toEqual({ width: 640, height: 480 });
    expect(fitSize(3000, 4000, 640)).toEqual({ width: 480, height: 640 });
  });
  it("no agranda una foto chica", () => {
    expect(fitSize(300, 200, 640)).toEqual({ width: 300, height: 200 });
  });
});

describe("fallbackType", () => {
  it("conserva PNG (transparencia) y usa JPEG para lo demás", () => {
    expect(fallbackType("image/png")).toBe("image/png");
    expect(fallbackType("image/heic")).toBe("image/jpeg");
  });
});
