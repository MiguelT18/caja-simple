import type { APIRoute } from "astro";
import { needsSecondFactor, verifyHref } from "@/lib/auth";
import { safeNext } from "@/middleware";

/** Vuelta de Google y de los enlaces de confirmación de correo (flujo PKCE). */
export const GET: APIRoute = async ({ locals, url, redirect }) => {
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const next = safeNext(url.searchParams.get("next"));
      return redirect((await needsSecondFactor(locals.supabase)) ? verifyHref(next) : next, 303);
    }
  }
  return redirect(`/auth/iniciar-sesion?error=${encodeURIComponent("El enlace venció o ya se usó. Inicia sesión de nuevo.")}`, 303);
};
