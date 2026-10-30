// Precios orientativos (ver docs/planes-de-suscripcion.md): hay que validarlos con dueños reales.

export interface Plan {
  name: string;
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
