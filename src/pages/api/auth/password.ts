import type { APIRoute } from "astro";
import { authMessage, authResponse } from "@/lib/auth";

/** Guarda la contraseña nueva de quien llegó por el enlace de recuperar (ya tiene sesión). */
export const POST: APIRoute = async ({ request, locals }) => {
  const back = "/auth/nueva-contrasena";
  if (!locals.userId) return authResponse(request, { back: "/auth/iniciar-sesion", message: "El enlace venció o ya se usó. Pide uno nuevo." });
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  if (password.length < 8 || password.length > 72) return authResponse(request, { back, message: "Usa entre 8 y 72 caracteres." });
  if (password !== form.get("passwordConfirm")) return authResponse(request, { back, message: "Las contraseñas no coinciden." });

  const { error } = await locals.supabase.auth.updateUser({ password });
  if (error) return authResponse(request, { back, message: authMessage(error) });
  return authResponse(request, { back, redirect: "/app" });
};
