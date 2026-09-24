/**
 * Який запит обірвався останнім.
 *
 * НАВІЩО. Коли зникає мережа, клієнт бази не кидає Error, а повертає
 * `{ error: { message: "TypeError: Failed to fetch" } }` — без стека й без
 * адреси. Код, що робить `if (error) throw error` поза try, перетворює це на
 * необроблену помилку, і в журналі лишаються тільки текст і сторінка. Так
 * 24.09.2026 прийшов алерт «Нова помилка в браузері» з картки прорахунку: із
 * сотні запитів, які сторінка робить при відкритті, упав один, і який саме —
 * не відновити ні з журналу, ні з логів бази (до сервера він не дійшов).
 *
 * Тому обгортка над fetch запам'ятовує метод і шлях останнього обірваного
 * запиту, а журнал помилок дописує його поруч. Наступного разу видно, чий код
 * не обробляє обрив.
 *
 * Лише шлях, без параметрів: у параметрах бувають ідентифікатори й тексти
 * пошуку, а для діагнозу досить таблиці чи функції.
 */

type NetworkFailure = { method: string; path: string; at: number };

/** Скільки обрив вважається «тим самим», що й помилка в журналі. */
export const NETWORK_FAILURE_MATCH_WINDOW_MS = 15_000;

/** `/rest/v1/rpc/<функція>` — чотири сегменти; далі в сховищі йдуть імена файлів. */
const MAX_PATH_SEGMENTS = 4;

let lastFailure: NetworkFailure | null = null;

function describeRequest(input: RequestInfo | URL, init?: RequestInit): { method: string; path: string } {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const raw = input instanceof Request ? input.url : String(input);
  let pathname: string;
  try {
    pathname = new URL(raw, "http://local").pathname;
  } catch {
    pathname = raw.split("?")[0] ?? "";
  }
  const segments = pathname.split("/").filter(Boolean).slice(0, MAX_PATH_SEGMENTS).map(decodeSegment);
  return { method, path: `/${segments.join("/")}` };
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Обгортка для клієнта Supabase. Поведінку запиту не міняє: відповідь і
 * помилка проходять як були, лише обрив мережі лишає слід.
 *
 * Обрив у fetch — завжди TypeError. Скасування (AbortError) — рішення коду, а
 * наш тайм-аут має власний зрозумілий текст; жодне з них сюди не пишеться.
 */
export function trackNetworkFailures(baseFetch: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      return await baseFetch(input, init);
    } catch (error) {
      if (error instanceof TypeError) {
        lastFailure = { ...describeRequest(input, init), at: Date.now() };
      }
      throw error;
    }
  };
}

/** «POST /rest/v1/rpc/acquire_entity_lock», якщо обрив був щойно; інакше null. */
export function describeRecentNetworkFailure(now: number = Date.now()): string | null {
  if (!lastFailure) return null;
  if (now - lastFailure.at > NETWORK_FAILURE_MATCH_WINDOW_MS) return null;
  return `${lastFailure.method} ${lastFailure.path}`;
}

/** Для тестів: стан модуля не має протікати з одного тесту в інший. */
export function resetNetworkFailureTrail(): void {
  lastFailure = null;
}
