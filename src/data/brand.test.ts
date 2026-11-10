import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandColors } from "./brand";

// Contraste WCAG entre dos #rrggbb.
const lum = (hex: string) => {
  const [r, g, b] = hex.match(/\w\w/g)!.map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// app-surface.css: panel y superficie elevada, y --color-on-primary (tokens.css), en claro y oscuro.
const light = { onPrimary: "#ffffff", surfaces: ["#ffffff", "#f3f0eb"] };
const dark = { onPrimary: "#1f1a17", surfaces: ["#161311", "#221e1b"] };

describe("paleta del negocio", () => {
  it.each(brandColors)("$label cumple AA en los dos temas", ({ light: l, dark: d }) => {
    // Texto del botón primario sobre el color, y el color como texto (ítem activo, enlaces) sobre las superficies.
    expect(contrast(light.onPrimary, l)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark.onPrimary, d)).toBeGreaterThanOrEqual(4.5);
    for (const s of light.surfaces) expect(contrast(l, s)).toBeGreaterThanOrEqual(4.5);
    for (const s of dark.surfaces) expect(contrast(d, s)).toBeGreaterThanOrEqual(4.5);
  });

  it("las claves son únicas y la primera es el ámbar de siempre", () => {
    expect(new Set(brandColors.map((c) => c.key)).size).toBe(brandColors.length);
    expect(brandColors[0].key).toBe("ambar");
  });

  it("la base acepta exactamente los colores de la paleta", () => {
    const dir = "supabase/migrations";
    const sql = readdirSync(dir).sort().map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n");
    const checks = [...sql.matchAll(/check \(color in \(([^)]*)\)\)/g)].map((m) => m[1]);
    expect(checks.at(-1)!.split(",").map((k) => k.trim().replace(/'/g, ""))).toEqual(brandColors.map((c) => c.key));
  });
});
