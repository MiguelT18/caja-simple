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
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: 'server', access: 'public', url: true }),
      SUPABASE_KEY: envField.string({ context: 'server', access: 'public' }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
