import type { APIRoute } from "astro";
import { rateLimit } from "@/lib/cache";
import { authResponse } from "@/lib/auth";
import { safeNext } from "@/middleware";

/** Segundo paso del acceso: el código de 6 dígitos de la app de autenticación. */
export const POST: APIRoute = async ({ request, locals, url }) => {
  const next = safeNext(url.searchParams.get("next"));
  const back = `/auth/verificar?next=${encodeURIComponent(next)}`;
  if (!locals.userId) return authResponse(request, { back: "/auth/iniciar-sesion", message: "Tu sesión terminó. Vuelve a entrar." });

  const code = String((await request.formData()).get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return authResponse(request, { back, message: "Escribe los 6 números que muestra tu app." });

  // 6 dígitos se adivinan a fuerza bruta sin un límite.
  if (!(await rateLimit(`totp:${locals.userId}`, 5, 5 * 60))) return authResponse(request, { back, message: "Demasiados intentos. Espera unos minutos y vuelve a intentar." });

  const { data } = await locals.supabase.auth.mfa.listFactors();
  const factor = data?.totp[0];
  if (!factor) return authResponse(request, { back, redirect: next });

  const { error } = await locals.supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return authResponse(request, { back, message: "El código no es correcto o ya venció. Prueba con el que se ve ahora." });
  return authResponse(request, { back, redirect: next });
};
