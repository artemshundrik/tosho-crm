// Канонічні категорії сповіщень для матриці налаштувань (тип × канал).
// ВАЖЛИВО: тримати синхронно з netlify/functions/_notificationCategories.ts (та сама структура).
// Ключ категорії передається продюсером у deliverNotifications({ category }) і використовується
// для гейтингу каналів через user_notification_settings.channel_prefs.

export type NotificationCategoryKey =
  | "customer_followup"
  | "quote_deadline"
  | "quote_comment"
  | "design"
  | "contractor"
  | "team_events"
  | "team_absences"
  | "probation"
  | "employment"
  | "finance_payment"
  | "admin_digest"
  | "business_digest";

export type NotificationCategory = {
  key: NotificationCategoryKey;
  label: string;
  description: string;
  /** Категорія доставляється лише в Telegram — у матриці налаштувань push-тумблер не показуємо. */
  telegramOnly?: boolean;
};

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  {
    key: "customer_followup",
    label: "Клієнти та ліди",
    description: "Нагадування зв'язатися з клієнтом або лідом",
  },
  {
    key: "quote_deadline",
    label: "Дедлайни прорахунків",
    description: "Наближається термін прорахунку / КП",
  },
  {
    key: "quote_comment",
    label: "Коментарі у прорахунках",
    description: "Нові коментарі та згадки у прорахунках",
  },
  {
    key: "design",
    label: "Дизайн-задачі",
    description: "Згадки, коментарі та статуси у дизайн-задачах",
  },
  {
    key: "contractor",
    label: "Контрагенти",
    description: "Події по контрагентах і постачальниках",
  },
  {
    key: "team_events",
    label: "Події команди",
    description: "Дні народження, річниці, відпустки",
  },
  {
    key: "team_absences",
    label: "Заявки на відсутність",
    description: "Запити на відпустку / day-off, рішення по них і лікарняні",
  },
  {
    key: "probation",
    label: "Випробувальний термін",
    description: "Нагадування по випробувальному терміну",
  },
  {
    key: "employment",
    label: "Працевлаштування",
    description: "Зміни статусу співпраці",
  },
  {
    key: "finance_payment",
    label: "Платежі та підписки",
    description: "Нагадування про майбутній платіж / списання підписки",
  },
  {
    key: "admin_digest",
    label: "Системний дайджест",
    description: "Ранковий звіт про бекапи, storage, базу та cron",
    telegramOnly: true,
  },
  {
    key: "business_digest",
    label: "Бізнес-дайджест",
    description: "Ранковий план на день і вечірній підсумок продажів та дизайну",
    telegramOnly: true,
  },
];

// Видимість категорій за роллю. Чиста функція від рядків ролей —
// та сама логіка в netlify/functions/_notificationCategories.ts (бот). Тримати синхронно.
export type RoleContext = { accessRole: string | null; jobRole: string | null };

const QUOTE_JOB_ROLES = ["manager", "менеджер", "sales_manager", "junior_sales_manager", "pm"];

export function isCategoryVisibleForRole(key: NotificationCategoryKey, ctx: RoleContext): boolean {
  const access = (ctx.accessRole ?? "").trim().toLowerCase();
  const job = (ctx.jobRole ?? "").trim().toLowerCase();
  const isPrivileged = access === "owner" || access === "admin" || job === "seo";
  const isQuoteWorker = isPrivileged || QUOTE_JOB_ROLES.includes(job);
  const isDesigner = job === "designer" || job === "дизайнер";
  // Фінанси — власник + SEO + бухгалтери (той самий набір, що має доступ до Фінансів).
  const isFinance = access === "owner" || access === "admin" || ["seo", "accountant", "chief_accountant"].includes(job);
  switch (key) {
    // Універсальні / персональні — бачать усі.
    case "team_events":
    case "team_absences":
    case "probation":
    case "employment":
      return true;
    // Платежі / підписки — лише фін-ролі.
    case "finance_payment":
      return isFinance;
    // Системний дайджест — лише власник. Свідомо вужче за доступ до
    // Observability: у команді решта «адмінів» — це SEO, і щоденна технічна
    // зведення їм лише шум (бізнес-дайджест вони отримують окремо).
    case "admin_digest":
      return access === "owner";
    // Бізнес-дайджест — власник/адмін + SEO.
    case "business_digest":
      return isPrivileged;
    // Дизайн-задачі — дизайнери + ті, хто з прорахунками/дизайном.
    case "design":
      return isQuoteWorker || isDesigner;
    // Збут / прорахунки / контрагенти — лише ті, хто з цим працює.
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
