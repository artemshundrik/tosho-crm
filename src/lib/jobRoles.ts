// Canonical Ukrainian labels for internal job-role keys (job_role column).
// Values coming from the workspace directory are role keys like "designer";
// some manually-entered roles are already Ukrainian (e.g. "Бухгалтер") — those
// pass through unchanged via formatJobRole.

export const JOB_ROLE_NAMES: Record<string, string> = {
  manager: "Менеджер",
  printer: "Друкар",
  head_of_logistics: "Начальник відділу логістики",
  head_of_production: "Начальник з виробництва",
  designer: "Дизайнер",
  logistics: "Логіст",
  packer: "Пакувальник",
  pm: "PM",
  sales_manager: "Менеджер з продажу",
  top_manager: "Топ-менеджер",
  junior_sales_manager: "Молодший менеджер з продажу",
  office_manager: "Офіс-менеджер",
  accountant: "Бухгалтер",
  chief_accountant: "Головний бухгалтер",
  marketer: "Маркетолог",
  smm: "СММ",
  seo: "SEO",
};

// Maps a job-role key to its Ukrainian label. Unknown or already-localized
// values are returned trimmed as-is; empty/nullish input yields "".
export const formatJobRole = (value?: string | null): string => {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  return JOB_ROLE_NAMES[raw.toLowerCase()] ?? raw;
};
