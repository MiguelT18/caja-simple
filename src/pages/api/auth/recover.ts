import type { APIRoute } from "astro";
import { rateLimit } from "@/lib/cache";
import { authResponse } from "@/lib/auth";

/** Pide el enlace para crear una contraseña nueva. Responde lo mismo exista o no la cuenta. */
export const POST: APIRoute = async ({ request, locals, url, clientAddress }) => {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const back = "/auth/recuperar";
  if (!email) return authResponse(request, { back, message: "Ingresa tu correo." });

  // Cada pedido manda un correo: límite por IP y por correo, como en el login.
  const allowed = (await rateLimit(`recover:ip:${clientAddress}`, 5, 15 * 60)) && (await rateLimit(`recover:email:${email}`, 3, 60 * 60));
  if (!allowed) return authResponse(request, { back, message: "Demasiados intentos. Espera unos minutos y vuelve a intentar." });

  // El enlace vuelve por /api/auth/callback (PKCE), que abre la sesión y lleva a elegir la contraseña nueva.
  const redirectTo = `${url.origin}/api/auth/callback?next=${encodeURIComponent("/auth/nueva-contrasena")}`;
  const { error } = await locals.supabase.auth.resetPasswordForEmail(email, { redirectTo });
  // Un error (correo inexistente, límite de Supabase) no se muestra: diría qué cuentas existen.
  if (error) console.error(JSON.stringify({ level: "error", source: "recover", code: error.code, message: error.message }));
  return authResponse(request, { back, redirect: `${back}?enviado=1` });
};
