import { FEATURE_DEFINITIONS } from "./featureCatalog";
import { MODULE_DEFINITIONS, MODULE_GROUP_LABELS, MODULE_KEYS, type ModuleKey } from "./moduleAccess";

/**
 * Компактна карта CRM для промптів.
 *
 * Розбір надиктованого запиту (netlify/functions/dev-request-draft.ts) бачив
 * лише сказаний текст: він охайно структурував слова, але не знав, з чого
 * складається сам застосунок — тож не міг ні поставити напрямок, ні сказати
 * «це вже працює, ось тут». Увесь код у запит не покласти, а карта — можна.
 *
 * Джерела — ті самі реєстри, що керують застосунком:
 *  - moduleAccess.MODULE_DEFINITIONS — перелік напрямків (ключ + людський підпис);
 *  - featureCatalog.FEATURE_DEFINITIONS — що CRM уже вміє.
 * Своїх рядків тут немає навмисно: доданий модуль чи можливість зʼявляються в
 * карті самі, без другого місця, яке треба не забути оновити.
 *
 * Обидва реєстри чисті (без React та іконок), тому файл вільно імпортується і
 * з фронтенду, і з Netlify-функції — прецедент такого імпорту вже є
 * (_systemHealth.ts тягне systemHealthThresholds.ts).
 *
 * Карта їде в КОЖЕН запит, тож її розмір — це гроші. Стеля зафіксована тестом
 * (projectMap.test.ts): роздути її вдесятеро мовчки не вийде.
 */

export { MODULE_KEYS };

const MODULE_LABEL_BY_KEY = new Map<string, string>(
  MODULE_DEFINITIONS.map((item) => [item.key, item.label])
);

/**
 * Чи існує такий напрямок насправді.
 *
 * Модель регулярно вигадує правдоподібні ключі («payments», «tasks»), і
 * невалідований напрямок отруїв би статистику тихо — картка виглядала б
 * класифікованою. Тому кожен ключ із відповіді проходить через цю перевірку.
 */
export function isKnownModuleKey(value: unknown): value is ModuleKey {
  return typeof value === "string" && MODULE_LABEL_BY_KEY.has(value);
}

/** Людський підпис напрямку. Невідомий ключ — null, а не вигаданий підпис. */
export function moduleKeyLabel(value: unknown): string | null {
  return typeof value === "string" ? (MODULE_LABEL_BY_KEY.get(value) ?? null) : null;
}

export type ProjectMapOptions = {
  /** Розділ «що CRM уже вміє». Вимикається, коли потрібен лише перелік напрямків. */
  includeFeatures?: boolean;
};

/**
 * Перше речення опису. Довгі описи в карті не потрібні: моделі вистачає
 * одного рядка, щоб упізнати можливість, а решта — оплачені токени.
 */
function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^[^.!?]+[.!?]/);
  return (match ? match[0] : trimmed).trim();
}

export function buildProjectMap(options: ProjectMapOptions = {}): string {
  const { includeFeatures = true } = options;
  const lines: string[] = ["Напрямки CRM (ключ — назва):"];

  // Групи дають моделі контекст сусідства: «Прорахунки» поруч із «Замовленнями»
  // читається інакше, ніж у плоскому списку з двадцяти ключів.
  (Object.keys(MODULE_GROUP_LABELS) as Array<keyof typeof MODULE_GROUP_LABELS>).forEach((group) => {
    const modules = MODULE_DEFINITIONS.filter((item) => item.group === group);
    if (modules.length === 0) return;
    lines.push(`${MODULE_GROUP_LABELS[group]}:`);
    modules.forEach((item) => {
      lines.push(`  ${item.key} — ${item.label}${item.hint ? ` (${item.hint})` : ""}`);
    });
  });

  if (includeFeatures && FEATURE_DEFINITIONS.length > 0) {
    lines.push("");
    lines.push("Що CRM уже вміє (довідник можливостей — не весь функціонал):");
    FEATURE_DEFINITIONS.forEach((feature) => {
      const where = feature.moduleKey ? `розділ: ${feature.moduleKey}` : "доступно всім";
      lines.push(`- ${feature.label}: ${firstSentence(feature.summary)} (${where}, ${feature.route})`);
    });
  }

  return lines.join("\n");
}
