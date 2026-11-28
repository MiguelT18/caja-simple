// Única entrada a los datos para las páginas de /app. Ver docs/modelo-de-datos.md.
// Todas las consultas usan el cliente de Supabase de la persona: RLS decide qué filas ve.
// Cada módulo tiene una sola tarea; aquí solo se re-exportan.
export * from "./session"; // sesión, negocios y rol de la persona
export * from "./routes"; // rutas de /app y color de sucursal
export * from "./branch"; // página de sucursal y barra del turno
export * from "./business"; // páginas del negocio
export { exportMyData } from "./account"; // descargar tus datos
export { byPeriod, expensesByCategory, isLowStock, sum, totalsBy } from "./cash"; // cuentas puras
export { branchImages, businessImages, headerBackdrop, closesBetween, CLOSES_PAGE_SIZE, movements, openOrders, orderLabels, receiptUrls, saleLines, stockDeliveries, stockMoves, stockRequests } from "./shared";
export { currentQuote, founderPromo, ownedBusinesses, type FounderPromo, paymentDetails, planCharges, referralClaimable, referralInvite, referralPerks } from "./billing"; // cobro de planes
export { affiliateSummary, commissionsByPeriod, type Commission } from "./affiliate"; // programa de afiliados
export { branchOvertime, OVERTIME_STATUSES, type Overtime } from "./overtime"; // horas extra de la sucursal
export { DIRECTORY_PAGE_SIZE, joinRequests, searchBusinesses, type DirectoryBusiness, type JoinRequest } from "./directory"; // Buscar y pedidos para unirse
export { businessStats, statsPeriods, statsRange, type BusinessStats } from "./stats"; // estadísticas del Resumen
export { daysSince, hourSpan, marketingIdeas, peakHour, trend, weekdayName, weekdayRange } from "./insights"; // ideas para vender más
export { today } from "@/lib/dates";
export { paidSince, payables, type FixedExpense, type OutsidePayment, type Payable } from "./payables"; // gastos fijos y pendientes
export { businessPromotions, promotionsToday, type Promotion } from "./promotions"; // promociones con descuento
