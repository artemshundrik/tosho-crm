/**
 * Який зараз час насправді, коли годинник комп'ютера бреше.
 *
 * НАВІЩО. Початок і кінець таймера дизайну ставить база (тригер у
 * scripts/design-task-timer-server-clock.sql). А лічильник на екрані рахує
 * «зараз мінус початок», і якщо «зараз» взяти з годинника, що відстає на 45 хв
 * (06.11.2026 так було в дизайнерки), він 45 хв стоятиме на 00:00:00: початок
 * уже в майбутньому. Тож показ теж мусить знати час сервера.
 *
 * ДЖЕРЕЛО — заголовок `Date` кожної відповіді бази: окремого запиту не треба, а
 * присутність і так ходить щохвилини, тож поправка живе й виправляється сама.
 *
 * ЛИШЕ ДЛЯ ПОКАЗУ. Це оцінка з точністю до секунди-двох, у запис вона не йде.
 *
 * ДОПУСК. Заголовок округлений до секунди й приходить із запізненням, тож навіть
 * на правильному годиннику різниця не нуль. Поправка міняється, лише коли розійшлась
 * із поточною на весь допуск: так лічильник не смикається з кожною відповіддю, зокрема
 * в тих, чий годинник зсунутий якраз близько межі. Ціна: годинник, зсунутий менше ніж
 * на допуск, лишається без поправки, і новий таймер кілька секунд стоїть на нулі або
 * стартує з кількох секунд.
 *
 * ПОВІЛЬНІ ВІДПОВІДІ не беремо: заморожена вкладка чи зайнятий браузер отримує її із
 * запізненням, і дата в ній уже стара. Межа менша за допуск на секунду округлення,
 * тож правильний годинник хибної поправки не отримає.
 */

const SKEW_TOLERANCE_MS = 3_000;
const SLOW_RESPONSE_MS = 2_000;

let offsetMs = 0;

/** Запам'ятати час сервера з відповіді. Поправка їде за нею: людина могла виправити годинник. */
export function noteServerDate(dateHeader: string | null | undefined) {
  if (!dateHeader) return;
  const serverMs = Date.parse(dateHeader);
  if (!Number.isFinite(serverMs)) return;
  const skew = serverMs - Date.now();
  if (Math.abs(skew - offsetMs) >= SKEW_TOLERANCE_MS) offsetMs = skew;
}

/** Як `Date.now()`, але з поправкою на зсунутий годинник. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

const isRestRequest = (input: RequestInfo | URL): boolean => {
  try {
    return new URL(urlOf(input), "http://local").pathname.startsWith("/rest/v1/");
  } catch {
    return false;
  }
};

/**
 * Обгортка над `fetch` для клієнта Supabase.
 *
 * Лише REST: відповіді бази браузер не кешує, а файл зі сховища може прийти з
 * кешу зі вчорашньою датою, і годинник «поїхав» би на добу.
 */
export function observeServerClock(baseFetch: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const sentAt = Date.now();
    const response = await baseFetch(input, init);
    if (isRestRequest(input) && Date.now() - sentAt < SLOW_RESPONSE_MS) {
      noteServerDate(response.headers.get("date"));
    }
    return response;
  };
}
