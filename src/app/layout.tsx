import type { Metadata } from "next";
import "./globals.css";
import style from "./layout.module.css";
import Aside from "@/components/layout/Aside";

export const metadata: Metadata = {
  title: "Caja Simple",
  description:
    "Sistema para la gestión de ingresos/gastos y catálogo de productos en una sucursal de cualquier negocio",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <Aside />
        <main className={style.main}>{children}</main>
      </body>
    </html>
  );
}
