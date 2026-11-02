import { getActionContext } from "astro:actions";
import { defineMiddleware } from "astro:middleware";
import { bump, businessVersion, userVersion } from "./lib/cache";
import { loadSession } from "./data/queries";
import { needsSecondFactor, verifyHref } from "./lib/auth";
import { createSupabase } from "./lib/supabase";

/** Solo acepta rutas internas como destino después de entrar (evita redirecciones abiertas). */
export const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/app");

/** Acciones que solo tocan datos que nunca van a la caché (caja, stock, avisos, seguridad): no la invalidan. */
const LIVE_ACTIONS = new Set([
  "registerSale",
  "createExpense",
  "openShift",
  "closeShift",
  "markNotificationsRead",
  "deleteNotification",
  "clearNotifications",
  "savePushSubscription",
  "deletePushSubscription",
  "searchPeople",
  "enrollTotp",
  "verifyTotp",
  "disableTotp",
  "changePassword",
]);

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

  // Toda otra acción invalida la caché de la persona y de cada negocio que veía antes o ve después de escribir
  // (así cubre negocios nuevos y borrados, y llega a las demás personas del negocio).
  const { action } = getActionContext(context);
  const invalidates = userId && action && !LIVE_ACTIONS.has(action.name);
  const businessIds = async () => ((await supabase.from("businesses").select("id")).data ?? []).map((b) => b.id);
  const before = invalidates ? await businessIds() : [];

  const response = await next();
  if (invalidates) await bump(userVersion(userId), ...[...before, ...(await businessIds())].map(businessVersion));
  cacheHeaders.forEach((value, key) => response.headers.set(key, value));
  return response;
});
