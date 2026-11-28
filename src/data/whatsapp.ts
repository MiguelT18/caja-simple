// Asistente de WhatsApp (migración whatsapp_assistant): estado del complemento, el número y las conversaciones.
// Se lee fresco: cambia con cada mensaje.
import type { Supabase } from "@/lib/supabase";
import { fail } from "./mappers";

export interface WaMessage {
  sender: "cliente" | "asistente" | "dueña";
  body: string;
  at: string;
}

export interface WaConversation {
  id: string;
  /** Nombre de perfil de WhatsApp, o el número. */
  customer: string;
  phone: string;
  lastAt: string | null;
  mutedUntil: string | null;
  handoffAt: string | null;
  handoffReason: string | null;
  /** Del más viejo al más nuevo. */
  messages: WaMessage[];
}

export interface WhatsappState {
  /** Complemento contratado hasta (incluido); null = sin contratar. */
  until: string | null;
  active: boolean;
  phone: string | null;
  paused: boolean;
  conversations: WaConversation[];
}

const CONVERSATIONS = 50;
const MESSAGES = 30;

export async function whatsappState(sb: Supabase, businessId: string, today: string): Promise<WhatsappState> {
  const [business, account, conversations] = await Promise.all([
    sb.from("businesses").select("assistant_until").eq("id", businessId).single(),
    sb.from("wa_accounts").select("display_phone, paused_at").eq("business_id", businessId).maybeSingle(),
    sb
      .from("wa_conversations")
      .select("id, wa_id, name, last_customer_at, muted_until, handoff_at, handoff_reason, wa_messages(sender, body, created_at)")
      .eq("business_id", businessId)
      .order("last_customer_at", { ascending: false, nullsFirst: false })
      .order("created_at", { referencedTable: "wa_messages", ascending: false })
      .limit(MESSAGES, { referencedTable: "wa_messages" })
      .limit(CONVERSATIONS),
  ]);
  fail(business.error ?? account.error ?? conversations.error);
  const until = business.data?.assistant_until ?? null;
  return {
    until,
    active: until !== null && until >= today,
    phone: account.data?.display_phone ?? null,
    paused: !!account.data?.paused_at,
    conversations: (conversations.data ?? []).map((c) => ({
      id: c.id,
      customer: c.name ?? `+${c.wa_id}`,
      phone: `+${c.wa_id}`,
      lastAt: c.last_customer_at,
      mutedUntil: c.muted_until,
      handoffAt: c.handoff_at,
      handoffReason: c.handoff_reason,
      messages: c.wa_messages.map((m) => ({ sender: m.sender as WaMessage["sender"], body: m.body, at: m.created_at })).reverse(),
    })),
  };
}
