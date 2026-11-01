import { defineMiddleware } from "astro:middleware";
import { loadSession } from "./data/queries";
import { needsSecondFactor, verifyHref } from "./lib/auth";
import { createSupabase } from "./lib/supabase";

/** Solo acepta rutas internas como destino después de entrar (evita redirecciones abiertas). */
export const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/app");

export const onRequest = defineMiddleware(async (context, next) => {
  // Las páginas prerenderizadas (la landing) no tienen petición real.
  if (context.isPrerendered) return next();

  const cacheHeaders = new Headers();
  const supabase = createSupabase({ request: context.request, cookies: context.cookies, headers: cacheHeaders });
  context.locals.supabase = supabase;

  // getClaims valida el JWT; getSession no sirve para autorizar en el servidor.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub ?? null;
  context.locals.userId = userId;

  const { pathname, search } = context.url;
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    if (!userId) return context.redirect(`/auth/iniciar-sesion?next=${encodeURIComponent(pathname + search)}`);
    // Sin el código, RLS (private.mfa_ok) no le deja leer nada: mejor pedirlo antes.
    if (await needsSecondFactor(supabase)) return context.redirect(verifyHref(pathname + search));
    context.locals.session = await loadSession(supabase, userId);
  } else if (pathname.startsWith("/auth/") && pathname !== "/auth/verificar" && userId) {
    return context.redirect(safeNext(context.url.searchParams.get("next")));
  }

  const response = await next();
  cacheHeaders.forEach((value, key) => response.headers.set(key, value));
  return response;
});
