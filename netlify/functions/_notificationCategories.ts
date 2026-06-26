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
