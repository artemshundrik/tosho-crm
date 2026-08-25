/**
 * Реєстр «поглядів» Огляду: посада → те, з чого складається сторінка.
 *
 * ЧОМУ НЕ `resolveAiBucket`. У `src/lib/aiSuggestions.ts` уже є мапа посад у
 * кошики, і спокуса перевикористати її велика — але таксономії різні й
 * зводити їх не можна. Там PM лежить у «продажах», а логістика — у
 * «виробництві», бо помічникові важливо, ПРО ЩО питають. Тут навпаки: PM і
 * логіст мають власні черги («чекає перевірки», «без ТТН»), яких немає ні в
 * менеджера, ні у друкаря. Спільна мапа зробила б обом гірше, тож мапи дві, і
 * ця відмінність — не недогляд.
 *
 * ЩО ЦЕЙ ФАЙЛ НЕ ВИРІШУЄ: доступ. Погляд лише вибирає, ЯК скласти сторінку з
 * даних, які людині й так видно. Що саме віддає база, вирішують RLS і
 * `moduleAccess.ts`; погляд не додає жодного права.
 */

export type OverviewLens = "chief" | "sales" | "design" | "pm" | "finance" | "logistics" | "general";

const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();

/** job_role → погляд. Ключі — з `JOB_ROLE_NAMES` (src/lib/jobRoles.ts). */
const LENS_BY_JOB_ROLE: Record<string, OverviewLens> = {
  seo: "chief",
  top_manager: "chief",

  manager: "sales",
  "менеджер": "sales",
  sales_manager: "sales",
  junior_sales_manager: "sales",

  designer: "design",
  "дизайнер": "design",

  pm: "pm",

  accountant: "finance",
  junior_accountant: "finance",
  chief_accountant: "finance",

  logistics: "logistics",
  head_of_logistics: "logistics",
};

export const OVERVIEW_LENS_LABEL: Record<OverviewLens, string> = {
  chief: "Огляд команди",
  sales: "Мої продажі",
  design: "Мій дизайн",
  pm: "Черга на мені",
  finance: "Гроші й документи",
  logistics: "Відвантаження",
  general: "Мій робочий стіл",
};

/**
 * Власник і адмін дивляться згори — навіть якщо в картці співробітника стоїть
 * вужча посада. Це не привілей погляду, а факт: у них справді немає «своїх»
 * прорахунків, зате є всі.
 */
export function resolveOverviewLens(params: { accessRole?: string | null; jobRole?: string | null }): OverviewLens {
  const access = normalize(params.accessRole);
  if (access === "owner" || access === "admin") return "chief";
  return LENS_BY_JOB_ROLE[normalize(params.jobRole)] ?? "general";
}

/**
 * Чи бачить погляд роботу ВСІЄЇ команди, а не лише свою.
 *
 * Керівництво й PM ведуть чужу роботу за обовʼязком; решта дивиться на свою —
 * саме тому в менеджера в черзі його прорахунки, а не всі 34.
 */
export const lensSeesTeam = (lens: OverviewLens) => lens === "chief" || lens === "pm";
