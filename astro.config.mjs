// @ts-check
import { defineConfig, envField } from 'astro/config';

import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/**
 * `astro dev` contra la base de producción se corta: desarrollar y probar va contra Supabase local (AGENTS.md).
 * @type {import('astro').AstroIntegration}
 */
const localDatabaseOnly = {
  name: 'local-database-only',
  hooks: {
    'astro:config:setup': ({ command }) => {
      if (command !== 'dev') return;
      // El mismo orden que Vite en `astro dev`: gana .env.development.local, después .env.development, .env.local, .env.
      const files = ['.env', '.env.local', '.env.development', '.env.development.local'].filter((f) => existsSync(f));
      const env = Object.assign({}, ...files.map((f) => parseEnv(readFileSync(f, 'utf8'))), process.env);
      if (/\.supabase\.co/.test(env.SUPABASE_URL ?? '') && env.ALLOW_PROD_DB !== '1') {
        throw new Error(
          'astro dev apunta a la base de PRODUCCIÓN (SUPABASE_URL en .env). Levanta la local con `pnpm db:start` y ' +
            'pon sus claves en .env.development.local (ver .env.example). Solo si de verdad hace falta: ALLOW_PROD_DB=1.',
        );
      }
      // La caché de .env es la de producción: con la base local, la sesión de una cuenta local quedaría guardada allá.
      if (env.UPSTASH_REDIS_REST_URL && env.ALLOW_PROD_DB !== '1') {
        throw new Error('astro dev usaría el Redis de PRODUCCIÓN: deja UPSTASH_REDIS_REST_URL= y UPSTASH_REDIS_REST_TOKEN= vacías en .env.development.local.');
      }
    },
  },
};

// https://astro.build/config
export default defineConfig({
  // Las páginas se renderizan en el servidor (sesión de Supabase); la landing se prerenderiza.
  output: 'server',
  adapter: vercel(),
  integrations: [react(), localDatabaseOnly],
  devToolbar: { enabled: false },
  // Los enlaces del menú lateral (data-astro-prefetch) se preparan al pasar el mouse o tocarlos: con clientPrerender,
  // Chrome arma la página destino en segundo plano (Speculation Rules) y al hacer clic aparece al instante.
  // En los navegadores sin Speculation Rules se precarga el HTML (prefetch).
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  experimental: { clientPrerender: true },
  // Cuerpo máximo de una Action: una foto de 2 MB o 5 capturas achicadas, por debajo de los 4,5 MB que corta Vercel.
  security: { actionBodySizeLimit: 4 * 1024 * 1024 },
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: 'server', access: 'public', url: true }),
      SUPABASE_KEY: envField.string({ context: 'server', access: 'public' }),
      // Upstash Redis: caché y límite de intentos (login, 2FA). Opcional en dev; obligatorio en producción (src/lib/cache.ts).
      UPSTASH_REDIS_REST_URL: envField.string({ context: 'server', access: 'secret', url: true, optional: true }),
      UPSTASH_REDIS_REST_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Opcionales: enlace de «Mejorar plan» y clave pública de los avisos push (sin url: true, vacías se aceptan).
      PUBLIC_UPGRADE_URL: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_VAPID_PUBLIC_KEY: envField.string({ context: 'client', access: 'public', optional: true }),
      // Opcionales: correo por cada mensaje de Ayuda y comentarios (Resend). Sin ellas, el mensaje solo queda en la tabla feedback.
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      FEEDBACK_EMAIL: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
