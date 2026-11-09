# Plan hacia un MVP estable

Pendientes para que un negocio use Caja Simple en su día a día, ordenados por importancia. Edítalo a medida que avances: marca `[x]`, reordena o agrega.
Origen: revisión del código, de las migraciones y de PRODUCT.md del 3 de noviembre de 2026. El ciclo básico ya funciona: abrir turno → vender → gasto → cerrar con arqueo.

## P0: Bloqueantes (sin esto no se puede lanzar)
- [x] **Integridad del dinero en la base** (`20261103190000_p0_integrity.sql`, aplicada el 3 de noviembre junto con 120000–180100; advisors sin hallazgos)
  - Trigger en `shift_closes`: forzar `business_date := private.today()`, y `closed_at` y `counted` en null al abrir (hoy se puede elegir la fecha).
  - `register_sale` pasa a ser security definer, verifica el turno abierto y ordena los ítems por producto (evita bloqueos mutuos). Quitar el insert directo en `sales` y `sale_items`.
  - Quitar el `::numeric(12,2)` de `sale_totals` (init.sql:187) y agregar límites de qty × precio en zod y en la base. Una venta enorme hoy rompe las páginas de la sucursal.
  - Agregar `mfa_ok()` a `respond_invitation` y `search_people`. Grants por columna en `employees` y `shift_closes`.
- [x] **Ventas sin duplicados:** el cliente genera un `saleId` UUID, y si el `23505` llega por un id repetido cuenta como éxito (`src/actions/sales.ts`, `registrar-venta.astro`). Lo mismo para gastos.
- [x] **Corregir errores:** anular venta (devuelve el stock y queda registrada, no se borra) y editar o borrar gasto. Para la dueña, solo con el turno abierto o con un registro de quién lo hizo.
- [x] **Método de pago por venta** (efectivo / QR / transferencia): columna en `sales`; solo el efectivo cuenta en el esperado (`src/data/cash.ts`, función de aviso de descuadre).
- [x] **Recuperar contraseña:** página «¿Olvidaste tu contraseña?», `resetPasswordForEmail` y una página para la contraseña nueva (`src/pages/auth`, `api/auth`).
- [x] **Turnos nocturnos y turnos olvidados:**
  - Si se abre después de medianoche, la fecha es la del día anterior.
  - El esperado de un turno viejo se calcula con su propia fecha.
  - Avisar cuando un turno lleva más de 24 h abierto.
- [x] **Stock sin pisarse:** `saveInventory` solo escribe el stock si cambió (o como ajuste +/−). Hoy puede deshacer ventas.
- [ ] **Producción:** (código listo: `astro:env`, `VAPID_SUBJECT`, Upstash exigido en producción; falta lo del panel)
  - Upstash obligatorio (sin él no hay límite de intentos en la 2FA).
  - SMTP propio y plantillas de correo en español.
  - Site URL y URLs de redirección en Supabase.
  - `PUBLIC_VAPID_PUBLIC_KEY` y `PUBLIC_UPGRADE_URL` en el esquema de `astro:env`; `VAPID_SUBJECT` en `.env.example`.
  - [x] Migración `20261103140000_search_people_by_name.sql` aplicada en la nube. Falta hacer commit del trabajo pendiente.
- [ ] **Legal y honestidad:** (páginas y «Próximamente» listos; faltan los datos entre [corchetes] de `/privacidad` y `/terminos`)
  - Páginas de privacidad y términos.
  - Sacar de `src/data/plans.ts` las funciones que no existen (reportes, exportar, vista consolidada), o marcarlas «Próximamente».

## P1: Para el uso diario (primeras semanas)
- [x] Historial con rango de fechas en Ventas y Gastos (hoy son 7 días fijos, `src/data/branch.ts:16`), con el detalle de cada venta.
- [x] Historial de cierres de turno: quién abrió y cerró, diferencia, y una nota que explique el descuadre.
- [x] Entrada de mercadería y mermas con motivo, más un registro de movimientos de stock. La empleada pide entradas y la dueña las acepta (`20261108200000_stock_requests.sql`).
- [x] Venta con código de barras: la búsqueda de Vender también busca por `barcode`.
- [x] Traspaso de turno: el siguiente turno parte del monto contado del anterior; reabrir un turno cerrado por error (solo la dueña).
- [x] Vencimiento del plan: `plan_until`, recordatorios, y volver a Gratis al vencer. Que la caché se invalide al cambiar el plan.
- [x] Monitoreo: registro de los errores de las Actions y del middleware en JSON. Falta conectar el log drain en Vercel (Sentry, más adelante si hace falta).
- [x] Tests con vitest de `src/lib/dates.ts`, `src/data/cash.ts`, `src/lib/format.ts`, y que `planLimits` coincida con la migración.
- [x] Prueba de accesibilidad en /app con sesión: axe sin errores (claro y oscuro, 1280 y 390px), recorrido con Tab con foco visible y árbol de accesibilidad revisado. Falta probarlo con un lector real (VoiceOver o TalkBack en el celular).

## P2: Mejora la experiencia (después del lanzamiento)
- [x] Checklist de inicio para la dueña nueva: catálogo → inventario → abrir turno → primera venta (`SetupChecklist.astro` en el resumen del negocio).
- [x] Invitación de empleados por correo, y poder invitar a quien todavía no tiene cuenta (`20261104120100_invite_without_account.sql`, Edge Function `send-invite`). Falta: aplicar la migración, desplegar `send-invite` y cambiar la plantilla «Invite user» en Supabase (ver docs/modelo-de-datos.md › Invitaciones); depende del SMTP propio de P0.
- [x] PWA: íconos PNG de 192, 512 y maskable, `apple-touch-icon`, `theme-color` y una página sin conexión. También el favicon, que era el de Astro.
- [x] Vender sin conexión: guardar el carrito en el dispositivo y una cola de ventas con id idempotente (depende de «Ventas sin duplicados»). Después de vender, no recargar la página entera.
- [x] Borrar la cuenta y exportar los datos propios (`20261104120000_delete_my_account.sql`; falta aplicarla).
- [x] Importar productos por CSV o pegando filas de una planilla (nombre, código de barras, categoría y, si se quiere, precio, stock y mínimo), con plantilla para descargar; lo importado puede entrar directo al inventario de las sucursales elegidas.
- [x] Agregar varios productos del catálogo a una sucursal de una vez, con precio y stock en la misma tabla.
- [x] Promociones con descuento (porcentaje, precio especial o lleva N paga M), por fechas, sin fecha límite o ciertos días, en todas o algunas sucursales; solo en los planes pagos (`20261108190000_promotions.sql`, `/app/[negocio]/promociones`).
- [x] Resumen del negocio y de la sucursal en vivo: ventas, gastos y turnos de cualquier sucursal llegan sin recargar (Realtime Broadcast como aviso, canal privado por negocio), con indicador «En vivo» y últimas ventas del día (`20261109191358_business_live.sql`; falta aplicarla y apagar «Allow public access» en Realtime).
- [x] Alta rápida: «Guardar y agregar otro» y lectura del código de barras con la cámara (Chrome/Edge en Android; en iPhone, todavía no).

## P3: Funciones de los planes pagos (Negocio y Sucursales)
- [x] Reportes por día, semana y mes de cada sucursal, y exportar a Excel (CSV) o PDF (imprimir): `/app/<negocio>/sucursales/<sucursal>/reportes`, solo la dueña en plan Negocio o superior.
- [ ] Vista consolidada y comparación entre sucursales; permisos por empleado; historial de cambios; traspaso de stock entre sucursales; tickets, descuentos y fiado.

## Criterio de «MVP estable»
- P0 completo.
- Una semana de uso real en un negocio piloto sin descuadres causados por la app.
- `pnpm build`, `astro check` y los tests de P1 en verde.
