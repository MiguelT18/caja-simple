import type { APIRoute } from "astro";
import { rateLimit } from "@/lib/cache";
import { authMessage, authResponse, needsSecondFactor, verifyHref } from "@/lib/auth";
import { safeNext } from "@/middleware";

export const POST: APIRoute = async ({ request, locals, url, clientAddress }) => {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const back = "/auth/iniciar-sesion";
  if (!email || !password) return authResponse(request, { back, message: "Ingresa tu correo y tu contraseña." });

  // Supabase ve la IP de Vercel, no la de la persona: el límite por IP y por correo va aquí.
  const allowed = (await rateLimit(`login:ip:${clientAddress}`, 10, 5 * 60)) && (await rateLimit(`login:email:${email.toLowerCase()}`, 10, 15 * 60));
  if (!allowed) return authResponse(request, { back, message: "Demasiados intentos. Espera unos minutos y vuelve a intentar." });

  const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
  if (error) return authResponse(request, { back, message: authMessage(error) });
  const next = safeNext(url.searchParams.get("next"));
  return authResponse(request, { back, redirect: (await needsSecondFactor(locals.supabase)) ? verifyHref(next) : next });
};
