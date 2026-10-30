# Caja Simple

App web para llevar la caja de negocios pequeños con una o varias sucursales: ventas, gastos, productos, turnos y cuadre de caja. Astro 7, sin framework de UI, interfaz en español. Todavía no hay backend: los datos son de demostración y la autenticación no está conectada.

## Qué leer según la tarea

| Documento | Cuándo |
|---|---|
| `AGENTS.md` (este) | Siempre: mapa del código, comandos y convenciones. |
| [`PRODUCT.md`](PRODUCT.md) | Antes de decidir qué construir o cómo redactar: usuarios, propósito, voz, principios. |
| [`DESIGN.md`](DESIGN.md) | Antes de tocar UI: tokens, color, tipografía, íconos, navegación y el mundo de las páginas de acceso. |
| [`docs/modelo-de-datos.md`](docs/modelo-de-datos.md) | Antes de tocar `src/data/` o `/app/*`: persona → negocios → sucursales → inventario, roles y rutas. |
| [`docs/planes-de-suscripcion.md`](docs/planes-de-suscripcion.md) | Si tocas precios o planes (`src/data/plans.ts`). |

No repitas en este archivo lo que ya dicen esos documentos. Enlázalos.

## Comandos

```sh
pnpm install
astro dev --background   # servidor de dev en segundo plano; también: astro dev stop | status | logs
pnpm build               # verificación mínima antes de dar algo por terminado
```

No hay tests ni linter. Para verificar, compila y revisa la página en el navegador, en tema claro y oscuro y a 390px de ancho.

## Mapa del código

```text
src/
├── pages/
│   ├── app/          # la app con sesión: /app (Tus negocios), /app/[negocio]/…, /app/[negocio]/sucursales/[sucursal]/… (ver docs/modelo-de-datos.md)
│   └── auth/         # /auth/iniciar-sesion, /auth/crear-cuenta
├── layouts/
│   ├── Layout.astro      # app: Sidebar + <main>
│   └── AuthLayout.astro  # acceso: <body class="auth-surface">, pizarra + formulario, carga auth-form.ts
├── components/       # Sidebar, ContextSwitcher (negocio y sucursal), UserCard, ThemeToggle, Logo, BaseHead; auth/ = pizarra y campos; landing/
├── data/
│   ├── queries.ts    # única entrada a los datos para las páginas: negocios, rol, contexto de negocio/sucursal y getStaticPaths
│   ├── navigation.ts # enlaces del Sidebar según rol (agrega aquí las rutas nuevas de /app)
│   ├── mock.ts       # tipos y datos de demostración: negocios, sucursales, catálogo, inventario… (TODO: backend)
│   └── plans.ts      # planes y precios orientativos
├── scripts/          # JS del navegador: auth-form.ts (validación), auth-board.ts (reloj de la pizarra)
└── styles/
    ├── tokens.css    # todos los valores de diseño; colores con light-dark()
    ├── global.css    # base y clases compartidas: .btn, .icon-btn, .input, .field-*, .notice, .num
    └── auth.css      # redefine los tokens solo bajo body.auth-surface
```

`/` (landing) está en construcción. Su dirección de diseño está en `.impeccable/surfaces/src-pages-index-astro.md`.

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
- **Pendientes:** los `TODO:` del código marcan lo que espera al backend (auth, sesión, sucursal activa).

## Herramientas

`.impeccable/` es el estado de la herramienta de diseño Impeccable: mocks, revisiones y contratos de dirección por pantalla en `surfaces/`. No lo edites a mano. Lee el contrato de `surfaces/` antes de rediseñar esa pantalla.

## Astro

Documentación: https://docs.astro.build. Consulta la guía que corresponda antes de trabajar en:
[rutas y middleware](https://docs.astro.build/en/guides/routing/) ·
[componentes](https://docs.astro.build/en/basics/astro-components/) ·
[estilos](https://docs.astro.build/en/guides/styling/) ·
[colecciones de contenido](https://docs.astro.build/en/guides/content-collections/) ·
[i18n](https://docs.astro.build/en/guides/internationalization/)
