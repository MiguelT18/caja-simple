// Caché en Redis (Upstash) para lo que cambia poco. Ver docs/modelo-de-datos.md › Caché.
// Sin las variables de Upstash, o si Redis falla, todo va directo a Supabase: la caché nunca rompe la app.
// El límite de intentos (rateLimit) sí las exige en producción.
import { Redis } from "@upstash/redis";
import { UPSTASH_REDIS_REST_TOKEN, UPSTASH_REDIS_REST_URL } from "astro:env/server";

const redis = UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN ? new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN }) : null;

/** Claves de versión: subirlas invalida toda entrada que dependa de ellas. */
export const userVersion = (userId: string) => `v:u:${userId}`;
export const businessVersion = (businessId: string) => `v:b:${businessId}`;

const versionsOf = async (keys: string[]) => (keys.length ? (await redis!.mget<(number | null)[]>(...keys)).map((v) => Number(v ?? 0)) : []);

/**
 * Cache-aside: devuelve lo guardado si las versiones de sus dependencias no cambiaron; si no, corre `fn` y lo guarda.
 * Guarda solo filas crudas (JSON), nunca objetos con funciones o Map.
 */
export async function cached<T>(key: string, ttl: number, fn: () => Promise<T>, deps: (value: T) => string[]): Promise<T> {
  if (!redis) return fn();
  try {
    const hit = await redis.get<{ data: T; deps: string[]; versions: number[] }>(key);
    if (hit) {
      const now = await versionsOf(hit.deps);
      if (now.every((v, i) => v === hit.versions[i])) return hit.data;
    }
  } catch (error) {
    console.error("cache get", key, error);
    return fn();
  }
  const data = await fn();
  try {
    const keys = deps(data);
    // shortcut: las versiones se leen después de fn; una escritura en ese instante deja datos viejos hasta el TTL. Si pasa, leerlas antes.
    await redis.set(key, { data, deps: keys, versions: await versionsOf(keys) }, { ex: ttl });
  } catch (error) {
    console.error("cache set", key, error);
  }
  return data;
}

/** Invalida todo lo que dependa de esas versiones. */
export async function bump(...keys: string[]) {
  if (!redis || keys.length === 0) return;
  try {
    const p = redis.pipeline();
    for (const k of new Set(keys)) p.incr(k);
    await p.exec();
  } catch (error) {
    console.error("cache bump", error);
  }
}

/**
 * Límite de intentos en ventana fija. Si Redis falla, deja pasar: mejor sin límite que dejar a todos fuera.
 * Sin Upstash: en dev deja pasar; en producción es un error de configuración (la 2FA quedaría sin límite).
 */
export async function rateLimit(key: string, max: number, windowSec: number) {
  if (!redis) {
    if (import.meta.env.PROD) throw new Error("Falta UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN: sin ellas no hay límite de intentos en el acceso.");
    return true;
  }
  try {
    const [count] = await redis.pipeline().incr(`rl:${key}`).expire(`rl:${key}`, windowSec, "NX").exec<[number, number]>();
    // shortcut: la ventana fija deja pasar hasta 2× max en el borde entre ventanas; usar @upstash/ratelimit (ventana deslizante) si hay abuso.
    return count <= max;
  } catch (error) {
    console.error("rate limit", key, error);
    return true;
  }
}

/** Valores simples con TTL (URLs firmadas). Devuelve null en las claves que faltan. */
export async function getMany(keys: string[]): Promise<(string | null)[]> {
  if (!redis || keys.length === 0) return keys.map(() => null);
  try {
    return await redis.mget<(string | null)[]>(...keys);
  } catch (error) {
    console.error("cache mget", error);
    return keys.map(() => null);
  }
}

export async function setMany(entries: [string, string][], ttl: number) {
  if (!redis || entries.length === 0) return;
  try {
    const p = redis.pipeline();
    for (const [k, v] of entries) p.set(k, v, { ex: ttl });
    await p.exec();
  } catch (error) {
    console.error("cache setMany", error);
  }
}
