// Negocio y sucursales.
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { defaultShifts } from "@/data/session";
import { check, confirmName, db, freeSlug, imageFile, kind, name, shiftList, shiftsFrom, slugify, storeImage, uuid } from "./shared";

export const businesses = {
  createBusiness: defineAction({
    accept: "form",
    input: z.object({
      name: name(80, "Ingresa el nombre del negocio"),
      branchName: name(80, "Ingresa el nombre de la sucursal"),
      branchAddress: z.string().trim().max(160).nullable().transform((v) => v ?? ""),
      kind,
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
          p_kind: input.kind,
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
        await storeImage(sb, "branches", businessId, data!, image, removeImage);
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
      await storeImage(sb, "branches", businessId, { id: data!.id, image_path: null }, image, false);
      return { id: data!.id, slug };
    },
  }),

  saveBusiness: defineAction({
    accept: "form",
    input: z.object({ id: uuid, name: name(80, "Ingresa el nombre del negocio"), kind }),
    handler: async ({ id, name, kind }, context) => {
      // El slug no cambia: los enlaces guardados siguen funcionando.
      const { error } = await db(context).from("businesses").update({ name, kind }).eq("id", id).select("id").single();
      check(error);
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
};
