// Novedades para la persona: las notas de src/content/novedades/ según sus roles y cuáles no vio (cookie).
import type { AstroCookies } from "astro";
import { getCollection } from "astro:content";
import { NEWS_SEEN_COOKIE, notesFor, unseenNotes } from "@/lib/news";
import { myBusinesses } from "./session";

export { NEWS_SEEN_COOKIE };

export async function myNews(locals: App.Locals, cookies: AstroCookies) {
  const memberships = myBusinesses(locals);
  const roles = {
    owner: memberships.some((m) => m.role === "dueño"),
    // También la dueña que se agregó a una sucursal: vende y abre turnos como empleada.
    employee: memberships.some((m) => m.employee),
  };
  const notes = notesFor(
    (await getCollection("novedades")).map((e) => ({ ...e.data, id: e.id, entry: e })),
    roles,
  );
  return { notes, unseen: unseenNotes(notes, cookies.get(NEWS_SEEN_COOKIE)?.value) };
}
