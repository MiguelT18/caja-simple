<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Iconos: `lucide-react`

Instalado `lucide-react` (v1). No hace falta tocar `next.config.ts`: esta versión
de Next ya incluye `lucide-react` en `experimental.optimizePackageImports` por
defecto, así que un import con nombre se reescribe al archivo del icono y solo
se empaqueta lo que se usa.

**Importa siempre por nombre, directo desde el paquete:**

```tsx
import { ShoppingCart, TrendingUp } from "lucide-react";
```

No hagas ninguna de estas cosas:

- `import { icons } from "lucide-react"` ni `import * as icons`: eso arrastra los
  ~2100 iconos.
- Un barrel propio que reexporte iconos: rompe la reescritura por icono y
  añade indirección sin ganar nada.
- `DynamicIcon` de `lucide-react/dynamic`: es un import distinto al principal
  (rompió en v1), necesita `"use client"` y carga el mapa completo de iconos.
  Úsalo solo si el nombre del icono llega como string en runtime, y entonces
  prefija el archivo con `"use client"`.

**Props y estilo:**

- Tamaño con el prop `size` (por defecto `24`), no con CSS. Lucide emite `width`
  y `height` como atributos de presentación del SVG y cualquier regla CSS gana
  sobre ellos, así que un `width` en CSS rompe el `size` en silencio.
- El color no necesita nada: los iconos ya usan `stroke: currentColor`.
- No pases `aria-hidden`: lucide lo añade solo cuando no detecta props de
  accesibilidad. Pasa `aria-label` o `<title>` solo si el icono es el único
  contenido con significado.
- En v1 el tipo `IconNode` está deprecado; usa `LucideIconNode`.

Todos los iconos de lucide v1 son client components: su implementación interna
usa `useLucideContext`, así que el módulo lleva `"use client"`. Importarlos desde
un Server Component funciona y el HTML llega igual por SSR, pero cada icono
suma una referencia de cliente. El módulo compartido (`Icon.mjs`) se carga una
sola vez, así que el coste marginal por icono es pequeño y no conviene pelearse
con ello. No pongas `"use client"` en un archivo solo por usar iconos: los iconos
ya son cliente y ese directive se lleva el módulo entero a cliente.

