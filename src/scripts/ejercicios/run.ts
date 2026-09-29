import {
  aplicarDescuento,
  calcularTotal,
  calcularValorInventario,
  crearProducto,
  filtrarProductosConStock,
  formatearMoneda,
  obtenerProductosAgotados,
  registrarVenta,
  resumenVentas,
  type Producto,
  type Venta,
} from "./nucleo";

export function ejecutarEjercicios() {
  const productos: Producto[] = [
    crearProducto(1, "Café", 2.5, 100),
    crearProducto(2, "Té", 1.8, 0),
    crearProducto(3, "Azúcar", 3.2, 50),
    crearProducto(4, "Leche", 4.0, 25),
    crearProducto(5, "Galletas", 2.0, 0),
  ];

  const conStock = filtrarProductosConStock(productos);
  const agotados = obtenerProductosAgotados(productos);
  const valorInventario = calcularValorInventario(productos);

  const venta1 = registrarVenta(1, productos[0], 3);
  const venta2 = registrarVenta(2, productos[2], 2);
  const venta3 = registrarVenta(3, productos[3], 1);

  const ventas: Venta[] = [venta1, venta2, venta3];
  const resumen = resumenVentas(ventas);

  const totalConDescuento = aplicarDescuento(resumen.total, 10);

  return {
    productos: {
      total: productos.length,
      conStock: conStock.length,
      agotados: agotados.map((p) => p.nombre),
      valorInventario: formatearMoneda(valorInventario),
    },
    ventas: {
      detalle: ventas.map((v) => ({
        id: v.id,
        total: formatearMoneda(v.total),
      })),
      resumen: {
        total: formatearMoneda(resumen.total),
        cantidad: resumen.cantidad,
        promedio: formatearMoneda(resumen.promedio),
        conDescuento10: formatearMoneda(totalConDescuento),
      },
    },
    calculos: {
      totalSimple: formatearMoneda(calcularTotal(2.5, 4)),
      descuento20: formatearMoneda(aplicarDescuento(10, 20)),
    },
  };
}
