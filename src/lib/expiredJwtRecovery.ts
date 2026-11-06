/**
 * Відновлення після «JWT expired», коли годинник комп'ютера бреше.
 *
 * НАВІЩО. Клієнт бази вирішує, чи пора оновлювати токен, порівнюючи його строк
 * із `Date.now()` — тобто з годинником людини, а не сервера. 06.11.2026 у
 * дизайнерки годинник відстав на 45 хв: токен закінчився, а браузер ще 45 хв
 * вважав його живим, не оновлював і слав далі. База відхиляла все (2214 запитів
 * за день), а сторінка показувала сире «JWT expired» і порожню дошку. Жодної
 * спроби оновитись за цей час у логах немає — клієнт просто не бачив причини.
 *
 * ТОМУ орієнтир тут — слово сервера, а не годинник: база сказала «прострочено»,
 * отже оновлюємо сесію й повторюємо запит. Людина цього не помічає.
 *
 * Повтор безпечний і для записів: прострочений токен відхиляється ДО виконання
 * запиту, тож другий запис не задвоїть перший.
 *
 * Лише REST. Вхід сюди не потрапляє (інакше оновлення токена оновлювало б себе),
 * а файли у сховищі не повторюємо: тіло на 50 МБ не для цього. Їм вистачає того,
 * що найближчий запит до бази оновить сесію для всіх — присутність ходить щохвилини.
 */

/** Повертає живий токен або null, якщо сесію відновити не вдалось. */
export type RenewAccessToken = (failedToken: string) => Promise<string | null>;

const BEARER = /^Bearer\s+(.+)$/i;

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

const isRestRequest = (input: RequestInfo | URL): boolean => {
  try {
    return new URL(urlOf(input), "http://local").pathname.startsWith("/rest/v1/");
  } catch {
    return false;
  }
};

/** PGRST301 («підпис не той») сюди не входить: це відмова, а не прострочення. */
const isExpiredJwtResponse = async (response: Response): Promise<boolean> => {
  if (response.status !== 401) return false;
  try {
    const body = (await response.clone().json()) as { code?: unknown; message?: unknown };
    return body?.code === "PGRST303" || (typeof body?.message === "string" && /jwt expired/i.test(body.message));
  } catch {
    return false;
  }
};

/**
 * Обгортка над `fetch` для клієнта Supabase — зовнішня, бо токен у заголовок
 * ставить сам клієнт, і саме цей заголовок тут треба підмінити.
 */
export function recoverExpiredJwt(baseFetch: typeof fetch, renew: RenewAccessToken): typeof fetch {
  /**
   * Одне оновлення на пачку. Сторінка шле сотні запитів разом і всі вони
   * повертаються з відмовою; кожне оновлення ротує refresh-токен, тож пачка
   * оновлень — це гонка, яка може викинути людину із системи.
   */
  let renewing: Promise<string | null> | null = null;

  const renewOnce = (failedToken: string): Promise<string | null> => {
    renewing ??= renew(failedToken)
      .catch(() => null)
      .finally(() => {
        renewing = null;
      });
    return renewing;
  };

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await baseFetch(input, init);
    if (response.status !== 401 || input instanceof Request || !isRestRequest(input)) return response;

    // Потік другий раз не прочитати: повтор пішов би з порожнім тілом.
    if (init?.body != null && typeof init.body !== "string") return response;

    const headers = new Headers(init?.headers);
    const failedToken = headers.get("Authorization")?.match(BEARER)?.[1];
    if (!failedToken || !(await isExpiredJwtResponse(response))) return response;

    const freshToken = await renewOnce(failedToken);
    if (!freshToken) return response;

    headers.set("Authorization", `Bearer ${freshToken}`);
    return baseFetch(input, { ...init, headers });
  };
}
