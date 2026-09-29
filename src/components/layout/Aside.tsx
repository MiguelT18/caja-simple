"use client";

import { useState } from "react";
import {
  BarChart3,
  Boxes,
  CreditCard,
  WalletCards,
  CircleDollarSign,
} from "lucide-react";
import style from "./aside.module.css";
import HamburgerButton from "./HamburgerButton";

const sections = [
  { label: "Resumen", Icon: BarChart3 },
  { label: "Productos", Icon: Boxes },
  { label: "Registrar Venta", Icon: CreditCard },
  { label: "Gastos", Icon: WalletCards },
];

export default function Aside() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <aside className={`${style.aside} ${!isOpen ? style.asideCollapsed : ""}`}>
      <HamburgerButton
        checked={isOpen}
        onToggle={() => setIsOpen((prev) => !prev)}
        setIsOpen={setIsOpen}
      />
      <header className={style.header}>
        <span className={style.headerIcon}>
          <CircleDollarSign width={20} height={20} />
        </span>

        <div className={style.headerText}>
          <h1>Caja Simple</h1>
          <span>Control de caja diario</span>
        </div>
      </header>
      <nav className={style.menu}>
        {sections.map(({ label, Icon }) => (
          <a key={label} href="#" className={style.menuItem}>
            <Icon size={18} />
            <span className={style.menuLabel}>{label}</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}
