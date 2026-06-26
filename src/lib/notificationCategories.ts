// Канонічні категорії сповіщень для матриці налаштувань (тип × канал).
// ВАЖЛИВО: тримати синхронно з netlify/functions/_notificationCategories.ts (та сама структура).
// Ключ категорії передається продюсером у deliverNotifications({ category }) і використовується
// для гейтингу каналів через user_notification_settings.channel_prefs.

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
  description: string;
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
    key: "probation",
    label: "Випробувальний термін",
    description: "Нагадування по випробувальному терміну",
  },
  {
    key: "employment",
    label: "Працевлаштування",
    description: "Зміни статусу співпраці",
  },
];

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
