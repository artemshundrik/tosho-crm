import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PostgrestClient } from "@supabase/postgrest-js";

type AnySupabaseClient = SupabaseClient<any, any, any, any, any>;
type AnyPostgrestClient = PostgrestClient<any, any, any>;

let cachedSupabase: AnySupabaseClient | null = null;
let cachedDb: AnyPostgrestClient | null = null;

export function getSupabaseClient(): AnySupabaseClient {
  if (cachedSupabase) return cachedSupabase;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }

  cachedSupabase = createClient(supabaseUrl, supabaseAnonKey);
  return cachedSupabase;
}

/**
 * DB client з дефолтною схемою `tosho`.
 * Використовуй його для всіх запитів до таблиць CRM.
 */
export function getDbClient(): AnyPostgrestClient {
  if (cachedDb) return cachedDb;

  const supabase = getSupabaseClient();

  // У твоїй версії supabase-js це повертає PostgrestClient — це ОК.
  cachedDb = supabase.schema("tosho") as unknown as AnyPostgrestClient;

  return cachedDb;
}

/**
 * Простий runtime health-check (НЕ викликати під час build)
 */
export async function supabaseHealthCheck() {
  const db = getDbClient();
  return db.from("_healthcheck").select("*").limit(1);
}
