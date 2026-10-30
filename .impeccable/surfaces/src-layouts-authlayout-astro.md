---
version: 1
slug: "src-layouts-authlayout-astro"
primary_target: "src/layouts/AuthLayout.astro"
related_targets: ["src/pages/auth/iniciar-sesion.astro","src/pages/auth/crear-cuenta.astro"]
---

# Páginas de acceso

Alcance: `/auth/iniciar-sesion` y `/auth/crear-cuenta` (AuthLayout y los componentes de `src/components/auth/`). Modo: **Operate**. Mundo propio de acceso; el resto de la app conserva DESIGN.md.

Público: empleados de sucursal y dueños (con frecuencia, la misma persona). Trabajo: entrar o crear la cuenta en la computadora. Restricciones: el marcado del formulario, `auth-form.ts`, la accesibilidad y el texto se conservan. La autenticación todavía no está conectada.

Momento memorable: la pizarra escribe el saludo, la fecha y la hora reales de quien entra. El turno no se adivina, porque los horarios dependen de cada negocio.

## Direction contract

THESIS: Entrar es abrir la caja del día. Se rechaza la tarjeta centrada sobre un fondo neutro y también el panel de marca con un eslogan.

OWN-WORLD: Pizarra de tiza verde pizarra (#1F2B25) enmarcada en madera, rotulada en tiza blanca con Cabin Sketch y con el amarillo tiza (#F2CF5B) solo para el saludo y los valores. El formulario va sobre una pared encalada verdosa (#EEF1EC), en Public Sans, con un solo tamaño de cuerpo y controles web estándar. La acción principal es un botón pizarra con texto amarillo. Modo oscuro: la pared se vuelve pizarra oscura y la pizarra se mantiene.

STORY: La persona reconoce la pizarra del mostrador, ve el saludo, la fecha y la hora de hoy, entiende que una cuenta sirve para trabajar en un negocio y para llevar el suyo, e inicia sesión o crea la cuenta sin distracciones.

FIRST VIEWPORT: Desktop 1440×900. A la izquierda, una pizarra de ~600px a toda la altura con 24px de margen: logo y nombre arriba, «Hoy» y el número del día a ~130px (la fecha es la dueña del campo, con al menos media pizarra vacía), y abajo filas regladas de igual altura (Hora con cifras tabulares, Ventas y gastos, Cuadre de caja, con los valores alineados a la derecha) más una nota. A la derecha, el formulario de 420px centrado. En móvil la pizarra se reduce a una franja superior.

FORM: Pizarra del día, candidato 6 de 7 en la lista ordenada; seed:8c04344ed749c701. Mejoras: filas enteras (catálogo de feria), valores a la derecha (casete), las líneas de la pizarra como retícula (Crouwel), campo vacío (Saville), un solo tamaño (manual), jerarquía solo por escala (muestrario). Interacción distintiva: la tiza se escribe al cargar (barrido con máscara) y la hora se actualiza cada minuto.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
