// Precios orientativos (ver docs/planes-de-suscripcion.md): hay que validarlos con dueños reales.

export type PlanName = "Gratis" | "Negocio" | "Sucursales";

// Lo que la app aplica de cada plan; null = sin tope. La base es la que manda
// (migración plan_limits): esto solo lo muestra y tiene que coincidir con ella.
export const planLimits: Record<PlanName, { branches: number | null; historyDays: number | null; cashAlerts: boolean }> = {
  Gratis: { branches: 1, historyDays: 60, cashAlerts: false },
  Negocio: { branches: 1, historyDays: null, cashAlerts: true },
  Sucursales: { branches: null, historyDays: null, cashAlerts: true },
};

// Enlace del botón «Mejorar plan» (WhatsApp, formulario…). Sin él, la página de plan solo explica el proceso.
export const upgradeUrl: string | undefined = import.meta.env.PUBLIC_UPGRADE_URL || undefined;

export interface Plan {
  name: PlanName;
  audience: string;
  price: string;
  period?: string;
  features: string[];
}

// Rangos mensuales en Bs para la calculadora de sucursales.
export const negocioPrice = [60, 90] as const;
export const extraBranchPrice = [40, 60] as const;

export const plans: Plan[] = [
  {
    name: "Gratis",
    audience: "Puesto o tienda que recién empieza",
    price: "Bs 0",
    features: [
      "1 negocio y 1 sucursal",
      "Empleados ilimitados",
      "Ventas, gastos, turnos y cuadre",
      "Historial de los últimos 60 días",
    ],
  },
  {
    name: "Negocio",
    audience: "El local que ya depende de la app",
    price: `Bs ${negocioPrice[0]}–${negocioPrice[1]}`,
    period: "/mes",
    features: [
      "Todo lo del plan Gratis",
      "Historial completo",
      "Reportes por día, semana y mes",
      "Exportar a Excel o PDF",
      "Alertas cuando la caja no cuadra",
    ],
  },
  {
    name: "Sucursales",
    audience: "Dueño con 2 o más locales",
    price: `+ Bs ${extraBranchPrice[0]}–${extraBranchPrice[1]}`,
    period: "por sucursal extra",
    features: [
      "Todo lo del plan Negocio",
      "Vista consolidada de tus locales",
      "Comparación entre sucursales",
      "Permisos por empleado y sucursal",
      "Historial de quién hizo cada cambio",
    ],
  },
];
