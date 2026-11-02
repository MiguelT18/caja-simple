# Caja Simple

App web para llevar la caja de negocios pequeños con una o varias sucursales: ventas, gastos, productos, turnos y cuadre de caja. Astro 7 renderizado en el servidor (adaptador de Vercel), interfaz en español. Datos y autenticación en Supabase; las islas interactivas de `/app` usan React y shadcn/ui.

## Qué leer según la tarea

| Documento | Cuándo |
|---|---|
| `AGENTS.md` (este) | Siempre: mapa del código, comandos y convenciones. |
| [`PRODUCT.md`](PRODUCT.md) | Antes de decidir qué construir o cómo redactar: usuarios, propósito, voz, principios. |
| [`DESIGN.md`](DESIGN.md) | Antes de tocar UI: tokens, color, tipografía, íconos, navegación y el mundo de las páginas de acceso. |
| [`docs/modelo-de-datos.md`](docs/modelo-de-datos.md) | Antes de tocar `src/data/` o `/app/*`: persona → negocios → sucursales → inventario, roles y rutas. |
| [`docs/planes-de-suscripcion.md`](docs/planes-de-suscripcion.md) | Si tocas precios, planes o sus límites (`src/data/plans.ts`, migración `plan_limits`). |

No repitas en este archivo lo que ya dicen esos documentos. Enlázalos.

## Comandos

```sh
pnpm install
astro dev --background   # servidor de dev en segundo plano; también: astro dev stop | status | logs
pnpm build               # verificación mínima antes de dar algo por terminado
pnpm astro check         # tipos (usa TypeScript 6: astro check no soporta la 7)
```

Supabase (proyecto en la nube; no hay base local). Las variables van en `.env` (ver `.env.example`); `SUPABASE_DB_PASSWORD` es solo para la CLI:

```sh
pnpm dlx supabase migration new <nombre>                     # migración nueva en supabase/migrations/
pnpm dlx supabase db push --db-url "$DB_URL"                 # aplicarla
pnpm dlx supabase db advisors --db-url "$DB_URL"             # revisar seguridad y rendimiento
pnpm dlx supabase gen types typescript --db-url "$DB_URL" --schema public > src/lib/database.types.ts
# DB_URL = postgresql://postgres.<ref>:$SUPABASE_DB_PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

Notificaciones push (Edge Function `send-push`; necesita `pnpm dlx supabase login` una vez). Las claves están en `.env`:

```sh
pnpm dlx supabase secrets set --project-ref <ref> VAPID_PUBLIC_KEY="$PUBLIC_VAPID_PUBLIC_KEY" VAPID_PRIVATE_KEY="$VAPID_PRIVATE_KEY" PUSH_WEBHOOK_SECRET="$PUSH_WEBHOOK_SECRET" VAPID_SUBJECT="mailto:<contacto>"
pnpm dlx supabase functions deploy send-push --project-ref <ref>
```

La base llama a la función con la URL y el secreto guardados en Vault (`project_url`, `push_webhook_secret`); ver `docs/modelo-de-datos.md` › Tu cuenta.

No hay tests ni linter. Para verificar, compila y revisa la página en el navegador, en tema claro y oscuro y a 390px de ancho.

## Mapa del código

```text
src/
├── pages/
│   ├── index.astro   # / (landing) · planes.astro: /planes
│   ├── app/          # la app con sesión: /app (Tus negocios), /app/cuenta, /app/[negocio]/…, /app/[negocio]/sucursales/[sucursal]/… (ver docs/modelo-de-datos.md)
│   ├── auth/         # /auth/iniciar-sesion, /auth/crear-cuenta, /auth/verificar (código de la 2FA)
│   └── api/auth/     # login, signup, google, callback, verify, logout (endpoints de Supabase Auth)
├── actions/          # Astro Actions: todas las escrituras de /app (validan con zod; RLS autoriza). index.ts las junta; un archivo por dominio (businesses, shifts, sales, products, employees, account) y shared.ts (validadores, errores, fotos)
├── middleware.ts     # cliente de Supabase por petición, sesión y protección de /app
├── layouts/
│   ├── Layout.astro      # app: <body class="app-surface">, Sidebar + <main> en paneles y, en una sucursal, la barra del turno
│   ├── SiteLayout.astro  # públicas (/ y /planes): encabezado y pie según haya sesión, estilos en styles/site.css
│   └── AuthLayout.astro  # acceso: <body class="auth-surface">, pizarra + formulario, carga auth-form.ts
├── components/       # Sidebar (con la biblioteca de sucursales), PageHeader (encabezado con degradado), ContextSwitcher, NotificationBell, UserCard, ThemeToggle, Logo, BaseHead; app/ = ShiftBar, MediaCard, BranchCard, Modal, FormInput…; auth/ = pizarra y campos; landing/
├── data/
│   ├── queries.ts    # única entrada a los datos para las páginas: solo re-exporta los módulos de abajo
│   ├── session.ts    # sesión: perfil, negocios, rol y avisos (la carga el middleware)
│   ├── branch.ts · business.ts # contexto de una página de sucursal (y la barra del turno) / del negocio
│   ├── cash.ts       # cuentas puras: esperado en caja, estado de la caja, totales
│   ├── shared.ts · mappers.ts · routes.ts # consultas comunes (movimientos, cierres, fotos firmadas) · filas → tipos · rutas de /app
│   ├── navigation.ts # enlaces del Sidebar según rol (agrega aquí las rutas nuevas de /app)
│   ├── types.ts      # tipos de dominio (Business, Branch, Product…)
│   └── plans.ts      # planes y precios orientativos
├── lib/              # supabase.ts (cliente de servidor), cache.ts (Redis de Upstash; opcional), database.types.ts (generado), auth.ts, format.ts (dinero y texto), dates.ts (hora de Bolivia)
├── scripts/          # JS del navegador: auth-form.ts (validación y envío), action-forms.ts (formularios → Actions), nav-skeleton.ts (esqueleto al navegar en /app), auth-board.ts
└── styles/
    ├── tokens.css    # todos los valores de diseño; colores con light-dark()
    ├── global.css    # base y clases compartidas: .btn, .icon-btn, .input, .field-*, .notice, .num
    ├── app-surface.css # redefine los tokens y los controles solo bajo body.app-surface (mundo de /app)
    └── auth.css      # redefine los tokens solo bajo body.auth-surface
```

Fuera de `src/`: `supabase/migrations/` (esquema), `supabase/functions/send-push/` (Edge Function, Deno; excluida del tsconfig) y `public/sw.js` + `public/manifest.webmanifest` (avisos push).

`/` (landing) y `/planes` (planes y precios) se renderizan con la sesión: sin ella invitan a crear cuenta; con ella llevan a `/app`. La dirección de diseño de la landing está en `.impeccable/surfaces/src-pages-index-astro.md`.

## Convenciones

- **Idioma:** la UI, los comentarios y los nombres de rutas van en español neutro con tuteo. Los identificadores de código van en inglés.
- **Estilos:**
  - Usa solo `var(--…)` de `tokens.css`, nunca colores hex sueltos en los componentes.
  - El modo oscuro sale solo de `light-dark()`: no escribas bloques `@media (prefers-color-scheme)` para colores.
  - Usa los estilos `<style>` con scope de cada componente. Una clase va a `global.css` solo si la usan varios componentes.
- **Foco:** el anillo de foco es global (`:where(a, button):focus-visible` en `global.css`). No lo copies en cada componente.
- **Íconos:** usa `@lucide/astro`, con `size` y `stroke-width={1.75}`. Nada de SVG a mano, salvo el logo y la «G» de Google.
- **Scripts de cliente:** van en `<script>` dentro del componente, o en `src/scripts/` si los comparten varias páginas. Lee los mensajes de error y la configuración de atributos `data-*`.
- **Accesibilidad (no negociable):**
  - Texto con contraste WCAG AA en los dos temas.
  - Inputs de al menos 16px.
  - Nada se comunica solo con color.
  - `aria-*` correctos en los controles personalizados (popover, menú, toggles).
- **Datos falsos:** no inventes clientes, métricas ni testimonios. Si hace falta mostrar algo, rotúlalo como «Ejemplo».
- **Datos y permisos:** las páginas leen solo por `src/data/queries.ts` y escriben solo por `src/actions/`. La autorización real es RLS en la base (ver `docs/modelo-de-datos.md`): nunca la reemplaces con chequeos en el cliente. Cambios de esquema, siempre con una migración nueva. Toda tabla nueva lleva RLS y la política restrictiva «Exige la verificación en dos pasos» (`private.mfa_ok()`).
- **Caché (Redis):** solo lo que cambia poco (sesión, catálogo, turnos, equipo, URLs firmadas), con clave por persona. Caja, stock y avisos nunca van a la caché. El middleware la invalida tras cada Action; si una Action nueva solo toca datos frescos, agrégala a `LIVE_ACTIONS` en `src/middleware.ts`. Ver `docs/modelo-de-datos.md` › Caché.
- **Formularios de /app:** en páginas Astro, `<form data-action="nombreDeLaAccion">` con `FormInput` y `Modal` (`src/components/app/`); en islas React, `actions.x()` directo.

## Herramientas

`.impeccable/` es el estado de la herramienta de diseño Impeccable: mocks, revisiones y contratos de dirección por pantalla en `surfaces/`. No lo edites a mano. Lee el contrato de `surfaces/` antes de rediseñar esa pantalla.

## Astro

Documentación: https://docs.astro.build. Consulta la guía que corresponda antes de trabajar en:
[rutas y middleware](https://docs.astro.build/en/guides/routing/) ·
[componentes](https://docs.astro.build/en/basics/astro-components/) ·
[estilos](https://docs.astro.build/en/guides/styling/) ·
[colecciones de contenido](https://docs.astro.build/en/guides/content-collections/) ·
[i18n](https://docs.astro.build/en/guides/internationalization/)
