import {
  ChartNoAxesColumn,
  Package,
  Settings,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import style from "../../app/layout.module.css";

const sections = [
  { label: "Resumen", Icon: ChartNoAxesColumn },
  { label: "Ingresos", Icon: TrendingUp },
  { label: "Gastos", Icon: TrendingDown },
  { label: "Productos", Icon: Package },
  { label: "Ventas", Icon: ShoppingCart },
  { label: "Configuración", Icon: Settings },
];

export default function Aside() {
  return (
    <aside className={style.aside}>
      <span>Menú Lateral</span>
      <nav className={style.menu}>
        {sections.map(({ label, Icon }) => (
          <a key={label} href="#" className={style.menuItem}>
            <Icon size={18} />
            {label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
