/**
 * Як дві помилки з різним текстом стають однією.
 *
 * Живе тут, а не в панелі чи в боті, бо читають це двоє: вкладка «Помилки» в
 * /dev/health і щогодинний алерт. Якби кожен нормалізував по-своєму, бот
 * писав би «нова помилка» про те, що на сторінці вже давно лежить у групі, —
 * і довіри до алертів не лишилось би після другого разу.
 */

/**
 * Ключ групування.
 *
 * Числа й адреси прибираємо: «Loading chunk 42» і «Loading chunk 77» — це одна
 * помилка, а не дві. А от «reading 'url'» і «reading 'state'» лишаються
 * різними: у лапках стоїть ім'я поля, і воно вказує на різні місця в коді.
 */
export function runtimeErrorSignature(message: string): string {
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
