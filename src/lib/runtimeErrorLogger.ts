import { supabase } from "@/lib/supabaseClient";
import type { Json } from "@/lib/database.types";
import { buildUserNameFromMetadata } from "@/lib/userName";
import { getCurrentUser, getCurrentUserId } from "./currentUser";

type RuntimeErrorPayload = {
  teamId?: string | null;
  userId?: string | null;
  actorName?: string | null;
  source: "boundary" | "window_error" | "unhandledrejection";
  title?: string | null;
  href?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Локальна машина в журнал не пише.
 *
 * `import.meta.env.DEV` ловить лише dev-сервер, а зібране прев'ю (`vite
 * preview`, `netlify dev`) — це збірка ПРОДАКШЕНУ на localhost: прапорець там
 * хибний, і помилка їде в спільний журнал нарівні зі справжніми. Так у
 * таблиці й опинився запис з origin `http://localhost:5200` — це наш власний
 * `preview-alt` із .claude/launch.json, на якому міряють швидкість.
 *
 * Чому це важливо за межами одного рядка: журнал читають, щоб зрозуміти, чи в
 * проді щось горить. Кожна помилка з чиєїсь машини — це хибний сигнал, і
 * розбирати його доводиться руками. У розробника помилка й так перед очима в
 * консолі.
 *
 * Приватні адреси теж локальні: dev-сервер, відкритий із телефона по Wi-Fi,
 * має адресу виду 192.168.x.x, а не localhost.
 */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

export function isLocalRuntimeHost(hostname: string | null | undefined): boolean {
  const host = (hostname ?? "").trim().toLowerCase();
  if (!host) return false;
  if (LOCAL_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  return /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

let cachedActorName: string | null = null;

async function resolveActorName(): Promise<string | null> {
  if (cachedActorName) return cachedActorName;
  const user = await getCurrentUser();
  if (!user) return null;
  const resolved = buildUserNameFromMetadata(
    user.user_metadata as Record<string, unknown> | undefined,
    user.email
  );
  const name = resolved.displayName || user.email || null;
  cachedActorName = name;
  return name;
}

export async function logRuntimeError(payload: RuntimeErrorPayload) {
  // Перевірка тут, а не лише на місці виклику: журнал спільний, і кожен
  // майбутній відправник має мовчати з localhost так само, нічого не знаючи
  // про це правило.
  if (typeof window !== "undefined" && isLocalRuntimeHost(window.location.hostname)) return;

  const teamId = payload.teamId ?? null;
  if (!teamId) return;

  let userId = payload.userId ?? null;
  if (!userId) {
    userId = await getCurrentUserId();
  }
  if (!userId) return;

  const actorName = payload.actorName ?? (await resolveActorName());

  const { error } = await supabase.schema("tosho").from("runtime_errors").insert({
    team_id: teamId,
    user_id: userId,
    actor_name: actorName,
    source: payload.source,
    title: payload.title ?? null,
    href: payload.href ?? null,
    metadata: (payload.metadata ?? {}) as Json,
  });

  if (error) throw error;
}
