// Tu cuenta: perfil, contraseña, verificación en dos pasos y avisos push.
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "astro:env/server";
import { bump, businessVersion } from "@/lib/cache";
import { notifyTeam } from "@/lib/mail";
import { check, confirmName, db, extension, imageFile, limit, name, removeBusinessPhotos, totpCode, uuid, verifyCode, uploadLimit } from "./shared";

export const account = {
  saveProfile: defineAction({
    accept: "form",
    input: z.object({
      firstName: name(60, "Ingresa tu nombre"),
      lastName: z.string().trim().max(60, "Máximo 60 caracteres").nullish().transform((v) => v ?? ""),
      image: imageFile,
      removeImage: z.coerce.boolean().default(false),
    }),
    handler: async ({ firstName, lastName, image, removeImage }, context) => {
      await uploadLimit(context, image);
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
        const upload = await bucket.upload(path, image, { contentType: image.type, cacheControl: "31536000" });
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
      await limit(context, "totp", 5, 5 * 60);
      await verifyCode(db(context), factorId, code);
      return { ok: true };
    },
  }),

  disableTotp: defineAction({
    accept: "form",
    input: z.object({ factorId: uuid, code: totpCode }),
    handler: async ({ factorId, code }, context) => {
      const sb = db(context);
      await limit(context, "totp", 5, 5 * 60);
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

  changeMyShift: defineAction({
    accept: "form",
    input: z.object({ employeeId: uuid, businessId: uuid, shiftId: z.uuid("Elige un turno") }),
    handler: async ({ employeeId, businessId, shiftId }, context) => {
      // La base comprueba que la ficha sea tuya y el turno, de tu sucursal (change_my_shift).
      check(await db(context).rpc("change_my_shift", { p_employee: employeeId, p_shift: shiftId }).then((r) => r.error));
      await bump(businessVersion(businessId));
      return { ok: true };
    },
  }),

  /** Borra la cuenta, sus negocios con todo su historial y sus fotos. Pide el correo y, si tiene, la contraseña. */
  deleteAccount: defineAction({
    accept: "form",
    input: z.object({ email: z.string().trim(), password: z.string().nullish() }),
    handler: async ({ email, password }, context) => {
      const sb = db(context);
      await limit(context, "delete-account", 5, 15 * 60);
      const { data: auth } = await sb.auth.getUser();
      const user = auth.user!;
      confirmName(email, user.email ?? "");
      if (user.identities?.some((i) => i.provider === "email")) {
        // Un cliente aparte: iniciar sesión en el de la persona reemplazaría su sesión (y su segundo paso).
        const verifier = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
        const { error } = await verifier.auth.signInWithPassword({ email: user.email!, password: password ?? "" });
        if (error) throw new ActionError({ code: "BAD_REQUEST", message: "La contraseña no es correcta." });
      }

      const owned = await sb.from("businesses").select("id").eq("owner_id", user.id);
      check(owned.error);
      for (const { id } of owned.data!) await removeBusinessPhotos(sb, id);
      const { data: avatars } = await sb.storage.from("avatars").list(user.id, { limit: 100 });
      if (avatars?.length) await sb.storage.from("avatars").remove(avatars.map((f) => `${user.id}/${f.name}`));

      check((await sb.rpc("delete_my_account")).error);
      await sb.auth.signOut({ scope: "local" });
      return { ok: true };
    },
  }),

  /** Ayuda y comentarios (/app/ayuda): se guarda en feedback y, si está configurado, nos llega por correo. */
  sendFeedback: defineAction({
    accept: "form",
    input: z.object({
      kind: z.enum(["duda", "problema", "sugerencia"], { error: "Elige de qué se trata" }),
      message: z.string().trim().min(10, "Cuéntanos un poco más (al menos 10 caracteres)").max(2000, "Máximo 2000 caracteres"),
      page: z.string().trim().max(300).optional(),
      // Un input de archivos vacío manda un File de 0 bytes: se descarta.
      images: z
        .array(imageFile)
        .default([])
        .transform((files) => files.filter((f): f is File => !!f && f.size > 0))
        .refine((files) => files.length <= 5, "Puedes adjuntar hasta 5 imágenes"),
    }),
    handler: async ({ kind, message, page, images }, context) => {
      await uploadLimit(context, ...images);
      await limit(context, "feedback", 5, 3600);
      const sb = db(context);
      const userId = context.locals.userId!;
      const paths = await Promise.all(
        images.map(async (image) => {
          const path = `${userId}/${crypto.randomUUID()}.${extension(image.type)}`;
          const upload = await sb.storage.from("feedback-images").upload(path, image, { contentType: image.type, cacheControl: "31536000" });
          if (upload.error) throw new ActionError({ code: "BAD_REQUEST", message: "No se pudo subir una imagen. Intenta de nuevo." });
          return path;
        }),
      );
      // shortcut: si una subida o el insert fallan, las imágenes ya subidas quedan huérfanas; limpiar a mano si crece.
      check((await sb.from("feedback").insert({ kind, message, page: page || null, images: paths })).error);

      const [{ data: user }, { data: profile }] = await Promise.all([
        sb.auth.getUser(),
        sb.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle(),
      ]);
      const who = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Alguien";
      const label = { duda: "Duda", problema: "Problema", sugerencia: "Sugerencia" }[kind];
      await notifyTeam({
        subject: `[Caja Simple] ${label} de ${who}`,
        text: `${message}\n\n${paths.length ? `Capturas (${paths.length}, bucket feedback-images):\n${paths.join("\n")}\n\n` : ""}— ${who} <${user.user?.email ?? "sin correo"}>\nPágina: ${page || "—"}\nFecha: ${new Date().toISOString()}`,
        replyTo: user.user?.email,
      });
      return { ok: true };
    },
  }),
};
