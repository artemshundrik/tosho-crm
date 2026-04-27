import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PostgrestClient } from "@supabase/postgrest-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any, any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPostgrestClient = PostgrestClient<any, any, any>;

let cachedSupabase: AnySupabaseClient | null = null;
let cachedDb: AnyPostgrestClient | null = null;
const REALTIME_DISABLED_KEY = "tosho_realtime_disabled";

function requireEnv(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY"): string {
  const v = import.meta.env[name] as string | undefined;
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function getSupabaseClient(): AnySupabaseClient {
  if (cachedSupabase) return cachedSupabase;

  const url = requireEnv("VITE_SUPABASE_URL");
  const key = requireEnv("VITE_SUPABASE_ANON_KEY");

  cachedSupabase = createClient(url, key, {
    global: {
      headers: {
        apikey: key,
      },
    },
  });
  return cachedSupabase;
}

/**
 * DB-замовник для CRM зі схемою `tosho`
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
    const value = Reflect.get(client as object, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as AnySupabaseClient;

// Dev-only helper to inspect auth/session in browser console.
if (import.meta.env.DEV) {
  (window as unknown as { supabase?: AnySupabaseClient }).supabase = supabase;
}

/**
 * Зручний db експорт для CRM:
 * import { db } from "@/lib/supabaseClient"
 * db.from("clients") -> tosho.clients
 */
export const db: AnyPostgrestClient = new Proxy({} as AnyPostgrestClient, {
  get(_target, prop) {
    const client = getDbClient();
    const value = Reflect.get(client as object, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as AnyPostgrestClient;

export async function supabaseHealthCheck() {
  return db.from("_healthcheck").select("*").limit(1);
}

export function isRealtimeDisabledForSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(REALTIME_DISABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function disableRealtimeForSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(REALTIME_DISABLED_KEY, "1");
  } catch {
    // ignore storage access issues
  }
}

export function enableRealtimeForSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(REALTIME_DISABLED_KEY);
  } catch {
    // ignore storage access issues
  }
}
