# Diseño de Caja Simple

Tono cálido y cercano, con modo claro y oscuro. Todos los valores viven en `src/styles/tokens.css`; los componentes usan solo `var(--…)`, nunca colores hex sueltos.

## Reglas

- **El acento es escaso.** `--color-primary` (ámbar) se reserva para la acción principal, el ítem activo y el logo. Lo que guía la vista son los colores con significado.
- **Nada se comunica solo con color.** Los montos llevan signo (`+` / `−`), las alertas llevan ícono y los turnos su nombre escrito.
- **Montos:** ingreso → `--color-income` con `+`; gasto → `--color-expense` con `−`; saldo → `--color-text`, y en `--color-expense` solo si es negativo. Siempre con la clase `.num` (cifras tabulares).
- **Advertencias** (stock bajo, caja descuadrada) → `--color-warning` sobre `--color-warning-soft` y con ícono, para no confundirlas con el ámbar de marca.
- **Chips** (turnos, estados): texto con el color fuerte sobre el `-soft` correspondiente, en `--text-xs` + `--font-semibold`.
- **Contraste:** todo el texto cumple WCAG AA en los dos temas. `--color-text-subtle` solo se usa en placeholders y datos poco importantes.
- **Tema:** sigue `prefers-color-scheme`. `data-theme="light" | "dark"` en `<html>` lo fuerza. El botón es `src/components/ThemeToggle.astro` (luna/sol, `aria-pressed`, guarda la elección); va en el Sidebar de la app, primero en la barra de la landing y, en el acceso, fijo arriba a la derecha (en móvil, junto al título bajo la franja de la pizarra).

## Colores

### Neutros

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--color-bg` | `#FAF8F5` | `#171310` | Fondo de la página |
| `--color-surface` | `#FFFFFF` | `#211C18` | Tarjetas, sidebar, modales |
| `--color-surface-muted` | `#F3EFE9` | `#2B2520` | Hover, encabezados de tabla, filas alternas |
| `--color-border` | `#E7E1D8` | `#3A322B` | Bordes y divisores |
| `--color-border-strong` | `#D3CABD` | `#4D433A` | Bordes de inputs |
| `--color-text` | `#1F1A17` | `#F3EEE8` | Texto principal |
| `--color-text-muted` | `#6B625A` | `#B3A89C` | Texto secundario, etiquetas |
| `--color-text-subtle` | `#8F857B` | `#8A7F74` | Placeholders |

### Marca

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--color-primary` | `#B45309` | `#F0A04B` | Botón principal, ítem activo, logo |
| `--color-primary-hover` | `#92400E` | `#F5B871` | Hover del botón principal |
| `--color-primary-soft` | `#FDF1E3` | `#3A2A18` | Fondo del ítem activo |
| `--color-on-primary` | `#FFFFFF` | `#1F1A17` | Texto sobre primario |
| `--color-focus` | `#D97706` | `#F0A04B` | Anillo de foco (2px) |

### Con significado (texto / fondo `-soft`)

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--color-income` | `#2A7548` / `#E8F5EC` | `#5CC88A` / `#1A2E22` | Ingresos, ventas, éxito |
| `--color-expense` | `#B4233C` / `#FCEBEE` | `#F27A8C` / `#3A1C22` | Gastos, negativos, errores |
| `--color-warning` | `#8A6100` / `#FEF6D8` | `#E8C35A` / `#33290F` | Stock bajo, descuadres |
| `--color-info` | `#2B6CB0` / `#E8F1FB` | `#7AB3F0` / `#16263A` | Avisos neutrales |

### Turnos (texto / fondo `-soft`)

| Turno | Token | Claro | Oscuro |
|---|---|---|---|
| Mañana | `--color-shift-morning` | `#1F6F99` / `#E4F2FA` | `#7CC4EA` / `#152A36` |
| Tarde | `--color-shift-afternoon` | `#C2410C` / `#FFEDE3` | `#FB9A6A` / `#3A2216` |
| Noche | `--color-shift-night` | `#4C3FB0` / `#ECEAFB` | `#A99DF5` / `#231F3D` |

### Sucursales

`--color-branch-1` … `--color-branch-6`, asignados en orden, para gráficos, leyendas y avatares: ámbar, azul, verde, violeta, turquesa, naranja (más claros en modo oscuro). A partir de la séptima sucursal se repite la paleta y se agrega una etiqueta o un patrón.

## Tipografía

**Plus Jakarta Sans Variable**, instalada localmente con `@fontsource-variable/plus-jakarta-sans` → `--font-sans`.

| Peso | Token | Uso |
|---|---|---|
| 400 | `--font-regular` | Texto general |
| 500 | `--font-medium` | Navegación, etiquetas, botones |
| 600 | `--font-semibold` | Títulos de tarjeta, ítem activo, encabezados de tabla |
| 700 | `--font-bold` | Títulos de página, marca, cifras KPI |

Los tamaños son **fluidos**: cada uno es un `clamp()` que crece de forma lineal entre un viewport de 360px y uno de 1280px. Los interlineados (`--text-*-lh`) no tienen unidad.

| Token | 360px → 1280px | Interlineado | Uso |
|---|---|---|---|
| `--text-xs` | 12 → 13px | 1.33 | Badges, chips de turno, notas |
| `--text-sm` | 14 → 15px | 1.43 | Tablas, texto secundario, ayudas |
| `--text-base` | 16 → 17px | 1.5 | Texto general, inputs (nunca menos de 16px), menú |
| `--text-lg` | 17 → 18px | 1.55 | Títulos de tarjeta, marca |
| `--text-xl` | 18 → 20px | 1.4 | h2 |
| `--text-2xl` | 20 → 24px | 1.33 | h1 |
| `--text-3xl` | 24 → 30px | 1.2 | KPI en Resumen |
| `--text-4xl` | 28 → 36px | 1.1 | Total en «Registrar venta» |

- A partir de `--text-xl`, los títulos llevan `letter-spacing: -0.01em`.
- Para nuevos tamaños, mantener la misma interpolación: `clamp(min, a + b·vw, max)` con `b = (max − min) / 920px × 100` y `a = min − b × 3.6px`.
- Los números (montos, cantidades, horas) llevan la clase `.num` (`tabular-nums`).

## Íconos

Se usan los componentes de [Lucide](https://lucide.dev/icons) vía `@lucide/astro`: `import { Wallet } from "@lucide/astro"` → `<Wallet size={20} stroke-width={1.75} />`. Lucide agrega `aria-hidden` y heredan el color con `currentColor`. No se escriben SVG a mano, salvo marcas: el logo (`Logo.astro`) y la «G» de Google (`public/google.svg`).

## Navegación

- **Panel lateral flotante** (escritorio): separado `0.75rem` del borde, `border-radius: 1rem`, borde `--color-border` y `--shadow-md`. En móvil deja de flotar: barra superior fija y menú a pantalla completa.
- **Orden:** marca y tema → selector de negocio → selector de sucursal → acción principal → secciones → tarjeta de usuario.
- **Selectores de contexto** (`ContextSwitcher.astro`): son enlaces, no estado. El de negocio muestra el rol en cada uno y termina en «Tus negocios»; el de sucursal solo aparece si hay más de una y conserva la sección actual al cambiar.
- **Según dónde estás:** en `/app` solo «Tus negocios»; en las páginas del negocio, la sección del negocio sin selector de sucursal ni «Registrar venta»; en una sucursal, todo. La empleada nunca ve la sección del negocio ni el resumen de la sucursal.
- **Acción principal:** «Registrar venta» va como `.btn-primary` fuera de la lista, solo dentro de una sucursal. Debe haber una sola acción destacada.
- **Secciones:** títulos en `--text-xs`, mayúsculas, `--font-semibold`, `--color-text-muted`. Los enlaces se definen en `src/data/navigation.ts`.
- **Ítem activo:** `aria-current="page"`, fondo `--color-primary-soft`, texto `--color-primary` y una barra de acento de 3px a la izquierda.
- **Popovers** (p. ej. los selectores de negocio y sucursal): Popover API nativa, `--color-surface`, `--shadow-md`, `border-radius: 0.75rem`.
- **Sombras:** `--shadow-sm` para elementos pequeños sobre superficies, `--shadow-md` para paneles y popovers.

## Páginas de acceso: «Pizarra del día»

`/auth/*` tiene su propio mundo, la pizarra de tiza del mostrador. El resto de la app no lo usa. Vive en `src/styles/auth.css`, que solo se activa con `<body class="auth-surface">` (lo pone `AuthLayout.astro`) y redefine los tokens de la app, así `.btn`, `.input`, `.field-*` y `.notice` se adaptan sin duplicar reglas.

- **Composición:** en escritorio, una pizarra fija a la izquierda (`minmax(22rem, 37.5rem)`, marco de madera de 14px y sticky; se ajusta a la altura de la ventana y nunca hace scroll: en pantallas bajas oculta primero la nota, la descripción y la caja registradora, y luego las filas de capacidades; la frase y la hora se quedan) y el formulario de 26.25rem a la derecha. A ≤960px la pizarra se vuelve una franja arriba con el logo y el día, con marco y textura pero sin repisa, trazos ni dibujos.
- **Material:** la pizarra (`src/components/auth/Board.astro`) es un objeto, no un rectángulo de color. Marco de madera con veta a lo largo de cada travesaño y bisel; pizarra con polvo de tiza (`--slate-grain`), borrones de borrador (`--chalk-dust`) y viñeta; renglones de tiza irregulares y cortados en lugar de bordes rectos; repisa abajo con una tiza blanca, una amarilla gastada y el borrador.
- **Trazos y dibujos:** SVG en línea con el filtro `#chalk-stroke` (borde rasposo y grano). Subrayado amarillo bajo el saludo, óvalo suelto alrededor del día, flecha antes de la nota y una caja registradora en el hueco junto al día. Los dibujos son decoración, nunca datos: no se dibujan cifras, montos ni gráficos. La caja registradora se borra si la pizarra es angosta (`@container`) o baja.
- **Pizarra:** solo contenido verdadero. Saludo según la hora, día, fecha y hora con el reloj de quien entra (`src/scripts/auth-board.ts`), capacidades del producto y la nota de la cuenta única. Bajo la marca, la descripción fija «Tu negocio, bajo control. La caja del día, sin cuaderno ni calculadora.»; entre el día y las filas, una frase que invita a la acción de cada página (prop `pitch` de `AuthLayout`). Las dos en tiza; la frase sin promesas que el producto no cumpla. Nunca se inventan cifras ni se adivina el turno.
- **Tiza:** `--font-chalk` (Cabin Sketch 700) solo dentro de la pizarra, en blanco `--chalk` y amarillo `--chalk-yellow` para el saludo y los valores. Las filas tienen la misma altura (`--board-row`) y los valores van alineados a la derecha.
- **Formulario:** Public Sans Variable (`--font-sans`) y controles web estándar. Etiquetas, campos, ayudas y errores van a un solo tamaño (`--text-base`), con el título en `--text-4xl`. Los controles miden 3rem de alto.
- **Acción principal:** en claro, fondo pizarra con texto amarillo; en oscuro, al revés (`--color-primary` / `--color-on-primary`).
- **Movimiento:** al cargar, la tiza se escribe de izquierda a derecha con una máscara (900ms, ease-out expo, escalonada) y enseguida se pasan los trazos con `stroke-dashoffset` (subrayado, óvalo, flecha, caja registradora; 300–800ms de retraso, la misma curva). Con `prefers-reduced-motion: reduce` no hay animación, y todo está visible por defecto.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--color-bg` | `#EEF1EC` | `#121814` | Pared encalada |
| `--color-text` / `-muted` | `#18201C` / `#4B5650` | `#E9ECE6` / `#A9B3AC` | Texto |
| `--color-border-strong` | `#7F8B84` | `#66746B` | Bordes de inputs (≥3:1) |
| `--color-primary` / `--color-on-primary` | `#1F2B25` / `#F2CF5B` | `#F2CF5B` / `#1F2B25` | Botón principal |
| `--color-focus` | `#9A6800` | `#F2CF5B` | Foco, cursor y subrayado de enlaces |
| `--board` / `--board-frame` | `#1F2B25` / `#8B5E3C` | `#1F2B25` / `#6B4A30` | Pizarra y marco |
| `--chalk` / `--chalk-muted` / `--chalk-yellow` | `#ECEAE2` / `#C3C9C0` / `#F2CF5B` | igual | Tiza |

## Componentes de la app (shadcn)

- shadcn/ui (estilo new-york, Radix, Recharts) vive en `src/components/ui/`; las islas React de la app, en `src/components/app/`.
- El tema de shadcn está en `src/styles/app.css`: sus variables (`--background`, `--card`, `--primary`, `--border`, `--ring`…) apuntan a los tokens de `tokens.css`, así claro y oscuro salen de `light-dark()` como en el resto.
- Colores de gráficos: `--chart-1..3` = turnos (mañana, tarde, noche), `--chart-4` = ingreso, `--chart-5` = gasto; las tortas por categoría usan `--color-branch-1..6`. Cada serie lleva leyenda con nombre y monto: nada solo con color.
- Tailwind se carga solo en `Layout.astro` (`/app/*`). La landing y `/auth/*` no lo usan.
