import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { fetchWithReadTimeout } from "./requestTimeout";
import {
  blockedRpc,
  guardPostgrestClient,
  guardStorageBucket,
  guardTableBuilder,
  installViewOnlyFetchGuard,
  isBlockedRpc,
  isViewOnly,
} from "./viewOnlyGuard";

// Typed against the generated schema (./database.types.ts): column names, row shapes, and
// insert/update payloads are checked at compile time.
type AnySupabaseClient = SupabaseClient<Database>;
type AnyPostgrestClient = ReturnType<AnySupabaseClient["schema"]>;

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

  cachedSupabase = createClient<Database>(url, key, {
    global: {
      headers: {
        apikey: key,
      },
      /**
       * Читання з дедлайном. Коли база мовчить (20.08.2026 інстанс перестав
       * відповідати зовсім), без цього сторінка крутить «Завантаження» стільки,
       * скільки шлюз тримає зʼєднання, і людина не розуміє, чи щось відбувається.
       * Тепер запит здається сам і сторінка може сказати правду. Записи й
       * завантаження файлів не чіпаємо — див. requestTimeout.ts.
       */
      fetch: fetchWithReadTimeout(),
    },
    /**
     * Стеля частоти broadcast — записана явно, хоч це і типове значення.
     *
     * Без неї легко поставити курсорам крок у 50 мс, побачити рівний рух у себе
     * на екрані й не помітити, що supabase-js половину повідомлень притримав:
     * зовні це виглядає не економією, а чужим курсором, який підвисає. Число
     * тут — МЕЖА, під яку має лізти LiveCursorsLayer, а не мета.
     */
    realtime: {
      params: { eventsPerSecond: 10 },
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
 * Режим перегляду («Дивитись як → очима людини») не має права нічого писати.
 *
 * Перехоплюємо тут, бо це єдине місце, крізь яке проходять УСІ запити: обходити
 * кнопки по сторінках означало б мовчки пропустити частину з них. Поза режимом
 * `isViewOnly()` хибний і жодної обгортки не створюється — звичайний шлях
 * лишається байт-у-байт тим самим.
 */
function withViewOnlyGuard<T extends object>(client: T, prop: string | symbol, value: unknown): unknown {
  if (!isViewOnly() || typeof value !== "function") return value;

  if (prop === "from") {
    return (...args: unknown[]) => {
      const builder = (value as (...a: unknown[]) => unknown).apply(client, args);
      return guardTableBuilder(builder, String(args[0] ?? "таблиця"));
    };
  }

  if (prop === "rpc") {
    return (...args: unknown[]) => {
      const name = String(args[0] ?? "");
      if (isBlockedRpc(name)) return blockedRpc(name);
      return (value as (...a: unknown[]) => unknown).apply(client, args);
    };
  }

  // `supabase.schema("tosho")` — окремий клієнт, який інакше пройшов би повз.
  if (prop === "schema") {
    return (...args: unknown[]) =>
      guardPostgrestClient((value as (...a: unknown[]) => unknown).apply(client, args));
  }

  return value;
}

installViewOnlyFetchGuard();

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

    if (prop === "storage" && isViewOnly() && value && typeof value === "object") {
      const storage = value as { from: (bucket: string) => unknown };
      return new Proxy(storage, {
        get(target, key) {
          const inner = Reflect.get(target, key);
          if (key !== "from" || typeof inner !== "function") {
            return typeof inner === "function" ? inner.bind(target) : inner;
          }
          return (bucket: string) => guardStorageBucket(inner.call(target, bucket), bucket);
        },
      });
    }

    const bound = typeof value === "function" ? value.bind(client) : value;
    return withViewOnlyGuard(client as object, prop, bound);
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
    const bound = typeof value === "function" ? value.bind(client) : value;
    return withViewOnlyGuard(client as object, prop, bound);
  },
}) as AnyPostgrestClient;

export async function supabaseHealthCheck() {
  // `db` is the tosho-schema client; its schema generic isn't bound here, so `.from()`
  // types the relation as `never` — cast the table name (runtime unchanged).
  return db.from("_healthcheck" as never).select("*").limit(1);
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
