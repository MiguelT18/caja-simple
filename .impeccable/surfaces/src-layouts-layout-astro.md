---
version: 1
slug: "src-layouts-layout-astro"
primary_target: "src/layouts/Layout.astro"
related_targets: ["src/pages/app/index.astro","src/pages/app/[negocio]/index.astro","src/pages/app/[negocio]/sucursales/[sucursal]/index.astro"]
---

# /app/* — la app con sesión

Modo: Operate. Dueñas y empleadas registran ventas y gastos, abren y cierran turnos y revisan cómo va el negocio, en la computadora del local o de la casa y también en el celular, a cualquier hora (los turnos nocturnos existen). Restricciones: claro y oscuro según el sistema (con botón), AA, inputs de 16px, nada solo con color, acento ámbar de la marca; nada de la marca de Spotify (ni su verde, ni su logo, ni su tipografía).

## Direction contract

THESIS: La caja del día se maneja con la forma de un reproductor: el turno abierto vive siempre abajo, con la cuenta de su caja a la vista (apertura + ventas − gastos = esperado), y cada sucursal es un álbum con su portada. Rechaza el tablero de tarjetas con borde sobre fondo crema.

OWN-WORLD: Suelo casi negro cálido (claro: piedra #e8e4de) con dos paneles redondeados a 8px de distancia; superficies elevadas en lugar de bordes; ámbar solo en el botón redondo de acción, la acción principal de cada vista (botón en píldora), el ícono del ítem activo y el punto vivo de «En curso». Plus Jakarta 800 con tracking −0.03em en títulos; píldoras, botones circulares, listas sin bordes por fila con hover redondeado, arte cuadrado para cosas y círculo para personas.

STORY: Quien entra ve su contexto (negocio, sucursal) en la Biblioteca, el estado del turno y su caja abajo, y cada página abre con el color de su entidad. Registra una venta desde la barra en un clic.

FIRST VIEWPORT: Izquierda, panel de navegación (marca, campana, tema; Biblioteca con negocio, secciones y sucursales con miniatura). Derecha, panel con encabezado degradado del color de la sucursal, título de 56px en 800 y acciones en píldora debajo; luego el contenido. Abajo, a todo el ancho, la barra del turno: turno con «En curso», horario y sucursal a la izquierda; la cuenta de la caja al centro; botón redondo ámbar «Registrar venta» a la derecha.

FORM: Lenguaje de reproductor de música (pedido explícito del usuario: «al estilo Spotify», «similar más no lo mismo»), aplicado solo como tipo, paleta, densidad y dos gestos: encabezado degradado por entidad y barra del turno fija abajo. seed: none (unavailable): el usuario fijó la dirección, así que no se tiró la ruleta de conceptos.

RISK: El negro puede aplanar la jerarquía en tablas densas; se compensa con superficies elevadas y pesos tipográficos, nunca con bordes. El modo claro debe sostener la misma estructura sin parecer otro producto. Del reproductor se toma la forma, nunca sus metáforas de audio: nada de tiempos de canción, ecualizadores, reproducir/pausar ni listas con duración; cada pieza muestra datos de la caja.
