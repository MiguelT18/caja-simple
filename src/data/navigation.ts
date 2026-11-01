import { BriefcaseBusiness, ChartColumn, Clock, LayoutDashboard, Package, Store, Users, Wallet, Boxes, Settings, UserRound } from "@lucide/astro";
import type { Branch } from "./types";
import { branchHref, businessHref, type Membership } from "./queries";

/** Secciones del panel lateral según dónde está la persona y su rol en ese negocio. */
export function appNav(m?: Membership, branch?: Branch) {
  if (!m)
    return [
      {
        title: "Cuenta",
        items: [
          { label: "Tus negocios", href: "/app", icon: BriefcaseBusiness },
          { label: "Tu cuenta", href: "/app/cuenta", icon: UserRound },
        ],
      },
    ];

  const sections = [];
  if (branch) {
    const href = (section?: string) => branchHref(m.business, branch, section);
    sections.push({
      title: branch.name,
      items: [
        ...(m.role === "dueño" ? [{ label: "Resumen", href: href(), icon: LayoutDashboard }] : []),
        { label: "Gastos", href: href("gastos"), icon: Wallet },
        { label: "Inventario", href: href("inventario"), icon: Boxes },
        { label: "Turnos", href: href("turnos"), icon: Clock },
      ],
    });
  }
  if (m.role === "dueño") {
    const base = businessHref(m.business);
    sections.push({
      title: m.business.name,
      items: [
        { label: "Resumen del negocio", href: base, icon: ChartColumn },
        { label: "Sucursales", href: `${base}/sucursales`, icon: Store },
        { label: "Catálogo", href: `${base}/catalogo`, icon: Package },
        { label: "Empleados", href: `${base}/empleados`, icon: Users },
        { label: "Configuración", href: `${base}/configuracion`, icon: Settings },
      ],
    });
  }
  return sections;
}
