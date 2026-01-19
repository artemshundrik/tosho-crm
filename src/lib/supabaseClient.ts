import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PostgrestClient } from "@supabase/postgrest-js";

type AnySupabaseClient = SupabaseClient<any, any, any, any, any>;
type AnyPostgrestClient = PostgrestClient<any, any, any>;

let cachedSupabase: AnySupabaseClient | null = null;
let cachedDb: AnyPostgrestClient | null = null;

function requireEnv(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY"): string {
  const v = import.meta.env[name] as string | undefined;
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function getSupabaseClient(): AnySupabaseClient {
  if (cachedSupabase) return cachedSupabase;

  const url = requireEnv("VITE_SUPABASE_URL");
  const key = requireEnv("VITE_SUPABASE_ANON_KEY");

  cachedSupabase = createClient(url, key);
  return cachedSupabase;
}

/**
 * DB-клієнт для CRM зі схемою `tosho`
 */
export function getDbClient(): AnyPostgrestClient {
  if (cachedDb) return cachedDb;

  const supabase = getSupabaseClient();
  cachedDb = supabase.schema("tosho") as unknown as AnyPostgrestClient;

  return cachedDb;
}

/**
 * Сумісний експорт, щоб НЕ ламати існуючі імпорти:
 * import { supabase } from "@/lib/supabaseClient"
 *
 * Це звичайний SupabaseClient (auth/realtime/storage доступні).
 */
export const supabase: AnySupabaseClient = new Proxy({} as AnySupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    return (client as any)[prop];
  },
}) as AnySupabaseClient;

/**
 * Зручний db експорт для CRM:
 * import { db } from "@/lib/supabaseClient"
 * db.from("clients") -> tosho.clients
 */
export const db: AnyPostgrestClient = new Proxy({} as AnyPostgrestClient, {
  get(_target, prop) {
    const client = getDbClient();
    return (client as any)[prop];
  },
}) as AnyPostgrestClient;

export async function supabaseHealthCheck() {
  return db.from("_healthcheck").select("*").limit(1);
}
