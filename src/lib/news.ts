// Novedades de la app (src/content/novedades/): quién ve cada nota y cuáles son nuevas para la persona.

export type Audience = "todos" | "dueña" | "empleada";

/** Cookie con la fecha (AAAA-MM-DD) de la nota más nueva que la persona ya vio. La escriben la página y la franja. */
export const NEWS_SEEN_COOKIE = "novedades-vistas";

interface Note {
  id: string;
  date: string;
  para: Audience;
}

/** Las notas para sus roles, de la más nueva a la más vieja. «dueña» si tiene un negocio propio; «empleada» si trabaja en alguno. */
export function notesFor<T extends Note>(notes: T[], roles: { owner: boolean; employee: boolean }) {
  return notes
    .filter((n) => n.para === "todos" || (n.para === "dueña" && roles.owner) || (n.para === "empleada" && roles.employee))
    .toSorted((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

/**
 * Las que no vio (la lista ya ordenada). Sin cookie, solo la más nueva: una cuenta recién creada no recibe todo el historial.
 * shortcut: guarda solo la fecha; una segunda nota del mismo día publicada después no sale como nueva. Guardar el id si pasa.
 */
export function unseenNotes<T extends Note>(sorted: T[], seen?: string) {
  if (!seen || !/^\d{4}-\d{2}-\d{2}$/.test(seen)) return sorted.slice(0, 1);
  return sorted.filter((n) => n.date > seen);
}
