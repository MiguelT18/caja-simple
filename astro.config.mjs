// @ts-check
import { defineConfig, envField } from 'astro/config';

import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Las páginas se renderizan en el servidor (sesión de Supabase); la landing se prerenderiza.
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
  devToolbar: { enabled: false },
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: 'server', access: 'public', url: true }),
      SUPABASE_KEY: envField.string({ context: 'server', access: 'public' }),
      // Caché opcional (Upstash Redis); sin estas variables la app lee siempre de Supabase.
      UPSTASH_REDIS_REST_URL: envField.string({ context: 'server', access: 'secret', url: true, optional: true }),
      UPSTASH_REDIS_REST_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
