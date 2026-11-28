// Asistente de WhatsApp: la dueña lo pausa o lo reactiva en todo el negocio o en una conversación.
// Las funciones de la base exigen la verificación en dos pasos y que sea la dueña.
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { check, db, uuid } from "./shared";

export const whatsapp = {
  setAssistantPaused: defineAction({
    accept: "form",
    input: z.object({ businessId: uuid, paused: z.enum(["true", "false"]) }),
    handler: async ({ businessId, paused }, context) => {
      check((await db(context).rpc("wa_set_paused", { p_business: businessId, p_paused: paused === "true" })).error);
    },
  }),
  resumeConversation: defineAction({
    accept: "form",
    input: z.object({ conversationId: uuid }),
    handler: async ({ conversationId }, context) => {
      check((await db(context).rpc("wa_resume_conversation", { p_conversation: conversationId })).error);
    },
  }),
};
