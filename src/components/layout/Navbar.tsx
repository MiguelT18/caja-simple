import { Search, User } from "lucide-react";
import style from "../../app/layout.module.css";

export default function Navbar() {
  return (
    <nav className={style.navbar}>
      <span>Barra de Navegación</span>
      <Search size={18} />
      <User size={18} />
    </nav>
  );
}
