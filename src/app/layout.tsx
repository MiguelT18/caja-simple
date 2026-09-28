import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import style from "./layout.module.css";
import Aside from "@/components/layout/Aside";
import { ThemeProvider } from "@/context/ThemeContext";

export const metadata: Metadata = {
  title: "Caja Simple",
  description:
    "Sistema para la gestión de ingresos/gastos y catálogo de productos en una sucursal de cualquier negocio",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <ThemeProvider>
          <Aside />
          <main className={style.main}>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
