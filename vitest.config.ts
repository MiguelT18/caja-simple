import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Solo funciones puras (src/lib, src/data/cash.ts…): sin Astro ni Supabase.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "astro:env/client": fileURLToPath(new URL("./src/test/astro-env.ts", import.meta.url)),
    },
  },
  test: { include: ["src/**/*.test.ts"], env: { TZ: "UTC" } },
});
