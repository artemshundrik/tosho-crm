/**
 * Тайм-аут на ЧИТАННЯ з бази — щоб мовчазний бекенд не залишав сторінку з
 * вічним колесом.
 *
 * НАВІЩО. 20.08.2026 інстанс Supabase перестав відповідати: браузер отримував
 * 504 на оновлення сесії, а сторінки просто крутили «Завантаження» скільки
 * завгодно довго — жодного повідомлення про те, що база недоступна. Без
 * тайм-ауту запит `fetch` висить, поки шлюз сам не обірве зʼєднання, а це
 * десятки секунд, і кожен наступний екран поводиться так само.
 *
 * ЩО ПІД ДЕДЛАЙНОМ. Усе, крім завантаження файлів у сховище: читання, записи в
 * базу і — головне — оновлення сесії. Останнє з'ясувалось на живій аварії:
 * застосунок висів на «Завантаження CRM» ще до першого читання, бо оновлення
 * токена йде POST-запитом. Вкладення до 50 МБ лишаються без дедлайну.
 *
 * ЧОМУ НЕ ПОВТОР. Повторювати мовчазний запит наосліп — множити навантаження
 * на бекенд, якому вже погано. Наше завдання тут скромніше: чесно сказати
 * «не дочекались», щоб інтерфейс показав помилку замість скелета.
 */
export const READ_TIMEOUT_MS = 25_000;

/** Помилка, яку видно в інтерфейсі, тож текст — людський. */
export class RequestTimeoutError extends Error {
  constructor() {
    super("База не відповідає. Перевірте зв'язок і спробуйте ще раз.");
    this.name = "RequestTimeoutError";
  }
}

/**
 * Чи ставити цьому запиту дедлайн.
 *
 * Спершу тут стояло «лише GET/HEAD» — і перевірка на живій аварії показала, що
 * цього мало: застосунок застрягав на «Завантаження CRM» ще ДО першого читання,
 * бо оновлення сесії (`/auth/v1/token?grant_type=refresh_token`) — це POST. Саме
 * його 504-ки й видно в консолі.
 *
 * Тому правило зворотне: дедлайн має все, КРІМ завантаження файлів у сховище.
 * Тіло аплоаду буває на 50 МБ, і обірвати його на 25-й секунді означало б
 * ламати робочий сценарій на повільному інтернеті. Читання зі сховища
 * (картинки, підписані посилання) дедлайн має — воно швидке.
 */
const shouldBound = (input: RequestInfo | URL, init?: RequestInit): boolean => {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method === "GET" || method === "HEAD") return true;
  const url = input instanceof Request ? input.url : String(input);
  return !url.includes("/storage/v1/");
};

/**
 * Обгортка над `fetch` для клієнта Supabase.
 *
 * Власний `signal` викликача не перебиваємо: якщо код уже вміє скасовувати
 * запит сам, це його право й наш тайм-аут там зайвий.
 */
export function fetchWithReadTimeout(
  baseFetch: typeof fetch = fetch,
  timeoutMs: number = READ_TIMEOUT_MS
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!shouldBound(input, init) || init?.signal) return baseFetch(input, init);

    /**
     * ПЕРЕГОНИ, а не просто signal.
     *
     * Перша редакція лише передавала `signal` і покладалась на те, що нижній
     * `fetch` його поважає. Тест одразу це зловив: підставний fetch, який
     * ігнорує скасування, висів вічно — тобто «тайм-аут» був обіцянкою, а не
     * гарантією. Тепер дедлайн тримає таймер, а `abort` лише звільняє зʼєднання.
     */
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new RequestTimeoutError());
      }, timeoutMs);
    });

    try {
      return await Promise.race([baseFetch(input, { ...init, signal: controller.signal }), deadline]);
    } catch (error) {
      if (error instanceof RequestTimeoutError) throw error;
      if (controller.signal.aborted) throw new RequestTimeoutError();
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
