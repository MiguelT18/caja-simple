// Color del negocio: una paleta curada (no un selector libre) para que todo color cumpla el contraste en los dos temas
// (lo prueba brand.test.ts). Dentro del negocio reemplaza al ámbar como acento: botones, ítem activo, foco y
// encabezados (Layout.astro). Ver DESIGN.md › Color del negocio.

export const brandColors = [
  { key: "ambar", label: "Ámbar", light: "#9c4708", dark: "#f0a04b" },
  { key: "terracota", label: "Terracota", light: "#b03a1e", dark: "#f4987a" },
  { key: "rojo", label: "Rojo", light: "#b91c1c", dark: "#f68a8a" },
  { key: "rosa", label: "Rosa", light: "#be185d", dark: "#f58cba" },
  { key: "violeta", label: "Violeta", light: "#7e3fb0", dark: "#c9a0ef" },
  { key: "indigo", label: "Índigo", light: "#4338ca", dark: "#a5b0fb" },
  { key: "azul", label: "Azul", light: "#1d63b0", dark: "#7ab8f5" },
  { key: "turquesa", label: "Turquesa", light: "#0b6f6e", dark: "#5cd0cc" },
  { key: "verde", label: "Verde", light: "#2a7548", dark: "#6fd39a" },
  { key: "oliva", label: "Oliva", light: "#5f6b12", dark: "#c3cf5a" },
] as const;

export type BrandColor = (typeof brandColors)[number]["key"];
export const brandKeys = brandColors.map((c) => c.key) as [BrandColor, ...BrandColor[]];

const find = (key: string | undefined) => brandColors.find((c) => c.key === key) ?? brandColors[0];

/** El color para un `--art` o un `color:` (MediaCard de «Tus negocios»). */
export const brandColor = (key?: string) => {
  const c = find(key);
  return `light-dark(${c.light}, ${c.dark})`;
};

/** Variables del acento para el `style` de <body>: lo que use var(--color-primary…) toma el color del negocio. */
export function brandStyle(key?: string) {
  const c = find(key);
  return [
    `--color-primary: light-dark(${c.light}, ${c.dark})`,
    `--color-primary-hover: light-dark(color-mix(in oklab, ${c.light} 82%, black), color-mix(in oklab, ${c.dark} 80%, white))`,
    `--color-primary-soft: light-dark(color-mix(in oklab, ${c.light} 12%, white), color-mix(in oklab, ${c.dark} 18%, #161311))`,
    `--color-focus: light-dark(${c.light}, ${c.dark})`,
  ].join("; ");
}
