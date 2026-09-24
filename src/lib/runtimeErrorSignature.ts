/**
 * Як дві помилки з різним текстом стають однією.
 *
 * Живе тут, а не в панелі чи в боті, бо читають це двоє: вкладка «Помилки» в
 * /dev/health і щогодинний алерт. Якби кожен нормалізував по-своєму, бот
 * писав би «нова помилка» про те, що на сторінці вже давно лежить у групі, —
 * і довіри до алертів не лишилось би після другого разу.
 */

/**
 * Обрив мережі, а не помилка в коді.
 *
 * Браузери кажуть про нього кожен по-своєму: Chrome — «Failed to fetch»,
 * Firefox — «NetworkError when attempting to fetch resource.», Safari — «Load
 * failed». Клієнт бази (postgrest-js) ще й ставить попереду ім'я:
 * «TypeError: Failed to fetch». Такий запис означає, що в людини на мить
 * зник інтернет, а не що реліз щось зламав.
 *
 * «Failed to fetch dynamically imported module» сюди НЕ належить: це стара
 * вкладка після викочування, на неї окрема реакція (перезавантаження).
 */
const NETWORK_FAILURE_PATTERN =
  /^(?:typeerror:\s*)?(?:failed to fetch|load failed|networkerror when attempting to fetch resource|the network connection was lost|the internet connection appears to be offline)/i;

export function isNetworkFailureMessage(message: string): boolean {
  const text = message.trim();
  if (!text || /dynamically imported module/i.test(text)) return false;
  return NETWORK_FAILURE_PATTERN.test(text);
}

/**
 * Усі обриви мережі — одна група, хоч би як їх назвав браузер. Інакше троє
 * людей без зв'язку в Chrome, Firefox і Safari розійшлись би по трьох групах
 * по одній людині, і поріг «зачепило кількох» не спрацював би ніколи.
 */
const NETWORK_FAILURE_SIGNATURE = "Обрив мережі (Failed to fetch)";

/**
 * Ключ групування.
 *
 * Числа й адреси прибираємо: «Loading chunk 42» і «Loading chunk 77» — це одна
 * помилка, а не дві. А от «reading 'url'» і «reading 'state'» лишаються
 * різними: у лапках стоїть ім'я поля, і воно вказує на різні місця в коді.
 */
export function runtimeErrorSignature(message: string): string {
  if (isNetworkFailureMessage(message)) return NETWORK_FAILURE_SIGNATURE;
  return message
    .replace(/\b\d+\b/g, "#")
    .replace(/https?:\/\/[^\s)]+/g, "<url>")
    .trim()
    .slice(0, 180);
}

export type RuntimeErrorLike = {
  created_at?: string | null;
  actor_name?: string | null;
  user_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type RuntimeErrorGroup = {
  signature: string;
  /** Текст першої помилки групи — його й показуємо людині. */
  message: string;
  count: number;
  people: string[];
  routes: string[];
  firstAt: string | null;
  lastAt: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Групує сирі рядки журналу за сигнатурою. Порядок — від найчастіших. */
export function groupRuntimeErrors(rows: RuntimeErrorLike[]): RuntimeErrorGroup[] {
  const groups = new Map<string, RuntimeErrorGroup & { peopleSet: Set<string>; routeSet: Set<string> }>();

  for (const row of rows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const message = readString(metadata.message) ?? "Без повідомлення";
    const signature = runtimeErrorSignature(message);
    const person = readString(row.actor_name) ?? readString(row.user_id);
    const route = readString(metadata.route_pattern);
    const at = readString(row.created_at);

    const existing = groups.get(signature);
    if (!existing) {
      groups.set(signature, {
        signature,
        message,
        count: 1,
        people: [],
        routes: [],
        firstAt: at,
        lastAt: at,
        peopleSet: new Set(person ? [person] : []),
        routeSet: new Set(route ? [route] : []),
      });
      continue;
    }

    existing.count += 1;
    if (person) existing.peopleSet.add(person);
    if (route) existing.routeSet.add(route);
    if (at && (!existing.firstAt || at < existing.firstAt)) existing.firstAt = at;
    if (at && (!existing.lastAt || at > existing.lastAt)) existing.lastAt = at;
  }

  return [...groups.values()]
    .map(({ peopleSet, routeSet, ...group }) => ({
      ...group,
      people: [...peopleSet],
      routes: [...routeSet],
    }))
    .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature));
}
