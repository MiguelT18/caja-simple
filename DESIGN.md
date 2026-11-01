# Diseño de Caja Simple

Tono cálido y cercano, con modo claro y oscuro. Los valores base viven en `src/styles/tokens.css`; `/app/*` y `/auth/*` los redefinen en su propia hoja (`app-surface.css`, `auth.css`). Los componentes usan solo `var(--…)`, nunca colores hex sueltos.

## Reglas

- **El acento es escaso.** `--color-primary` (ámbar) se reserva para la acción principal, el ítem activo, el progreso y el logo. Lo que guía la vista son los colores con significado.
- **Nada se comunica solo con color.** Los montos llevan signo (`+` / `−`), las alertas llevan ícono y los turnos su nombre escrito.
- **Montos:** ingreso → `--color-income` con `+`; gasto → `--color-expense` con `−`; saldo → `--color-text`, y en `--color-expense` solo si es negativo. Siempre con la clase `.num` (cifras tabulares).
- **Advertencias** (stock bajo, caja descuadrada) → `--color-warning` sobre `--color-warning-soft` y con ícono, para no confundirlas con el ámbar de marca.
- **Chips** (turnos, estados): texto con el color fuerte sobre el `-soft` correspondiente, en `--text-xs` + `--font-semibold`.
- **Contraste:** todo el texto cumple WCAG AA en los dos temas. `--color-text-subtle` solo se usa en placeholders y datos poco importantes.
- **Tema:** sigue `prefers-color-scheme`. `data-theme="light" | "dark"` en `<html>` lo fuerza. El botón es `src/components/ThemeToggle.astro` (luna/sol, `aria-pressed`, guarda la elección); va en el Sidebar de la app, primero en la barra de la landing y, en el acceso, fijo arriba a la derecha (en móvil, junto al título bajo la franja de la pizarra).

## Colores

### Neutros (base)

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--color-bg` | `#FAF8F5` | `#171310` | Fondo de la página |
| `--color-surface` | `#FFFFFF` | `#211C18` | Tarjetas, sidebar, modales |
| `--color-surface-muted` | `#F3EFE9` | `#2B2520` | Hover, superficies secundarias |
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

### Mundo de `/app/*`

`src/styles/app-surface.css` redefine los tokens solo bajo `:root:has(> body.app-surface)` (la clase la pone `Layout.astro`), así `.btn`, `.input`, `.card`, `.table` y `.modal` de `global.css` toman el mundo de la app sin tocar la landing ni el acceso. La jerarquía sale del tono de la superficie, no de bordes ni sombras.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--color-bg` | `#E7E3DD` | `#0B0908` | Suelo detrás de los paneles y de la barra del turno |
| `--color-surface` | `#FFFFFF` | `#161311` | Paneles (navegación y contenido), popovers |
| `--color-surface-muted` | `#F3F0EB` | `#221E1B` | Superficie elevada: tarjetas, inputs, ítem activo |
| `--color-surface-hover` | `#E9E5DF` | `#2C2723` | Hover de filas y tarjetas, sucursal actual, arte sin tono |
| `--color-border` | `#E4DFD8` | `#2A2522` | Línea bajo el encabezado de tabla, divisores de cifras |
| `--color-border-strong` | `#8A8077` | `#7D736A` | Bordes de inputs y botón secundario (≥3:1 sobre panel y elevada), pista del progreso |
| `--color-text` / `-muted` / `-subtle` | `#1A1613` / `#5C544C` / `#6F665E` | `#F5F1EC` / `#B3A99E` / `#8F857B` | Texto (≥4.5:1 sobre panel y elevada) |

Marca, significado, turnos y sucursales no cambian. En la app el ámbar va en el botón redondo de acción (`.play-btn`), el ícono del ítem activo, el nombre de la sucursal actual, la barra de progreso del turno y el anillo del turno abierto.

## Tipografía

**Plus Jakarta Sans Variable**, instalada localmente con `@fontsource-variable/plus-jakarta-sans` → `--font-sans`.

**Escala de `/app/*`:** en escritorio (≥769px) la raíz baja a 15px (`Layout.astro`), así todo lo que está en `rem` queda un poco más compacto; los controles miden 2.5rem con mouse y 2.75rem con pantalla táctil. Lo que se escribe en un campo nunca baja de 16px.

| Peso | Token | Uso |
|---|---|---|
| 400 | `--font-regular` | Texto general |
| 500 | `--font-medium` | Etiquetas, descripción del encabezado |
| 600 | `--font-semibold` | Navegación, etiquetas de campo, encabezados de tabla |
| 700 | `--font-bold` | Botones, ítem activo, títulos de tarjeta, cifras |
| 800 | `--font-extrabold` | Solo en `/app`: títulos de página y de sección, marca, cifras KPI, monogramas |

Los tamaños son **fluidos**: cada uno es un `clamp()` que crece de forma lineal entre un viewport de 360px y uno de 1280px. Los interlineados (`--text-*-lh`) no tienen unidad.

| Token | 360px → 1280px | Interlineado | Uso |
|---|---|---|---|
| `--text-xs` | 12 → 13px | 1.33 | Badges, chips de turno, notas |
| `--text-sm` | 14 → 15px | 1.43 | Tablas, navegación, texto secundario, ayudas |
| `--text-base` | 16 → 17px | 1.5 | Texto general, inputs (nunca menos de 16px), título de `MediaCard` |
| `--text-lg` | 17 → 18px | 1.55 | `.card-title` |
| `--text-xl` | 18 → 20px | 1.4 | Título de modal |
| `--text-2xl` | 20 → 24px | 1.33 | h2 en `/app` (800) |
| `--text-3xl` | 24 → 30px | 1.2 | Títulos grandes fuera de la app |
| `--text-4xl` | 28 → 36px | 1.1 | Cifras KPI, total en «Registrar venta» |
| `--text-display` | 32 → 56px | 1.05 | Solo en `/app`: h1 del encabezado de página |

- En `/app`, h1 y h2 llevan `letter-spacing: -0.02em`; el h1 del encabezado, `-0.035em`, y las cifras KPI, `-0.03em`. Fuera de la app, a partir de `--text-xl`, `-0.01em`.
- Para nuevos tamaños, mantener la misma interpolación: `clamp(min, a + b·vw, max)` con `b = (max − min) / 920px × 100` y `a = min − b × 3.6px`.
- Los números (montos, cantidades, horas) llevan la clase `.num` (`tabular-nums`).

## Íconos

Se usan los componentes de [Lucide](https://lucide.dev/icons) vía `@lucide/astro`: `import { Wallet } from "@lucide/astro"` → `<Wallet size={20} stroke-width={1.75} />`. Lucide agrega `aria-hidden` y heredan el color con `currentColor`. No se escriben SVG a mano, salvo marcas: el logo (`Logo.astro`) y la «G» de Google (`public/google.svg`).

## Estructura de `/app/*`

El mundo de la app es el de un reproductor de música con la marca de Caja Simple: suelo oscuro, paneles redondeados, píldoras, botones redondos y arte cuadrado para cosas (círculo para personas). Nada de la marca de Spotify: ni su verde, ni su logo, ni su tipografía.

- **Shell** (`Layout.astro`): `<body>` es una grilla de `18.5rem | 1fr` a toda la altura (`100dvh`) sobre `--color-bg`, con `0.5rem` de separación y de margen. A la izquierda la navegación; a la derecha `<main>`, un panel `--color-surface` con `--radius-panel` (8px) y su propio scroll. En una sucursal se suma abajo, a todo el ancho, la barra del turno.
- **Sin bordes ni sombras en los paneles:** se separan por el tono del suelo. Las sombras quedan para lo que flota: popovers, modales, la barra del turno en móvil y el arte de tarjetas y portadas.
- **Móvil (≤768px):** desaparece el suelo; todo queda sobre `--color-surface`, la navegación pasa a barra superior fija y la barra del turno a mini-reproductor fijo abajo.

## Navegación

- **Dos paneles apilados** (`Sidebar.astro`), los dos `--color-surface` con `--radius-panel`: arriba la marca (logo ámbar, «Caja Simple» en 800 y el lema), la campana y el tema; abajo la biblioteca, que crece y hace scroll sola (la barra de scroll aparece al pasar el mouse) y termina en la tarjeta de usuario.
- **Biblioteca:** selector de negocio (`ContextSwitcher.astro`, son enlaces: muestra el rol en cada negocio y termina en «Tus negocios»), luego las secciones y al final «Sucursales». No hay selector de sucursal ni botón de acción: «Registrar venta» vive en la barra del turno.
- **Secciones:** el título es el nombre de la sucursal o del negocio, en `--text-sm`, 800 y `--color-text`, sin mayúsculas. Los enlaces (`--text-sm`, 600, `--color-text-muted`; `--color-text` al pasar) se definen en `src/data/navigation.ts`.
- **Según dónde estás:** en `/app`, «Cuenta» (Tus negocios, Tu cuenta); en las páginas del negocio, la sección del negocio; en una sucursal, la de la sucursal arriba y la del negocio debajo. La empleada nunca ve la sección del negocio ni el resumen de la sucursal.
- **Ítem activo:** `aria-current="page"`, fondo `--color-surface-muted`, texto `--color-text` en 700 y solo el ícono en ámbar (el ámbar sobre la superficie elevada clara no llega a AA como texto).
- **Sucursales como filas de biblioteca:** miniatura cuadrada de 2.75rem con la foto de la fachada (`branchImages()`: enlaces firmados del bucket `branch-images`, una sola petición por página); sin foto, el ícono `Store` en el color de la sucursal (`branchColor()`, el mismo orden que en «Sucursales») sobre ese color al 22%. Al lado, el nombre en 700 y, debajo, la dirección. La actual lleva `aria-current`, fondo `--color-surface-hover` y el nombre en ámbar. Al cambiar de sucursal se queda en la misma sección si el rol la puede ver.
- **Campana** (`NotificationBell.astro`): `.icon-btn` con el número de avisos sin leer, en texto y en el `aria-label` (el color solo refuerza). Abre un popover de 22rem (todo el ancho en móvil) con los avisos, «Marcar todo como leído» y, en una invitación pendiente, «Aceptar» y «Rechazar». Lo sin leer va en negrita, con fondo `--color-primary-soft` y un punto.
- **Popovers:** Popover API nativa, `--color-surface`, `--shadow-md`, `border-radius: 0.75rem`.
- **Móvil:** la marca queda en una barra superior fija de 4rem (superficie al 92% con desenfoque) con el botón de menú; la biblioteca se abre a pantalla completa y el fondo queda `inert`.

## Encabezado de página

`PageHeader.astro` abre cada página de `/app` con el color de su entidad.

- **Degradado:** de arriba abajo, `--tint` al 40% → 16% (al 65%) → `--color-surface`, mezclado en `oklab`, de borde a borde del panel (anula el padding de `<main>` con `--main-pad`). `tint` es el color de la sucursal (`branchColor()`) o, por defecto, el ámbar.
- **Título:** h1 en `--text-display`, 800, `-0.035em`, `text-wrap: balance`.
- **Descripción:** `--text-sm`, 500, en `--color-text`: el `-muted` no llega a AA sobre el tinte.
- **Acciones:** van debajo del título, en una fila que se parte si no cabe.
- **Portada** (slot `cover`): cuadrada, de 6 a 12rem, radio 0.375rem y sombra; queda a la izquierda del título y baja encima a ≤480px. La usa el resumen de la sucursal, con el ícono `Store` sobre su color.

## Barra del turno

`src/components/app/ShiftBar.astro`, abajo en toda página de sucursal (`Layout` la muestra si recibe `context.shift`; los datos salen de `shiftBarData()` en `queries.ts`). Es el reproductor: el turno abierto «suena» siempre.

- **Escritorio:** sobre `--color-bg`, sin panel, en tres columnas.
  - **Izquierda:** el arte del turno (3.5rem, ícono sol, atardecer o luna sobre el `-soft` de su turno), «Turno mañana», y debajo «En curso» en ámbar con las barras `.eq` y el nombre de la sucursal.
  - **Centro:** el horario como el tiempo de una canción: inicio, pista de 4px (`--color-border-strong`) con el relleno ámbar y fin (`+1` si termina al día siguiente). Es un `role="progressbar"` con `aria-valuetext` («2 h 10 min de 8 h»). `shiftProgress()` (`format.ts`) lo calcula en hora de Bolivia (`boliviaNow()`) y se actualiza cada minuto. Pasada la hora de cierre aparece «Pasó la hora de cierre» en `--color-warning` con ícono.
  - **Derecha:** «Ventas» y «Esperado en caja» (`dl`, 700) y el `.play-btn` con `+` y «Registrar venta». A ≤1180px el texto del botón queda solo para lectores de pantalla; a ≤960px se oculta «Ventas».
- **Sin turno abierto:** «Sin turno abierto» con un reloj y, a la derecha, `.btn-primary` «Abrir turno».
- **Nunca repite la página actual:** en «Registrar venta» no muestra ese botón y en «Turnos» no muestra «Abrir turno».
- **Móvil:** mini-reproductor fijo a 0.5rem de los bordes, `--color-surface-hover`, `--radius-panel` y `--shadow-md`. Solo quedan el arte, el título, el esperado y el botón (2.75rem); el progreso se vuelve una línea de 3px al pie, sin horas. `<main>` reserva 6.5rem abajo.
- **El turno abierto en las páginas** (Turnos, resumen de la sucursal): la tarjeta lleva un anillo ámbar de 2px (`box-shadow: inset`) y «En curso» con `.eq`. El texto siempre está: las barras solo acompañan y quedan quietas con movimiento reducido.

## Botones, tarjetas y listas

- **Botones:** en `/app`, `.btn` es una píldora (`999px`) en 700; el primario crece a `scale(1.04)` al pasar el mouse y todos bajan a `0.98` al presionar. El secundario es transparente con borde `--color-border-strong` (`--color-text` al pasar). `.icon-btn` es redondo con hover `--color-surface-hover`. El `Button` de shadcn también es `rounded-full` y 700. Un botón nunca parte su texto (`.btn` lleva `white-space: nowrap`): si la etiqueta incluye un nombre, se deja corta («Entrar») con el nombre en `sr-only`, o se usa `.btn-label`, que lo corta con «…» y lleva el texto completo en `title`.
- **`.play-btn`:** el gesto de «reproducir». Círculo ámbar de 3rem con ícono `--color-on-primary` y sombra, para entrar o registrar. Siempre tiene nombre accesible (`aria-label`, `title` o el texto del enlace que lo contiene).
- **Campos:** `.input` con fondo `--color-surface-muted`, radio 0.375rem y borde `--color-border-strong`, que pasa a `--color-text-muted` al pasar el mouse.
- **Tarjetas:** `.card` y `Card` de shadcn (`--card` = `--color-surface-muted`) son superficies elevadas sin borde ni sombra, con `--radius-panel`.
- **Tarjeta tipo álbum** (`MediaCard.astro`, en «Tus negocios» dentro de `.media-grid`, columnas de mínimo 12.5rem): arte cuadrado con degradado del color de la entidad y monograma en 800 (o imagen; `round` para personas), título en 700 y subtítulo de hasta dos líneas. Toda la tarjeta es el enlace y el foco se dibuja en la tarjeta. Al pasar el mouse se aclara a `--color-surface-hover` y sube el `.play-btn`; en pantallas táctiles se ve siempre.
- **Tarjeta de sucursal** (`BranchCard.astro`):
  - Arriba, la foto de la fachada en 16:9 con margen y radio 0.375rem. Sin foto, el degradado del color de la sucursal con el ícono `Store` y «Agregar foto». Las fotos están en el bucket privado `branch-images`.
  - Sobre la foto, el estado de la caja (chip con ícono), el lápiz para editar y el `.play-btn` «Entrar», que aparece al pasar el mouse (fijo en táctil).
  - Debajo, el nombre con su punto de color, la dirección y los empleados (con elipsis si no caben), los turnos como `ShiftChip` con horario y las cifras de hoy en tres columnas.
- **Cifras del día** (`.kpis`): tres columnas sin tarjetas, separadas por una línea `--color-border`; etiqueta en `--text-sm` 600 atenuada, valor en `--text-4xl` 800 y nota. A ≤900px quedan una debajo de otra.
- **Estante** (`.shelf-head`): título de sección con «Mostrar todo» (`.shelf-link`, `--text-sm` 700, atenuado) a la derecha.
- **Listas y tablas:** como una lista de canciones. El encabezado va sin fondo, en 600 atenuado y con una línea fina `--color-border` debajo; las filas no tienen borde y al pasar el mouse toman `--color-surface-hover` con las puntas redondeadas (0.375rem). Vale para `.table` y para `Table` de shadcn.
- **Modales:** borde `--color-border`, `--shadow-md`, fondo detrás negro al 60% y título en `--text-xl` 800.

## Carga

`.skeleton` (en `global.css`) es un bloque entre `--color-surface-muted` y `--color-border` con un brillo que se desplaza; con movimiento reducido queda quieto. Se usa solo donde algo espera la red o la hidratación, nunca como adorno. Las variantes son `.skeleton-text` (una línea, ancho con `--w`) y `.skeleton-circle`.

- **Navegación en `/app`:** `src/scripts/nav-skeleton.ts` cambia `<main>` por el esqueleto de la página destino (`src/components/app/PageSkeleton.astro`) si la página tarda más de 150 ms. Todos empiezan con un encabezado del mismo tamaño y lugar que el de `PageHeader`, con un degradado neutro (`--color-surface-muted` → `--color-surface`) y una barra de título de 3rem. Las variantes son:
  - `dashboard`: resúmenes;
  - `table`: listas y formularios;
  - `grid`: catálogo e inventario;
  - `cards`: negocios y sucursales.
- **Gráficos:** `ChartContainer` muestra un esqueleto del mismo tamaño hasta montarse.
- **Fotos de productos, avatares y búsqueda de personas:** esqueleto mientras llegan.

## Páginas de acceso: «Pizarra del día»

`/auth/*` tiene su propio mundo, la pizarra de tiza del mostrador. El resto de la app no lo usa. Vive en `src/styles/auth.css`, que solo se activa con `<body class="auth-surface">` (lo pone `AuthLayout.astro`) y redefine los tokens de la app, así `.btn`, `.input`, `.field-*` y `.notice` se adaptan sin duplicar reglas.

- **Composición:** en escritorio, una pizarra fija a la izquierda (`minmax(22rem, 37.5rem)`, marco de madera de 14px y sticky; se ajusta a la altura de la ventana y nunca hace scroll: en pantallas bajas oculta primero la nota, la descripción y la caja registradora, y luego las filas de capacidades menos la primera; el saludo, la cuenta y la frase se quedan) y el formulario de 26.25rem a la derecha. A ≤960px la pizarra se vuelve una franja arriba con el logo y el saludo, con marco y textura pero sin repisa, trazos ni dibujos.
- **Material:** la pizarra (`src/components/auth/Board.astro`) es un objeto, no un rectángulo de color. Marco de madera con veta a lo largo de cada travesaño y bisel; pizarra con polvo de tiza (`--slate-grain`), borrones de borrador (`--chalk-dust`) y viñeta; renglones de tiza irregulares y cortados en lugar de bordes rectos; repisa abajo con una tiza blanca, una amarilla gastada y el borrador.
- **Trazos y dibujos:** SVG en línea con el filtro `#chalk-stroke` (borde rasposo y grano). Subrayado amarillo bajo el saludo, raya de suma y óvalo suelto alrededor de «cuadra», flecha antes de la nota y una caja registradora en el hueco junto a la cuenta. Los dibujos son decoración, nunca datos: no se dibujan cifras, montos ni gráficos. La caja registradora se borra si la pizarra es angosta (`@container`) o baja.
- **Pizarra:** solo contenido verdadero. Saludo según la hora de quien entra (`src/scripts/auth-board.ts`); la cuenta que hace la app escrita como en el mostrador, «ventas − gastos = caja cuadra», sin cifras; tres filas de capacidades (ventas y gastos por sucursal, cuadre por turno, empleados gratis) y la nota de la cuenta única. Ni fecha ni reloj: no le dicen nada nuevo a quien entra. Bajo la marca, la descripción fija «Tu negocio, bajo control. La caja del día, sin cuaderno ni calculadora.»; entre la cuenta y las filas, una frase que invita a la acción de cada página (prop `pitch` de `AuthLayout`). Las dos en tiza; la frase sin promesas que el producto no cumpla. Nunca se inventan cifras ni se adivina el turno.
- **Tiza:** `--font-chalk` (Cabin Sketch 700) solo dentro de la pizarra, en blanco `--chalk` y amarillo `--chalk-yellow` para el saludo y los valores. Las filas tienen la misma altura (`--board-row`) y los valores van alineados a la derecha.
- **Formulario:** Public Sans Variable (`--font-sans`) y controles web estándar. Etiquetas y ayudas en `--text-sm`, lo que se escribe en 16px y el título en `--text-3xl`. Los controles miden 2.5rem de alto (2.75rem con pantalla táctil), para que el registro entre en laptops pequeñas.
- **Acción principal:** en claro, fondo pizarra con texto amarillo; en oscuro, al revés (`--color-primary` / `--color-on-primary`).
- **Movimiento:** al cargar, la tiza se escribe de izquierda a derecha con una máscara (900ms, ease-out expo, escalonada) y enseguida se pasan los trazos con `stroke-dashoffset` (subrayado, raya de suma, óvalo, flecha, caja registradora; 300–800ms de retraso, la misma curva). Con `prefers-reduced-motion: reduce` no hay animación, y todo está visible por defecto.

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
- El tema de shadcn está en `src/styles/app.css`: sus variables (`--background`, `--card`, `--primary`, `--border`, `--ring`…) apuntan a los tokens de `tokens.css`, así claro y oscuro salen de `light-dark()` como en el resto. `--card` es `--color-surface-muted`: las tarjetas son superficies elevadas sobre el panel.
- Colores de gráficos: `--chart-1..3` = turnos (mañana, tarde, noche), `--chart-4` = ingreso, `--chart-5` = gasto; las tortas por categoría usan `--color-branch-1..6`. Cada serie lleva leyenda con nombre y monto: nada solo con color.
- Tailwind se carga solo en `Layout.astro` (`/app/*`), junto con `app-surface.css`. La landing y `/auth/*` no lo usan.
