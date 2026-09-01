export type TeamRole = "super_admin" | "manager" | "viewer" | null;

export type AccessRole = string | null;
export type JobRole = string | null;

export type AppPermissions = {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isSeo: boolean;
  isManagerJob: boolean;
  isDesigner: boolean;
  canManageMembers: boolean;
  canEditMemberRoles: boolean;
  canManageAssignments: boolean;
  canManageDesignStatuses: boolean;
  canEditDesignBriefChangeRequests: boolean;
  canSelfAssignDesign: boolean;
  canWriteStandings: boolean;
  canViewManagerOverview: boolean;
};

type QuoteAccessContext = {
  userId?: string | null;
  quoteManagerUserId?: string | null;
  quoteCreatedByUserId?: string | null;
  viewerJobRole?: string | null;
  permissions: AppPermissions;
};

const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();

export const normalizeAccessRole = (value?: string | null): string => normalize(value);
export const normalizeJobRole = (value?: string | null): string => normalize(value);

export const isDesignerJobRole = (value?: string | null) => {
  const jobRole = normalizeJobRole(value);
  return jobRole === "designer" || jobRole === "дизайнер";
};

export const isQuoteManagerJobRole = (value?: string | null) => {
  const jobRole = normalizeJobRole(value);
  return ["manager", "менеджер", "sales_manager", "junior_sales_manager"].includes(jobRole);
};

// У переліку crm_job_role два близькі значення: logistics («Логіст») і
// head_of_logistics («Начальник відділу логістики»). Обидва працюють з
// доставкою, тож перевірки мусять знати обидва — інакше начальник відділу
// лишається без прав, які має його підлеглий.
export const isLogisticsJobRole = (value?: string | null) => {
  const jobRole = normalizeJobRole(value);
  return jobRole === "logistics" || jobRole === "head_of_logistics";
};

export const mapAccessRoleToTeamRole = (accessRole?: string | null): TeamRole => {
  const normalized = normalizeAccessRole(accessRole);
  if (normalized === "owner") return "super_admin";
  if (normalized === "admin") return "manager";
  if (normalized) return "viewer";
  return null;
};

export function buildPermissions({
  role,
  accessRole,
  jobRole,
}: {
  role?: TeamRole;
  accessRole?: string | null;
  jobRole?: string | null;
}): AppPermissions {
  const normalizedAccessRole = normalizeAccessRole(accessRole);
  const normalizedJobRole = normalizeJobRole(jobRole);

  const isSuperAdmin = role === "super_admin" || normalizedAccessRole === "owner";
  const isAdmin = role === "manager" || normalizedAccessRole === "admin";
  const isSeo = normalizedJobRole === "seo";
  const isManagerJob = normalizedJobRole === "manager";
  const isDesigner = isDesignerJobRole(jobRole);

  const canManageMembers = isSuperAdmin || isAdmin || isSeo;
  const canEditMemberRoles = isSuperAdmin || isAdmin;
  const canManageAssignments = canManageMembers || isManagerJob;
  const canManageDesignStatuses = canManageAssignments && !isDesigner;
  const canEditDesignBriefChangeRequests = isSuperAdmin || isAdmin || isSeo;
  const canSelfAssignDesign = canManageAssignments || isDesigner;
  const canWriteStandings = canManageMembers || isManagerJob;
  const canViewManagerOverview = canManageMembers || isManagerJob;

  return {
    isSuperAdmin,
    isAdmin,
    isSeo,
    isManagerJob,
    isDesigner,
    canManageMembers,
    canEditMemberRoles,
    canManageAssignments,
    canManageDesignStatuses,
    canEditDesignBriefChangeRequests,
    canSelfAssignDesign,
    canWriteStandings,
    canViewManagerOverview,
  };
}

/**
 * Права в режимі «Дивитись як»: вміння обраної посади, але НІКОЛИ не вище
 * власних.
 *
 * Прапорці діляться на два ґатунки:
 *  • «хто я» (`isSuperAdmin`, `isAdmin`, `isSeo`, `isManagerJob`, `isDesigner`)
 *    беруться з ЦІЛІ — інакше owner, дивлячись очима дизайнера, не побачив би
 *    жодного дизайнерського екрана, бо `isDesigner` у нього хибний;
 *  • «що я можу» (решта, усі `can*`) — перетин: `власне && цільове`.
 *
 * Перетин потрібен не для owner (у нього і так усе true, тож режим лишається
 * точно таким, як був), а для решти тих, кому режим дозволено. Сесія в базі
 * лишається їхньою, тож кнопка, домальована «бо я приміряв старшу роль», за
 * відсутності серверної перевірки виконала б справжню дію. Режим має тільки
 * ЗВУЖУВАТИ.
 */
const VIEW_AS_IDENTITY_KEYS: ReadonlySet<keyof AppPermissions> = new Set([
  "isSuperAdmin",
  "isAdmin",
  "isSeo",
  "isManagerJob",
  "isDesigner",
]);

export function permissionsForViewAs(real: AppPermissions, target: AppPermissions): AppPermissions {
  const result = { ...target };
  (Object.keys(result) as (keyof AppPermissions)[]).forEach((key) => {
    if (VIEW_AS_IDENTITY_KEYS.has(key)) return;
    result[key] = real[key] && target[key];
  });
  return result;
}

const normalizeId = (value?: string | null) => (value ?? "").trim();

export function canOpenQuoteDetails({
  userId,
  quoteManagerUserId,
  quoteCreatedByUserId,
  permissions,
  viewerJobRole,
}: QuoteAccessContext) {
  if (permissions.isSuperAdmin || permissions.isSeo) return true;
  if (!permissions.isAdmin && !isQuoteManagerJobRole(viewerJobRole)) return true;
  const viewer = normalizeId(userId);
  return (
    viewer !== "" &&
    (viewer === normalizeId(quoteManagerUserId) || viewer === normalizeId(quoteCreatedByUserId))
  );
}

export function canViewQuoteSummary({
  userId,
  quoteManagerUserId,
  quoteCreatedByUserId,
  permissions,
  viewerJobRole,
}: QuoteAccessContext) {
  if (permissions.isSuperAdmin || permissions.isSeo) return true;
  if (!permissions.isAdmin && !isQuoteManagerJobRole(viewerJobRole)) return false;
  const viewer = normalizeId(userId);
  return (
    viewer !== "" &&
    (viewer === normalizeId(quoteManagerUserId) || viewer === normalizeId(quoteCreatedByUserId))
  );
}

export function canEditQuoteContent({
  userId,
  quoteManagerUserId,
  quoteCreatedByUserId,
  viewerJobRole,
  permissions,
}: QuoteAccessContext) {
  if (permissions.isSuperAdmin || permissions.isSeo) return true;
  if (normalizeJobRole(viewerJobRole) === "pm") return true;
  if (!permissions.isAdmin && !isQuoteManagerJobRole(viewerJobRole)) return true;
  const viewer = normalizeId(userId);
  return (
    viewer !== "" &&
    (viewer === normalizeId(quoteManagerUserId) || viewer === normalizeId(quoteCreatedByUserId))
  );
}

// Чотири поля ціни в тиражі раніше висіли на одному прапорці canEditRuns: хто
// редагував вміст прорахунку, той міняв і вартість товару, і логістику.
// Розділяємо по полях. Це лише половина правила — друга живе тригером у базі
// (scripts/quote-run-price-field-access.sql, звужений у
// scripts/quote-run-price-field-access-pm-cost.sql), бо RLS дозволяє update без
// обмеження по колонках, а інтерфейс сам собою нічого не захищає.
export const QUOTE_RUN_PRICE_FIELDS = [
  "unit_price_model",
  "unit_price_print",
  "logistics_cost",
  "desired_manager_income",
  "markup_rate",
] as const;

export type QuoteRunPriceField = (typeof QUOTE_RUN_PRICE_FIELDS)[number];

export type QuoteRunPriceFieldAccess = Record<QuoteRunPriceField, boolean>;

export function canEditQuoteRunPriceField(
  field: QuoteRunPriceField,
  {
    viewerJobRole,
    permissions,
  }: { viewerJobRole?: string | null; permissions: AppPermissions }
): boolean {
  // owner і seo можуть усе — це задум, а не виняток із правила.
  if (permissions.isSuperAdmin || permissions.isSeo) return true;
  const role = normalizeJobRole(viewerJobRole);
  const isPm = role === "pm";
  switch (field) {
    case "unit_price_print":
      return isPm;
    case "logistics_cost":
      return isPm || isLogisticsJobRole(role);
    // Вартість товару за одиницю — те, що ми заплатили постачальнику, — веде
    // проєктний менеджер, і БЕЗ менеджера прорахунку (REQ-229). Менеджер
    // домовляється про ціну ДЛЯ КЛІЄНТА і робить це накруткою нижче; закупівельна
    // сума приходить від постачальника, а не з переговорів, тож рука, яка її
    // вписує, має бути та сама, що й у вартості нанесення.
    case "unit_price_model":
      return isPm;
    // Легасі-поле: інпута під нього в картці більше немає, ціна задається
    // накруткою з 30.08.2026. Права лишаємо як були — звужувати їх означало б
    // ламати збереження старих тиражів заради поля, якого ніхто не бачить.
    case "desired_manager_income":
      return isPm || isQuoteManagerJobRole(role);
    // Накрутка — БЕЗ pm, і це головна відмінність від сусідньої гілки.
    //
    // Заміряно 30.08.2026: із 28 змін «бажаного заробітку» 12 зробив проєктний
    // менеджер, і в 9 випадках менеджер потім переписував його число. У
    // TS-0826-0039 pm поставив 1000 ₴ о 08:13, менеджер виправив на 500 ₴ о
    // 08:15 — гроші вписували, щоб зняти блокування, а не тому, що така ціна.
    // Проєктний менеджер веде вартість товару; ціну для клієнта веде менеджер.
    case "markup_rate":
      return isQuoteManagerJobRole(role);
    default:
      return false;
  }
}

/**
 * Хто ухвалює рішення по накрутці нижче дна (REQ-149, звужено REQ-182).
 *
 * ДВА РІЗНІ ПРАВИЛА, і плутати їх не можна.
 *
 * МЕРЧ І «ІНШЕ» — як домовлялись 30.08.2026: запит іде трьом (двом СЕО і
 * головному бухгалтеру), рішення ставить будь-хто з них. Звичайний бухгалтер
 * розклад ціни бачить, а кнопок не має: нарахування — його справа, ціна — ні.
 *
 * ПОЛІГРАФІЯ — іменем, а не роллю. Шкала типів угоди прийшла від Олени, дно —
 * її домовленість, і Артем 01.09.2026 сказав прямо: затверджує саме вона. Роль
 * тут не годиться, бо СЕО в компанії двоє. Хто саме — лежить налаштуванням
 * `print_markup_approver_user_id`, а не константою в коді: репозиторій
 * публічний, та й людина на цій ролі колись зміниться.
 *
 * ДРУГИЙ СЕО ЛИШАЄТЬСЯ ЗАПАСНИМ — це відповідь самої Олени на питання «а якщо
 * тебе немає»: «будуть чекати або СЕО номер 2». Тобто запит АДРЕСОВАНИЙ їй
 * (сповіщення йде тільки їй, і в текстах стоїть її ім'я), але право підписати
 * має й другий СЕО — інакше двотижнева відпустка зупиняла б усю поліграфію.
 *
 * Головного бухгалтера й власника сюди НЕ повертаємо: у поліграфії їх не
 * називав ні Артем, ні Олена, а «щоб хтось міг» — не підстава роздавати право
 * на ціну.
 *
 * Порожнє налаштування повертає загальне правило — інакше поліграфічний запит
 * не міг би погодити НІХТО й висів би вічно.
 *
 * Дзеркало в базі: tosho.is_quote_markup_approver(uuid, uuid)
 * (scripts/quote-print-markup-approver.sql). Тут і там правило мусить збігатись
 * дослівно — кнопка без права за нею гірша за відсутню кнопку.
 */
export function canApproveQuoteMarkup({
  viewerJobRole,
  permissions,
  viewerUserId,
  isPrintQuote,
  printApproverUserId,
}: {
  viewerJobRole?: string | null;
  permissions: AppPermissions;
  /** Хто дивиться — потрібен лише поліграфії, де правило іменне. */
  viewerUserId?: string | null;
  /** Чи це поліграфічний прорахунок (quote_type = 'print'). */
  isPrintQuote?: boolean;
  /** Призначений погоджувач поліграфії; `null` — налаштування не заповнене. */
  printApproverUserId?: string | null;
}): boolean {
  if (isPrintQuote && printApproverUserId) {
    if (viewerUserId && viewerUserId === printApproverUserId) return true;
    // Запасний: другий СЕО. Саме СЕО, а не «будь-хто з керівництва».
    return normalizeJobRole(viewerJobRole) === "seo";
  }
  if (permissions.isSuperAdmin || permissions.isSeo) return true;
  return normalizeJobRole(viewerJobRole) === "chief_accountant";
}

export function resolveQuoteRunPriceFieldAccess(context: {
  viewerJobRole?: string | null;
  permissions: AppPermissions;
}): QuoteRunPriceFieldAccess {
  return QUOTE_RUN_PRICE_FIELDS.reduce((acc, field) => {
    acc[field] = canEditQuoteRunPriceField(field, context);
    return acc;
  }, {} as QuoteRunPriceFieldAccess);
}

export function canEditQuoteDelivery({
  userId,
  quoteManagerUserId,
  quoteCreatedByUserId,
  viewerJobRole,
  permissions,
}: QuoteAccessContext) {
  if (permissions.isSuperAdmin || permissions.isSeo) return true;
  const role = normalizeJobRole(viewerJobRole);
  if (role === "pm" || isLogisticsJobRole(role)) return true;
  if (!permissions.isAdmin && !isQuoteManagerJobRole(viewerJobRole)) return true;
  const viewer = normalizeId(userId);
  return (
    viewer !== "" &&
    (viewer === normalizeId(quoteManagerUserId) || viewer === normalizeId(quoteCreatedByUserId))
  );
}
