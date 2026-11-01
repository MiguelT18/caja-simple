// Manda por push cada aviso nuevo de la bandeja. La llama el trigger notifications_push (pg_net) con el
// header x-push-secret; no la llama el navegador. Ver docs/modelo-de-datos.md («Notificaciones push»).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const bs = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Igual que formatBs de src/lib/format.ts.
const money = (n: number) => `${n < 0 ? "−" : ""}Bs ${bs.format(Math.abs(n))}`;

type Notice = { user_id: string; kind: string; data: Record<string, any> };

// Mismos textos que describe() en src/components/NotificationBell.astro: si cambias uno, cambia el otro.
function describe({ kind, data }: Notice) {
  switch (kind) {
    case "invitation":
      return { title: `${data.owner} te invitó a ${data.business}`, body: [data.jobTitle, data.branch, data.shift && `turno ${data.shift}`].filter(Boolean).join(" · ") };
    case "invitation_answer":
      return data.accepted
        ? { title: `${data.person} aceptó tu invitación`, body: `Ya está en ${data.business}` }
        : { title: `${data.person} rechazó tu invitación`, body: data.business };
    case "cash_mismatch":
      return { title: `Caja descuadrada en ${data.branch}`, body: `Turno ${data.shift}: ${money(Number(data.difference))} de diferencia` };
    case "low_stock":
      return { title: `Stock bajo: ${data.product}`, body: `Quedan ${data.stock} en ${data.branch} (mínimo ${data.minStock})` };
    default:
      return { title: "Caja Simple", body: "Tienes un aviso nuevo" };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST" || req.headers.get("x-push-secret") !== Deno.env.get("PUSH_WEBHOOK_SECRET")) {
    return new Response("No autorizado", { status: 401 });
  }
  const notice: Notice = await req.json();
  const { data: subs, error } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", notice.user_id);
  if (error) return new Response(error.message, { status: 500 });

  const payload = JSON.stringify({ ...describe(notice), url: "/app" });
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
        sent++;
      } catch (e) {
        // El navegador dio de baja la suscripción: se borra para no insistir.
        if (e?.statusCode === 404 || e?.statusCode === 410) gone.push(s.id);
        else console.error(e);
      }
    }),
  );
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
  return Response.json({ sent, removed: gone.length });
});
