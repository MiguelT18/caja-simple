import type { APIRoute } from "astro";
import { authMessage, authResponse, needsSecondFactor, verifyHref } from "@/lib/auth";
import { safeNext } from "@/middleware";

export const POST: APIRoute = async ({ request, locals, url }) => {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const back = "/auth/iniciar-sesion";
  if (!email || !password) return authResponse(request, { back, message: "Ingresa tu correo y tu contraseña." });

  const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
  if (error) return authResponse(request, { back, message: authMessage(error) });
  const next = safeNext(url.searchParams.get("next"));
  return authResponse(request, { back, redirect: (await needsSecondFactor(locals.supabase)) ? verifyHref(next) : next });
};
