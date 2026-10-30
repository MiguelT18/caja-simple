// Datos de ejemplo en memoria. Ver docs/modelo-de-datos.md: persona → negocios → sucursales → inventario.
// Las páginas no leen esto directo: pasan por src/data/queries.ts, la costura para el futuro backend.
// TODO: reemplazar por los datos reales (sesión y base de datos) cuando exista el backend.

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
}

export interface Branch {
  id: string;
  businessId: string;
  slug: string;
  name: string;
  address: string;
}

export type ShiftTone = "morning" | "afternoon" | "night";

/** Cada sucursal define sus propios turnos. */
export interface Shift {
  id: string;
  branchId: string;
  name: string;
  start: string;
  end: string;
  tone: ShiftTone;
}

/** Producto del catálogo del negocio: se define una sola vez. */
export interface CatalogProduct {
  id: string;
  businessId: string;
  name: string;
  category: string;
  // EAN-13 del envase; los productos a granel o por peso no tienen.
  barcode?: string;
  image?: string;
}

/** Lo que una sucursal hace con un producto del catálogo. Sin fila, esa sucursal no lo vende. */
export interface InventoryItem {
  branchId: string;
  productId: string;
  price: number;
  stock: number;
  minStock: number;
}

/** Producto tal como lo ve una sucursal: el del catálogo con su precio y stock ahí. */
export interface Product extends Omit<CatalogProduct, "businessId"> {
  price: number;
  stock: number;
  minStock: number;
}

export interface Employee {
  id: string;
  businessId: string;
  branchId: string;
  shiftId: string;
  // Cuenta de la persona, si ya la tiene; así una misma persona trabaja en un negocio y lleva otro.
  personId?: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  status: "activo" | "invitado";
}

export interface Sale {
  id: string;
  branchId: string;
  time: string;
  shiftId: string;
  employeeId: string;
  items: { productId: string; qty: number }[];
}

export interface Expense {
  id: string;
  branchId: string;
  time: string;
  shiftId: string;
  employeeId: string;
  concept: string;
  category: string;
  amount: number;
}

export interface DatedExpense extends Expense {
  date: string; // AAAA-MM-DD
}

export interface DaySummary {
  date: string;
  sales: number;
  expenses: number;
}

export interface ShiftClose {
  branchId: string;
  shiftId: string;
  status: "cerrado" | "en-curso";
  opening: number;
  // Contado − esperado. Solo existe cuando el turno está cerrado.
  difference?: number;
}

export const TODAY = "2026-10-29";
export const pastDates = ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"];

// Personas

export const me: Person = {
  id: "maria",
  firstName: "María Fernanda",
  lastName: "López García",
  email: "maria.lopez@cajasimple.com",
};

// Negocios y sucursales: María es dueña de Almacén López y cajera en Panadería La Espiga (de otra persona).

export const businesses: Business[] = [
  { id: "almacen-lopez", slug: "almacen-lopez", name: "Almacén López", ownerId: "maria", plan: "Sucursales" },
  { id: "la-espiga", slug: "panaderia-la-espiga", name: "Panadería La Espiga", ownerId: "hugo", plan: "Gratis" },
];

export const branches: Branch[] = [
  { id: "centro", businessId: "almacen-lopez", slug: "centro", name: "Sucursal Centro", address: "Av. Principal 123" },
  { id: "norte", businessId: "almacen-lopez", slug: "norte", name: "Sucursal Norte", address: "Calle Los Pinos 456" },
  { id: "plaza", businessId: "almacen-lopez", slug: "plaza", name: "Sucursal Plaza", address: "C.C. Plaza Mayor, local 12" },
  { id: "miraflores", businessId: "la-espiga", slug: "miraflores", name: "Miraflores", address: "Av. Busch 1820" },
];

// Turnos: Centro y Norte abren tres; Plaza sigue el horario del centro comercial; la panadería abre temprano.

const shift = (branchId: string, key: string, name: string, start: string, end: string, tone: ShiftTone): Shift => ({
  id: `${branchId}-${key}`,
  branchId,
  name,
  start,
  end,
  tone,
});

export const shifts: Shift[] = [
  ...["centro", "norte"].flatMap((b) => [
    shift(b, "manana", "Mañana", "07:00", "14:00", "morning"),
    shift(b, "tarde", "Tarde", "14:00", "21:00", "afternoon"),
    shift(b, "noche", "Noche", "21:00", "00:00", "night"),
  ]),
  shift("plaza", "manana", "Mañana", "09:00", "15:00", "morning"),
  shift("plaza", "tarde", "Tarde", "15:00", "22:00", "afternoon"),
  shift("miraflores", "manana", "Mañana", "06:00", "13:00", "morning"),
  shift("miraflores", "tarde", "Tarde", "13:00", "20:00", "afternoon"),
];

// Catálogo de Almacén López, con el precio, stock y mínimo de Sucursal Centro.

type Seed = [id: string, name: string, category: string, price: number, stock: number, minStock: number, barcode?: string];

const almacenSeed: Seed[] = [
  ["pan", "Pan de batalla", "Panadería", 0.5, 120, 50],
  ["marraqueta", "Marraqueta", "Panadería", 0.6, 80, 40],
  ["pan-molde", "Pan de molde 500 g", "Panadería", 14, 8, 5, "7770000010004"],
  ["leche", "Leche 1 L", "Lácteos", 7, 3, 10, "7770000010073"],
  ["mantequilla", "Mantequilla 200 g", "Lácteos", 12.5, 14, 5, "7770000010141"],
  ["yogur", "Yogur 1 L", "Lácteos", 15, 4, 6, "7770000010219"],
  ["queso", "Queso fresco 500 g", "Lácteos", 25, 7, 4],
  ["leche-polvo", "Leche en polvo 400 g", "Lácteos", 38, 11, 4, "7770000010288"],
  ["jamon", "Jamón 200 g", "Embutidos", 18, 9, 5, "7770000010356"],
  ["salchicha", "Salchicha 500 g", "Embutidos", 21, 12, 6, "7770000010424"],
  ["chorizo", "Chorizo 1 kg", "Embutidos", 48, 3, 4],
  ["mortadela", "Mortadela 250 g", "Embutidos", 13.5, 10, 4, "7770000010493"],
  ["pollo", "Pollo entero (kg)", "Carnes", 19, 15, 8],
  ["carne-molida", "Carne molida (kg)", "Carnes", 52, 6, 5],
  ["chuleta", "Chuleta de cerdo (kg)", "Carnes", 46, 4, 4],
  ["arroz", "Arroz 1 kg", "Abarrotes", 9, 40, 10, "7770000010561"],
  ["azucar", "Azúcar 1 kg", "Abarrotes", 8, 22, 10, "7770000010639"],
  ["aceite", "Aceite 900 ml", "Abarrotes", 14.5, 9, 8, "7770000010707"],
  ["fideo", "Fideo 400 g", "Abarrotes", 6, 35, 10, "7770000010776"],
  ["huevos", "Huevos (maple de 30)", "Abarrotes", 32, 6, 4],
  ["cafe", "Café molido 250 g", "Abarrotes", 22, 2, 3, "7770000010844"],
  ["harina", "Harina 1 kg", "Abarrotes", 7.5, 18, 8, "7770000010912"],
  ["sal", "Sal 1 kg", "Abarrotes", 3, 30, 10, "7770000010981"],
  ["atun", "Atún en lata 170 g", "Abarrotes", 11, 24, 10, "7770000011056"],
  ["gaseosa", "Gaseosa 2 L", "Bebidas", 13, 18, 12, "7770000011124"],
  ["agua", "Agua 2 L", "Bebidas", 6.5, 25, 10, "7770000011193"],
  ["jugo", "Jugo de durazno 1 L", "Bebidas", 10, 5, 6, "7770000011261"],
  ["cerveza", "Cerveza 620 ml", "Bebidas", 12, 36, 12, "7770000011339"],
  ["detergente", "Detergente 1 kg", "Limpieza", 24, 7, 4, "7770000011407"],
  ["lavandina", "Lavandina 1 L", "Limpieza", 8.5, 13, 5, "7770000011476"],
  ["jabon", "Jabón de tocador", "Limpieza", 5, 20, 8, "7770000011544"],
  ["papel", "Papel higiénico (4 u.)", "Limpieza", 11, 2, 5, "7770000011612"],
  ["galletas", "Galletas de agua", "Snacks", 4.5, 28, 10, "7770000011681"],
  ["papas", "Papas fritas 150 g", "Snacks", 9, 14, 6, "7770000011759"],
  ["chocolate", "Chocolate 100 g", "Snacks", 8, 19, 6, "7770000011827"],
  ["mani", "Maní salado 200 g", "Snacks", 7, 3, 5],
];

const espigaSeed: Seed[] = [
  ["esp-marraqueta", "Marraqueta", "Panes", 0.6, 150, 60],
  ["esp-sarnita", "Sarnita", "Panes", 1.5, 40, 20],
  ["esp-integral", "Pan integral 500 g", "Panes", 12, 6, 4],
  ["esp-cunape", "Cuñapé", "Masitas", 2, 35, 15],
  ["esp-empanada", "Empanada de queso", "Masitas", 3, 12, 15],
  ["esp-galletas", "Galletas de manteca 100 g", "Masitas", 6, 18, 8],
  ["esp-torta", "Torta de chocolate (porción)", "Tortas", 8, 10, 4],
  ["esp-api", "Api morado (vaso)", "Bebidas", 4, 30, 10],
  ["esp-cafe", "Café con leche", "Bebidas", 5, 40, 10],
];

const fromSeed = (businessId: string, seed: Seed[]): CatalogProduct[] =>
  seed.map(([id, name, category, , , , barcode]) => ({ id, businessId, name, category, ...(barcode && { barcode }) }));

export const catalog: CatalogProduct[] = [...fromSeed("almacen-lopez", almacenSeed), ...fromSeed("la-espiga", espigaSeed)];

const inventoryFromSeed = (branchId: string, seed: Seed[]): InventoryItem[] =>
  seed.map(([productId, , , price, stock, minStock]) => ({ branchId, productId, price, stock, minStock }));

const roundHalf = (n: number) => Math.round(n * 2) / 2;

// Norte no vende carnes; Plaza (centro comercial) no vende carnes ni pan a granel. Precio y stock propios, fijos.
const derivedInventory = (branchId: string, skip: string[], priceFactor: number, stockSeed: number): InventoryItem[] =>
  almacenSeed
    .filter(([id, , category]) => !skip.includes(category) && !skip.includes(id))
    .map(([productId, , , price, stock, minStock], i) => ({
      branchId,
      productId,
      price: price < 1 ? price : roundHalf(price * priceFactor),
      stock: (stock * 3 + i * stockSeed) % 45,
      minStock,
    }));

export const inventory: InventoryItem[] = [
  ...inventoryFromSeed("centro", almacenSeed),
  ...derivedInventory("norte", ["Carnes"], 1, 7),
  ...derivedInventory("plaza", ["Carnes", "pan", "marraqueta"], 1.1, 11),
  ...inventoryFromSeed("miraflores", espigaSeed),
];

// Personal de cada negocio. María es cajera en La Espiga con su misma cuenta.

const employee = (
  id: string,
  businessId: string,
  branchId: string,
  shiftKey: string,
  firstName: string,
  lastName: string,
  jobTitle: string,
  status: Employee["status"] = "activo",
  personId?: string,
): Employee => ({ id, businessId, branchId, shiftId: `${branchId}-${shiftKey}`, firstName, lastName, jobTitle, status, ...(personId && { personId }) });

export const employees: Employee[] = [
  employee("carla", "almacen-lopez", "centro", "manana", "Carla", "Mamani", "Cajera"),
  employee("jorge", "almacen-lopez", "centro", "tarde", "Jorge", "Quispe", "Cajero"),
  employee("lucia", "almacen-lopez", "centro", "noche", "Lucía", "Rojas", "Encargada"),
  employee("rosa", "almacen-lopez", "centro", "manana", "Rosa", "Choque", "Reponedora"),
  employee("pedro", "almacen-lopez", "centro", "tarde", "Pedro", "Condori", "Cajero", "invitado"),
  employee("diego", "almacen-lopez", "norte", "manana", "Diego", "Flores", "Cajero"),
  employee("ana", "almacen-lopez", "norte", "tarde", "Ana", "Gutiérrez", "Cajera"),
  employee("sofia", "almacen-lopez", "norte", "noche", "Sofía", "Aguilar", "Encargada"),
  employee("luis", "almacen-lopez", "norte", "manana", "Luis", "Mendoza", "Reponedor"),
  employee("marco", "almacen-lopez", "plaza", "manana", "Marco", "Vargas", "Cajero", "invitado"),
  employee("raul", "almacen-lopez", "plaza", "manana", "Raúl", "Paz", "Encargado"),
  employee("elena", "almacen-lopez", "plaza", "tarde", "Elena", "Torrez", "Cajera"),
  employee("carmen", "almacen-lopez", "plaza", "tarde", "Carmen", "Salazar", "Cajera"),
  employee("andres", "almacen-lopez", "plaza", "tarde", "Andrés", "Ríos", "Reponedor", "invitado"),
  employee("maria-espiga", "la-espiga", "miraflores", "manana", "María Fernanda", "López García", "Cajera", "activo", "maria"),
  employee("teresa", "la-espiga", "miraflores", "manana", "Teresa", "Huanca", "Panadera"),
  employee("julio", "la-espiga", "miraflores", "tarde", "Julio", "Mamani", "Cajero"),
];

// Movimientos de hoy, por sucursal. Los montos están en Bs; el precio sale del inventario de cada sucursal.

type SaleSeed = [id: string, time: string, shiftKey: string, employeeId: string, items: [string, number][]];

const salesOf = (branchId: string, seed: SaleSeed[]): Sale[] =>
  seed.map(([id, time, shiftKey, employeeId, items]) => ({
    id,
    branchId,
    time,
    shiftId: `${branchId}-${shiftKey}`,
    employeeId,
    items: items.map(([productId, qty]) => ({ productId, qty })),
  }));

export const sales: Sale[] = [
  ...salesOf("centro", [
    ["v1", "07:42", "manana", "carla", [["pan", 10], ["leche", 2]]],
    ["v2", "08:15", "manana", "carla", [["huevos", 1], ["pan", 6]]],
    ["v3", "09:30", "manana", "carla", [["arroz", 2], ["aceite", 1], ["azucar", 1]]],
    ["v4", "11:05", "manana", "carla", [["gaseosa", 1], ["fideo", 2]]],
    ["v5", "14:20", "tarde", "jorge", [["cafe", 1], ["leche", 1]]],
    ["v6", "16:48", "tarde", "jorge", [["yogur", 1], ["mantequilla", 1]]],
    ["v7", "18:10", "tarde", "jorge", [["pan", 20], ["agua", 2]]],
    ["v8", "21:15", "noche", "lucia", [["gaseosa", 2], ["pan", 10]]],
    ["v9", "22:02", "noche", "lucia", [["arroz", 1], ["fideo", 1]]],
  ]),
  ...salesOf("norte", [
    ["n1", "07:55", "manana", "diego", [["pan", 8], ["leche", 2]]],
    ["n2", "09:10", "manana", "diego", [["arroz", 2], ["azucar", 1], ["aceite", 1]]],
    ["n3", "12:40", "manana", "diego", [["gaseosa", 2], ["papas", 1]]],
    ["n4", "15:05", "tarde", "ana", [["cafe", 1], ["galletas", 2]]],
    ["n5", "17:30", "tarde", "ana", [["huevos", 1], ["fideo", 3]]],
    ["n6", "21:20", "noche", "sofia", [["cerveza", 4], ["mani", 1]]],
  ]),
  ...salesOf("plaza", [
    ["p1", "09:40", "manana", "raul", [["chocolate", 2], ["agua", 1]]],
    ["p2", "11:15", "manana", "raul", [["detergente", 1], ["jabon", 2]]],
    ["p3", "16:20", "tarde", "elena", [["gaseosa", 1], ["papas", 2]]],
    ["p4", "18:45", "tarde", "elena", [["atun", 2], ["galletas", 1]]],
  ]),
  ...salesOf("miraflores", [
    ["m1", "06:20", "manana", "maria-espiga", [["esp-marraqueta", 10], ["esp-api", 2]]],
    ["m2", "07:05", "manana", "maria-espiga", [["esp-cunape", 4], ["esp-cafe", 2]]],
    ["m3", "09:30", "manana", "maria-espiga", [["esp-sarnita", 3]]],
    ["m4", "13:40", "tarde", "julio", [["esp-torta", 2], ["esp-empanada", 3]]],
    ["m5", "16:10", "tarde", "julio", [["esp-integral", 1], ["esp-galletas", 2]]],
  ]),
];

type ExpenseSeed = [time: string, shiftKey: string, employeeId: string, concept: string, category: string, amount: number];

const expenseOf = (branchId: string, id: string, date: string, [time, shiftKey, employeeId, concept, category, amount]: ExpenseSeed): DatedExpense => ({
  id,
  branchId,
  date,
  time,
  shiftId: `${branchId}-${shiftKey}`,
  employeeId,
  concept,
  category,
  amount,
});

const todayExpenses: Record<string, ExpenseSeed[]> = {
  centro: [
    ["08:00", "manana", "carla", "Garrafa de gas", "Servicios", 22.5],
    ["10:30", "manana", "carla", "Bolsas", "Insumos", 8],
    ["15:10", "tarde", "jorge", "Pago al proveedor de leche", "Proveedores", 140],
    ["19:40", "tarde", "jorge", "Productos de limpieza", "Insumos", 12],
    ["21:30", "noche", "lucia", "Taxi al depósito", "Transporte", 15],
  ],
  norte: [
    ["08:30", "manana", "diego", "Bolsas", "Insumos", 8],
    ["16:00", "tarde", "ana", "Pago al proveedor de gaseosas", "Proveedores", 85],
  ],
  plaza: [["10:00", "manana", "raul", "Expensas del centro comercial", "Servicios", 40]],
  miraflores: [
    ["06:10", "manana", "teresa", "Harina (2 qq)", "Proveedores", 160],
    ["14:30", "tarde", "julio", "Garrafa de gas", "Servicios", 22.5],
  ],
};

// Gastos de los 6 días anteriores: una lista fija por sucursal, con una variación determinista de monto.
const pastExpenses: Record<string, ExpenseSeed[]> = {
  centro: [
    ["08:20", "manana", "carla", "Pago al panadero", "Proveedores", 95],
    ["11:40", "manana", "carla", "Bolsas", "Insumos", 8],
    ["15:30", "tarde", "jorge", "Pago al proveedor de leche", "Proveedores", 120],
    ["18:05", "tarde", "jorge", "Luz del local", "Servicios", 64],
    ["21:45", "noche", "lucia", "Taxi al depósito", "Transporte", 15],
  ],
  norte: [
    ["09:00", "manana", "diego", "Pago al panadero", "Proveedores", 70],
    ["17:20", "tarde", "ana", "Bolsas", "Insumos", 8],
  ],
  plaza: [["10:15", "manana", "raul", "Expensas del centro comercial", "Servicios", 40]],
  miraflores: [
    ["06:15", "manana", "teresa", "Harina y manteca", "Proveedores", 120],
    ["15:00", "tarde", "julio", "Bolsas de papel", "Insumos", 10],
  ],
};

export const expenseHistory: DatedExpense[] = branches.flatMap(({ id: branchId }) => [
  ...todayExpenses[branchId].map((seed, i) => expenseOf(branchId, `${branchId}-g${i}`, TODAY, seed)),
  ...pastDates.toReversed().flatMap((date, d) =>
    pastExpenses[branchId].map((seed, i) => {
      const g = expenseOf(branchId, `${branchId}-h${d}-${i}`, date, seed);
      return { ...g, amount: g.amount + ((d * 3 + i) % 4) * 2.5 };
    }),
  ),
]);

// Ventas de los días anteriores por sucursal (fijas); hoy se calcula de `sales`.
export const pastSales: Record<string, number[]> = {
  centro: [612.5, 548, 731, 402.5, 569, 655.5],
  norte: [488, 512.5, 455, 530, 601, 476.5],
  plaza: [210, 265.5, 198, 240, 312.5, 288],
  miraflores: [384, 402, 356.5, 420, 451, 398.5],
};

export const shiftCloses: ShiftClose[] = [
  { branchId: "centro", shiftId: "centro-manana", status: "cerrado", opening: 100, difference: 0 },
  { branchId: "centro", shiftId: "centro-tarde", status: "cerrado", opening: 100, difference: -5 },
  { branchId: "centro", shiftId: "centro-noche", status: "en-curso", opening: 100 },
  { branchId: "norte", shiftId: "norte-manana", status: "cerrado", opening: 100, difference: 0 },
  { branchId: "norte", shiftId: "norte-tarde", status: "cerrado", opening: 100, difference: 0 },
  { branchId: "norte", shiftId: "norte-noche", status: "en-curso", opening: 100 },
  { branchId: "plaza", shiftId: "plaza-manana", status: "cerrado", opening: 80, difference: -3.5 },
  { branchId: "plaza", shiftId: "plaza-tarde", status: "en-curso", opening: 80 },
  { branchId: "miraflores", shiftId: "miraflores-manana", status: "cerrado", opening: 50, difference: 0 },
  { branchId: "miraflores", shiftId: "miraflores-tarde", status: "en-curso", opening: 50 },
];

// Utilidades sin estado.

export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
export const isLowStock = (p: { stock: number; minStock: number }) => p.stock <= p.minStock;
export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
