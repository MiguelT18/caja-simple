// Escrituras de /app. Ver docs/modelo-de-datos.md.
// RLS es la autorización real: estas acciones validan la entrada y traducen los errores.
import { ActionError, defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import { defaultShifts } from "@/data/queries";

const uuid = z.uuid();
const name = (max: number, message: string) => z.string().trim().min(1, message).max(max, `Máximo ${max} caracteres`);
const money = z.coerce.number({ error: "Ingresa un monto" }).min(0, "No puede ser negativo").max(9_999_999);
const count = z.coerce.number({ error: "Ingresa un número" }).int("Usa un número entero").min(0, "No puede ser negativo");
const optional = z
  .string()
  .trim()
  .transform((v) => v || undefined)
  .optional();

/** Convierte un nombre en un slug de URL: «Almacén López» → «almacen-lopez». */
export const slugify = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "negocio";

function db(context: ActionAPIContext) {
  if (!context.locals.userId) throw new ActionError({ code: "UNAUTHORIZED", message: "Tu sesión terminó. Vuelve a entrar." });
  return context.locals.supabase;
}

/** Mensaje claro para los errores de Postgres/PostgREST. */
function check(error: { code?: string; message: string } | null, duplicate = "Ya existe un registro con ese nombre.") {
  if (!error) return;
  if (error.code === "23505") throw new ActionError({ code: "CONFLICT", message: duplicate });
  // Mensajes propios de la base (raise exception en los triggers): ya están en español.
  if (error.code === "P0001") throw new ActionError({ code: "BAD_REQUEST", message: error.message });
  if (error.code === "42501" || error.code === "PGRST116")
    throw new ActionError({ code: "FORBIDDEN", message: "No tienes permiso para hacer esto." });
  console.error(error);
  throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo guardar. Intenta de nuevo." });
}

const totpCode = z
  .string()
  .transform((v) => v.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Escribe los 6 números que muestra tu app"));

/** Comprueba un código de la app de autenticación; si es correcto, la sesión queda en aal2. */
async function verifyCode(sb: ReturnType<typeof db>, factorId: string, code: string) {
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw new ActionError({ code: "BAD_REQUEST", message: "El código no es correcto o ya venció. Prueba con el que se ve ahora." });
}

/** Eliminar pide escribir el nombre: evita borrar el negocio o la sucursal equivocada. */
function confirmName(typed: string, expected: string) {
  if (typed.toLocaleLowerCase("es") !== expected.trim().toLocaleLowerCase("es"))
    throw new ActionError({ code: "BAD_REQUEST", message: `Escribe «${expected}» tal cual para confirmar.` });
}

/** Busca un slug libre agregando -2, -3… si ya existe. */
async function freeSlug(base: string, taken: (slug: string) => Promise<boolean>) {
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await taken(slug))) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

// Turnos que vienen de ShiftsEditor: campos repetidos, uno por fila.
const time = z.string().regex(/^\d{2}:\d{2}$/, "Hora no válida");
const tone = z.enum(["morning", "afternoon", "night"]);
const shiftList = {
  shiftName: z.array(z.string().trim()).default([]),
  shiftStart: z.array(z.string()).default([]),
  shiftEnd: z.array(z.string()).default([]),
  shiftTone: z.array(z.string()).default([]),
};

/** Une las filas del editor de turnos y las valida; los errores van al campo shiftName. */
function shiftsFrom(input: { shiftName: string[]; shiftStart: string[]; shiftEnd: string[]; shiftTone: string[] }) {
  const fail = (message: string): never => {
    throw new ActionError({ code: "BAD_REQUEST", message });
  };
  const shifts = input.shiftName.map((name, i) => ({ name, start: input.shiftStart[i] ?? "", end: input.shiftEnd[i] ?? "", tone: input.shiftTone[i] ?? "" }));
  if (shifts.length === 0) fail("Agrega al menos un turno.");
  if (shifts.length > 8) fail("Máximo 8 turnos por sucursal.");
  const seen = new Set<string>();
  for (const [i, s] of shifts.entries()) {
    const label = s.name || `El turno ${i + 1}`;
    if (!s.name) fail(`Ponle nombre al turno ${i + 1}.`);
    if (s.name.length > 40) fail(`El nombre «${s.name}» es muy largo (máximo 40 caracteres).`);
    if (!time.safeParse(s.start).success || !time.safeParse(s.end).success) fail(`${label}: revisa las horas.`);
    if (s.start === s.end) fail(`${label}: la hora de inicio y la de fin no pueden ser iguales.`);
    if (!tone.safeParse(s.tone).success) fail(`${label}: elige el momento del día.`);
    if (seen.has(s.name.toLowerCase())) fail(`Hay dos turnos llamados «${s.name}».`);
    seen.add(s.name.toLowerCase());
  }
  return shifts as { name: string; start: string; end: string; tone: z.infer<typeof tone> }[];
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const extension = (type: string) => type.split("/")[1].replace("jpeg", "jpg");
const imageFile = z
  .instanceof(File)
  .optional()
  .refine((f) => !f || f.size === 0 || IMAGE_TYPES.includes(f.type), "La foto debe ser JPG, PNG o WebP")
  .refine((f) => !f || f.size <= 2 * 1024 * 1024, "La foto pesa más de 2 MB");

/** Sube, reemplaza o quita la foto de fachada de una sucursal (bucket branch-images, <negocio>/<sucursal>.<ext>). */
async function saveBranchImage(
  sb: ReturnType<typeof db>,
  businessId: string,
  branch: { id: string; image_path: string | null },
  image: File | undefined,
  remove: boolean,
) {
  const bucket = sb.storage.from("branch-images");
  if (image && image.size > 0) {
    const path = `${businessId}/${branch.id}.${extension(image.type)}`;
    const upload = await bucket.upload(path, image, { upsert: true, contentType: image.type });
    if (upload.error) throw new ActionError({ code: "BAD_REQUEST", message: "No se pudo subir la foto. Intenta de nuevo." });
    if (branch.image_path && branch.image_path !== path) await bucket.remove([branch.image_path]);
    check((await sb.from("branches").update({ image_path: path }).eq("id", branch.id)).error);
  } else if (remove && branch.image_path) {
    await bucket.remove([branch.image_path]);
    check((await sb.from("branches").update({ image_path: null }).eq("id", branch.id)).error);
  }
}

export const server = {
  // Negocio y sucursales ---------------------------------------------------

  createBusiness: defineAction({
    accept: "form",
    input: z.object({
      name: name(80, "Ingresa el nombre del negocio"),
      branchName: name(80, "Ingresa el nombre de la sucursal"),
      branchAddress: z.string().trim().max(160).nullable().transform((v) => v ?? ""),
    }),
    handler: async (input, context) => {
      const sb = db(context);
      // Los slugs de negocio son únicos en todo el sistema; RLS no deja ver los ajenos, así que se prueba con la RPC.
      let slug = slugify(input.name);
      for (let i = 0; i < 5; i++) {
        const { error } = await sb.rpc("create_business", {
          p_name: input.name,
          p_slug: slug,
          p_branch_name: input.branchName,
          p_branch_slug: slugify(input.branchName),
          p_branch_address: input.branchAddress,
          // La primera sucursal arranca con los turnos de siempre; cada sucursal los ajusta en Turnos.
          p_shifts: defaultShifts,
        });
        if (!error) return { slug };
        if (error.code !== "23505") check(error);
        slug = `${slugify(input.name)}-${crypto.randomUUID().slice(0, 4)}`;
      }
      throw new ActionError({ code: "CONFLICT", message: "No pudimos crear el negocio. Prueba con otro nombre." });
    },
  }),

  saveBranch: defineAction({
    accept: "form",
    input: z.object({
      businessId: uuid,
      id: uuid.optional(),
      name: name(80, "Ingresa el nombre de la sucursal"),
      address: z.string().trim().max(160).nullable().transform((v) => v ?? ""),
      image: imageFile,
      removeImage: z.coerce.boolean().default(false),
      ...shiftList,
    }),
    handler: async ({ businessId, id, image, removeImage, shiftName, shiftStart, shiftEnd, shiftTone, ...fields }, context) => {
      const sb = db(context);
      if (id) {
        const { data, error } = await sb.from("branches").update(fields).eq("id", id).select("id, image_path").single();
        check(error, "Ya tienes una sucursal con ese nombre.");
        await saveBranchImage(sb, businessId, data!, image, removeImage);
        return { id };
      }
      // Al crear, los turnos son obligatorios; al editar se cambian en Turnos.
      const shifts = shiftsFrom({ shiftName, shiftStart, shiftEnd, shiftTone });
      const slug = await freeSlug(slugify(fields.name), async (s) => {
        const { count } = await sb.from("branches").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("slug", s);
        return (count ?? 0) > 0;
      });
      const { data, error } = await sb.from("branches").insert({ business_id: businessId, slug, ...fields }).select("id").single();
      check(error, "Ya tienes una sucursal con ese nombre.");
      const { error: shiftsError } = await sb
        .from("shifts")
        .insert(shifts.map((s) => ({ branch_id: data!.id, name: s.name, start_time: s.start, end_time: s.end, tone: s.tone })));
      if (shiftsError) {
        // Sin turnos la sucursal no sirve: se deshace para que la dueña corrija y vuelva a guardar.
        await sb.from("branches").delete().eq("id", data!.id);
        check(shiftsError, "Hay dos turnos con el mismo nombre.");
      }
      await saveBranchImage(sb, businessId, { id: data!.id, image_path: null }, image, false);
      return { id: data!.id, slug };
    },
  }),

  renameBusiness: defineAction({
    accept: "form",
    input: z.object({ id: uuid, name: name(80, "Ingresa el nombre del negocio") }),
    handler: async ({ id, name }, context) => {
      // El slug no cambia: los enlaces guardados siguen funcionando.
      const { error } = await db(context).from("businesses").update({ name }).eq("id", id).select("id").single();
      check(error);
      return { id };
    },
  }),

  deleteBranch: defineAction({
    accept: "form",
    input: z.object({ id: uuid, confirm: z.string().trim() }),
    handler: async ({ id, confirm }, context) => {
      const sb = db(context);
      const { data, error } = await sb.from("branches").select("name, image_path").eq("id", id).single();
      check(error);
      confirmName(confirm, data!.name);
      // La base no deja borrar la última sucursal (trigger branches_keep_one); su historial se va en cascada.
      check((await sb.from("branches").delete().eq("id", id).select("id").single()).error);
      if (data!.image_path) await sb.storage.from("branch-images").remove([data!.image_path]);
      return { ok: true };
    },
  }),

  deleteBusiness: defineAction({
    accept: "form",
    input: z.object({ id: uuid, confirm: z.string().trim() }),
    handler: async ({ id, confirm }, context) => {
      const sb = db(context);
      const { data, error } = await sb.from("businesses").select("name").eq("id", id).single();
      check(error);
      confirmName(confirm, data!.name);
      // Las fotos viven en <negocio>/… de cada bucket, y Storage solo deja borrarlas mientras el negocio existe.
      // shortcut: borra hasta 1000 fotos por bucket, si un negocio llega a más, paginar el list().
      for (const bucket of ["product-images", "branch-images"]) {
        const { data: files } = await sb.storage.from(bucket).list(id, { limit: 1000 });
        if (files?.length) await sb.storage.from(bucket).remove(files.map((f) => `${id}/${f.name}`));
      }
      check((await sb.from("businesses").delete().eq("id", id).select("id").single()).error);
      return { ok: true };
    },
  }),

  // Turnos -----------------------------------------------------------------

  saveShift: defineAction({
    accept: "form",
    input: z.object({
      branchId: uuid,
      id: uuid.optional(),
      name: name(40, "Ingresa el nombre del turno"),
      start: time,
      end: time,
      tone,
    }).refine((s) => s.start !== s.end, { message: "La hora de fin no puede ser igual a la de inicio", path: ["end"] }),
    handler: async ({ branchId, id, name, start, end, tone }, context) => {
      const sb = db(context);
      const fields = { name, start_time: start, end_time: end, tone };
      const { error } = id
        ? await sb.from("shifts").update(fields).eq("id", id).select("id").single()
        : await sb.from("shifts").insert({ branch_id: branchId, ...fields }).select("id").single();
      check(error, `Ya hay un turno llamado «${name}» en esta sucursal.`);
      return { ok: true };
    },
  }),

  /** Quita un turno. Se archiva: las ventas y los gastos viejos siguen mostrando su nombre. */
  deleteShift: defineAction({
    accept: "form",
    input: z.object({ id: uuid }),
    handler: async ({ id }, context) => {
      const sb = db(context);
      const { data: shift, error } = await sb.from("shifts").select("branch_id").eq("id", id).is("archived_at", null).single();
      check(error);
      const [{ count: active }, { count: open }] = await Promise.all([
        sb.from("shifts").select("id", { count: "exact", head: true }).eq("branch_id", shift!.branch_id).is("archived_at", null),
        sb.from("shift_closes").select("id", { count: "exact", head: true }).eq("shift_id", id).eq("status", "en-curso"),
      ]);
      if ((active ?? 0) <= 1) throw new ActionError({ code: "BAD_REQUEST", message: "La sucursal necesita al menos un turno." });
      if ((open ?? 0) > 0) throw new ActionError({ code: "BAD_REQUEST", message: "Cierra el turno antes de quitarlo." });
      check((await sb.from("shifts").update({ archived_at: new Date().toISOString() }).eq("id", id).select("id").single()).error);
      check((await sb.from("employees").update({ shift_id: null }).eq("shift_id", id)).error);
      return { ok: true };
    },
  }),

  openShift: defineAction({
    accept: "form",
    input: z.object({ branchId: uuid, shiftId: uuid, opening: money }),
    handler: async ({ branchId, shiftId, opening }, context) => {
      const { error } = await db(context)
        .from("shift_closes")
        .insert({ branch_id: branchId, shift_id: shiftId, opening, opened_by: context.locals.userId! });
      check(error, "Ese turno ya está abierto o ya se abrió hoy.");
      return { ok: true };
    },
  }),

  closeShift: defineAction({
    accept: "form",
    input: z.object({ closeId: uuid, counted: money }),
    handler: async ({ closeId, counted }, context) => {
      const { error } = await db(context)
        .from("shift_closes")
        .update({ status: "cerrado", counted })
        .eq("id", closeId)
        .select("id")
        .single();
      check(error);
      return { ok: true };
    },
  }),

  // Ventas y gastos --------------------------------------------------------

  registerSale: defineAction({
    input: z.object({
      branchId: uuid,
      shiftId: uuid,
      items: z
        .array(z.object({ productId: uuid, qty: z.number().int().min(1).max(10_000) }))
        .min(1, "La venta no tiene productos")
        .max(200),
    }),
    handler: async ({ branchId, shiftId, items }, context) => {
      const { data, error } = await db(context).rpc("register_sale", { p_branch: branchId, p_shift: shiftId, p_items: items });
      check(error);
      return { id: data };
    },
  }),

  createExpense: defineAction({
    accept: "form",
    input: z.object({
      branchId: uuid,
      shiftId: uuid,
      concept: name(120, "Ingresa el concepto"),
      category: name(40, "Ingresa la categoría"),
      amount: z.coerce.number({ error: "Ingresa un monto" }).positive("El monto debe ser mayor a cero").max(9_999_999),
    }),
    handler: async ({ branchId, shiftId, ...fields }, context) => {
      const { error } = await db(context)
        .from("expenses")
        .insert({ branch_id: branchId, shift_id: shiftId, recorded_by: context.locals.userId!, ...fields });
      check(error);
      return { ok: true };
    },
  }),

  // Catálogo ---------------------------------------------------------------

  saveCategory: defineAction({
    input: z.object({ businessId: uuid, id: uuid.optional(), name: name(40, "Escribe un nombre") }),
    handler: async ({ businessId, id, name }, context) => {
      const sb = db(context);
      const duplicate = `Ya existe la categoría «${name}».`;
      if (id) {
        const { error } = await sb.from("categories").update({ name }).eq("id", id).select("id").single();
        check(error, duplicate);
        return { id, name };
      }
      const { data, error } = await sb.from("categories").insert({ business_id: businessId, name }).select("id, name").single();
      check(error, duplicate);
      return data!;
    },
  }),

  deleteCategory: defineAction({
    input: z.object({ id: uuid }),
    handler: async ({ id }, context) => {
      // Sus productos quedan «Sin categoría» (on delete set null).
      const { error } = await db(context).from("categories").delete().eq("id", id);
      check(error);
      return { ok: true };
    },
  }),

  moveProduct: defineAction({
    input: z.object({ productId: uuid, categoryId: uuid.nullable() }),
    handler: async ({ productId, categoryId }, context) => {
      const { error } = await db(context).from("products").update({ category_id: categoryId }).eq("id", productId).select("id").single();
      check(error);
      return { ok: true };
    },
  }),

  saveProduct: defineAction({
    accept: "form",
    input: z.object({
      businessId: uuid,
      id: uuid.optional(),
      name: name(80, "Ingresa el nombre del producto"),
      categoryId: uuid.optional().or(z.literal("").transform(() => undefined)),
      barcode: optional.pipe(z.string().regex(/^\d{6,14}$/, "El código de barras solo lleva números (6 a 14)").optional()),
      image: imageFile,
      removeImage: z.coerce.boolean().default(false),
    }),
    handler: async ({ businessId, id, name, categoryId, barcode, image, removeImage }, context) => {
      const sb = db(context);
      const fields = { name, category_id: categoryId ?? null, barcode: barcode ?? null };
      const duplicate = "Ya tienes otro producto con ese código de barras.";
      const saved = id
        ? await sb.from("products").update(fields).eq("id", id).select("id, image_path").single()
        : await sb.from("products").insert({ business_id: businessId, ...fields }).select("id, image_path").single();
      check(saved.error, duplicate);
      const product = saved.data!;

      if (image && image.size > 0) {
        const path = `${businessId}/${product.id}.${extension(image.type)}`;
        const upload = await sb.storage.from("product-images").upload(path, image, { upsert: true, contentType: image.type });
        if (upload.error) throw new ActionError({ code: "BAD_REQUEST", message: "No se pudo subir la foto. Intenta de nuevo." });
        if (product.image_path && product.image_path !== path) await sb.storage.from("product-images").remove([product.image_path]);
        check((await sb.from("products").update({ image_path: path }).eq("id", product.id)).error);
      } else if (removeImage && product.image_path) {
        await sb.storage.from("product-images").remove([product.image_path]);
        check((await sb.from("products").update({ image_path: null }).eq("id", product.id)).error);
      }
      return { id: product.id };
    },
  }),

  deleteProduct: defineAction({
    accept: "form",
    input: z.object({ id: uuid }),
    handler: async ({ id }, context) => {
      const sb = db(context);
      const { data, error } = await sb.from("products").delete().eq("id", id).select("image_path").single();
      if (error?.code === "23503")
        throw new ActionError({ code: "CONFLICT", message: "Este producto ya tiene ventas. Quítalo del inventario de cada sucursal en vez de borrarlo." });
      check(error);
      if (data?.image_path) await sb.storage.from("product-images").remove([data.image_path]);
      return { ok: true };
    },
  }),

  // Inventario -------------------------------------------------------------

  saveInventory: defineAction({
    accept: "form",
    input: z.object({ businessId: uuid, branchId: uuid, productId: uuid, price: money, stock: count, minStock: count }),
    handler: async ({ businessId, branchId, productId, price, stock, minStock }, context) => {
      const { error } = await db(context)
        .from("inventory")
        .upsert({ business_id: businessId, branch_id: branchId, product_id: productId, price, stock, min_stock: minStock })
        .select("product_id")
        .single();
      check(error);
      return { ok: true };
    },
  }),

  removeInventory: defineAction({
    accept: "form",
    input: z.object({ branchId: uuid, productId: uuid }),
    handler: async ({ branchId, productId }, context) => {
      const { error } = await db(context).from("inventory").delete().eq("branch_id", branchId).eq("product_id", productId);
      check(error);
      return { ok: true };
    },
  }),

  // Empleados --------------------------------------------------------------

  inviteEmployee: defineAction({
    accept: "form",
    input: z.object({
      businessId: uuid,
      branchId: uuid,
      shiftId: z.uuid("Elige un turno"),
      email: z.email("Ingresa un correo válido").trim().toLowerCase(),
      jobTitle: name(60, "Escribe el puesto"),
    }),
    handler: async ({ businessId, branchId, shiftId, email, jobTitle }, context) => {
      const sb = db(context);
      const { data: shift } = await sb.from("shifts").select("branch_id").eq("id", shiftId).single();
      if (shift?.branch_id !== branchId)
        throw new ActionError({ code: "BAD_REQUEST", message: "Ese turno es de otra sucursal. Elige uno de la sucursal seleccionada." });
      // La base exige que el correo tenga cuenta y deja la invitación pendiente hasta que la persona la acepte.
      // shortcut: el aviso llega solo a la bandeja de la app, no por correo.
      const { error } = await sb
        .from("employees")
        .insert({
          business_id: businessId,
          branch_id: branchId,
          shift_id: shiftId,
          email,
          job_title: jobTitle,
        })
        .select("id")
        .single();
      check(error, "Esa persona ya está en tu equipo.");
      return { ok: true };
    },
  }),

  /** Sugerencias de cuentas al escribir el correo de quien se invita. La base acota quién puede buscar y qué ve. */
  searchPeople: defineAction({
    input: z.object({ businessId: uuid, query: z.string().trim().max(120), page: z.number().int().min(1).max(1000).default(1) }),
    handler: async ({ businessId, query, page }, context) => {
      if (query.length < 3) return { people: [], total: 0, page };
      const { data, error } = await db(context).rpc("search_people", { p_business: businessId, p_query: query, p_page: page });
      check(error);
      return {
        // La base devuelve 5 por página y el total en cada fila.
        people: (data ?? []).map((p) => ({
          email: p.email,
          name: `${p.first_name} ${p.last_name}`.trim(),
          avatarUrl: p.avatar_url ?? undefined,
        })),
        total: Number(data?.[0]?.total ?? 0),
        page,
      };
    },
  }),

  respondInvitation: defineAction({
    accept: "form",
    input: z.object({ employeeId: uuid, accept: z.enum(["true", "false"]).transform((v) => v === "true") }),
    handler: async ({ employeeId, accept }, context) => {
      const { error } = await db(context).rpc("respond_invitation", { p_employee: employeeId, p_accept: accept });
      check(error);
      return { ok: true };
    },
  }),

  markNotificationsRead: defineAction({
    accept: "form",
    handler: async (_input, context) => {
      const { error } = await db(context).from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
      check(error);
      return { ok: true };
    },
  }),

  removeEmployee: defineAction({
    accept: "form",
    input: z.object({ id: uuid }),
    handler: async ({ id }, context) => {
      const { error } = await db(context).from("employees").delete().eq("id", id);
      check(error);
      return { ok: true };
    },
  }),

  // Tu cuenta --------------------------------------------------------------

  saveProfile: defineAction({
    accept: "form",
    input: z.object({
      firstName: name(60, "Ingresa tu nombre"),
      lastName: z.string().trim().max(60, "Máximo 60 caracteres").default(""),
      image: imageFile,
      removeImage: z.coerce.boolean().default(false),
    }),
    handler: async ({ firstName, lastName, image, removeImage }, context) => {
      const sb = db(context);
      const userId = context.locals.userId!;
      const bucket = sb.storage.from("avatars");
      const { data: profile, error } = await sb.from("profiles").select("avatar_url").eq("id", userId).single();
      check(error);
      // Solo se borra la foto anterior si es de nuestro bucket (la de Google no es nuestra).
      const marker = "/object/public/avatars/";
      const oldPath = profile!.avatar_url?.includes(marker) ? profile!.avatar_url.split(marker)[1] : undefined;

      let avatarUrl = profile!.avatar_url;
      if (image && image.size > 0) {
        // Nombre nuevo en cada cambio: así ningún navegador ni CDN muestra la foto vieja.
        const path = `${userId}/${Date.now()}.${extension(image.type)}`;
        const upload = await bucket.upload(path, image, { contentType: image.type });
        if (upload.error) throw new ActionError({ code: "BAD_REQUEST", message: "No se pudo subir la foto. Intenta de nuevo." });
        avatarUrl = bucket.getPublicUrl(path).data.publicUrl;
      } else if (removeImage) {
        avatarUrl = null;
      }

      check((await sb.from("profiles").update({ first_name: firstName, last_name: lastName, avatar_url: avatarUrl }).eq("id", userId)).error);
      if (oldPath && avatarUrl !== profile!.avatar_url) await bucket.remove([oldPath]);
      return { ok: true };
    },
  }),

  changePassword: defineAction({
    accept: "form",
    input: z
      .object({
        password: z.string().min(8, "Usa al menos 8 caracteres").max(72, "Máximo 72 caracteres"),
        confirm: z.string(),
      })
      .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden", path: ["confirm"] }),
    handler: async ({ password }, context) => {
      const { error } = await db(context).auth.updateUser({ password });
      if (error?.code === "same_password") throw new ActionError({ code: "BAD_REQUEST", message: "Es la misma contraseña que ya tienes." });
      if (error?.code === "weak_password") throw new ActionError({ code: "BAD_REQUEST", message: "La contraseña es muy débil. Prueba con una más larga." });
      if (error?.code === "reauthentication_needed")
        throw new ActionError({ code: "FORBIDDEN", message: "Por seguridad, cierra sesión, vuelve a entrar y cámbiala enseguida." });
      if (error) {
        console.error(error);
        throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo cambiar la contraseña. Intenta de nuevo." });
      }
      return { ok: true };
    },
  }),

  enrollTotp: defineAction({
    handler: async (_input, context) => {
      const { auth } = db(context);
      // Un intento anterior que no se terminó deja un factor sin verificar: se limpia antes de empezar otro.
      const { data: factors } = await auth.mfa.listFactors();
      for (const f of factors?.all ?? []) if (f.factor_type === "totp" && f.status === "unverified") await auth.mfa.unenroll({ factorId: f.id });

      const { data, error } = await auth.mfa.enroll({ factorType: "totp", friendlyName: `Caja Simple ${new Date().toISOString().slice(0, 10)}` });
      if (error || !data) {
        console.error(error);
        throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo empezar la activación. Intenta de nuevo." });
      }
      return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
    },
  }),

  verifyTotp: defineAction({
    accept: "form",
    input: z.object({ factorId: uuid, code: totpCode }),
    handler: async ({ factorId, code }, context) => {
      await verifyCode(db(context), factorId, code);
      return { ok: true };
    },
  }),

  disableTotp: defineAction({
    accept: "form",
    input: z.object({ factorId: uuid, code: totpCode }),
    handler: async ({ factorId, code }, context) => {
      const sb = db(context);
      // Pedir el código evita que alguien con tu sesión abierta la desactive sin tu teléfono.
      await verifyCode(sb, factorId, code);
      const { error } = await sb.auth.mfa.unenroll({ factorId });
      if (error) {
        console.error(error);
        throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo desactivar. Intenta de nuevo." });
      }
      return { ok: true };
    },
  }),

  savePushSubscription: defineAction({
    input: z.object({ endpoint: z.url().startsWith("https://"), p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
    handler: async (subscription, context) => {
      const sb = db(context);
      // Si el mismo navegador ya estaba suscrito con otra cuenta, pasa a esta.
      const { error } = await sb.from("push_subscriptions").upsert({ ...subscription, user_id: context.locals.userId! }, { onConflict: "endpoint" });
      check(error);
      return { ok: true };
    },
  }),

  deletePushSubscription: defineAction({
    input: z.object({ endpoint: z.string() }),
    handler: async ({ endpoint }, context) => {
      check((await db(context).from("push_subscriptions").delete().eq("endpoint", endpoint)).error);
      return { ok: true };
    },
  }),
};
