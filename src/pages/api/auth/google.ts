import type { APIRoute } from "astro";
import { safeNext } from "@/middleware";

export const POST: APIRoute = async ({ locals, url, redirect }) => {
  const next = safeNext(url.searchParams.get("next"));
  const { data, error } = await locals.supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${url.origin}/api/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) {
    return redirect(`/auth/iniciar-sesion?error=${encodeURIComponent("El acceso con Google todavía no está disponible.")}`, 303);
  }
  return redirect(data.url, 303);
};
