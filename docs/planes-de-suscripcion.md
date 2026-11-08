# Caja Simple: planes de suscripción

Oct 29, 2026 · @miguel teran

## Recomendación

Cobrar **al dueño, por sucursal**, y que los empleados entren siempre gratis.

El plan es **de cada negocio**: quien tiene dos negocios paga cada uno por separado, y trabajar como empleado en un negocio ajeno nunca cuesta.

El precio se fija **en dólares** y el cliente paga **en bolivianos**: el sistema convierte con el tipo de cambio del día y suma los impuestos.

Así encaja con cómo está pensada la app. La cuenta es de la persona y no del rol, así que cobrar por usuario castigaría justo lo que se quiere fomentar: que el dueño invite a su gente y que registrar sea fácil.

La sucursal crece al mismo ritmo que el negocio. El que tiene tres locales gana más y saca más provecho del panel, así que entiende por qué paga más.

## Estructura propuesta

Tres planes, con precio en dólares y sin impuestos. El monto final en bolivianos sale de la sección siguiente.

| Plan | Para quién | Incluye | Mensual (US$, sin impuestos) | Anual (US$, 2 meses gratis) |
| --- | --- | --- | --- | --- |
| Gratis | Puesto o tienda que recién empieza | 1 sucursal por negocio (negocios ilimitados), empleados ilimitados, ventas, gastos, turnos y cuadre. Historial de 60 días | 0 | — |
| Negocio | El local que ya depende de la app | Todo lo anterior, con historial completo, reportes por día, semana y mes, exportar a Excel o PDF | 5,50 | 55 |
| Sucursales | Dueño con 2 o más locales | Todo lo de Negocio, más vista consolidada, comparación entre sucursales, permisos por empleado y sucursal, e historial de quién hizo cada cambio | 5,50 + 3,50 por sucursal extra | 55 + 35 por sucursal extra |

## Precio en bolivianos

El sistema calcula el total en bolivianos al generar cada cobro: precio en dólares por el tipo de cambio oficial del BCB del día, más impuestos, redondeado al boliviano.

```latex
\text{Total (Bs)} = \operatorname{redondear}\left( \frac{\text{Precio (US\$)} \times \text{TC}}{1 - 0{,}16} \right)
```

El 0,16 es IVA (13%) más IT (3%), ambos calculados sobre el total facturado. Por eso se divide entre 0,84 en vez de multiplicar por 1,16: así, después de impuestos, queda limpio el precio en dólares.

Ejemplo con el tipo de cambio de Bs 11,81 (7 de noviembre de 2026):

| Concepto | US$ sin impuestos | Bs con impuestos |
| --- | --- | --- |
| Negocio, mensual | 5,50 | 77 |
| Sucursal extra, mensual | 3,50 | 49 |
| Sucursales con 3 locales, mensual | 12,50 | 176 |
| Negocio, anual | 55 | 773 |
| Sucursal extra, anual | 35 | 492 |

- La factura y el cobro (por QR) van siempre en bolivianos. El dólar es solo la referencia del precio.
- El monto en Bs queda fijo desde que se genera el cobro hasta que vence (por ejemplo, 3 días). Si vence sin pagarse, se recalcula con el tipo de cambio nuevo.
- La app muestra los dos valores: "US$ 5,50 + impuestos · hoy Bs 77".
- Si ese día no se puede obtener el tipo de cambio, se usa el último disponible y se registra cuál fue.
- La tasa de 0,16 es configurable y hay que confirmarla con un contador según el régimen ante el SIN. No incluye la comisión de la pasarela de pago.

## Criterios detrás

- **Lo básico va en todos los planes.** Registrar ventas y cuadrar la caja funciona en el plan gratis. Si se limita, el empleado vuelve al cuaderno y se pierde al cliente. Lo que se paga es el historial, el análisis y tener más de una sucursal.
- **No limitar la cantidad de ventas.** Un tope de "X ventas al mes" castiga al negocio justo cuando le va bien y anima a no registrar todo.
- **Limitar el historial, no las funciones.** Después de dos meses de uso, el dueño quiere comparar con el mes pasado. Ese es el momento natural para pasar a un plan pago.
- **Precio anclado en dólares.** Vercel, Supabase y Upstash se pagan en dólares. Con el precio en US$, una devaluación del boliviano no se come el margen. El precio en dólares se revisa una vez al año.
- **Plan anual con 2 meses gratis.** Da caja por adelantado y reduce cancelaciones.
- **Precio fundador.** Los primeros 20–50 negocios pagan 50% durante el primer año a cambio de opiniones. No es de por vida, porque un descuento permanente ata el ingreso aunque suban los costos.

## Cobros en Bolivia

Muchos negocios pequeños pagan por QR bancario y pocos tienen tarjeta para cobros automáticos. Al principio conviene cobrar por QR, mensual o anual, y activar el plan a mano o de forma semiautomática, en vez de montar Stripe desde el primer día.

Con QR no hay cobro automático, así que hacen falta recordatorios antes de que venza el plan.

En la app (`/app/<negocio>/plan`) el único método es el **QR bancario** de monto abierto (BCP), con el monto ya convertido a bolivianos con impuestos. El QR del BCP vive en `public/pagos/`: `qr.jpg` es el original (póster completo), `qr-codigo.webp` el recorte de la tarjeta que se muestra en la página del cobro y `qr-descarga.jpg` la copia liviana para descargar (los dos salen de `qr.jpg` con sharp). Si `billing_settings.qr_image_url` tiene otra imagen, se usa esa para todo. **El QR actual vence el 07/11/2028.** Cada cobro tiene su página, `/app/<negocio>/cobro/<id>`: para qué negocio es, el monto, el QR y los pasos (pagar, enviar el comprobante por WhatsApp, activación y avisos de vencimiento). La base todavía acepta transferencia y tarjeta (`plan_charges.method`), pero la página no las ofrece.

## Límites en la app

La base de datos aplica los límites (migración `supabase/migrations/20261031012616_plan_limits.sql`). `planLimits`, en `src/data/plans.ts`, solo los muestra y tiene que coincidir con ella. Ese mismo archivo repite, para mostrarlos, los precios en dólares sin impuestos de `private.plan_usd`. No se guarda ningún precio fijo en bolivianos: se calcula al mostrarlo y al cobrar.

| Límite | Gratis | Negocio | Sucursales | Dónde se aplica |
| --- | --- | --- | --- | --- |
| Sucursales por negocio | 1 | 1 | sin tope (cada extra se cobra) | trigger `branches_check_limit` |
| Historial de ventas, gastos y cierres a la vista | últimos 60 días | completo | completo | RLS (`private.history_start`) |
| Reportes por día, semana y mes; exportar | no | sí | sí | solo en la app (`planLimits.reports`): RLS ya filtra los datos |

- Un negocio nuevo siempre empieza en Gratis. Una persona puede tener los negocios que quiera: cada uno paga su propio plan (migración `20261108130000_charge_by_branches_unlimited_businesses.sql`).
- La vista consolidada, los permisos por empleado y el historial de cambios todavía no existen en la app, así que no hay nada que limitar ahí.
- **Al bajar de plan no se borra nada.** Las sucursales que sobran siguen funcionando, pero no se pueden agregar otras. El historial de más de 60 días se oculta y vuelve a aparecer al pagar.

### Activar un plan tras el pago

La dueña ve el uso de su plan en `/app/<negocio>/configuracion` y los planes con sus precios en `/app/<negocio>/plan`. Ahí genera el **cobro**: elige cuántos locales paga (nunca menos de los que tiene; 1 = Negocio, más = Sucursales) y mensual o anual, ve el total al instante, y ve el monto en bolivianos con impuestos, fijo hasta que vence, con su código y el QR para pagar. No puede cambiar de plan ella misma.

Cómo funciona por dentro (migración `20261104150000_plan_charges.sql`):

- **Tipo de cambio:** un cron trae cada día el oficial del BCB desde `apibcb.cucu.bo` (el BCB no tiene API) y lo guarda en `public.exchange_rates`. Corre a las 06:15 y a las 12:15 de Bolivia. Si un día falla, se usa el último disponible, y cada cobro guarda cuál usó (`rate_date`).
- **Precio:** `private.plan_usd` tiene los precios en dólares; `src/data/plans.ts` los repite para mostrarlos (`plans.test.ts` avisa si dejan de coincidir). `private.bs_total` aplica la fórmula de arriba.
- **Cobro:** `public.create_plan_charge` calcula el monto con el tipo de cambio y la tasa del momento y lo guarda en `public.plan_charges`. Si ya hay uno vigente igual, devuelve ese, así el monto no cambia hasta que vence.

Al ver el pago, un administrador lo activa con SQL usando el código del cobro (los primeros 8 caracteres del id). Esto marca el cobro como pagado, pone el plan y extiende `plan_until` un mes o un año:

```sh
pnpm dlx supabase db query --db-url "$DB_URL" "select id, amount_bs, created_at from public.plan_charges where id::text ilike 'a1b2c3d4%';"
pnpm dlx supabase db query --db-url "$DB_URL" "select private.activate_plan_charge('<id del cobro>');"
```

La tasa de impuestos, los días que dura un cobro y los datos para pagar (imagen del QR, cuenta para transferir y el texto para la tarjeta) están en `public.billing_settings`, una sola fila que se edita con SQL:

```sh
pnpm dlx supabase db query --db-url "$DB_URL" "update public.billing_settings set qr_image_url = 'https://…/qr.png', bank_details = E'Banco …\nCuenta …\nTitular …';"
```

El botón «Ya pagué: enviar comprobante» lleva a `PUBLIC_UPGRADE_URL`. Con un enlace de WhatsApp (`https://wa.me/591…`), el mensaje va ya escrito con el negocio, el monto y el código del cobro. Si la variable no está definida, se usa el WhatsApp de cobros, +591 67677457 (`src/data/plans.ts`).

### Precio fundador

Los primeros **20 negocios que pagan** tienen **50% de descuento durante 12 meses** desde su primer pago (migración `20261108140000_founder_promo.sql`). Con TC 11,81: Negocio a Bs 39 al mes o Bs 387 al año.

- **Cupo:** lo ocupa el negocio al activarse su primer cobro con descuento (`activate_plan_charge` pone `businesses.founder_since`). Un cobro generado y sin pagar no ocupa cupo.
- **Cobro:** `create_plan_charge` aplica el descuento si el negocio ya es fundador y está dentro de sus 12 meses, o si todavía quedan cupos. Lo guarda en `plan_charges.discount`, y `usd` ya va con descuento.
- **Caso borde:** si varios cobros con descuento se generan con el último cupo libre, todos se respetan al pagarse (el monto se mostró fijo). Puede pasarse de 20 por uno o dos.
- **Barra:** `PromoBar` muestra los cupos reales de `public.founder_promo()` en `/`, `/planes` y en `/app` (solo a quien tiene un negocio propio en Gratis; ahí se puede ocultar). Sin cupos, o con la promo apagada, no aparece.
- **Configurar o apagar:** en `public.billing_settings` (`founder_active`, `founder_slots`, `founder_discount`, `founder_months`):

```sh
pnpm dlx supabase db query --db-url "$DB_URL" "update public.billing_settings set founder_active = false;"
```

Pendiente: la factura electrónica.
