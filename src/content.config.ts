// Colecciones de contenido de Astro. Novedades: una nota en Markdown por cambio que la persona nota (ver AGENTS.md).
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const novedades = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/novedades" }),
  schema: z.object({
    title: z.string().max(80),
    /** Día en que sale (AAAA-MM-DD, hora de Bolivia). */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Una línea para la franja de arriba. */
    summary: z.string().max(120),
    /** Quién la ve: «dueña» (tiene un negocio), «empleada» (trabaja en uno) o «todos». */
    para: z.enum(["todos", "dueña", "empleada"]).default("todos"),
  }),
});

export const collections = { novedades };
