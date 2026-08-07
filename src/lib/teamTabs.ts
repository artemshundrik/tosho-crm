/**
 * Яку вкладку «Команди» відкрити за посиланням.
 *
 * Навіщо окремий модуль: сповіщення про заявку вели просто на /team, і SEO
 * щоразу потрапляв на «Людей», а тоді шукав «Запити» — посилання не доводило
 * до дії, заради якої його надіслали.
 *
 * Нові сповіщення несуть явний `?tab=`. Але в дзвіночках уже лежать сотні
 * старих, де вкладки немає — там єдина зачіпка це ключ `reminder=`. Переписати
 * їх у базі не можна: на цьому href тримається частковий унікальний індекс,
 * який гасить повтори (див. _notificationDelivery). Тому старі розбираємо за
 * ключем події, а не міняємо.
 */

export type TeamTab = "people" | "calendar" | "requests";

export const DEFAULT_TEAM_TAB: TeamTab = "people";

const isTeamTab = (value: string | null): value is TeamTab =>
  value === "people" || value === "calendar" || value === "requests";

export function resolveTeamTab(params: URLSearchParams): TeamTab {
  const explicit = params.get("tab");
  if (isTeamTab(explicit)) return explicit;

  const reminder = params.get("reminder") ?? "";
  // Заявка без рішення — це запит на дію, і кнопки рішення стоять у «Запитах».
  if (reminder.includes("absence-pending")) return "requests";
  // Решта відсутностей (початок / кінець / один день) — факт для календаря.
  if (reminder.includes("absence-")) return "calendar";
  return DEFAULT_TEAM_TAB;
}
