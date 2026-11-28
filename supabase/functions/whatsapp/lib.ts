// Partes puras del webhook de WhatsApp: firma, lectura del payload de Meta e historial para el modelo.
// Pruebas: deno test supabase/functions/whatsapp/

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256 del cuerpo crudo con el secreto de la app de Meta. */
export async function verifySignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice("sha256=".length);
  // Comparación en tiempo constante.
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export type WaEvent =
  // Un cliente escribió. text = null si no es texto (audio, imagen…).
  | { kind: "message"; phoneNumberId: string; waId: string; name: string | null; id: string; text: string | null }
  // La dueña escribió desde la app de WhatsApp Business (coexistencia): waId es el cliente.
  | { kind: "echo"; phoneNumberId: string; waId: string; id: string; text: string | null };

// deno-lint-ignore no-explicit-any
type Any = any;

const textOf = (m: Any): string | null => (m?.type === "text" && typeof m.text?.body === "string" ? m.text.body : null);

/** Los mensajes y echoes de un webhook; ignora estados (sent/delivered/read) y otros campos. */
export function parseWebhook(payload: Any): WaEvent[] {
  const events: WaEvent[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      const phoneNumberId = value.metadata?.phone_number_id;
      if (typeof phoneNumberId !== "string") continue;
      if (change.field === "messages") {
        const names = new Map<string, string>((value.contacts ?? []).map((c: Any) => [c.wa_id, c.profile?.name]));
        for (const m of value.messages ?? []) {
          if (typeof m?.from !== "string" || typeof m?.id !== "string") continue;
          events.push({ kind: "message", phoneNumberId, waId: m.from, name: names.get(m.from) ?? null, id: m.id, text: textOf(m) });
        }
      } else if (change.field === "smb_message_echoes") {
        // Forma según la referencia de Meta (webhooks/reference/smb_message_echoes): from = negocio, to = cliente.
        // shortcut: Meta omite `to` si no tiene el número (solo manda to_user_id, el BSUID); ese echo se salta y la
        // conversación no se calla. Cambiar a BSUID si llegan echoes sin `to` en los logs.
        for (const m of value.message_echoes ?? []) {
          if (typeof m?.to !== "string" || typeof m?.id !== "string") continue;
          events.push({ kind: "echo", phoneNumberId, waId: m.to, id: m.id, text: textOf(m) });
        }
      }
    }
  }
  return events;
}

export type StoredMessage = { sender: "cliente" | "asistente" | "dueña"; body: string };

/** Historial (del más viejo al más nuevo) como mensajes para Claude: el primero tiene que ser del cliente. */
export function toModelMessages(rows: StoredMessage[]): { role: "user" | "assistant"; content: string }[] {
  const out = rows.map((r) => ({
    role: r.sender === "cliente" ? ("user" as const) : ("assistant" as const),
    content: r.sender === "dueña" ? `[Lo escribió la dueña] ${r.body}` : r.body,
  }));
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
