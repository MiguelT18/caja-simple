import { describe, expect, it } from "vitest";
import { dominantColor, nearestBrand } from "./logo-color";

const image = (...colors: [number, number, number, number, number][]) => {
  // [r, g, b, a, cuántos píxeles]
  const px = colors.flatMap(([r, g, b, a, n]) => Array.from({ length: n }, () => [r, g, b, a]).flat());
  return new Uint8ClampedArray(px);
};

describe("nearestBrand", () => {
  it("cae en la familia del color, aunque sea más claro u oscuro", () => {
    expect(nearestBrand([220, 30, 30])).toBe("rojo");
    expect(nearestBrand([40, 140, 70])).toBe("verde");
    expect(nearestBrand([30, 100, 180])).toBe("azul");
    expect(nearestBrand([240, 150, 40])).toBe("ambar");
    expect(nearestBrand([150, 90, 200])).toBe("violeta");
    expect(nearestBrand([20, 160, 160])).toBe("turquesa");
    expect(nearestBrand([250, 160, 200])).toBe("fucsia");
    expect(nearestBrand([30, 170, 230])).toBe("celeste");
    expect(nearestBrand([150, 180, 40])).toBe("lima");
  });
});

describe("dominantColor", () => {
  it("ignora el fondo blanco y lo transparente", () => {
    const rgb = dominantColor(image([255, 255, 255, 255, 700], [0, 0, 0, 0, 200], [30, 100, 180, 255, 100]))!;
    expect(nearestBrand(rgb)).toBe("azul");
  });

  it("sin color (blanco, negro, gris) no sugiere nada", () => {
    expect(dominantColor(image([255, 255, 255, 255, 500], [20, 20, 20, 255, 300], [128, 128, 128, 255, 200]))).toBeNull();
  });

  it("gana el color que más ocupa", () => {
    expect(nearestBrand(dominantColor(image([220, 30, 30, 255, 300], [40, 140, 70, 255, 100]))!)).toBe("rojo");
  });
});
