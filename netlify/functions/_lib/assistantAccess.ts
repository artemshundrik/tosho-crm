// Модель доступу до асистента.
//
// Бот перестав бути інструментом керівництва й відкрився команді, тож питання
// «хто що може спитати» стало не формальністю, а захистом: дизайнер не повинен
// бачити виторг, а менеджер — чужі угоди.
//
// Рівні навмисно грубі. Тонка матриця «роль × інтент» виглядає гарно на папері,
// але її ніхто не тримає в голові, і через півроку хтось додає інтент і забуває
// прописати обмеження. Чотири рівні легко перевірити очима.

export type AccessLevel =
  /** Власник і CEO — бачать усе, включно з грошима компанії та станом системи. */
  | "full"
  /** Продажі: свої прорахунки, картки клієнтів, спільні дизайн-задачі. */
  | "sales"
  /** Дизайн: задачі й час, БЕЗ грошей. */
  | "design"
  /** Решта команди: спільні задачі й присутність, без грошей і без чужої статистики. */
  | "basic";

const SALES_ROLES = ["manager", "sales_manager", "junior_sales_manager", "top_manager", "office_manager", "pm"];
const DESIGN_ROLES = ["designer"];

export function resolveAccessLevel(params: { accessRole: string | null; jobRole: string | null }): AccessLevel {
  const access = (params.accessRole ?? "").trim().toLowerCase();
  const job = (params.jobRole ?? "").trim().toLowerCase();
  if (access === "owner" || job === "seo") return "full";
  if (SALES_ROLES.includes(job)) return "sales";
  if (DESIGN_ROLES.includes(job)) return "design";
  return "basic";
}

/** Гроші — тільки тим, хто ними оперує. Дизайнер сум не бачить узагалі. */
export function canSeeMoney(level: AccessLevel): boolean {
  return level === "full" || level === "sales";
}

/** Прорахунки, воронка, клієнти. */
export function canUseQuotes(level: AccessLevel): boolean {
  return level === "full" || level === "sales";
}

/**
 * Чи можна питати статистику про ІНШУ людину.
 *
 * Лише керівництву. Решта отримує ті самі інтенти, але завжди про себе — тож
 * «скільки задач у Марʼяни» від колеги мовчки перетвориться на «скільки в мене».
 * Це не приховування даних, а межа: особиста продуктивність — не спільне надбання.
 */
export function canQueryOtherPeople(level: AccessLevel): boolean {
  return level === "full";
}

/**
 * Внутрішня кухня: бекапи, cron, storage.
 *
 * `_level` не читається навмисно: усі предикати цього модуля мають однакову
 * сигнатуру, щоб викликач не тримав у голові, який із них чого просить. Тут
 * вирішує лише власник — рівень доступу нічого не додає.
 */
export function canSeeSystemHealth(_level: AccessLevel, isOwner: boolean): boolean {
  return isOwner;
}

/**
 * Обсяг зробленої роботи: релізи, години, що викотилось. Той самий предикат,
 * що на сторінці «Релізи» — керівництво (owner + CEO мають level "full").
 */
export function canSeeReleases(level: AccessLevel): boolean {
  return level === "full";
}

/** Витрати на AI — це бюджет, його бачить керівництво. */
export function canSeeAiCosts(level: AccessLevel): boolean {
  return level === "full";
}
