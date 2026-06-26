// Канонічні категорії сповіщень (копія src/lib/notificationCategories.ts — тримати синхронно).
// Використовується в доставці (гейтинг каналів) та в боті (/settings інлайн-кнопки).

export type NotificationCategoryKey =
  | "customer_followup"
  | "quote_deadline"
  | "quote_comment"
  | "contractor"
  | "team_events"
  | "probation"
  | "employment";

export type NotificationCategory = {
  key: NotificationCategoryKey;
  label: string;
};

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  { key: "customer_followup", label: "Клієнти та ліди" },
  { key: "quote_deadline", label: "Дедлайни прорахунків" },
  { key: "quote_comment", label: "Коментарі у прорахунках" },
  { key: "contractor", label: "Контрагенти" },
  { key: "team_events", label: "Події команди" },
  { key: "probation", label: "Випробувальний термін" },
  { key: "employment", label: "Працевлаштування" },
];

// Видимість категорій за роллю — копія src/lib/notificationCategories.ts (тримати синхронно).
export type RoleContext = { accessRole: string | null; jobRole: string | null };

const QUOTE_JOB_ROLES = ["manager", "менеджер", "sales_manager", "junior_sales_manager", "pm"];

export function isCategoryVisibleForRole(key: NotificationCategoryKey, ctx: RoleContext): boolean {
  const access = (ctx.accessRole ?? "").trim().toLowerCase();
  const job = (ctx.jobRole ?? "").trim().toLowerCase();
  const isPrivileged = access === "owner" || access === "admin" || job === "seo";
  const isQuoteWorker = isPrivileged || QUOTE_JOB_ROLES.includes(job);
  switch (key) {
    case "team_events":
    case "probation":
    case "employment":
      return true;
    case "customer_followup":
    case "quote_deadline":
    case "quote_comment":
    case "contractor":
      return isQuoteWorker;
    default:
      return true;
  }
}

export function visibleNotificationCategories(ctx: RoleContext): NotificationCategory[] {
  return NOTIFICATION_CATEGORIES.filter((c) => isCategoryVisibleForRole(c.key, ctx));
}

export type NotificationChannel = "push" | "telegram";

/** Чи дозволяє користувач конкретний канал для категорії (дефолт — увімкнено). */
export function isChannelEnabled(
  channelPrefs: Record<string, Record<string, boolean>> | null | undefined,
  category: string | null | undefined,
  channel: NotificationChannel
): boolean {
  if (!category) return true;
  const entry = channelPrefs?.[category];
  if (!entry) return true;
  return entry[channel] !== false;
}
