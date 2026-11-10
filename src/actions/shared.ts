// Piezas comunes de las acciones: sesión, validadores, errores de la base y fotos.
// RLS es la autorización real: las acciones validan la entrada y traducen los errores.
import { ActionError, type ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import { rateLimit } from "@/lib/cache";
import { imageInfo, tooLarge } from "@/lib/image";
import { today, toneOf } from "@/lib/dates";
import { effectivePlan, planLimits } from "@/data/plans";

// Los mensajes que zod arma solo (los que no escribimos a mano) también en español: nada en inglés llega a la pantalla.
z.config(z.locales.es());

export const uuid = z.uuid();
export const name = (max: number, message: string) => z.string({ error: message }).trim().min(1, message).max(max, `Máximo ${max} caracteres`);
export const money = z.coerce.number({ error: "Ingresa un monto" }).min(0, "No puede ser negativo").max(9_999_999);
export const count = z.coerce.number({ error: "Ingresa un número" }).int("Usa un número entero").min(0, "No puede ser negativo");
// Astro manda los campos vacíos de un formulario como null: vacío, null o ausente quedan en undefined.
export const optional = z
  .string()
  .trim()
  .nullish()
  .transform((v) => v || undefined);

/** Convierte un nombre en un slug de URL: «Almacén López» → «almacen-lopez». */
export const slugify = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "negocio";

export function db(context: ActionAPIContext) {
  if (!context.locals.userId) throw new ActionError({ code: "UNAUTHORIZED", message: "Tu sesión terminó. Vuelve a entrar." });
  return context.locals.supabase;
}

/** Corta los intentos repetidos de una persona (fuerza bruta, raspado de correos). */
export async function limit(context: ActionAPIContext, name: string, max: number, windowSec: number) {
  if (!(await rateLimit(`${name}:${context.locals.userId}`, max, windowSec)))
    throw new ActionError({ code: "TOO_MANY_REQUESTS", message: "Demasiados intentos. Espera un momento." });
}

/** Límites del plan que vale hoy en el negocio. La base los aplica igual: esto es para cortar antes con un mensaje claro. */
export async function limitsOf(sb: ReturnType<typeof db>, businessId: string) {
  const { data, error } = await sb.from("businesses").select("plan, plan_until").eq("id", businessId).single();
  check(error);
  return planLimits[effectivePlan(data!.plan, data!.plan_until, today())];
}

/** Mensaje claro para los errores de Postgres/PostgREST. */
export function check(error: { code?: string; message: string } | null, duplicate = "Ya existe un registro con ese nombre.") {
  if (!error) return;
  if (error.code === "23505") throw new ActionError({ code: "CONFLICT", message: duplicate });
  // Mensajes propios de la base (raise exception en los triggers): ya están en español.
  if (error.code === "P0001") throw new ActionError({ code: "BAD_REQUEST", message: error.message });
  if (error.code === "42501" || error.code === "PGRST116")
    throw new ActionError({ code: "FORBIDDEN", message: "No tienes permiso para hacer esto." });
  // Una línea JSON por error: el log drain de Vercel la recoge y se puede filtrar por level/code.
  console.error(JSON.stringify({ level: "error", source: "action", code: error.code ?? null, message: error.message }));
  throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo guardar. Intenta de nuevo." });
}

export const totpCode = z
  .string()
  .transform((v) => v.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Escribe los 6 números que muestra tu app"));

/** Comprueba un código de la app de autenticación; si es correcto, la sesión queda en aal2. */
export async function verifyCode(sb: ReturnType<typeof db>, factorId: string, code: string) {
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw new ActionError({ code: "BAD_REQUEST", message: "El código no es correcto o ya venció. Prueba con el que se ve ahora." });
}

/** Eliminar pide escribir el nombre: evita borrar el negocio o la sucursal equivocada. */
export function confirmName(typed: string, expected: string) {
  if (typed.toLocaleLowerCase("es") !== expected.trim().toLocaleLowerCase("es"))
    throw new ActionError({ code: "BAD_REQUEST", message: `Escribe «${expected}» tal cual para confirmar.` });
}

/** Busca un slug libre agregando -2, -3… si ya existe. */
export async function freeSlug(base: string, taken: (slug: string) => Promise<boolean>) {
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await taken(slug))) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

// Turnos que vienen de ShiftsEditor: campos repetidos, uno por fila.
export const time = z.string().regex(/^\d{2}:\d{2}$/, "Hora no válida");
export const kind = z.enum(["tienda", "ropa", "restaurante"], { error: "Elige el rubro" }).default("tienda");
export const shiftList = {
  shiftName: z.array(z.string().trim()).default([]),
  shiftStart: z.array(z.string()).default([]),
  shiftEnd: z.array(z.string()).default([]),
};

/** Une las filas del editor de turnos y las valida; los errores van al campo shiftName. */
export function shiftsFrom(input: { shiftName: string[]; shiftStart: string[]; shiftEnd: string[] }) {
  const fail = (message: string): never => {
    throw new ActionError({ code: "BAD_REQUEST", message });
  };
  const shifts = input.shiftName.map((name, i) => ({ name, start: input.shiftStart[i] ?? "", end: input.shiftEnd[i] ?? "", }));
  if (shifts.length === 0) fail("Agrega al menos un turno.");
  if (shifts.length > 8) fail("Máximo 8 turnos por sucursal.");
  const seen = new Set<string>();
  for (const [i, s] of shifts.entries()) {
    const label = s.name || `El turno ${i + 1}`;
    if (!s.name) fail(`Ponle nombre al turno ${i + 1}.`);
    if (s.name.length > 40) fail(`El nombre «${s.name}» es muy largo (máximo 40 caracteres).`);
    if (!time.safeParse(s.start).success || !time.safeParse(s.end).success) fail(`${label}: revisa las horas.`);
    if (s.start === s.end) fail(`${label}: la hora de inicio y la de fin no pueden ser iguales.`);
    if (seen.has(s.name.toLowerCase())) fail(`Hay dos turnos llamados «${s.name}».`);
    seen.add(s.name.toLowerCase());
  }
  return shifts.map((s) => ({ ...s, tone: toneOf(s.start) }));
}

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const extension = (type: string) => type.split("/")[1].replace("jpeg", "jpg");
export const imageFile = z
  .instanceof(File)
  .optional()
  .refine((f) => !f || f.size === 0 || IMAGE_TYPES.includes(f.type), "La foto debe ser JPG, PNG o WebP")
  .refine((f) => !f || f.size <= 2 * 1024 * 1024, "La foto pesa más de 2 MB")
  // El tipo lo pone quien envía: se mira el contenido. Así nadie sube un HTML, un SVG o un ejecutable con nombre de foto,
  // y el contentType con que se guarda (f.type) queda verificado.
  .superRefine(async (f, ctx) => {
    if (!f || f.size === 0 || f.size > 2 * 1024 * 1024) return;
    const info = imageInfo(new Uint8Array(await f.arrayBuffer()));
    if (!info || info.type !== f.type) ctx.addIssue({ code: "custom", message: "Esta imagen no es un JPG, PNG o WebP válido" });
    else if (tooLarge(info)) ctx.addIssue({ code: "custom", message: "La imagen es demasiado grande en píxeles. Usa una foto más chica." });
  });

/** Tope de subidas por persona (llenar el Storage con un script). Solo cuenta si viene algún archivo. */
export async function uploadLimit(context: ActionAPIContext, ...files: (File | undefined)[]) {
  if (files.some((f) => f && f.size > 0)) await limit(context, "upload", 60, 60 * 60);
}

/** Sube, reemplaza o quita la foto de una sucursal o un producto (bucket privado, <negocio>/<id>-<timestamp>.<ext>) y guarda su image_path. */
/** Las fotos viven en <negocio>/… de cada bucket, y Storage solo deja borrarlas mientras el negocio existe. */
// shortcut: borra hasta 1000 fotos por bucket, si un negocio llega a más, paginar el list().
export async function removeBusinessPhotos(sb: ReturnType<typeof db>, businessId: string) {
  for (const bucket of ["product-images", "branch-images"]) {
    const { data: files } = await sb.storage.from(bucket).list(businessId, { limit: 1000 });
    if (files?.length) await sb.storage.from(bucket).remove(files.map((f) => `${businessId}/${f.name}`));
  }
}

export async function storeImage(
  sb: ReturnType<typeof db>,
  table: "businesses" | "branches" | "products",
  businessId: string,
  row: { id: string; image_path: string | null },
  image: File | undefined,
  remove: boolean,
) {
  // El logo del negocio comparte bucket y carpeta con las fachadas: <negocio>/<negocio>.<ext>.
  const bucket = sb.storage.from(table === "products" ? "product-images" : "branch-images");
  if (image && image.size > 0) {
    // Nombre nuevo en cada cambio: la URL de la foto nueva nunca coincide con la vieja, y así se puede guardar un año.
    const path = `${businessId}/${row.id}-${Date.now()}.${extension(image.type)}`;
    const upload = await bucket.upload(path, image, { contentType: image.type, cacheControl: "31536000" });
    if (upload.error) throw new ActionError({ code: "BAD_REQUEST", message: "No se pudo subir la foto. Intenta de nuevo." });
    if (row.image_path && row.image_path !== path) await bucket.remove([row.image_path]);
    check((await sb.from(table).update({ image_path: path }).eq("id", row.id)).error);
  } else if (remove && row.image_path) {
    await bucket.remove([row.image_path]);
    check((await sb.from(table).update({ image_path: null }).eq("id", row.id)).error);
  }
}
