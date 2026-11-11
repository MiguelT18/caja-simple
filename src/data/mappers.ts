// Conversión de filas de la base (snake_case) a los tipos de dominio de ./types.
import type { Branch, Business, CatalogProduct, Employee, Person, Shift } from "./types";

type Tables = import("@/lib/database.types").Database["public"]["Tables"];
export type Row<T extends keyof Tables> = Tables[T]["Row"];

export function fail(error: { message: string } | null) {
  if (error) throw new Error(`Error al consultar la base de datos: ${error.message}`);
}

export const toBusiness = (b: Row<"businesses">): Business => ({
  id: b.id,
  slug: b.slug,
  name: b.name,
  ownerId: b.owner_id,
  plan: b.plan,
  trial: b.trial || undefined,
  kind: b.kind,
  imagePath: b.image_path ?? undefined,
  description: b.description ?? undefined,
  listed: b.listed,
  // Una fila cacheada de antes de la columna no la trae: ámbar.
  color: (b.color ?? "ambar") as Business["color"],
});

export const toBranch = (b: Row<"branches">): Branch => ({
  id: b.id,
  businessId: b.business_id,
  slug: b.slug,
  name: b.name,
  address: b.address,
  imagePath: b.image_path ?? undefined,
});

export const toShift = (s: Row<"shifts">): Shift => ({
  id: s.id,
  branchId: s.branch_id,
  name: s.name,
  start: s.start_time.slice(0, 5),
  end: s.end_time.slice(0, 5),
  tone: s.tone,
  weekdays: s.weekdays,
  archived: s.archived_at !== null,
});

// El nombre es de la persona: se trae de su perfil con el empleado.
export const EMPLOYEE_COLUMNS = "*, profile:profiles(first_name, last_name)";
type EmployeeRow = Row<"employees"> & { profile: { first_name: string; last_name: string } | null };

export const toEmployee = (e: EmployeeRow): Employee => ({
  id: e.id,
  businessId: e.business_id,
  branchId: e.branch_id,
  shiftId: e.shift_id ?? undefined,
  personId: e.person_id ?? undefined,
  email: e.email,
  firstName: e.profile?.first_name || e.email,
  lastName: e.profile?.last_name ?? "",
  jobTitle: e.job_title,
  status: e.status,
});

export const toPerson = (p: Row<"profiles">): Person => ({
  id: p.id,
  firstName: p.first_name,
  lastName: p.last_name,
  email: p.email,
  avatarUrl: p.avatar_url ?? undefined,
});

/** Producto del catálogo con su categoría y la URL firmada de su foto (de imageUrls). */
export const toCatalogProduct = (
  p: Row<"products"> & {
    categories: { name: string } | null;
    components?: { component_id: string; qty: number; product: { name: string } | null }[];
  },
  images: Map<string, string>,
): Omit<CatalogProduct, "businessId"> => ({
  id: p.id,
  name: p.name,
  categoryId: p.category_id ?? undefined,
  category: p.categories?.name,
  barcode: p.barcode ?? undefined,
  description: p.description ?? undefined,
  image: p.image_path ? images.get(p.image_path) : undefined,
  components: p.components?.length ? p.components.map((c) => ({ productId: c.component_id, name: c.product?.name ?? "", qty: c.qty })) : undefined,
});

/** Embed de PostgREST con lo que incluye un combo (para el select de products). */
export const COMBO_PARTS =
  "components:product_components!product_components_combo_id_business_id_fkey(component_id, qty, product:products!product_components_component_id_business_id_fkey(name))";
