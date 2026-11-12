import type { AuthError } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";
import type { Supabase } from "./supabase";

/** Mensajes de Supabase Auth en español. Los códigos: https://supabase.com/docs/guides/auth/debugging/error-codes */
export function authMessage(error: AuthError) {
  switch (error.code) {
    case "invalid_credentials":
      return "El correo o la contraseña no son correctos.";
    case "email_not_confirmed":
      return "Todavía no confirmaste tu correo. Revisa tu bandeja de entrada.";
    case "user_already_exists":
    case "email_exists":
      return "Ya existe una cuenta con ese correo. Inicia sesión.";
    case "same_password":
      return "Esa ya es tu contraseña. Elige una distinta.";
    case "weak_password":
      return "La contraseña es muy débil. Usa al menos 8 caracteres.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
    default:
      return "No pudimos completar el acceso. Intenta de nuevo.";
  }
}

/**
 * Respuesta de los endpoints de acceso. Con JavaScript (fetch) devuelve JSON;
 * sin JavaScript (POST normal del formulario) redirige.
 */
export function authResponse(request: Request, result: { redirect?: string; message?: string; back: string }) {
  if (request.headers.get("accept")?.includes("application/json")) {
    return Response.json({ redirect: result.redirect, message: result.message }, { status: result.redirect ? 200 : 400 });
  }
  const to = result.redirect ?? `${result.back}?error=${encodeURIComponent(result.message ?? "")}`;
  return new Response(null, { status: 303, headers: { Location: to } });
}

/** Si la persona activó la verificación en dos pasos y esta sesión todavía no pasó el código. Lee la cookie, sin red. */
export async function needsSecondFactor(supabase: Supabase) {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

export const verifyHref = (next: string) => `/auth/verificar?next=${encodeURIComponent(next)}`;

/** Cookie que deja el link de un afiliado (/r/<código>) hasta que la persona crea su cuenta. */
export const REFERRAL_COOKIE = "ref";

/**
 * Si llegó con el link de un afiliado, la deja referida por él (la base decide si vale: cuenta nueva, sin pagos, no
 * es el propio afiliado). Se llama al tener sesión tras crear la cuenta; la cookie se borra pase lo que pase.
 */
export async function claimReferral(supabase: Supabase, cookies: AstroCookies) {
  const code = cookies.get(REFERRAL_COOKIE)?.value;
  if (!code) return;
  cookies.delete(REFERRAL_COOKIE, { path: "/" });
  // Un error aquí no debe impedir entrar: la atribución es secundaria.
  const { error } = await supabase.rpc("claim_referral", { p_code: code });
  if (error) console.error(JSON.stringify({ level: "error", source: "claimReferral", message: error.message }));
}
