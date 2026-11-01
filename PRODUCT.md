# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Empleados de sucursal:** registran ventas y gastos durante su turno en la sucursal donde trabajan.
- **Dueños de negocio:** controlan su negocio y sus sucursales (ventas, gastos, productos, cuadre de caja).
- Una misma persona puede tener los dos roles a la vez: ser empleada en la sucursal de un negocio y ser dueña de otro negocio con sus propias sucursales. La cuenta es de la persona, no del rol.

## Product Purpose

Caja Simple lleva la caja de negocios pequeños con una o varias sucursales: registrar ventas, gastos y productos, organizar el trabajo por turnos (mañana, tarde, noche) y saber si la caja cuadra. Tiene éxito cuando el dueño sabe cómo va su negocio y el empleado registra sin fricción.

## Operating Context

- Se usa sobre todo desde una computadora: la del local o la de la casa.
- Una persona tiene uno o varios **negocios** y puede trabajar en negocios ajenos. Cada negocio tiene **sucursales**; el **catálogo** de productos es del negocio y cada sucursal lleva su **inventario** (precio, stock y mínimo), sus turnos, sus ventas y sus gastos. Detalle en `docs/modelo-de-datos.md`.
- El rol es por negocio: la dueña ve el resumen del negocio, sus sucursales, el catálogo y los empleados; la empleada ve solo lo operativo de su sucursal (registrar venta, gastos, inventario en consulta y turnos).

## Capabilities and Constraints

- Astro 7, español, con modo claro y oscuro.
- `/` es la landing pública y `/planes`, los planes y precios; las dos reconocen la sesión (sin ella invitan a crear cuenta, con ella llevan a la app). La app vive bajo `/app/*`: `/app` lista tus negocios, `/app/[negocio]` es el resumen del negocio y `/app/[negocio]/sucursales/[sucursal]/…` es el trabajo diario de cada sucursal.
- Rutas de acceso: `/auth/iniciar-sesion` y `/auth/crear-cuenta`, con correo y contraseña o con Google.
- Cobro: el plan es de cada negocio y lo paga su dueño, por sucursal; trabajar como empleado nunca cuesta. Planes Gratis / Negocio / Sucursales en `src/data/plans.ts`, con precios orientativos todavía sin validar. Los límites de cada plan ya se aplican en la base (ver `docs/planes-de-suscripcion.md`); el plan se activa a mano tras el pago por QR, transferencia o tarjeta.
- La autenticación todavía no está conectada: el envío muestra un aviso de "aún no conectada" y el OAuth de Google es un TODO.
- Sin decidir: recuperación de contraseña.
- Empleados: la dueña invita a una persona que ya tiene cuenta (correo, puesto, sucursal y turno); la persona acepta o rechaza desde su bandeja de notificaciones.

## Brand Commitments

- Nombre: **Caja Simple**. El logo es el SVG de `src/components/Logo.astro`.
- Voz: español neutro, con tuteo, cercana y directa ("Ingresa tu correo").

## Evidence on Hand

No hay clientes, testimonios, métricas ni capturas reales. No se fabrican; los datos de demostración se marcan como tales.

## Product Principles

1. La cuenta es de la persona: un mismo acceso sirve para trabajar en un negocio y para administrar el propio.
2. Registrar debe ser más rápido que anotar en papel.
3. Nada se comunica solo con color: los montos llevan signo, las alertas llevan ícono.

## Accessibility & Inclusion

Todo el texto en WCAG AA en los dos temas. Inputs de al menos 16px. Foco siempre visible.
