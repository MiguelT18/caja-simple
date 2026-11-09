// Lógica pura de las páginas en vivo (live.ts): agrupar avisos, el texto para lectores de pantalla y «hace X min».

/** Un aviso de la base (migración business_live): qué tabla, qué operación y en qué sucursal. Sin datos del negocio. */
export interface LiveEvent {
  table: string;
  op: string;
  branch: string;
}

/** Junta los avisos que llegan seguidos y los entrega de una vez, `wait` ms después del último. */
export function createBatcher<T>(wait: number, flush: (items: T[]) => void) {
  let items: T[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    push(item: T) {
      items.push(item);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const batch = items;
        items = [];
        flush(batch);
      }, wait);
    },
    cancel() {
      clearTimeout(timer);
      items = [];
    },
  };
}

const what = (e: LiveEvent, n: number) => {
  if (e.table === "sales") return e.op === "insert" ? (n > 1 ? `${n} ventas nuevas` : "Nueva venta") : "Venta anulada";
  if (e.table === "expenses") return e.op === "insert" ? (n > 1 ? `${n} gastos nuevos` : "Nuevo gasto") : "Gasto modificado";
  if (e.table === "shift_closes") return e.op === "insert" ? "Turno abierto" : "Turno actualizado";
  return "Cambios";
};

/** Una frase corta para aria-live: «Nueva venta en Sucursal Centro», «Cambios en 2 sucursales». Nunca montos. */
export function announcement(events: LiveEvent[], names: Record<string, string>) {
  if (events.length === 0) return "";
  const branches = new Set(events.map((e) => e.branch));
  if (branches.size > 1) return `Cambios en ${branches.size} sucursales`;
  const where = names[events[0].branch] ?? "una sucursal";
  const kinds = new Set(events.map((e) => `${e.table}:${e.op}`));
  return kinds.size === 1 ? `${what(events[0], events.length)} en ${where}` : `Cambios en ${where}`;
}

/** «hace un momento», «hace 1 min», «hace 2 h». */
export function ago(ms: number) {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}
