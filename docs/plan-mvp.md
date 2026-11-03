# Plan hacia un MVP estable

Pendientes para que un negocio use Caja Simple en su día a día, ordenados por importancia. Edítalo a medida que avances: marca `[x]`, reordena o agrega.
Origen: revisión del código, de las migraciones y de PRODUCT.md del 3 de noviembre de 2026. El ciclo básico ya funciona: abrir turno → vender → gasto → cerrar con arqueo.

## P0: Bloqueantes (sin esto no se puede lanzar)
- [ ] **Integridad del dinero en la base** (nueva migración)
  - Trigger en `shift_closes`: forzar `business_date := private.today()`, y `closed_at` y `counted` en null al abrir (hoy se puede elegir la fecha).
  - `register_sale` pasa a ser security definer, verifica el turno abierto y ordena los ítems por producto (evita bloqueos mutuos). Quitar el insert directo en `sales` y `sale_items`.
  - Quitar el `::numeric(12,2)` de `sale_totals` (init.sql:187) y agregar límites de qty × precio en zod y en la base. Una venta enorme hoy rompe las páginas de la sucursal.
  - Agregar `mfa_ok()` a `respond_invitation` y `search_people`. Grants por columna en `employees` y `shift_closes`.
- [ ] **Ventas sin duplicados:** el cliente genera un `saleId` UUID, y si el `23505` llega por un id repetido cuenta como éxito (`src/actions/sales.ts`, `registrar-venta.astro`). Lo mismo para gastos.
- [ ] **Corregir errores:** anular venta (devuelve el stock y queda registrada, no se borra) y editar o borrar gasto. Para la dueña, solo con el turno abierto o con un registro de quién lo hizo.
- [ ] **Método de pago por venta** (efectivo / QR / transferencia): columna en `sales`; solo el efectivo cuenta en el esperado (`src/data/cash.ts`, función de aviso de descuadre).
- [ ] **Recuperar contraseña:** página «¿Olvidaste tu contraseña?», `resetPasswordForEmail` y una página para la contraseña nueva (`src/pages/auth`, `api/auth`).
- [ ] **Turnos nocturnos y turnos olvidados:**
  - Si se abre después de medianoche, la fecha es la del día anterior.
  - El esperado de un turno viejo se calcula con su propia fecha.
  - Avisar cuando un turno lleva más de 24 h abierto.
- [ ] **Stock sin pisarse:** `saveInventory` solo escribe el stock si cambió (o como ajuste +/−). Hoy puede deshacer ventas.
- [ ] **Producción:**
  - Upstash obligatorio (sin él no hay límite de intentos en la 2FA).
  - SMTP propio y plantillas de correo en español.
  - Site URL y URLs de redirección en Supabase.
  - `PUBLIC_VAPID_PUBLIC_KEY` y `PUBLIC_UPGRADE_URL` en el esquema de `astro:env`; `VAPID_SUBJECT` en `.env.example`.
  - Confirmar que la migración `20261103140000_search_people_by_name.sql` está aplicada en la nube y hacer commit del trabajo pendiente.
- [ ] **Legal y honestidad:**
  - Páginas de privacidad y términos.
  - Sacar de `src/data/plans.ts` las funciones que no existen (reportes, exportar, vista consolidada), o marcarlas «Próximamente».

## P1: Para el uso diario (primeras semanas)
- [ ] Historial con rango de fechas en Ventas y Gastos (hoy son 7 días fijos, `src/data/branch.ts:16`), con el detalle de cada venta.
- [ ] Historial de cierres de turno: quién abrió y cerró, diferencia, y una nota que explique el descuadre.
- [ ] Entrada de mercadería y mermas con motivo, más un registro de movimientos de stock. La empleada puede registrar entradas.
- [ ] Venta con código de barras: la búsqueda de Vender también busca por `barcode`.
- [ ] Traspaso de turno: el siguiente turno parte del monto contado del anterior; reabrir un turno cerrado por error (solo la dueña).
- [ ] Vencimiento del plan: `plan_until`, recordatorios, y volver a Gratis al vencer. Que la caché se invalide al cambiar el plan.
- [ ] Monitoreo: Sentry (o un log drain de Vercel) y registro de los errores de las Actions.
- [ ] Tests con vitest de `src/lib/dates.ts`, `src/data/cash.ts`, `src/lib/format.ts`, y que `planLimits` coincida con la migración.
- [ ] Prueba manual de accesibilidad pendiente: Tab, lector de pantalla y axe en /app con sesión.

## P2: Mejora la experiencia (después del lanzamiento)
- [ ] Checklist de inicio para la dueña nueva: catálogo → inventario → abrir turno → primera venta.
- [ ] Invitación de empleados por correo, y poder invitar a quien todavía no tiene cuenta.
- [ ] PWA: íconos PNG de 192, 512 y maskable, `apple-touch-icon`, `theme-color` y una página sin conexión.
- [ ] Vender sin conexión: guardar el carrito en el dispositivo y una cola de ventas con id idempotente (depende de «Ventas sin duplicados»). Después de vender, no recargar la página entera.
- [ ] Borrar la cuenta y exportar los datos propios.
- [ ] Importar productos por CSV.

## P3: Funciones de los planes pagos (Negocio y Sucursales)
Reportes por día, semana y mes; exportar a Excel o PDF; vista consolidada y comparación entre sucursales; permisos por empleado; historial de cambios; traspaso de stock entre sucursales; tickets, descuentos y fiado.

## Criterio de «MVP estable»
- P0 completo.
- Una semana de uso real en un negocio piloto sin descuadres causados por la app.
- `pnpm build`, `astro check` y los tests de P1 en verde.
