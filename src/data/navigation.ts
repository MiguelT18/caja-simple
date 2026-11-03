import { BriefcaseBusiness, ChartColumn, Clock, LayoutDashboard, Package, Receipt, ShoppingCart, Users, Wallet, Boxes, Settings, UserRound } from "@lucide/astro";
import { catalogLabel } from "./kinds";
import type { Branch } from "./types";
import { branchHref, businessHref, type Membership } from "./queries";

/** Secciones del panel lateral según dónde está la persona y su rol en ese negocio. */
export function appNav(m?: Membership, branch?: Branch) {
  if (!m)
    return [
      {
        key: "account",
        title: "Cuenta",
        items: [
          { id: "negocios", label: "Tus negocios", href: "/app", icon: BriefcaseBusiness },
          { id: "cuenta", label: "Tu cuenta", href: "/app/cuenta", icon: UserRound },
        ],
      },
    ];

  const sections = [];
  if (branch) {
    const href = (section?: string) => branchHref(m.business, branch, section);
    sections.push({
      key: "branch",
      title: branch.name,
      items: [
        { id: "vender", label: "Vender", href: href("registrar-venta"), icon: ShoppingCart },
        ...(m.role === "dueño" ? [{ id: "resumen", label: "Resumen", href: href(), icon: LayoutDashboard }] : []),
        { id: "ventas", label: "Ventas", href: href("ventas"), icon: Receipt },
        { id: "gastos", label: "Gastos", href: href("gastos"), icon: Wallet },
        { id: "inventario", label: "Inventario", href: href("inventario"), icon: Boxes },
        { id: "turnos", label: "Turnos", href: href("turnos"), icon: Clock },
      ],
    });
  }
  if (m.role === "dueño") {
    const base = businessHref(m.business);
    sections.push({
      key: "business",
      title: m.business.name,
      items: [
        { id: "resumen", label: "Resumen del negocio", href: base, icon: ChartColumn },
        { id: "catalogo", label: catalogLabel(m.business.kind), href: `${base}/catalogo`, icon: Package },
        { id: "empleados", label: "Empleados", href: `${base}/empleados`, icon: Users },
        { id: "configuracion", label: "Configuración", href: `${base}/configuracion`, icon: Settings },
      ],
    });
  }
  return sections;
}

/** Cookie con el orden que la persona eligió arrastrando: { [section.key]: [item.id, …] }. La escribe el Sidebar. */
export const NAV_ORDER_COOKIE = "nav-order";

/** Ordena los ítems de cada sección según la cookie; los que no están en ella (rutas nuevas) quedan al final. */
export function applyNavOrder(sections: ReturnType<typeof appNav>, raw?: string) {
  let order: Record<string, string[]> = {};
  try {
    order = raw ? JSON.parse(raw) : {};
  } catch {
    // Cookie dañada: se usa el orden de siempre.
  }
  return sections.map((section) => {
    const saved = Array.isArray(order[section.key]) ? order[section.key] : [];
    const rank = (id: string) => (saved.includes(id) ? saved.indexOf(id) : saved.length);
    return { ...section, items: section.items.toSorted((a, b) => rank(a.id) - rank(b.id)) };
  });
}
