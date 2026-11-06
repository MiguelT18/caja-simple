// Manda el correo de invitación a quien todavía no tiene cuenta (Supabase Auth › «Invite user»). La llama el
// trigger employees_notify_invited (pg_net) con el header x-push-secret; no la llama el navegador.
// El correo usa la plantilla «Invite user» del panel, que lleva a /api/auth/callback?token_hash=…&type=invite
// (ver docs/modelo-de-datos.md › Invitaciones).
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method !== "POST" || req.headers.get("x-push-secret") !== Deno.env.get("PUSH_WEBHOOK_SECRET")) {
    return new Response("No autorizado", { status: 401 });
  }
  const { email, business, owner } = await req.json();
  if (typeof email !== "string" || !email.includes("@")) return new Response("Falta el correo", { status: 400 });
  // Los datos van a la plantilla ({{ .Data.business }}, {{ .Data.owner }}).
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { data: { business, owner } });
  // Ya registrada (por ejemplo, con Google): no hace falta el correo; el aviso le llega al confirmar.
  if (error && error.code !== "email_exists") {
    console.error(JSON.stringify({ level: "error", source: "send-invite", code: error.code, message: error.message }));
    return new Response(error.message, { status: 500 });
  }
  return new Response("ok");
});
