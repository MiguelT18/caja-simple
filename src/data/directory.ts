// Buscar negocios (/app/buscar) y pedidos para unirse (Empleados). Nada de esto va a la caché: cambia con cada pedido.
import type { BusinessKind } from "./types";
import { fail } from "./mappers";
import { imageUrls } from "./shared";

/** Qué es la persona en cada negocio encontrado: decide el botón de la tarjeta. */
export type DirectoryRelation = "dueño" | "equipo" | "invitado" | "pendiente" | null;

export interface DirectoryBusiness {
  id: string;
  name: string;
  kind: BusinessKind;
  description: string;
  logo?: string;
  branches: { id: string; name: string; address: string }[];
  relation: DirectoryRelation;
}

export const DIRECTORY_PAGE_SIZE = 12;

export async function searchBusinesses(locals: App.Locals, { q, kind, page }: { q: string; kind: BusinessKind | null; page: number }) {
  const sb = locals.supabase;
  const { data, error } = await sb.rpc("search_businesses", { p_query: q, p_kind: kind ?? undefined, p_page: page });
  fail(error);
  const rows = data ?? [];
  const logos = await imageUrls(sb, rows.map((r) => r.image_path), "branch-images");
  return {
    total: Number(rows[0]?.total ?? 0),
    businesses: rows.map(
      (r): DirectoryBusiness => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        description: r.description,
        logo: r.image_path ? logos.get(r.image_path) : undefined,
        branches: r.branches as DirectoryBusiness["branches"],
        relation: r.relation as DirectoryRelation,
      }),
    ),
  };
}

export interface JoinRequest {
  id: string;
  personName: string;
  personEmail: string;
  branchId?: string;
  message?: string;
  createdAt: string;
}

/** Pedidos para unirse que esperan respuesta de la dueña (RLS deja verlos solo a ella). */
export async function joinRequests(locals: App.Locals, businessId: string): Promise<JoinRequest[]> {
  const { data, error } = await locals.supabase
    .from("join_requests")
    .select("id, person_name, person_email, branch_id, message, created_at")
    .eq("business_id", businessId)
    .eq("status", "pendiente")
    .order("created_at");
  fail(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    personName: r.person_name,
    personEmail: r.person_email,
    branchId: r.branch_id ?? undefined,
    message: r.message ?? undefined,
    createdAt: r.created_at,
  }));
}
