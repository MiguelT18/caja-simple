# Diseño de Caja Simple

Tono cálido y cercano, con modo claro y oscuro. Todos los valores viven en `src/styles/tokens.css`; los componentes usan solo `var(--…)`, nunca colores hex sueltos.

## Reglas

- **El acento es escaso.** `--color-primary` (ámbar) se reserva para la acción principal, el ítem activo y el logo. Lo que guía la vista son los colores con significado.
- **Nada se comunica solo con color.** Los montos llevan signo (`+` / `−`), las alertas llevan ícono y los turnos su nombre escrito.
- **Montos:** ingreso → `--color-income` con `+`; gasto → `--color-expense` con `−`; saldo → `--color-text`, y en `--color-expense` solo si es negativo. Siempre con la clase `.num` (cifras tabulares).
- **Advertencias** (stock bajo, caja descuadrada) → `--color-warning` sobre `--color-warning-soft` y con ícono, para no confundirlas con el ámbar de marca.
- **Chips** (turnos, estados): texto con el color fuerte sobre el `-soft` correspondiente, en `--text-xs` + `--font-semibold`.
- **Contraste:** todo el texto cumple WCAG AA en los dos temas. `--color-text-subtle` solo se usa en placeholders y datos poco importantes.
- **Tema:** sigue `prefers-color-scheme`. `data-theme="light" | "dark"` en `<html>` lo fuerza.

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
