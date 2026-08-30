import { normalizeJobRole, type AppPermissions } from "@/lib/permissions";

/**
 * Один блок ціни — шість виглядів за посадою (REQ-149, пункт p11).
 *
 * Ухвалено СЕО 30.08.2026, прототип: tmp/quote-markup-prototype.html.
 *
 * ЧОМУ НЕ «ОДИН БЛОК ДЛЯ ВСІХ». Той самий стан звучить для різних людей
 * по-різному, і спільна фраза виходила б або незрозумілою погоджувачу (він не
 * знає, чия ціна й наскільки вона нижча), або наказовою менеджеру. Тому
 * міняється не лише набір полів, а й текст — за це відповідає
 * `markupNoteFor` у самому блоці.
 *
 * ЩО ЦЕЙ ФАЙЛ НЕ ВИРІШУЄ: хто ухвалює РІШЕННЯ по запиту — це питання прав, а не
 * вигляду, і на нього відповідає `canApproveQuoteMarkup` (src/lib/permissions.ts)
 * разом із дзеркалом у базі. Вигляд, який сам роздає кнопки погодження, рано чи
 * пізно розійшовся б із правом за ними, і кнопка почала б повертати 42501.
 *
 * ЩО ЦЕЙ ФАЙЛ ТЕЖ НЕ ВИРІШУЄ: чи можна РУХАТИ накрутку. Вигляд каже лише, чи є
 * повзунок у цієї посади взагалі; право на поле лишається за
 * `canEditQuoteRunPriceField("markup_rate")`, а заморозка на час погодження —
 * за `isMarkupFrozen`. Три різні питання, і зливати їх в одне не можна:
 * top_manager отримує вигляд менеджера, але поле йому не належить.
 */

export type QuoteMarkupViewKey = "manager" | "seo" | "chief" | "back" | "pm" | "junior";

export type QuoteMarkupView = {
  key: QuoteMarkupViewKey;
  /**
   * "headline" — велика ціна й смуга зверху (менеджерська мова).
   * "breakdown" — розклад ціни першим (мова бухгалтерії й виробництва).
   */
  layout: "headline" | "breakdown";
  /** Чи є смуга-повзунок у цієї посади. */
  hasSlider: boolean;
  /** Чи видно розклад ціни на прибуток / постійні / ПДВ. */
  showEconomics: boolean;
  /**
   * "own" — «твій заробіток», "manager" — «заробіток менеджера (ім'я)»,
   * null — чужих грошей не показуємо взагалі.
   */
  income: "own" | "manager" | null;
};

const VIEWS: Record<QuoteMarkupViewKey, QuoteMarkupView> = {
  // Тягне повзунок, бачить свій заробіток і орієнтир. Розкладу ціни на
  // прибуток/постійні/ПДВ немає — це не його рішення.
  manager: { key: "manager", layout: "headline", hasSlider: true, showEconomics: false, income: "own" },
  // Той самий повзунок лишається свідомо: СЕО єдиний, хто опускає нижче дна
  // власноруч. Плюс уся економіка й кнопки погодження.
  seo: { key: "seo", layout: "headline", hasSlider: true, showEconomics: true, income: "manager" },
  // Ціну не рухає, але рішення ухвалює нарівні з СЕО.
  chief: { key: "chief", layout: "breakdown", hasSlider: false, showEconomics: true, income: "manager" },
  // Те саме без кнопок. Заробіток менеджера видно — він потрібен для нарахування.
  back: { key: "back", layout: "breakdown", hasSlider: false, showEconomics: true, income: "manager" },
  // Проджект вносить собівартість; чужі гроші його не стосуються.
  pm: { key: "pm", layout: "breakdown", hasSlider: false, showEconomics: true, income: null },
  // Вигляд менеджера, тільки очима.
  junior: { key: "junior", layout: "headline", hasSlider: false, showEconomics: false, income: null },
};

const MANAGER_VIEW_ROLES = new Set([
  "manager",
  "менеджер",
  "sales_manager",
  "junior_sales_manager",
  // top_manager у право на поле не входить (isQuoteManagerJobRole його не знає),
  // але вигляд у нього менеджерський: він веде продаж і має бачити ту саму
  // смугу. Повзунок йому просто не дасться — це вирішує право на поле.
  "top_manager",
]);

/**
 * Посада, якої немає в переліку, отримує НАЙВУЖЧИЙ вигляд, а не менеджерський.
 * Друкар чи пакувальник, що відкрив картку, не має бачити чужі гроші лише тому,
 * що його роль забули додати в матрицю.
 */
export function resolveQuoteMarkupView({
  viewerJobRole,
  permissions,
}: {
  viewerJobRole?: string | null;
  permissions: AppPermissions;
}): QuoteMarkupView {
  const role = normalizeJobRole(viewerJobRole);
  if (permissions.isSuperAdmin || permissions.isSeo) return VIEWS.seo;
  if (role === "chief_accountant") return VIEWS.chief;
  if (role === "accountant") return VIEWS.back;
  if (role === "pm") return VIEWS.pm;
  if (MANAGER_VIEW_ROLES.has(role)) return VIEWS.manager;
  return VIEWS.junior;
}

export const QUOTE_MARKUP_VIEWS = VIEWS;
