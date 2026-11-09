import type { APIRoute } from "astro";
import { SUPABASE_KEY, SUPABASE_URL } from "astro:env/server";
import { needsSecondFactor } from "@/lib/auth";

/*
 * Token de acceso para escuchar los avisos en vivo (src/scripts/live.ts). Solo el access token, de vida corta: el refresh
 * token se queda en las cookies y la sesión la sigue renovando solo el servidor (getClaims en el middleware lo hace).
 * El canal lo autoriza la base (private.watch_topic); esto solo entrega la sesión que la persona ya tiene.
 */
export const GET: APIRoute = async ({ locals }) => {
  const sb = locals.supabase;
  const { data } = await sb.auth.getSession();
  const session = data.session;
  if (!locals.userId || !session || (await needsSecondFactor(sb))) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  return Response.json(
    { url: SUPABASE_URL, apikey: SUPABASE_KEY, token: session.access_token, expiresAt: (session.expires_at ?? 0) * 1000 },
    { headers: { "Cache-Control": "no-store" } },
  );
};
