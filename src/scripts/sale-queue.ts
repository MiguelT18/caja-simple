// Ventas sin conexión: se guardan en el dispositivo y se envían al volver la red (registrar-venta.astro).
// El saleId es el de la venta: register_sale lo ignora si ya llegó, así que reenviar nunca duplica.
// La venta lleva su hora (`at`): la base la guarda como occurred_at, acotada al turno abierto, y con ella elige la promoción del día.

export interface QueuedSale {
  saleId: string;
  branchId: string;
  shiftId: string;
  payment: "efectivo" | "qr" | "transferencia";
  items: { productId: string; qty: number; price?: number }[];
  total: number;
  /** Cuándo se hizo, en ms: se muestra y se envía como la hora de la venta. */
  at: number;
  /** El servidor la rechazó (por ejemplo, el turno ya se cerró): queda a la vista hasta descartarla. */
  error?: string;
}

const KEY = "caja:ventas-pendientes";

export function queued(): QueuedSale[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(list: QueuedSale[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {}
}

export const enqueue = (sale: QueuedSale) => save([...queued().filter((s) => s.saleId !== sale.saleId), sale]);
export const discard = (saleId: string) => save(queued().filter((s) => s.saleId !== saleId));

/** El resultado de enviar una venta: `offline` si no hubo respuesta (se reintenta después). */
export type SendResult = "ok" | "offline" | { error: string };

/**
 * Envía las pendientes en orden. Se detiene al primer corte de red; las rechazadas quedan marcadas con su error.
 * Devuelve cuántas se enviaron.
 */
export async function flush(send: (sale: QueuedSale) => Promise<SendResult>) {
  let sent = 0;
  for (const sale of queued().filter((s) => !s.error)) {
    const result = await send(sale);
    if (result === "offline") break;
    // Se relee cada vez: otra pestaña pudo cambiar la cola mientras tanto.
    if (result === "ok") {
      discard(sale.saleId);
      sent++;
    } else save(queued().map((s) => (s.saleId === sale.saleId ? { ...s, error: result.error } : s)));
  }
  return sent;
}
