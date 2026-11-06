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
| Gratis | Puesto o tienda que recién empieza | 1 negocio, 1 sucursal, empleados ilimitados, ventas, gastos, turnos y cuadre. Historial de 60 días | 0 | — |
| Negocio | El local que ya depende de la app | Todo lo anterior, con historial completo, reportes por día, semana y mes, exportar a Excel o PDF | 5,50 | 55 |
| Sucursales | Dueño con 2 o más locales | Todo lo de Negocio, más vista consolidada, comparación entre sucursales, permisos por empleado y sucursal, e historial de quién hizo cada cambio | 5,50 + 3,50 por sucursal extra | 55 + 35 por sucursal extra |

## Precio en bolivianos

El sistema calcula el total en bolivianos al generar cada cobro: precio en dólares por el tipo de cambio oficial del BCB del día, más impuestos, redondeado al boliviano.

```latex
\text{Total (Bs)} = \operatorname{redondear}\left( \frac{\text{Precio (US\$)} \times \text{TC}}{1 - 0{,}16} \right)
```

El 0,16 es IVA (13%) más IT (3%), ambos calculados sobre el total facturado. Por eso se divide entre 0,84 en vez de multiplicar por 1,16: así, después de impuestos, queda limpio el precio en dólares.

Ejemplo con un tipo de cambio de Bs 12,00 (solo ilustrativo):

| Concepto | US$ sin impuestos | Bs con impuestos |
| --- | --- | --- |
| Negocio, mensual | 5,50 | 79 |
| Sucursal extra, mensual | 3,50 | 50 |
| Sucursales con 3 locales, mensual | 12,50 | 179 |
| Negocio, anual | 55 | 786 |
| Sucursal extra, anual | 35 | 500 |

- La factura y el cobro (QR, transferencia o tarjeta) van siempre en bolivianos. El dólar es solo la referencia del precio.
- El monto en Bs queda fijo desde que se genera el cobro hasta que vence (por ejemplo, 3 días). Si vence sin pagarse, se recalcula con el tipo de cambio nuevo.
- La app muestra los dos valores: "US$ 5,50 + impuestos · hoy Bs 79".
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

En la app (`/app/<negocio>/plan`) se ofrecen tres métodos: **QR bancario**, **transferencia bancaria** y **tarjeta de crédito** (con un enlace de pago enviado a mano). Los tres muestran el monto ya convertido a bolivianos con impuestos, y con cualquiera de ellos el plan se activa a mano al ver el pago.

## Límites en la app

La base de datos aplica los límites (migración `supabase/migrations/20261031012616_plan_limits.sql`). `planLimits`, en `src/data/plans.ts`, solo los muestra y tiene que coincidir con ella. Ese mismo archivo repite, para mostrarlos, los precios en dólares sin impuestos de `private.plan_usd`. No se guarda ningún precio fijo en bolivianos: se calcula al mostrarlo y al cobrar.

| Límite | Gratis | Negocio | Sucursales | Dónde se aplica |
| --- | --- | --- | --- | --- |
| Sucursales por negocio | 1 | 1 | sin tope (cada extra se cobra) | trigger `branches_check_limit` |
| Negocios en Gratis por persona | 1 | — | — | trigger `businesses_check_free` |
| Historial de ventas, gastos y cierres a la vista | últimos 60 días | completo | completo | RLS (`private.history_start`) |
| Reportes por día, semana y mes; exportar | no | sí | sí | solo en la app (`planLimits.reports`): RLS ya filtra los datos |

- Un negocio nuevo siempre empieza en Gratis. Para abrir un segundo negocio, el primero tiene que estar en un plan pago.
- La vista consolidada, los permisos por empleado y el historial de cambios todavía no existen en la app, así que no hay nada que limitar ahí.
- **Al bajar de plan no se borra nada.** Las sucursales que sobran siguen funcionando, pero no se pueden agregar otras. El historial de más de 60 días se oculta y vuelve a aparecer al pagar.

### Activar un plan tras el pago

La dueña ve el uso de su plan en `/app/<negocio>/configuracion` y los planes con sus precios en `/app/<negocio>/plan`. Ahí genera el **cobro**: elige plan, mensual o anual, y método (QR, transferencia o tarjeta), y ve el monto en bolivianos con impuestos, fijo hasta que vence, con su código y las instrucciones del método. No puede cambiar de plan ella misma.

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

El botón «Ya pagué: avisar» lleva a `PUBLIC_UPGRADE_URL` (WhatsApp, un formulario…). Si la variable no está definida, la página solo muestra el código para avisar.

Pendiente: el precio fundador (50% el primer año) y la factura electrónica.
