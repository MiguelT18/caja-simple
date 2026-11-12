import type { APIRoute } from "astro";
import type { EmailOtpType } from "@supabase/supabase-js";
import { claimReferral, needsSecondFactor, verifyHref } from "@/lib/auth";
import { safeNext } from "@/middleware";

/**
 * Vuelta de Google y de los enlaces de los correos. Con `code`, flujo PKCE (Google, confirmar, recuperar).
 * Con `token_hash`, la invitación a quien no tenía cuenta: la manda el servidor (send-invite), que no puede usar
 * PKCE, y la plantilla «Invite user» enlaza aquí con `type=invite`.
 */
export const GET: APIRoute = async ({ locals, url, redirect, cookies }) => {
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const { error } = code
    ? await locals.supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type === "invite"
      ? await locals.supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })
      : { error: true };
  if (!error) {
    await claimReferral(locals.supabase, cookies);
    // Al aceptar una invitación, primero elige su contraseña.
    const next = type === "invite" ? "/auth/nueva-contrasena" : safeNext(url.searchParams.get("next"));
    return redirect((await needsSecondFactor(locals.supabase)) ? verifyHref(next) : next, 303);
  }
  return redirect(`/auth/iniciar-sesion?error=${encodeURIComponent("El enlace venció o ya se usó. Inicia sesión de nuevo.")}`, 303);
};
