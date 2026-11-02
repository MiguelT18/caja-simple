import type { APIRoute } from "astro";
import { rateLimit } from "@/lib/cache";
import { authMessage, authResponse } from "@/lib/auth";

export const POST: APIRoute = async ({ request, locals, url, clientAddress }) => {
  const form = await request.formData();
  const firstName = String(form.get("firstName") ?? "").trim();
  const lastName = String(form.get("lastName") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const back = "/auth/crear-cuenta";
  if (!firstName || !lastName || !email) return authResponse(request, { back, message: "Completa todos los campos." });
  if (password.length < 8) return authResponse(request, { back, message: "La contraseña debe tener al menos 8 caracteres." });

  if (!(await rateLimit(`signup:ip:${clientAddress}`, 5, 60 * 60))) return authResponse(request, { back, message: "Demasiados intentos. Espera unos minutos y vuelve a intentar." });

  const { data, error } = await locals.supabase.auth.signUp({
    email,
    password,
    options: {
      // Solo para mostrar el nombre; nunca se usa para autorizar.
      data: { first_name: firstName, last_name: lastName },
      emailRedirectTo: `${url.origin}/api/auth/callback`,
    },
  });
  if (error) return authResponse(request, { back, message: authMessage(error) });
  // Con confirmación de correo activa no hay sesión todavía.
  if (!data.session) return authResponse(request, { back, message: `Te enviamos un correo a ${email}. Ábrelo para confirmar tu cuenta y entrar.` });
  return authResponse(request, { back, redirect: "/app" });
};
