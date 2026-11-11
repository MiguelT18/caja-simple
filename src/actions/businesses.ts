// Negocio y sucursales.
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { brandKeys } from "@/data/brand";
import { defaultShifts } from "@/data/session";
import { check, confirmName, db, freeSlug, imageFile, kind, limit, name, removeBusinessPhotos, shiftList, shiftsFrom, slugify, storeImage, uuid, uploadLimit } from "./shared";

// Descripción del negocio (obligatoria), si aparece en Buscar (la casilla sin marcar no llega: queda en false) y su color.
const profile = {
  description: z.string({ error: "Cuenta en una o dos frases a qué se dedica tu negocio" }).trim().min(10, "Cuenta en una o dos frases a qué se dedica tu negocio").max(400, "Usa 400 caracteres o menos"),
  listed: z.coerce.boolean().default(false),
  color: z.enum(brandKeys, { error: "Elige uno de los colores" }).default("ambar"),
};

// El negocio ya existe: si una foto no sube, se entra igual (reintentar crearía otro) y se agrega en Configuración.
async function storePhotos(sb: ReturnType<typeof db>, slug: string, logo?: File, facade?: File) {
  if (!logo?.size && !facade?.size) return;
  try {
    const { data } = await sb.from("businesses").select("id").eq("slug", slug).single();
    if (!data) return;
    const { id } = data;
    await storeImage(sb, "businesses", id, { id, image_path: null }, logo, false);
    if (!facade?.size) return;
    const { data: branch } = await sb.from("branches").select("id, image_path").eq("business_id", id).single();
    if (branch) await storeImage(sb, "branches", id, branch, facade, false);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", source: "createBusiness.photos", message: String(error) }));
  }
}

/** Une las filas de «Tu equipo» y las valida antes de crear nada; los errores van al aviso del formulario. */
export function invitesFrom(
  input: { invitePerson: string[]; invitePersonId: string[]; inviteJob: string[]; inviteShift: string[] },
  shiftNames: string[],
) {
  const fail = (message: string): never => {
    throw new ActionError({ code: "BAD_REQUEST", message });
  };
  const seen = new Set<string>();
  return input.invitePerson.map((person, i) => {
    // Elegida entre las sugerencias por su nombre: se invita por la cuenta. Si no, lo escrito tiene que ser un correo.
    const personId = uuid.safeParse(input.invitePersonId[i]).success ? input.invitePersonId[i] : null;
    const email = personId ? "" : person.toLowerCase();
    const job = input.inviteJob[i] ?? "";
    const shift = input.inviteShift[i] ?? "";
    const who = `Persona ${i + 1}`;
    if (!personId && !z.email().safeParse(email).success) fail(`${who}: elígela de la lista o escribe su correo completo.`);
    if (seen.has(personId ?? email)) fail(`Invitaste dos veces a ${person}.`);
    if (!job) fail(`${who}: escribe el puesto.`);
    if (job.length > 60) fail(`${who}: el puesto es muy largo (máximo 60 caracteres).`);
    if (!shiftNames.includes(shift)) fail(`${who}: elige uno de los turnos de la sucursal.`);
    seen.add(personId ?? email);
    return { personId, email, job, shift };
  });
}

// Como storePhotos: el negocio ya existe, una invitación que falla se vuelve a mandar desde Empleados. Una por una:
// la base rechaza algunas (invitarte a ti misma) y no tienen que arrastrar a las demás.
// shortcut: el fallo solo queda en el log, no se avisa en la página (se redirige); si pasa seguido, devolverlo en la respuesta.
async function inviteTeam(sb: ReturnType<typeof db>, slug: string, invites: ReturnType<typeof invitesFrom>) {
  if (!invites.length) return;
  const { data: business } = await sb.from("businesses").select("id, branches(id, shifts(id, name))").eq("slug", slug).single();
  const branch = business?.branches[0];
  if (!business || !branch) return;
  for (const v of invites) {
    const { error } = await sb.from("employees").insert({
      business_id: business.id,
      branch_id: branch.id,
      shift_id: branch.shifts.find((s) => s.name === v.shift)!.id,
      ...(v.personId ? { person_id: v.personId, email: "" } : { email: v.email }),
      job_title: v.job,
    });
    if (error) console.error(JSON.stringify({ level: "error", source: "createBusiness.invites", code: error.code, message: error.message }));
  }
}

export const businesses = {
  createBusiness: defineAction({
    accept: "form",
    input: z.object({
      name: name(80, "Ingresa el nombre del negocio"),
      branchName: name(80, "Ingresa el nombre de la sucursal"),
      branchAddress: z.string().trim().max(160).nullable().transform((v) => v ?? ""),
      kind,
      ...profile,
      image: imageFile,
      branchImage: imageFile,
      ...shiftList,
      // Equipo opcional del primer negocio: lo escrito (nombre o correo), la cuenta elegida entre las sugerencias, el
      // puesto y el nombre del turno (los turnos aún no tienen id).
      invitePerson: z.array(z.string().trim()).max(10, "Invita hasta 10 personas por ahora; el resto, desde Empleados.").default([]),
      invitePersonId: z.array(z.string().trim()).default([]),
      inviteJob: z.array(z.string().trim()).default([]),
      inviteShift: z.array(z.string().trim()).default([]),
    }),
    handler: async (input, context) => {
      await uploadLimit(context, input.image, input.branchImage);
      // Sin el editor (el diálogo de «Crear negocio»), la sucursal arranca con los turnos de siempre.
      const shifts = input.shiftName.length ? shiftsFrom(input) : defaultShifts;
      const invites = invitesFrom(input, shifts.map((s) => s.name));
      // Cada invitación a un correo sin cuenta manda un correo: el mismo límite que en Empleados.
      for (const _ of invites) await limit(context, "invite", 10, 60 * 60);
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
          p_shifts: shifts,
          p_kind: input.kind,
          p_description: input.description,
          p_listed: input.listed,
        });
        if (!error) {
          // create_business no recibe el color: se guarda aparte (ámbar es el default de la columna).
          if (input.color !== "ambar") check((await sb.from("businesses").update({ color: input.color }).eq("slug", slug)).error);
          await storePhotos(sb, slug, input.image, input.branchImage);
          await inviteTeam(sb, slug, invites);
          return { slug };
        }
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
    handler: async ({ businessId, id, image, removeImage, shiftName, shiftStart, shiftEnd, ...fields }, context) => {
      await uploadLimit(context, image);
      const sb = db(context);
      if (id) {
        const { data, error } = await sb.from("branches").update(fields).eq("id", id).select("id, image_path").single();
        check(error, "Ya tienes una sucursal con ese nombre.");
        await storeImage(sb, "branches", businessId, data!, image, removeImage);
        return { id };
      }
      // Al crear, los turnos son obligatorios; al editar se cambian en Turnos.
      const shifts = shiftsFrom({ shiftName, shiftStart, shiftEnd });
      const slug = await freeSlug(slugify(fields.name), async (s) => {
        const { count } = await sb.from("branches").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("slug", s);
        return (count ?? 0) > 0;
      });
      const { data, error } = await sb.from("branches").insert({ business_id: businessId, slug, ...fields }).select("id").single();
      check(error, "Ya tienes una sucursal con ese nombre.");
      const { error: shiftsError } = await sb
        .from("shifts")
        .insert(shifts.map((s, i) => ({ branch_id: data!.id, name: s.name, start_time: s.start, end_time: s.end, tone: s.tone, position: i })));
      if (shiftsError) {
        // Sin turnos la sucursal no sirve: se deshace para que la dueña corrija y vuelva a guardar.
        await sb.from("branches").delete().eq("id", data!.id);
        check(shiftsError, "Hay dos turnos con el mismo nombre.");
      }
      await storeImage(sb, "branches", businessId, { id: data!.id, image_path: null }, image, false);
      return { id: data!.id, slug };
    },
  }),

  saveBusiness: defineAction({
    accept: "form",
    input: z.object({ id: uuid, name: name(80, "Ingresa el nombre del negocio"), kind, ...profile, image: imageFile, removeImage: z.coerce.boolean().default(false) }),
    handler: async ({ id, name, kind, description, listed, color, image, removeImage }, context) => {
      await uploadLimit(context, image);
      const sb = db(context);
      // El slug no cambia: los enlaces guardados siguen funcionando.
      const { data, error } = await sb.from("businesses").update({ name, kind, description, listed, color }).eq("id", id).select("id, image_path").single();
      check(error);
      await storeImage(sb, "businesses", id, data!, image, removeImage);
      return { id };
    },
  }),

  deleteBranch: defineAction({
    accept: "form",
    input: z.object({ id: uuid, confirm: z.string().trim().nullish().transform((v) => v ?? "") }),
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
    input: z.object({ id: uuid, confirm: z.string().trim().nullish().transform((v) => v ?? "") }),
    handler: async ({ id, confirm }, context) => {
      const sb = db(context);
      const { data, error } = await sb.from("businesses").select("name").eq("id", id).single();
      check(error);
      confirmName(confirm, data!.name);
      await removeBusinessPhotos(sb, id);
      check((await sb.from("businesses").delete().eq("id", id).select("id").single()).error);
      return { ok: true };
    },
  }),
};
