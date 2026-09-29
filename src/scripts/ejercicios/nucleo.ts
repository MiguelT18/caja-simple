export interface Producto {
  id: number;
  nombre: string;
  precio: number;
  stock: number;
}

export interface Venta {
  id: number;
  productoId: number;
  cantidad: number;
  total: number;
  fecha: string;
}

export function crearProducto(
  id: number,
  nombre: string,
  precio: number,
  stock: number,
): Producto {
  return { id, nombre, precio, stock };
}

export function calcularTotal(precio: number, cantidad: number): number {
  return precio * cantidad;
}

export function aplicarDescuento(total: number, porcentaje: number): number {
  return total * (1 - porcentaje / 100);
}

export function formatearMoneda(monto: number): string {
  return `$${monto.toFixed(2)}`;
}

export function filtrarProductosConStock(
  productos: Producto[],
): Producto[] {
  return productos.filter((p) => p.stock > 0);
}

export function obtenerProductosAgotados(
  productos: Producto[],
): Producto[] {
  return productos.filter((p) => p.stock === 0);
}

export function calcularValorInventario(productos: Producto[]): number {
  return productos.reduce((acc, p) => acc + p.precio * p.stock, 0);
}

export function registrarVenta(
  id: number,
  producto: Producto,
  cantidad: number,
): Venta {
  if (cantidad > producto.stock) {
    throw new Error(`Stock insuficiente: ${producto.stock} disponible`);
  }
  return {
    id,
    productoId: producto.id,
    cantidad,
    total: calcularTotal(producto.precio, cantidad),
    fecha: new Date().toISOString(),
  };
}

export function resumenVentas(ventas: Venta[]): {
  total: number;
  cantidad: number;
  promedio: number;
} {
  const total = ventas.reduce((acc, v) => acc + v.total, 0);
  const cantidad = ventas.length;
  const promedio = cantidad > 0 ? total / cantidad : 0;
  return { total, cantidad, promedio };
}
