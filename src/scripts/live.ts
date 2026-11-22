// Páginas en vivo: escucha los avisos del canal privado del negocio (Realtime Broadcast) y, al recibirlos, vuelve a pedir
// la página y cambia sus regiones (refreshRegions). El aviso no trae datos: lo que se ve lo arma el servidor, con RLS.
// Si Realtime no conecta, consulta cada minuto con la pestaña visible. Ver docs/modelo-de-datos.md › En vivo.
import { refreshRegions } from "./refresh";
import { announcement, createBatcher, type LiveEvent } from "./live-core";

export type LiveStatus = { live: boolean; updatedAt: number };

interface Options {
  /** Al cortarse, se cierra la conexión y deja de consultar (al dejar la página). */
  signal: AbortSignal;
  /** Canal: «negocio:<id>». */
  topic: string;
  /** Regiones (data-region) que se actualizan. */
  regions: string[];
  /** Además de `regions`, las que tocan según lo que llegó (p. ej., la bandeja: según el tipo de aviso). */
  regionsFor?: (events: LiveEvent[]) => string[];
  /** Actualiza aunque la pestaña esté oculta (la bandeja: el título de la pestaña avisa). */
  whileHidden?: boolean;
  /** id de sucursal → nombre, para el anuncio. */
  names: Record<string, string>;
  /** Solo los avisos de esta sucursal (el canal es del negocio entero). */
  branch?: string;
  /** Cambió el estado de la conexión o se actualizó la página. */
  onStatus: (status: LiveStatus) => void;
  /** Texto para aria-live, ya agrupado. */
  onAnnounce: (text: string) => void;
  /** Antes y después de cambiar las regiones (para comparar montos). */
  beforeRefresh?: () => void;
  afterRefresh?: () => void;
}

const WAIT = 1000;
const POLL = 60_000;
const CONNECT_TIMEOUT = 10_000;

interface Token {
  url: string;
  apikey: string;
  token: string;
  expiresAt: number;
}

export function watchLive(o: Options) {
  let live = false;
  let updatedAt = Date.now();
  let pending = false; // llegó un aviso con la pestaña oculta
  let busy = false;
  let poll: ReturnType<typeof setInterval> | undefined;

  const status = () => o.onStatus({ live, updatedAt });

  // Un aviso que llega mientras se actualiza no se pierde: al terminar se actualiza otra vez (la página que se pidió
  // pudo armarse antes de ese cambio).
  let again = "";
  const extra = new Set<string>();
  const refresh = async (text = "", more: string[] = []): Promise<void> => {
    if (o.signal.aborted) return;
    more.forEach((r) => extra.add(r));
    if (busy) {
      again = text || again || " ";
      return;
    }
    busy = true;
    const regions = [...new Set([...o.regions, ...extra])];
    extra.clear();
    try {
      o.beforeRefresh?.();
      await refreshRegions(regions, location.href, { keepFocus: true });
      o.afterRefresh?.();
      updatedAt = Date.now();
      if (text) o.onAnnounce(text);
    } finally {
      busy = false;
      status();
    }
    if (again) {
      const next = again.trim();
      again = "";
      return refresh(next);
    }
  };

  const batch = createBatcher<LiveEvent>(WAIT, (events) => {
    const more = o.regionsFor?.(events) ?? [];
    if (document.hidden && !o.whileHidden) {
      pending = true;
      more.forEach((r) => extra.add(r));
    } else void refresh(announcement(events, o.names), more);
  });

  // Respaldo: cada minuto, solo mientras Realtime no está y la pestaña se ve.
  // Solo al cambiar de estado: realtime-js reintenta cada pocos segundos y cada error reiniciaría la cuenta del minuto.
  const setLive = (value: boolean) => {
    if (o.signal.aborted || (value === live && (live || poll))) return;
    live = value;
    clearInterval(poll);
    poll = live ? undefined : setInterval(() => (o.whileHidden || !document.hidden) && refresh(), POLL);
    status();
  };

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) return;
      if (pending || Date.now() - updatedAt > POLL) {
        pending = false;
        void refresh();
      } else status();
    },
    { signal: o.signal },
  );
  o.signal.addEventListener("abort", () => clearInterval(poll));

  // Solo el access token: lo da el servidor, que es el único que renueva la sesión.
  let token: Token | undefined;
  const getToken = async () => {
    if (!token || token.expiresAt - Date.now() < 60_000) {
      const res = await fetch("/api/realtime-token", { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`token ${res.status}`);
      token = (await res.json()) as Token;
    }
    return token;
  };

  setLive(false);
  const connect = async () => {
    const first = await getToken();
    const { RealtimeClient } = await import("@supabase/supabase-js");
    const client = new RealtimeClient(`${first.url.replace(/^http/, "ws")}/realtime/v1`, {
      params: { apikey: first.apikey },
      accessToken: async () => (await getToken()).token,
    });
    // Sin esto el canal puede unirse antes de que llegue el token, como anónimo, y la base lo rechaza.
    await client.setAuth();
    if (o.signal.aborted) return client.disconnect();
    o.signal.addEventListener("abort", () => void client.removeAllChannels().then(() => client.disconnect()));
    const channel = client.channel(o.topic, { config: { private: true } });
    channel.on("broadcast", { event: "*" }, ({ event, payload }) => {
      if (o.branch && payload?.branch !== o.branch) return;
      // Un aviso de la bandeja trae su tipo («kind»); uno del negocio, la tabla como evento.
      batch.push({ table: String(payload?.kind ?? event), op: String(payload?.op ?? "insert"), branch: String(payload?.branch ?? "") });
    });
    const timeout = setTimeout(() => setLive(false), CONNECT_TIMEOUT);
    channel.subscribe((state) => {
      if (state === "SUBSCRIBED") {
        clearTimeout(timeout);
        // Lo que pasó mientras no había conexión no llegó como aviso.
        if (!live && Date.now() - updatedAt > WAIT) void refresh();
        setLive(true);
      } else {
        setLive(false);
      }
    });
  };
  connect().catch(() => setLive(false));
}
