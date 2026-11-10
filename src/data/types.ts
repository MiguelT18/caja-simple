// Tipos de dominio de la app. Ver docs/modelo-de-datos.md.
// Salen de la base (src/lib/database.types.ts) ya convertidos a la forma que usan las páginas.

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string;
}

/** La persona con sesión iniciada; UserCard la muestra. */
export type User = Person;

export interface Business {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  /** El plan que vale hoy: si `planUntil` ya pasó, Gratis (igual que private.effective_plan). */
  plan: "Gratis" | "Negocio" | "Sucursales";
  /** Último día pagado (AAAA-MM-DD); sin él, el plan no vence. */
  planUntil?: string;
  /** El plan es la prueba de 30 días de Negocio (todavía no se pagó). */
  trial?: boolean;
  /** Rubro: solo cambia textos y secciones de la app (ver docs/modelo-de-datos.md › Rubros). */
  kind: BusinessKind;
  /** Logo o foto del negocio, en branch-images (<negocio>/<negocio>.<ext>). */
  imagePath?: string;
  /** A qué se dedica. Obligatoria al crear; los negocios de antes pueden no tenerla todavía. */
  description?: string;
  /** Aparece en Buscar (/app/buscar) y recibe pedidos para unirse. */
  listed: boolean;
}

export type BusinessKind = "tienda" | "ropa" | "restaurante";

export interface Branch {
  id: string;
  businessId: string;
  slug: string;
  name: string;
  address: string;
  /** Ruta de la foto de fachada en el bucket branch-images; la URL firmada sale de businessContext. */
  imagePath?: string;
}

export type ShiftTone = "morning" | "afternoon" | "night";

/** Cada sucursal define sus propios turnos. */
export interface Shift {
  id: string;
  branchId: string;
  name: string;
  start: string; // HH:MM
  // Si es menor que start, el turno termina al día siguiente.
  end: string;
  tone: ShiftTone;
  /** Días ISO (1 = lunes … 7 = domingo) en que trabaja; null = todos. */
  weekdays: number[] | null;
  /** Turno quitado: ya no se usa, pero las ventas viejas lo siguen nombrando. */
  archived?: boolean;
}

export interface Category {
  id: string;
  name: string;
}

/** Producto del catálogo del negocio: se define una sola vez. */
export interface CatalogProduct {
  id: string;
  businessId: string;
  name: string;
  categoryId?: string;
  category?: string;
  // EAN-13 del envase; los productos a granel o por peso no tienen.
  barcode?: string;
  /** Texto libre de la dueña (hasta 500 caracteres): se ve en el detalle del producto. */
  description?: string;
  /** URL firmada de la foto, si tiene. */
  image?: string;
  /** Si tiene, es un combo: lo que incluye. Al venderse descuenta el stock de cada uno. */
  components?: ComboPart[];
}

export interface ComboPart {
  productId: string;
  name: string;
  qty: number;
}

/** Producto tal como lo ve una sucursal: el del catálogo con su precio y stock ahí. */
export interface Product extends Omit<CatalogProduct, "businessId"> {
  /** null: el precio se escribe al vender (una prenda única). */
  price: number | null;
  /** null: sin control de stock (un plato, una prenda por tipo); entonces minStock también es null. */
  stock: number | null;
  minStock: number | null;
}

export interface Employee {
  id: string;
  businessId: string;
  branchId: string;
  shiftId?: string;
  // Cuenta de la persona, si ya la tiene; así una misma persona trabaja en un negocio y lleva otro.
  personId?: string;
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  status: "activo" | "invitado";
}

/** Quién registró un movimiento: la dueña o alguien del equipo. */
export interface Recorder {
  firstName: string;
  lastName: string;
}

export type PaymentMethod = "efectivo" | "qr" | "transferencia";

export interface Sale {
  id: string;
  branchId: string;
  date: string; // AAAA-MM-DD, día del negocio
  time: string; // HH:MM, hora de Bolivia
  /** Momento exacto (ISO), para «hace X min». */
  at: string;
  shiftId: string;
  recordedBy: Recorder;
  recordedById: string | null;
  items: number;
  /** Lo que cuenta en los totales: 0 si la venta se anuló. */
  total: number;
  /** Lo que se anuló (el total original), o null. */
  voided: number | null;
  payment: PaymentMethod;
  /** Comprobante del pago por QR o transferencia (ruta en el bucket sale-receipts), o null. */
  receiptPath: string | null;
}

export interface SaleLine {
  name: string;
  qty: number;
  price: number;
  /** Lo que descontó la promoción en la línea (Bs); el monto es qty * price - discount. */
  discount: number;
  promo: string | null;
}

export interface ClosedShift {
  id: string;
  shiftId: string;
  date: string;
  closedAt: string | null;
  openedBy: string;
  closedBy: string;
  closedById: string | null;
  expected: number;
  counted: number;
  /** Contado − esperado: positivo sobra, negativo falta. */
  difference: number;
  note: string | null;
  reopened: boolean;
}

export interface StockMove {
  id: string;
  kind: "entrada" | "merma" | "ajuste";
  /** Con signo: lo que sumó o restó al stock. */
  qty: number;
  reason: string | null;
  product: string;
  by: string;
  /** Quien aceptó la entrada que pidió una empleada. */
  approvedBy: string | null;
  at: string;
}

/** Una entrada de stock que pidió una empleada y espera a la dueña. */
export interface StockRequest {
  id: string;
  product: string;
  qty: number;
  reason: string | null;
  by: string;
  mine: boolean;
  at: string;
}

export interface Expense {
  id: string;
  branchId: string;
  date: string;
  time: string;
  shiftId: string;
  recordedBy: Recorder;
  recordedById: string | null;
  concept: string;
  category: string;
  /** Lo que cuenta en los totales: 0 si el gasto se anuló. */
  amount: number;
  /** Lo que se anuló (el monto original), o null. */
  voided: number | null;
}

export interface DaySummary {
  date: string;
  sales: number;
  expenses: number;
}

/** Aviso de la bandeja. `data` guarda los nombres y montos del momento (ver la migración de notificaciones). */
export type Notification = {
  id: string;
  createdAt: string;
  read: boolean;
  /** Negocio del aviso, si es uno donde estás (para llevar a él al tocarlo). */
  businessId?: string;
  /** Sucursal del aviso, si la puedes ver (sale de su nombre en `data.branch`). */
  branchId?: string;
} & (
  | {
      kind: "invitation";
      employeeId: string;
      /** La invitación sigue esperando respuesta. */
      pending: boolean;
      data: { business: string; owner: string; branch: string; shift: string | null; jobTitle: string };
    }
  | { kind: "invitation_answer"; data: { person: string; business: string; accepted: boolean } }
  | { kind: "cash_mismatch"; data: { branch: string; shift: string; date: string; difference: number } }
  | { kind: "shift_closed"; data: { branch: string; shift: string; person: string | null; date: string; difference: number } }
  | { kind: "shift_reminder"; data: { branch: string; shift: string; start: string; minutes: number } }
  | { kind: "shift_late"; data: { branch: string; shift: string; start: string } }
  | { kind: "shift_overdue"; data: { branch: string; shift: string; end: string; person?: string | null } }
  | { kind: "low_stock"; data: { product: string; branch: string; stock: number; minStock: number } }
  | { kind: "shift_change"; data: { person: string; business: string; branch: string; from: string | null; to: string } }
  | { kind: "plan_expiring"; data: { business: string; plan: string; until: string; days: number; trial?: boolean } }
  | { kind: "plan_expired"; data: { business: string; plan: string; trial?: boolean } }
  | {
      kind: "reopen_request";
      requestId: string;
      /** El pedido sigue esperando respuesta de la dueña. */
      pending: boolean;
      data: { person: string; branch: string; shift: string; date: string; reason: string | null };
    }
  | {
      kind: "stock_request";
      requestId: string;
      /** El pedido sigue esperando respuesta de la dueña. */
      pending: boolean;
      data: { person: string; product: string; qty: number; branch: string; reason: string | null };
    }
  | { kind: "stock_answer"; data: { accepted: boolean; person: string; product: string; qty: number; branch: string } }
  | { kind: "reopen_answer"; data: { accepted: boolean; person: string; branch: string; shift: string; date: string } }
  | { kind: "ownership"; data: { business: string; person: string } }
  | {
      kind: "join_request";
      requestId: string;
      /** El pedido para unirse sigue esperando respuesta de la dueña. */
      pending: boolean;
      data: { person: string; business: string; slug: string; branch: string | null; message: string | null };
    }
  | { kind: "join_answer"; data: { accepted: boolean; business: string; person: string } }
  | {
      /** Copia del pedido en la bandeja de quien lo hizo. */
      kind: "reopen_sent";
      requestId: string;
      pending: boolean;
      data: { person: string; owner: string; branch: string; shift: string; date: string; reason: string | null };
    }
);

export interface ShiftClose {
  shiftId: string;
  /** "pendiente": todavía no se abrió hoy. */
  status: "pendiente" | "en-curso" | "cerrado";
  opening: number;
  // Contado − esperado. Solo existe cuando el turno está cerrado.
  difference?: number;
}

/** Pedido abierto: un carro con nombre que la sucursal cobra después. price solo en productos con precio al vender. */
export interface Order {
  id: string;
  label: string;
  items: { productId: string; qty: number; price?: number }[];
}

/** Cobro de un plan (docs/planes-de-suscripcion.md): el monto en Bs queda fijo hasta `expiresAt`. */
export interface PlanCharge {
  id: string;
  plan: "Negocio" | "Sucursales";
  period: "mensual" | "anual";
  extraBranches: number;
  /** US$ sin impuestos. */
  usd: number;
  /** Tipo de cambio usado y su día (el de ese día o, si no se pudo obtener, el último). */
  rate: number;
  rateDate: string;
  taxRate: number;
  amountBs: number;
  method: "qr" | "transferencia" | "tarjeta";
  /** Descuento aplicado (precio fundador): 0,5 = 50%. `usd` ya va con él. */
  discount: number;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  status: "pendiente" | "vencido" | "pagado";
}
