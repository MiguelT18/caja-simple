// Sugerir el color del negocio desde su logo: el color dominante (sin blancos, negros, grises ni transparencias) y el
// más parecido de la paleta. Lo usa BrandColorField.astro; la elección siempre la confirma la persona.
import { brandColors, type BrandColor } from "@/data/brand";

type Rgb = [number, number, number];

/** sRGB (0–255) → OKLab. */
function oklab([r, g, b]: Rgb): Rgb {
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const hex = (h: string): Rgb => h.match(/\w\w/g)!.map((x) => parseInt(x, 16)) as Rgb;

/**
 * El color de la paleta más parecido. Cuenta sobre todo el tono (a, b de OKLab, normalizados): un logo pastel o muy
 * oscuro igual cae en su familia; la claridad pesa poco.
 */
export function nearestBrand(rgb: Rgb): BrandColor {
  const [L, a, b] = oklab(rgb);
  const chroma = Math.hypot(a, b) || 1;
  let best: { key: BrandColor; d: number } = { key: brandColors[0].key, d: Infinity };
  for (const c of brandColors) {
    const [cl, ca, cb] = oklab(hex(c.light));
    const cc = Math.hypot(ca, cb);
    // Grafito (casi sin color) no es un tono: un logo con color nunca cae ahí.
    if (cc < 0.05) continue;
    const d = Math.hypot(a / chroma - ca / cc, b / chroma - cb / cc) + 0.3 * Math.abs(L - cl);
    if (d < best.d) best = { key: c.key, d };
  }
  return best.key;
}

/** Color dominante de los píxeles con color (RGBA de un canvas chico). null si el logo es blanco, negro o gris. */
export function dominantColor(pixels: Uint8ClampedArray): Rgb | null {
  // Por tono, en 12 grupos; pesa más lo saturado. Gana el grupo más pesado y se devuelve su promedio.
  const groups = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b, alpha] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    if (alpha < 128) continue;
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const light = (max + min) / 2;
    const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
    if (sat < 0.25 || light < 0.1 || light > 0.92) continue;
    const d = max - min;
    const h = max === r / 255 ? ((g - b) / 255 / d + 6) % 6 : max === g / 255 ? (b - r) / 255 / d + 2 : (r - g) / 255 / d + 4;
    const group = groups[Math.floor(h * 2) % 12];
    group.w += sat;
    group.r += r * sat;
    group.g += g * sat;
    group.b += b * sat;
  }
  const top = groups.reduce((x, y) => (y.w > x.w ? y : x));
  // Menos del 3 % del logo con color: no hay un color que sugerir.
  if (top.w < (pixels.length / 4) * 0.03) return null;
  return [top.r / top.w, top.g / top.w, top.b / top.w];
}
