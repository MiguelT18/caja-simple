# Caja Simple: planes de suscripción

Oct 29, 2026 · @miguel teran

## Recomendación

Cobrar **al dueño, por sucursal**, y que los empleados entren siempre gratis.

El plan es **de cada negocio**: quien tiene dos negocios paga cada uno por separado, y trabajar como empleado en un negocio ajeno nunca cuesta.

El precio se fija **en dólares** y el cliente paga **en bolivianos**: el sistema convierte con el tipo de cambio del día. **Mientras no haya NIT, no se suman impuestos** (ver abajo).

Así encaja con cómo está pensada la app. La cuenta es de la persona y no del rol, así que cobrar por usuario castigaría justo lo que se quiere fomentar: que el dueño invite a su gente y que registrar sea fácil.

La sucursal crece al mismo ritmo que el negocio. El que tiene tres locales gana más y saca más provecho del panel, así que entiende por qué paga más.

## Estructura propuesta

Tres planes, con precio en dólares y sin impuestos. El monto final en bolivianos sale de la sección siguiente.

| Plan | Para quién | Incluye | Mensual (US$, sin impuestos) | Anual (US$, 2 meses gratis) |
| --- | --- | --- | --- | --- |
| Gratis | Puesto o tienda que recién empieza | 1 sucursal por negocio (negocios ilimitados), hasta 150 productos, empleados ilimitados, ventas, gastos, turnos y cuadre. Historial de 60 días | 0 | — |
| Negocio | El local que ya depende de la app | Todo lo anterior, con productos sin límite, control de stock, importar productos y combos, historial completo, reportes por día, semana y mes, exportar a Excel o PDF | 5,50 | 55 |
| Sucursales | Dueño con 2 o más locales | Todo lo de Negocio, más vista consolidada, comparación entre sucursales, permisos por empleado y sucursal, e historial de quién hizo cada cambio | 5,50 + 3,50 por sucursal extra | 55 + 35 por sucursal extra |

## Precio en bolivianos

El sistema calcula el total en bolivianos al generar cada cobro: precio en dólares por el tipo de cambio oficial del BCB del día, redondeado al boliviano.

### Sin NIT (hoy): sin impuestos

Todavía no hay inscripción ante el SIN ni NIT, así que **no se cobran ni se mencionan impuestos**: cobrar «impuestos» que no se declaran ni se facturan se puede leer como un engaño. `billing_settings.tax_rate = 0` (`20261112120000_no_tax_and_founder_annual.sql`) y el total es la cuenta que el cliente puede rehacer con su calculadora:

```latex
\text{Total (Bs)} = \operatorname{redondear}\left( \text{Precio (US\$)} \times \text{TC} \right)
```

Ejemplo con el tipo de cambio de Bs 11,70:

| Concepto | US$ | Bs |
| --- | --- | --- |
| Negocio, mensual | 5,50 | 64 (64,35) |
| Sucursal extra, mensual | 3,50 | 41 (40,95) |
| Sucursales con 3 locales, mensual | 12,50 | 146 (146,25) |
| Negocio, anual | 55 | 644 (643,50) |

La página del cobro muestra el desglose: «US$ 5,50 × Bs 11,70 = Bs 64,35 · Total Bs 64 (redondeado al boliviano)». La app no dice «impuestos» en ningún lado mientras la tasa sea 0.

### Al inscribirse: con impuestos

Cuando haya NIT y se sepa el régimen, se cambia `tax_rate` con una migración (`update public.billing_settings set tax_rate = …`):

- **SIETE-RG:** `0.05`. El plan Negocio quedaría en ~Bs 68 (TC 11,70).
- **Régimen General:** `0.16` (IVA 13% + IT 3%, sobre el total facturado). Por eso se divide entre (1 − tasa) en vez de multiplicar por (1 + tasa): después de impuestos queda limpio el precio en dólares.

```latex
\text{Total (Bs)} = \operatorname{redondear}\left( \frac{\text{Precio (US\$)} \times \text{TC}}{1 - \text{tasa}} \right)
```

Con tasa mayor que 0, la app vuelve sola a mostrar «+ impuestos» en los precios y, en el cobro, la línea «Impuestos sobre el total: Bs …» (con 0,16 y TC 11,70: 64,35 + 12,26 → Bs 77). Confirmar la tasa con un contador.

- La factura (cuando la haya) y el cobro por QR van siempre en bolivianos. El dólar es solo la referencia del precio.
- El monto en Bs queda fijo desde que se genera el cobro hasta que vence (por ejemplo, 3 días). Si vence sin pagarse, se recalcula con el tipo de cambio nuevo.
- La app muestra los dos valores: "US$ 5,50 al mes · hoy Bs 64".
- Si ese día no se puede obtener el tipo de cambio, se usa el último disponible y se registra cuál fue.
- La tasa de 0,16 es configurable y hay que confirmarla con un contador según el régimen ante el SIN. No incluye la comisión de la pasarela de pago.

## Criterios detrás

- **Lo básico va en todos los planes.** Registrar ventas y cuadrar la caja funciona en el plan gratis. Si se limita, el empleado vuelve al cuaderno y se pierde al cliente. Lo que se paga es el historial, el análisis y tener más de una sucursal.
- **No limitar la cantidad de ventas.** Un tope de "X ventas al mes" castiga al negocio justo cuando le va bien y anima a no registrar todo.
- **Limitar el historial, no las funciones.** Después de dos meses de uso, el dueño quiere comparar con el mes pasado. Ese es el momento natural para pasar a un plan pago.
- **Limitar lo que crece con el tamaño, no con las ventas.** Un negocio grande con una sola sucursal (un supermercado) no debería quedarse gratis para siempre. Por eso Gratis llega a 150 productos y no incluye control de stock, importar productos ni combos: una tienda de barrio no los necesita, un supermercado sí. Vender mucho nunca cuesta más.
- **Prueba de 30 días.** El primer negocio de cada persona empieza con el plan Negocio por 30 días (una sola prueba por persona, aunque cree otro negocio o borre el suyo): prueba el stock, los combos y el historial antes de perderlos. Después baja a Gratis sin borrar nada.
- **Precio anclado en dólares.** Vercel, Supabase y Upstash se pagan en dólares. Con el precio en US$, una devaluación del boliviano no se come el margen. El precio en dólares se revisa una vez al año.
- **Plan anual con 2 meses gratis.** Da caja por adelantado y reduce cancelaciones.
- **Precio fundador.** Los primeros 20–50 negocios pagan 50% durante el primer año a cambio de opiniones. No es de por vida, porque un descuento permanente ata el ingreso aunque suban los costos.

## Cobros en Bolivia

Muchos negocios pequeños pagan por QR bancario y pocos tienen tarjeta para cobros automáticos. Al principio conviene cobrar por QR, mensual o anual, y activar el plan a mano o de forma semiautomática, en vez de montar Stripe desde el primer día.

Con QR no hay cobro automático, así que hacen falta recordatorios antes de que venza el plan.

En la app (`/app/<negocio>/plan`) el único método es el **QR bancario** de monto abierto (BCP), con el monto ya convertido a bolivianos con impuestos. El QR del BCP vive en `public/pagos/`: `qr.jpg` es el original (póster completo), `qr-codigo.webp` el recorte de la tarjeta que se muestra en la página del cobro y `qr-descarga.jpg` la copia liviana para descargar (los dos salen de `qr.jpg` con sharp). Si `billing_settings.qr_image_url` tiene otra imagen, se usa esa para todo. **El QR actual vence el 07/11/2028.** Cada cobro tiene su página, `/app/<negocio>/cobro/<id>`: para qué negocio es, el monto, el QR y los pasos (pagar, enviar el comprobante por WhatsApp, activación y avisos de vencimiento). La base todavía acepta transferencia y tarjeta (`plan_charges.method`), pero la página no las ofrece.

## Límites en la app

La base de datos aplica los límites (migraciones `supabase/migrations/20261031012616_plan_limits.sql` `20261108170000_free_plan_limits.sql` y `20261108190000_promotions.sql`). `planLimits`, en `src/data/plans.ts`, solo los muestra y tiene que coincidir con ella. Ese mismo archivo repite, para mostrarlos, los precios en dólares sin impuestos de `private.plan_usd`. No se guarda ningún precio fijo en bolivianos: se calcula al mostrarlo y al cobrar.

**Una función de pago nueva** (checklist, para que ningún negocio en Gratis la use):

1. **En la base**, un trigger o una función que la corte con `private.effective_plan(business_id) = 'Gratis'`, nunca con `businesses.plan`: un plan vencido sigue diciendo «Negocio» hasta que `plan_daily` corre a las 8:00. Lo que ya existe y se sigue viendo después de bajar a Gratis (promociones, combos, stock) no deja de existir: deja de aplicarse o de cambiar.
2. **En la Action**, si algo no pasa por la base (como importar), `limitsOf()` de `src/actions/shared.ts`, que ya usa el plan efectivo.
3. **En la página**, `planLimits[business.plan]` con el `business` de la sesión (`src/data/session.ts` ya lo pasa a Gratis al vencer): solo para mostrar o esconder, nunca como única barrera.
4. **El plan, su vencimiento, la prueba y el cupo de fundador** (`plan`, `plan_until`, `trial`, `founder_since`) solo los escriben funciones de la base: nadie tiene permiso de UPDATE ni de INSERT sobre esas columnas. No los agregues a ningún `grant`.
5. `planLimits` y `plans.test.ts`: la nueva clave y un test que compare con la migración.

| Límite | Gratis | Negocio | Sucursales | Dónde se aplica |
| --- | --- | --- | --- | --- |
| Sucursales por negocio | 1 | 1 | sin tope (cada extra se cobra) | trigger `branches_check_limit` |
| Historial de ventas, gastos y cierres a la vista | últimos 60 días | completo | completo | RLS (`private.history_start`) |
| Reportes por día, semana y mes; exportar | no | sí | sí | solo en la app (`planLimits.reports`): RLS ya filtra los datos |
| Productos en el catálogo | 150 | sin tope | sin tope | trigger `products_check_limit` |
| Control de stock (cambiarlo, entradas, mermas, ajustes; que las ventas lo descuenten) | no: el que había queda a la vista, congelado | sí | sí | trigger `inventory_freeze_stock`; `take_stock` y `void_sale` no lo tocan en Gratis |
| Combos nuevos | no (los que había se siguen vendiendo) | sí | sí | trigger `product_components_check` |
| Promociones con descuento | no (las que había se ven, pero no se aplican) | sí | sí | trigger `promotions_check_plan`; `promo_discount` devuelve 0 en Gratis |
| Importar o pegar productos de una planilla | no | sí | sí | Action `importProducts` (la base no distingue un alta de una importación; el tope de 150 sí lo aplica) |

- **Prueba de 30 días.** El primer negocio de cada persona empieza en el plan Negocio con `plan_until` a 30 días (hoy incluido) y `businesses.trial = true` (trigger `businesses_start_trial`). Una vez por persona: `private.trials` guarda quién ya la usó (también a quien empezó en Gratis antes de que existiera la prueba), y un negocio nuevo de esa persona queda en Gratis (`20261110014550_trial_once_per_person.sql`). `plan_daily` avisa a 7, 3 y 1 día («tu prueba termina…») y al vencer lo pasa a Gratis. Un pago la termina (`activate_plan_charge` pone `trial = false`; pagar Negocio durante la prueba suma desde el día siguiente al vencimiento). **La prueba no ocupa cupo de fundador**: el cupo solo lo da un pago real.
- Una persona puede tener los negocios que quiera: cada uno paga su propio plan (migración `20261108130000_charge_by_branches_unlimited_businesses.sql`).
- La vista consolidada, los permisos por empleado y el historial de cambios todavía no existen en la app, así que no hay nada que limitar ahí.
- **Al bajar de plan no se borra nada.** Las sucursales que sobran siguen funcionando, pero no se pueden agregar otras. El historial de más de 60 días se oculta y vuelve a aparecer al pagar. Los productos de más de 150 siguen ahí, pero no se agregan otros. El stock queda congelado (se ve como estaba) y vuelve a moverse al pagar: conviene contarlo de nuevo.

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
- **Plan anual:** el descuento cubre solo los meses de fundador que le quedan al negocio (los empezados cuentan enteros), guardados en `plan_charges.discount_months`: `usd = anual × (1 − descuento × meses / 12)`. Quien paga el año en su mes 11 lleva 2 meses al 50% y 10 a precio normal (55 × (1 − 0,5 × 2/12) = US$ 50,42). Un fundador nuevo (su período empieza al pagar) lleva los 12. `founderMonthsLeft` y `discounted` en `src/data/plans.ts` repiten la cuenta para mostrarla.
- **Caso borde:** si varios cobros con descuento se generan con el último cupo libre, todos se respetan al pagarse (el monto se mostró fijo). Puede pasarse de 20 por uno o dos.
- **Barra:** `PromoBar` muestra los cupos reales de `public.founder_promo()` en `/`, `/planes` y en `/app` (solo a quien tiene un negocio propio en Gratis; ahí se puede ocultar). Sin cupos, o con la promo apagada, no aparece.
- **Configurar o apagar:** en `public.billing_settings` (`founder_active`, `founder_slots`, `founder_discount`, `founder_months`):

```sh
pnpm dlx supabase db query --db-url "$DB_URL" "update public.billing_settings set founder_active = false;"
```

### Afiliados

Socios aprobados a mano (contadores, distribuidores, técnicos) recomiendan Caja Simple con su link y ganan un % de lo que pagan los negocios que traen (migración `20261112130000_affiliates.sql`).

- **Alta:** solo con SQL, sobre una cuenta que ya existe. `rate` es la fracción (0,30 = 30 %, tope 0,5). Se puede subir a quien trae volumen (por ejemplo, 40 % desde 5 negocios que pagan).

```sh
pnpm dlx supabase db query --db-url "$DB_URL" "insert into public.affiliates (id, code, rate, payout_details) select id, 'contador-juan', 0.30, 'BCP 123…' from public.profiles where email = '…';"
```

- **Link:** `/r/<código>` (`src/pages/r/[codigo].astro`) guarda la cookie `ref` por 60 días (no pisa una anterior) y lleva a `/planes`. Al crear la cuenta (`signup.ts`, o `callback.ts` con Google o al confirmar el correo), `claimReferral` llama a `public.claim_referral`, que deja `profiles.referred_by` solo si la cuenta tiene menos de 7 días, no tiene referido, no es la del afiliado y nunca pagó un plan. Cada negocio que crea después copia `referred_by` (trigger `businesses_copy_referral`), así que una transferencia no cambia de afiliado.
- **Descuento del referido:** `billing_settings.referral_discount` (20 %) en el **primer cobro** del negocio, sobre el cobro entero (también el anual). No se suma al de fundador: `create_plan_charge` aplica el mayor y lo guarda en `plan_charges.discount_reason` (`fundador` o `referido`). El de recomendación no ocupa cupo de fundador.
- **Comisión:** al activar cada cobro, `activate_plan_charge` crea una fila en `referral_commissions` si el negocio tiene un afiliado activo y el pago cae dentro de los `referral_months` (12) desde el **primer pago** del negocio: `round(amount_bs × rate × meses / meses_del_período)`. Mensual: 1 mes. Anual: los meses que quedan de la ventana (`private.commission_months`; los empezados cuentan enteros). Se calcula sobre lo cobrado en Bs, ya con descuento.
- **Pago al afiliado:** cada comisión queda retenida `referral_hold_days` (30) días. Una vez al mes, a quien tenga Bs 100 o más por cobrar, se le paga por QR o transferencia y se marca:

```sh
pnpm dlx supabase db query --db-url "$DB_URL" "select a.code, sum(c.amount_bs) from public.referral_commissions c join public.affiliates a on a.id = c.affiliate_id where c.paid_out_at is null and c.payable_at <= now() group by 1 having sum(c.amount_bs) >= 100;"
pnpm dlx supabase db query --db-url "$DB_URL" "select private.pay_commissions('<id del afiliado>', 'QR 12/11');"
```

- **Lo que ve el afiliado:** `/app/cuenta/afiliado` (link, totales retenido / por cobrar / cobrado, comisiones y condiciones) y, en la página de plan de sus negocios, `AffiliateInvite`. Quien no es afiliado recibe 404.
- **Dar de baja:** `update public.affiliates set active = false where code = '…';`. Los negocios que ya trajo dejan de generar comisión; las ya creadas se pagan igual.
- Sin NIT, las comisiones salen como gasto personal: confirmarlo con el contador al inscribirse.

Pendiente: la factura electrónica.
