import type { AdvisorySeverity, StackAdvisory, StackDependency } from "./stack";

// Як крон питає npm про дірки й кому їх приписує. Окремо від функції, бо тут
// уся логіка, на якій можна тихо збрехати: дірку не тій версії, не тому пакету
// або «чисто» там, де npm не відповів. Мережа лишається у функції.

export type AdvisoryTarget = { name: string; version: string };

const SEVERITIES: AdvisorySeverity[] = ["low", "moderate", "high", "critical"];

const keyOf = (name: string, version: string) => `${name}@${version}`;

/**
 * Розкласти name@version на тіла запитів, у кожному — ОДНА версія на ім'я.
 *
 * Bulk-ендпоінт npm на `{ ms: ["1.0.0", "2.1.3"] }` відповідає списком дірок
 * для `ms` загалом, з діапазоном уражених версій. Розібрати, яка з двох наших
 * копій уражена, можна лише semver-порівнянням — тягти його заради трьох
 * пакетів із кількома копіями (заміряно 29.10.2026) дорожче, ніж послати ще
 * один запит. Тож копії йдуть різними запитами, і відповідь однозначна.
 */
export function advisoryRequestBodies(targets: AdvisoryTarget[]): Record<string, string[]>[] {
  const bodies: Record<string, string[]>[] = [];
  const seen = new Set<string>();
  for (const target of targets) {
    const key = keyOf(target.name, target.version);
    if (seen.has(key)) continue;
    seen.add(key);
    let body = bodies.find((candidate) => !(target.name in candidate));
    if (!body) {
      body = {};
      bodies.push(body);
    }
    body[target.name] = [target.version];
  }
  return bodies;
}

/**
 * Відповідь bulk-ендпоінта → дірки за `name@version`, про яку питали.
 *
 * Пакетів без зауважень у відповіді немає — їм нічого й не пишемо: «чисто»
 * виводиться з того, що запит пройшов, а не з наявності ключа.
 */
export function parseBulkAdvisories(body: Record<string, string[]>, data: unknown): Map<string, StackAdvisory[]> {
  const result = new Map<string, StackAdvisory[]>();
  if (!data || typeof data !== "object") return result;
  for (const [name, raw] of Object.entries(data as Record<string, unknown>)) {
    const version = body[name]?.[0];
    if (!version || !Array.isArray(raw)) continue;
    result.set(
      keyOf(name, version),
      raw.map((entry) => {
        const item = (entry ?? {}) as { title?: unknown; severity?: unknown; url?: unknown };
        const severity = typeof item.severity === "string" ? item.severity.toLowerCase() : "";
        return {
          title: typeof item.title === "string" ? item.title : "Вразливість",
          severity: (SEVERITIES as string[]).includes(severity) ? (severity as AdvisorySeverity) : "moderate",
          url: typeof item.url === "string" ? item.url : null,
        };
      })
    );
  }
  return result;
}

/**
 * Дірки кожного нашого пакета: власні плюс ті, що приїхали з ним транзитивно.
 *
 * Транзитивна дірка висить на рядку того НАШОГО пакета, через який приїхала,
 * з позначкою `dependency`: лагодять її оновленням нашого пакета, а не того,
 * якого в package.json немає. Тягнуть її кілька наших — висить у кожного, бо
 * оновлювати доведеться кожен; лічильник на сторінці рахує її один раз.
 */
export function advisoriesByPackage(
  packages: AdvisoryTarget[],
  dependencies: StackDependency[],
  found: Map<string, StackAdvisory[]>
): Map<string, StackAdvisory[]> {
  const inherited = new Map<string, StackAdvisory[]>();
  for (const dependency of dependencies) {
    const holes = found.get(keyOf(dependency.name, dependency.version));
    if (!holes?.length) continue;
    const tagged = holes.map((advisory) => ({
      ...advisory,
      dependency: { name: dependency.name, version: dependency.version },
    }));
    for (const owner of dependency.via) {
      inherited.set(owner, [...(inherited.get(owner) ?? []), ...tagged]);
    }
  }

  const result = new Map<string, StackAdvisory[]>();
  for (const pkg of packages) {
    result.set(pkg.name, [...(found.get(keyOf(pkg.name, pkg.version)) ?? []), ...(inherited.get(pkg.name) ?? [])]);
  }
  return result;
}
