// Client helper for `/.netlify/functions/decline-name`.
//
// Translates a Ukrainian full name from nominative to the requested case (default: genitive).
// Falls back to the source string on any failure so document generation never breaks.

import { supabase } from "@/lib/supabaseClient";

type DeclineCase = "genitive";

type DeclineResponse = {
  source?: string;
  case?: string;
  result?: string;
  cached?: boolean;
  warning?: string;
};

// In-memory cache to avoid hitting the network for repeated lookups in the same session.
const memoryCache = new Map<string, string>();

const cacheKey = (source: string, targetCase: DeclineCase) => `${targetCase}::${source}`;

const FALLBACK = (source: string) => source.trim();

/**
 * Довше документ не чекає: холодна функція з OpenAI відповідала до 10 с, і
 * вікно документа весь цей час висіло. Не встигли — друкуємо називний відмінок.
 */
const DECLINE_TIMEOUT_MS = 4_000;

export async function declineName(source: string, targetCase: DeclineCase = "genitive"): Promise<string> {
  const trimmed = (source ?? "").trim();
  if (!trimmed) return trimmed;

  const key = cacheKey(trimmed, targetCase);
  const memoized = memoryCache.get(key);
  if (memoized !== undefined) return memoized;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      memoryCache.set(key, FALLBACK(trimmed));
      return FALLBACK(trimmed);
    }

    const response = await fetch("/.netlify/functions/decline-name", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ source: trimmed, case: targetCase }),
      signal: AbortSignal.timeout(DECLINE_TIMEOUT_MS),
    });

    if (!response.ok) {
      memoryCache.set(key, FALLBACK(trimmed));
      return FALLBACK(trimmed);
    }

    const data = (await response.json()) as DeclineResponse;
    const result =
      typeof data.result === "string" && data.result.trim() ? data.result.trim() : FALLBACK(trimmed);
    memoryCache.set(key, result);
    return result;
  } catch (error: unknown) {
    // Тайм-аут не кешуємо: наступного разу функція вже тепла й відповість вчасно.
    if (!(error instanceof DOMException && error.name === "TimeoutError")) memoryCache.set(key, FALLBACK(trimmed));
    return FALLBACK(trimmed);
  }
}

/** Convenience wrapper for the common case (Кого?). */
export const declineToGenitive = (source: string) => declineName(source, "genitive");
