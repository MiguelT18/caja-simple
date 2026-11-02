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
  plan: "Gratis" | "Negocio" | "Sucursales";
  /** Rubro: solo cambia textos y secciones de la app (ver docs/modelo-de-datos.md › Rubros). */
  kind: BusinessKind;
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
  /** URL firmada de la foto, si tiene. */
  image?: string;
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

export interface Sale {
  id: string;
  branchId: string;
  date: string; // AAAA-MM-DD, día del negocio
  time: string; // HH:MM, hora de Bolivia
  shiftId: string;
  recordedBy: Recorder;
  items: number;
  total: number;
}

export interface Expense {
  id: string;
  branchId: string;
  date: string;
  time: string;
  shiftId: string;
  recordedBy: Recorder;
  concept: string;
  category: string;
  amount: number;
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
  | { kind: "low_stock"; data: { product: string; branch: string; stock: number; minStock: number } }
  | { kind: "shift_change"; data: { person: string; business: string; branch: string; from: string | null; to: string } }
);

export interface ShiftClose {
  shiftId: string;
  /** "pendiente": todavía no se abrió hoy. */
  status: "pendiente" | "en-curso" | "cerrado";
  opening: number;
  // Contado − esperado. Solo existe cuando el turno está cerrado.
  difference?: number;
}
