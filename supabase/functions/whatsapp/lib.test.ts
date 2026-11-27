import { assert, assertEquals } from "jsr:@std/assert@1";
import { parseWebhook, toModelMessages, verifySignature } from "./lib.ts";

async function sign(body: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return "sha256=" + Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("firma válida e inválida", async () => {
  const body = '{"a":1}';
  assert(await verifySignature(body, await sign(body, "s3cret"), "s3cret"));
  assert(!(await verifySignature(body, await sign(body, "otro"), "s3cret")));
  assert(!(await verifySignature(body + " ", await sign(body, "s3cret"), "s3cret")));
  assert(!(await verifySignature(body, null, "s3cret")));
});

const meta = { phone_number_id: "111", display_phone_number: "59170000000" };

Deno.test("mensaje de texto, audio y estados", () => {
  const events = parseWebhook({
    entry: [{ changes: [
      { field: "messages", value: { metadata: meta, contacts: [{ wa_id: "59171111111", profile: { name: "Ana" } }], messages: [
        { from: "59171111111", id: "wamid.1", type: "text", text: { body: "¿Tienen pan?" } },
        { from: "59171111111", id: "wamid.2", type: "audio", audio: { id: "x" } },
      ] } },
      { field: "messages", value: { metadata: meta, statuses: [{ id: "wamid.0", status: "read" }] } },
    ] }],
  });
  assertEquals(events, [
    { kind: "message", phoneNumberId: "111", waId: "59171111111", name: "Ana", id: "wamid.1", text: "¿Tienen pan?" },
    { kind: "message", phoneNumberId: "111", waId: "59171111111", name: "Ana", id: "wamid.2", text: null },
  ]);
});

Deno.test("echo de la dueña desde la app", () => {
  const events = parseWebhook({
    entry: [{ changes: [{ field: "smb_message_echoes", value: { metadata: meta, message_echoes: [
      { from: "59170000000", to: "59171111111", id: "wamid.9", type: "text", text: { body: "Ya te lo guardo" } },
    ] } }] }],
  });
  assertEquals(events, [{ kind: "echo", phoneNumberId: "111", waId: "59171111111", id: "wamid.9", text: "Ya te lo guardo" }]);
});

Deno.test("payload raro no rompe", () => {
  assertEquals(parseWebhook(null), []);
  assertEquals(parseWebhook({ entry: [{ changes: [{ field: "messages", value: {} }] }] }), []);
});

Deno.test("historial empieza por el cliente", () => {
  assertEquals(toModelMessages([
    { sender: "asistente", body: "Hola" },
    { sender: "cliente", body: "¿Precio del pan?" },
    { sender: "dueña", body: "Bs 1" },
  ]), [
    { role: "user", content: "¿Precio del pan?" },
    { role: "assistant", content: "[Lo escribió la dueña] Bs 1" },
  ]);
});
