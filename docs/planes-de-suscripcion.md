# Caja Simple: planes de suscripción

Oct 29, 2026 · @miguel teran

## Recomendación

Cobrar **al dueño, por sucursal**, y que los empleados entren siempre gratis.

El plan es **de cada negocio**: quien tiene dos negocios paga cada uno por separado, y trabajar como empleado en un negocio ajeno nunca cuesta (ver [modelo de datos](modelo-de-datos.md)).

Así encaja con cómo está pensada la app. La cuenta es de la persona y no del rol, así que cobrar por usuario castigaría justo lo que se quiere fomentar: que el dueño invite a su gente y que registrar sea fácil.

La sucursal crece al mismo ritmo que el negocio. El que tiene tres locales gana más y saca más provecho del panel, así que entiende por qué paga más.

## Estructura propuesta

Tres planes. Los precios son un punto de partida: hay que validarlos hablando con dueños reales.

| Plan | Para quién | Incluye | Precio orientativo |
| --- | --- | --- | --- |
| Gratis | Puesto o tienda que recién empieza | 1 negocio, 1 sucursal, empleados ilimitados, ventas, gastos, turnos y cuadre. Historial de 60–90 días | Bs 0 |
| Negocio | El local que ya depende de la app | Todo lo anterior, con historial completo, reportes por día, semana y mes, exportar a Excel o PDF y alertas cuando la caja no cuadra | \~Bs 60–90/mes |
| Sucursales | Dueño con 2 o más locales | Todo lo de Negocio, más vista consolidada, comparación entre sucursales, permisos por empleado y sucursal, e historial de quién hizo cada cambio | Plan Negocio + \~Bs 40–60 por sucursal extra |

## Criterios detrás

- **Lo básico va en todos los planes.** Registrar ventas y cuadrar la caja funciona en el plan gratis. Si se limita, el empleado vuelve al cuaderno y se pierde al cliente. Lo que se paga es el historial, el análisis y tener más de una sucursal.
- **No limitar la cantidad de ventas.** Un tope de "X ventas al mes" castiga al negocio justo cuando le va bien y anima a no registrar todo.
- **Limitar el historial, no las funciones.** Después de dos meses de uso, el dueño quiere comparar con el mes pasado. Ese es el momento natural para pasar a un plan pago.
- **Plan anual con 2 meses gratis.** Da caja por adelantado y reduce cancelaciones.
- **Precio fundador.** Los primeros 20–50 negocios pagan la mitad de por vida a cambio de opiniones. Sin clientes ni testimonios todavía, eso vale más que el ingreso.

## Cobros en Bolivia

Muchos negocios pequeños pagan por QR bancario y pocos tienen tarjeta para cobros automáticos. Al principio conviene cobrar por QR, mensual o anual, y activar el plan a mano o de forma semiautomática, en vez de montar Stripe desde el primer día.

Con QR no hay cobro automático, así que hacen falta recordatorios antes de que venza el plan.
