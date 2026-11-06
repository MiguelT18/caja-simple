// Achica una foto antes de subirla: la cámara del celular saca 3–8 MB y 4000 px, y la app la muestra a unos cientos.
const KEEP = ["image/jpeg", "image/png", "image/webp"];

/** Tamaño de salida: el lado mayor queda en `max` px como mucho, sin agrandar. */
export function fitSize(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Formato de respaldo si el navegador no codifica WebP: PNG si el original lo era (conserva la transparencia), si no JPEG. */
export const fallbackType = (type: string) => (type === "image/png" ? "image/png" : "image/jpeg");

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * WebP de hasta `max` px por lado. Si ya es chica y liviana, o el navegador no la puede leer (HEIC en Chrome),
 * vuelve tal cual.
 */
export async function shrinkImage(file: File, max = 1600, quality = 0.8): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = fitSize(bitmap.width, bitmap.height, max);
    if (size.width === bitmap.width && size.height === bitmap.height && file.size <= 400 * 1024 && KEEP.includes(file.type)) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    Object.assign(canvas, size);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    let blob = await toBlob(canvas, "image/webp", quality);
    // Safari viejo devuelve PNG cuando no sabe hacer WebP.
    if (blob?.type !== "image/webp") blob = await toBlob(canvas, fallbackType(file.type), quality);
    if (!blob || (blob.size >= file.size && KEEP.includes(file.type))) return file;
    const ext = blob.type.split("/")[1].replace("jpeg", "jpg");
    return new File([blob], `${file.name.replace(/\.\w+$/, "")}.${ext}`, { type: blob.type });
  } catch {
    return file;
  }
}

/** Cambia el archivo de un `<input type="file">` por su versión achicada, para que el formulario envíe esa. */
export async function shrinkInput(input: HTMLInputElement, max: number) {
  const file = input.files?.[0];
  if (!file) return undefined;
  const small = await shrinkImage(file, max);
  if (small !== file) {
    const list = new DataTransfer();
    list.items.add(small);
    input.files = list.files;
  }
  return small;
}
