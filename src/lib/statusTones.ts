/**
 * Єдиний реєстр семантичних тонів.
 *
 * ЧОМУ ЦЕ ІСНУЄ: тон статусу раніше жив у чотирьох паралельних місцях —
 * `statusClasses` дублювався між quotes-page/config і quote-details/config,
 * `design-status-badge-*` був повною копією родини `.tone-*` в CSS, а мапа
 * дизайн-статусів дублювалась між DesignPage і DesignTaskPage. Зміна тону
 * одного статусу вимагала правки в 5–7 файлах, і вони встигли розійтись
 * (крапка `pm_review` була синя, а бейдж того ж статусу — фіолетовий).
 *
 * ПРАВИЛО: домен мапить статус → `Tone`. Тон мапиться в класи ТІЛЬКИ через
 * таблиці нижче. Рядки класів `tone-*` не збираються вручну по компонентах.
 *
 * Для нового коду краще `<Badge tone={...}>` — таблиці тут для місць, де
 * тон лягає не на бейдж (рядки, канти, крапки, іконки).
 */

export type Tone = "neutral" | "info" | "accent" | "success" | "warning" | "danger";

/** Насичена заливка + межа + текст. Бейджі, статус-чипи. */
export const toneBadgeClass: Record<Tone, string> = {
  neutral: "tone-neutral",
  info: "tone-info",
  accent: "tone-accent",
  success: "tone-success",
  warning: "tone-warning",
  danger: "tone-danger",
};

/** Приглушена заливка для ШИРОКИХ поверхонь — банерів, рядків, карток.
 *  Насиченість мусить падати з площею, інакше колір читається як бруд. */
export const toneSubtleClass: Record<Tone, string> = {
  neutral: "tone-neutral-subtle",
  info: "tone-info-subtle",
  accent: "tone-accent-subtle",
  success: "tone-success-subtle",
  warning: "tone-warning-subtle",
  danger: "tone-danger-subtle",
};

/** Тільки колір тексту/іконки. */
export const toneTextClass: Record<Tone, string> = {
  neutral: "tone-text-neutral",
  info: "tone-text-info",
  accent: "tone-text-accent",
  success: "tone-text-success",
  warning: "tone-text-warning",
  danger: "tone-text-danger",
};

/** Крапка-індикатор (канбан-колонки, легенди). */
export const toneDotClass: Record<Tone, string> = {
  neutral: "tone-dot-neutral",
  info: "tone-dot-info",
  accent: "tone-dot-accent",
  success: "tone-dot-success",
  warning: "tone-dot-warning",
  danger: "tone-dot-danger",
};

/** Квадратик під іконку: нейтральне тло + кольорові межа й іконка. */
export const toneIconBoxClass: Record<Tone, string> = {
  neutral: "tone-icon-box-neutral",
  info: "tone-icon-box-info",
  accent: "tone-icon-box-accent",
  success: "tone-icon-box-success",
  warning: "tone-icon-box-warning",
  danger: "tone-icon-box-danger",
};

/** Лівий кант 3px — колір «на ручці» для широких рядів. */
export const toneFlagClass: Record<Tone, string> = {
  neutral: "",
  info: "flag-info",
  accent: "",
  success: "flag-success",
  warning: "flag-warning",
  danger: "flag-danger",
};

/**
 * Прорахунки. Ключі — і канонічні статуси, і легасі-аліаси з БД
 * (draft/in_progress/sent/rejected/completed), які досі приходять у даних.
 */
export const QUOTE_STATUS_TONE: Record<string, Tone> = {
  new: "neutral",
  estimating: "info",
  estimated: "accent",
  awaiting_approval: "warning",
  approved: "success",
  cancelled: "danger",

  draft: "neutral",
  in_progress: "info",
  sent: "accent",
  rejected: "danger",
  completed: "success",
};

/**
 * Дизайн-задачі. `pm_review` навмисно фіолетовий (accent), а не синій:
 * «Дизайн готовий» і «В роботі» — сусідні етапи воркфлоу, вони мусять
 * читатись як різні кольори.
 */
export const DESIGN_STATUS_TONE: Record<string, Tone> = {
  new: "neutral",
  changes: "warning",
  in_progress: "info",
  pm_review: "accent",
  client_review: "warning",
  approved: "success",
  cancelled: "danger",
};

/** Редакції договорів. */
export const CONTRACT_REVISION_STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  pending_ceo: "warning",
  approved: "info",
  rejected: "warning",
  sent: "success",
};

const resolve = (map: Record<string, Tone>, status: string | null | undefined): Tone => {
  const key = typeof status === "string" ? status.trim().toLowerCase() : "";
  return map[key] ?? "neutral";
};

export const quoteStatusTone = (status: string | null | undefined): Tone =>
  resolve(QUOTE_STATUS_TONE, status);

export const designStatusTone = (status: string | null | undefined): Tone =>
  resolve(DESIGN_STATUS_TONE, status);

export const contractRevisionStatusTone = (status: string | null | undefined): Tone =>
  resolve(CONTRACT_REVISION_STATUS_TONE, status);

/** Готова мапа статус → клас, зібрана з тон-мапи. */
const buildClassMap = (
  toneMap: Record<string, Tone>,
  classMap: Record<Tone, string>
): Record<string, string> =>
  Object.fromEntries(Object.entries(toneMap).map(([status, tone]) => [status, classMap[tone]]));

export const quoteStatusBadgeClass = buildClassMap(QUOTE_STATUS_TONE, toneBadgeClass);
export const quoteStatusTextClass = buildClassMap(QUOTE_STATUS_TONE, toneTextClass);
export const quoteStatusDotClass = buildClassMap(QUOTE_STATUS_TONE, toneDotClass);
export const designStatusBadgeClass = buildClassMap(DESIGN_STATUS_TONE, toneBadgeClass);
export const designStatusDotClass = buildClassMap(DESIGN_STATUS_TONE, toneDotClass);
