// Color del negocio: una paleta curada (no un selector libre) para que todo color cumpla el contraste en los dos temas
// (lo prueba brand.test.ts). Dentro del negocio reemplaza al ámbar como acento: botones, ítem activo, foco y
// encabezados (Layout.astro). Ver DESIGN.md › Color del negocio.

// Tonos repartidos por la rueda (OKLCH, cada ~35°) para que no se confundan entre sí, con la saturación más alta que
// deja el contraste AA: en claro, lo más claro que aguanta texto blanco; en oscuro, lo más oscuro que aguanta texto
// oscuro. Grafito es el neutro, para marcas en blanco y negro.
export const brandColors = [
  { key: "ambar", label: "Ámbar", light: "#9c4708", dark: "#f0a04b" },
  { key: "rojo", label: "Rojo", light: "#ca0221", dark: "#ff6b65" },
  { key: "fucsia", label: "Fucsia", light: "#be048a", dark: "#ff5dc4" },
  { key: "violeta", label: "Violeta", light: "#8c06fe", dark: "#b086fe" },
  { key: "azul", label: "Azul", light: "#124fff", dark: "#6a99fe" },
  { key: "celeste", label: "Celeste", light: "#046d98", dark: "#02a5e4" },
  { key: "turquesa", label: "Turquesa", light: "#02736e", dark: "#05ada7" },
  { key: "verde", label: "Verde", light: "#017634", dark: "#03b353" },
  { key: "lima", label: "Lima", light: "#536f04", dark: "#81a904" },
  { key: "grafito", label: "Grafito", light: "#5b6777", dark: "#8f9dae" },
] as const;

export type BrandColor = (typeof brandColors)[number]["key"];
export const brandKeys = brandColors.map((c) => c.key) as [BrandColor, ...BrandColor[]];

const find = (key: string | undefined) => brandColors.find((c) => c.key === key) ?? brandColors[0];

/** El color para un `--art` o un `color:` (MediaCard de «Tus negocios»). */
export const brandColor = (key?: string) => {
  const c = find(key);
  return `light-dark(${c.light}, ${c.dark})`;
};

/**
 * Neutros de app-surface.css teñidos con el color del negocio: cada uno toma `light`/`dark` (0–1) del color en ese
 * tema. Así tarjetas, inputs, bordes y el suelo son variantes del mismo color. brand.test.ts revisa el contraste.
 */
export const tinted = {
  "--color-bg": { base: ["#e7e3dd", "#0b0908"], mix: [0.08, 0.07] },
  // El panel (sidebar y contenido): apenas teñido, para que el contenido mande sobre el color.
  "--color-surface": { base: ["#ffffff", "#161311"], mix: [0.03, 0.06] },
  "--color-surface-muted": { base: ["#f3f0eb", "#221e1b"], mix: [0.05, 0.05] },
  "--color-surface-hover": { base: ["#e9e5df", "#2c2723"], mix: [0.08, 0.08] },
  "--color-border": { base: ["#e4dfd8", "#2a2522"], mix: [0.08, 0.08] },
  "--color-border-strong": { base: ["#8a8077", "#7d736a"], mix: [0.1, 0.1] },
  "--scrollbar-thumb": { base: ["#c8c1b7", "#3f3833"], mix: [0.12, 0.12] },
  "--scrollbar-thumb-hover": { base: ["#a39a8f", "#5e5650"], mix: [0.12, 0.12] },
} as const;

const mixIn = (color: string, p: number, base: string) => `color-mix(in srgb, ${color} ${Math.round(p * 100)}%, ${base})`;

/** Variables para el `style` de <body>: el acento y los neutros de /app toman el color del negocio. */
export function brandStyle(key?: string) {
  const c = find(key);
  return [
    `--color-primary: light-dark(${c.light}, ${c.dark})`,
    `--color-primary-hover: light-dark(color-mix(in oklab, ${c.light} 82%, black), color-mix(in oklab, ${c.dark} 80%, white))`,
    `--color-primary-soft: light-dark(color-mix(in oklab, ${c.light} 12%, white), color-mix(in oklab, ${c.dark} 18%, #161311))`,
    `--color-focus: light-dark(${c.light}, ${c.dark})`,
    ...Object.entries(tinted).map(
      ([name, { base, mix }]) => `${name}: light-dark(${mixIn(c.light, mix[0], base[0])}, ${mixIn(c.dark, mix[1], base[1])})`,
    ),
  ].join("; ");
}
