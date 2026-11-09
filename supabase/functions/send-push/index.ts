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
    case "shift_closed": {
      const diff = Number(data.difference);
      const who = data.person ? `${data.person} lo cerró` : "Se cerró";
      const result = diff === 0 ? "la caja cuadró" : `${diff > 0 ? "sobran" : "faltan"} ${money(Math.abs(diff))}`;
      return { title: `Turno ${String(data.shift).toLowerCase()} cerrado en ${data.branch}`, body: `${who}: ${result}` };
    }
    case "shift_reminder":
      return { title: `Turno ${String(data.shift).toLowerCase()} en ${data.branch}: abre en ${data.minutes === 60 ? "1 hora" : `${data.minutes} minutos`}`, body: `Hora de abrir: ${data.start}` };
    case "shift_late":
      return { title: `Turno ${String(data.shift).toLowerCase()} sin abrir en ${data.branch}`, body: `Debía abrir a las ${data.start}` };
    case "shift_overdue":
      return { title: `Turno ${String(data.shift).toLowerCase()} sin cerrar en ${data.branch}`, body: `Debía cerrar a las ${data.end}${data.person ? ` · lo abrió ${data.person}` : ""}` };
    case "stock_request":
      return { title: `${data.person} pide sumar ${data.qty} de ${data.product}`, body: [data.branch, data.reason && `«${data.reason}»`].filter(Boolean).join(" · ") };
    case "stock_answer":
      return data.accepted
        ? { title: `${data.person} aceptó tu entrada de ${data.qty} ${data.product}`, body: `${data.branch}: el stock ya subió` }
        : { title: `${data.person} rechazó tu entrada de ${data.qty} ${data.product}`, body: `${data.branch}: el stock no cambió` };
    case "low_stock":
      return { title: `Stock bajo: ${data.product}`, body: `Quedan ${data.stock} en ${data.branch} (mínimo ${data.minStock})` };
    case "shift_change":
      return { title: `${data.person} cambió su turno`, body: `${data.from ? `De ${data.from} a ${data.to}` : `Ahora en ${data.to}`} · ${data.branch}` };
    case "plan_expiring":
      return { title: `Tu plan ${data.plan} de ${data.business} vence ${data.days === 1 ? "mañana" : `en ${data.days} días`}`, body: "Renuévalo para no volver al plan Gratis" };
    case "plan_expired":
      return { title: `${data.business} volvió al plan Gratis`, body: `Venció el plan ${data.plan}. Tus datos siguen guardados` };
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
