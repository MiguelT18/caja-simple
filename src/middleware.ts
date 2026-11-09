import { getActionContext } from "astro:actions";
import type { APIContext, MiddlewareNext } from "astro";
import { defineMiddleware } from "astro:middleware";
import { bump, businessVersion, userVersion } from "./lib/cache";
import { loadSession } from "./data/queries";
import { needsSecondFactor, verifyHref } from "./lib/auth";
import { createSupabase } from "./lib/supabase";

/** Solo acepta rutas internas como destino después de entrar (evita redirecciones abiertas). */
export const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/app");

/** Acciones que solo tocan datos que nunca van a la caché (caja, stock, avisos, seguridad): no la invalidan. */
const LIVE_ACTIONS = new Set([
  "requestReopen",
  "savePromotion",
  "requestStockEntry",
  "answerStockRequest",
  "togglePromotion",
  "deletePromotion",
  "requestJoin",
  "answerReopen",
  "sendFeedback",
  "registerSale",
  "saveOrder",
  "deleteOrder",
  "chargeOrder",
  "voidSale",
  "attachSaleReceipt",
  "createPlanCharge",
  "createExpense",
  "updateExpense",
  "voidExpense",
  "openShift",
  "closeShift",
  "saveCloseNote",
  "reopenShift",
  "recordStockMove",
  "saveInventory",
  "removeInventory",
  "addToInventory",
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

/** Acciones tras las que la persona puede dejar de ver un negocio: para invalidarlo hay que leer sus negocios antes. */
const LOSES_ACCESS = new Set(["deleteBusiness", "transferOwnership", "removeEmployee", "deleteAccount"]);

/**
 * Encabezados de seguridad de toda respuesta de servidor, redirecciones incluidas.
 * shortcut: las páginas prerenderizadas (/, /planes, /terminos, /privacidad) salen del CDN sin ellos (Vercel ignora vercel.json
 * con el adaptador de Astro); no tienen sesión ni formularios de la caja. Si hace falta, quitarles el prerender.
 */
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  // Nadie puede meter la app en un iframe (clickjacking sobre la caja).
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // La cámara es para el escáner de códigos de barras.
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
};

export const onRequest = defineMiddleware(async (context, next) => {
  // Las páginas prerenderizadas (la landing) no tienen petición real.
  if (context.isPrerendered) return next();
  const response = await handle(context, next);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(key, value);
  return response;
});

async function handle(context: APIContext, next: MiddlewareNext): Promise<Response> {

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
  } else if (pathname.startsWith("/auth/") && pathname !== "/auth/verificar" && pathname !== "/auth/nueva-contrasena" && userId) {
    // verificar y nueva-contrasena se usan con sesión (la del enlace de recuperar contraseña); las demás no.
    return context.redirect(safeNext(context.url.searchParams.get("next")));
  }

  // Toda otra acción invalida la caché de la persona y de cada negocio que ve después de escribir (y, si pudo perder
  // el acceso, también de los que veía antes): así cubre negocios nuevos y borrados, y llega a las demás personas.
  const { action } = getActionContext(context);
  const invalidates = userId && action && !LIVE_ACTIONS.has(action.name);
  const businessIds = async () => ((await supabase.from("businesses").select("id")).data ?? []).map((b) => b.id);
  // Los negocios de después bastan, salvo que la acción quite el acceso a alguno (ahí se leen también los de antes).
  const before = invalidates && LOSES_ACCESS.has(action.name) ? await businessIds() : [];

  let response: Response;
  try {
    response = await next();
  } catch (error) {
    // Sin datos personales: ruta, acción e id de la persona, para cruzar con los logs de Supabase.
    console.error(
      JSON.stringify({ level: "error", source: "request", path: pathname, action: action?.name ?? null, user: userId, message: error instanceof Error ? error.message : String(error) }),
    );
    throw error;
  }
  if (invalidates) await bump(userVersion(userId), ...[...before, ...(await businessIds())].map(businessVersion));
  cacheHeaders.forEach((value, key) => response.headers.set(key, value));
  return response;
}
