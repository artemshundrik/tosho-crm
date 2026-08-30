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
// редагував вміст прорахунку, той міняв і собівартість, і логістику. Розділяємо
// по полях. Це лише половина правила — друга живе тригером у базі
// (scripts/quote-run-price-field-access.sql), бо RLS дозволяє update без
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
    case "unit_price_model":
    case "desired_manager_income":
      return isPm || isQuoteManagerJobRole(role);
    // Накрутка — БЕЗ pm, і це головна відмінність від сусідньої гілки.
    //
    // Заміряно 30.08.2026: із 28 змін «бажаного заробітку» 12 зробив проєктний
    // менеджер, і в 9 випадках менеджер потім переписував його число. У
    // TS-0826-0039 pm поставив 1000 ₴ о 08:13, менеджер виправив на 500 ₴ о
    // 08:15 — гроші вписували, щоб зняти блокування, а не тому, що така ціна.
    // Проєктний менеджер веде собівартість; ціну для клієнта веде менеджер.
    case "markup_rate":
      return isQuoteManagerJobRole(role);
    default:
      return false;
  }
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
