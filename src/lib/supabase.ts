import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { SUPABASE_KEY, SUPABASE_URL } from "astro:env/server";
import type { Database } from "./database.types";

export type Supabase = ReturnType<typeof createSupabase>;

/** Cliente de Supabase con la sesión de la persona (cookies). Toda llamada pasa por el servidor. */
export function createSupabase({ request, cookies, headers }: { request: Request; cookies: AstroCookies; headers: Headers }) {
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => parseCookieHeader(request.headers.get("Cookie") ?? "").map(({ name, value }) => ({ name, value: value ?? "" })),
      setAll(toSet, cacheHeaders) {
        for (const { name, value, options } of toSet) cookies.set(name, value, options);
        // Evita que un CDN guarde una respuesta con la sesión de otra persona.
        for (const [key, value] of Object.entries(cacheHeaders ?? {})) headers.set(key, value);
      },
    },
  });
}
