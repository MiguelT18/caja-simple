// Correos que la app nos envía a nosotros (no a los usuarios): por ahora, cada mensaje de Ayuda y comentarios.
import { FEEDBACK_EMAIL, RESEND_API_KEY } from "astro:env/server";

/**
 * Manda un correo de texto por la API HTTP de Resend. Nunca lanza: el mensaje ya quedó guardado en la base,
 * y un correo que falla solo se registra en los logs.
 * shortcut: remitente de prueba de Resend (onboarding@resend.dev); con dominio propio, usar uno verificado.
 */
export async function notifyTeam({ subject, text, replyTo }: { subject: string; text: string; replyTo?: string }) {
  if (!RESEND_API_KEY || !FEEDBACK_EMAIL) return;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: "Caja Simple <onboarding@resend.dev>", to: [FEEDBACK_EMAIL], subject, text, ...(replyTo && { reply_to: replyTo }) }),
    });
    if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", source: "mail", message: error instanceof Error ? error.message : String(error) }));
  }
}
