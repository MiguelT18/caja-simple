/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    supabase: import("./lib/supabase").Supabase;
    /** id de la persona con sesión; null si no hay sesión. */
    userId: string | null;
    /** Perfil y negocios de la persona; solo se cargan en /app. */
    session?: import("./data/queries").SessionData;
  }
}
