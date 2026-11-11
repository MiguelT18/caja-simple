import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandColors, tinted } from "./brand";

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

// color-mix(in srgb, a p, b), como en brandStyle.
const mix = (a: string, b: string, p: number) =>
  "#" + [0, 1, 2].map((i) => Math.round(parseInt(a.slice(1 + 2 * i, 3 + 2 * i), 16) * p + parseInt(b.slice(1 + 2 * i, 3 + 2 * i), 16) * (1 - p)).toString(16).padStart(2, "0")).join("");

describe("paleta del negocio", () => {
  it.each(brandColors)("los neutros teñidos de $label dejan leer el texto", ({ light: l, dark: d }) => {
    // --color-text y --color-text-muted de app-surface.css, y el color como texto, sobre suelo, tarjetas y hover.
    const themes = [
      { i: 0, color: l, text: "#1a1613", muted: "#5c544c", surface: mix(l, "#ffffff", tinted["--color-surface"].mix[0]) },
      { i: 1, color: d, text: "#f5f1ec", muted: "#b3a99e", surface: mix(d, "#161311", tinted["--color-surface"].mix[1]) },
    ];
    for (const t of themes) {
      const tint = (name: keyof typeof tinted) => mix(t.color, tinted[name].base[t.i], tinted[name].mix[t.i]);
      for (const bg of [tint("--color-bg"), tint("--color-surface"), tint("--color-surface-muted"), tint("--color-surface-hover")]) {
        expect(contrast(t.text, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.muted, bg)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(t.color, tint("--color-surface-muted"))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.color, tint("--color-surface"))).toBeGreaterThanOrEqual(4.5);
      // El borde de los inputs se distingue del panel.
      expect(contrast(tint("--color-border-strong"), t.surface)).toBeGreaterThanOrEqual(3);
    }
  });

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
