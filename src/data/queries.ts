// Única entrada a los datos para las páginas de /app. Ver docs/modelo-de-datos.md.
// Todas las consultas usan el cliente de Supabase de la persona: RLS decide qué filas ve.
// Cada módulo tiene una sola tarea; aquí solo se re-exportan.
export * from "./session"; // sesión, negocios y rol de la persona
export * from "./routes"; // rutas de /app y color de sucursal
export * from "./branch"; // página de sucursal y barra del turno
export * from "./business"; // páginas del negocio
export { exportMyData } from "./account"; // descargar tus datos
export { byPeriod, expensesByCategory, isLowStock, sum, totalsBy } from "./cash"; // cuentas puras
export { branchImages, businessImages, headerBackdrop, closesBetween, movements, openOrders, orderLabels, receiptUrls, saleLines, stockMoves } from "./shared";
export { currentQuote, paymentDetails, planCharges } from "./billing"; // cobro de planes
export { today } from "@/lib/dates";
