// Qué es de verdad un archivo subido como imagen: se lee su encabezado, no el tipo que dice el navegador
// (lo controla quien envía). Solo JPEG, PNG y WebP, con su tamaño en píxeles para frenar «imágenes bomba».

export interface ImageInfo {
  type: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
}

const ascii = (b: Uint8Array, at: number, text: string) => [...text].every((c, i) => b[at + i] === c.charCodeAt(0));

export function imageInfo(b: Uint8Array): ImageInfo | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // PNG: firma de 8 bytes y luego el bloque IHDR con ancho y alto.
  if (b.length >= 24 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v) && ascii(b, 12, "IHDR"))
    return { type: "image/png", width: view.getUint32(16), height: view.getUint32(20) };

  // WebP: RIFF….WEBP y uno de sus tres formatos.
  if (b.length >= 30 && ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) {
    if (ascii(b, 12, "VP8 ") && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)
      return { type: "image/webp", width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (ascii(b, 12, "VP8L") && b[20] === 0x2f)
      return { type: "image/webp", width: 1 + (b[21] | ((b[22] & 0x3f) << 8)), height: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)) };
    if (ascii(b, 12, "VP8X"))
      return { type: "image/webp", width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    return null;
  }

  // JPEG: FF D8 y luego segmentos hasta el SOF, que trae alto y ancho.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) {
        i++; // relleno
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2; // marcadores sin longitud
        continue;
      }
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { type: "image/jpeg", width: view.getUint16(i + 7), height: view.getUint16(i + 5) };
      if (marker === 0xd9 || marker === 0xda) return null; // terminó o empezó la imagen sin SOF
      i += 2 + view.getUint16(i + 2);
    }
  }
  return null;
}

/** Más que esto no lo saca ninguna cámara de celular: es una imagen hecha para colgar el navegador. */
export const MAX_SIDE = 8000;
export const MAX_PIXELS = 40_000_000;
export const tooLarge = ({ width, height }: ImageInfo) => width === 0 || height === 0 || width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS;
