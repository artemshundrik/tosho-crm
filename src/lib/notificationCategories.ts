// Канонічні категорії сповіщень для матриці налаштувань (тип × канал).
// ВАЖЛИВО: тримати синхронно з netlify/functions/_notificationCategories.ts (та сама структура).
// Ключ категорії передається продюсером у deliverNotifications({ category }) і використовується
// для гейтингу каналів через user_notification_settings.channel_prefs.

export type NotificationCategoryKey =
  | "customer_followup"
  | "quote_created"
  | "quote_deadline"
  | "quote_comment"
  | "quote_markup_request"
  | "quote_markup_decision"
  | "design"
  | "contractor"
  | "team_events"
  | "team_absences"
  | "probation"
  | "employment"
  | "finance_payment"
  | "finance_month_close"
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
    key: "quote_created",
    label: "Нові прорахунки",
    description: "Менеджер завів новий прорахунок",
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
    key: "quote_markup_request",
    label: "Запити на погодження накрутки",
    description: "Менеджер просить накрутку нижче дна 20 % — потрібне рішення",
  },
  {
    key: "quote_markup_decision",
    label: "Рішення по накрутці",
    description: "Вашу накрутку нижче дна підтвердили або відхилили",
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
    key: "finance_month_close",
    label: "Закриття місяця",
    description: "Журнальні витрати (комуналка, прибирання), не внесені за місяць",
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
  // Фінанси — власник + CEO + бухгалтери (той самий набір, що має доступ до Фінансів).
  const isFinance = access === "owner" || access === "admin" || ["seo", "accountant", "chief_accountant"].includes(job);
  switch (key) {
    // Універсальні / персональні — бачать усі.
    case "team_events":
    case "team_absences":
    case "probation":
    case "employment":
      return true;
    // Платежі / підписки й закриття місяця — лише фін-ролі.
    case "finance_payment":
    case "finance_month_close":
      return isFinance;
    // Системний дайджест — лише власник. Свідомо вужче за доступ до
    // Observability: у команді решта «адмінів» — це CEO, і щоденна технічна
    // зведення їм лише шум (бізнес-дайджест вони отримують окремо).
    case "admin_digest":
      return access === "owner";
    // Бізнес-дайджест — власник/адмін + CEO.
    case "business_digest":
      return isPrivileged;
    // Дизайн-задачі — дизайнери + ті, хто з прорахунками/дизайном.
    case "design":
      return isQuoteWorker || isDesigner;
    // Власник, адміністратор, CEO і проєктний менеджер. Менеджера-автора тут
    // свідомо немає: він і так знає, що щойно завів прорахунок.
    case "quote_created":
      return isPrivileged || job === "pm";
    // Запит на знижену накрутку бачать ТІЛЬКИ ті, хто його вирішує, — той самий
    // перелік, що в canApproveQuoteMarkup і tosho.is_quote_markup_approver.
    // Менеджеру перемикач на це був би брехнею: запити йому не шлють.
    case "quote_markup_request":
      return access === "owner" || job === "seo" || job === "chief_accountant";
    // А відповідь на запит летить назад менеджерові — тому окрема категорія, а
    // не одна на обидва боки: вимкнути «мені більше не приходять чужі запити»
    // не має заодно глушити «на моє прохання відповіли».
    case "quote_markup_decision":
      return isQuoteWorker;
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
