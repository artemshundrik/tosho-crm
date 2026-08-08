/**
 * «Коли людину бачили востаннє» — ОДИН форматер на весь застосунок.
 *
 * ЗВІДКИ ДАНІ: public.user_presence, один рядок на людину. Відкрита вкладка
 * CRM пінгує `last_seen_at` (useWorkspacePresenceState): раз на ~5 хв, коли
 * працює realtime, і раз на хвилину у фолбеку. Тобто це «востаннє тримав
 * CRM відкритою», а не «востаннє був за компʼютером» — і точність ±кілька
 * хвилин, тому секунди не показуємо принципово.
 *
 * До цього модуля підпис жив ЧОТИРМА копіями (TeamPage, TeamMembersPage,
 * TeamPulsePanel, бот) і всі округлювали до однієї одиниці: «3 дн тому» —
 * а CEO хотів бачити «3 дн 4 год тому». Дві СУМІЖНІ одиниці: дні+години,
 * години+хвилини. «3 дн 54 хв» без годин — безглуздя, його не буває.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Після цього порога відносний час («43 дні тому») гірший за дату. */
const RELATIVE_LIMIT_DAYS = 30;

/**
 * «1 день / 3 дні / 5 днів» — повні слова, як просив CEO, не «дн».
 *
 * Експортується, бо копій цього правила в проєкті вже вісім (employment,
 * taskThread, amountInWords, TeamMemberCard, AbsenceDialog…). Дев'яту не
 * заводимо: нове місце, якому треба відмінювання, бере цю.
 */
export function pluralUk(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} ${many}`;
  if (mod10 === 1) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

const days_ = (n: number) => pluralUk(n, "день", "дні", "днів");
const hours_ = (n: number) => pluralUk(n, "годину", "години", "годин");
const minutes_ = (n: number) => pluralUk(n, "хвилину", "хвилини", "хвилин");

export function formatLastSeenAgo(lastSeenAt: string | null | undefined, now = new Date()): string {
  if (!lastSeenAt) return "не заходив";
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen)) return "не заходив";

  const diff = Math.max(0, now.getTime() - seen);
  if (diff < MINUTE) return "щойно";

  const days = Math.floor(diff / DAY);
  const hours = Math.floor((diff % DAY) / HOUR);
  const minutes = Math.floor((diff % HOUR) / MINUTE);

  if (days >= RELATIVE_LIMIT_DAYS) {
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: "Europe/Kiev",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(seen));
  }
  if (days > 0) return hours > 0 ? `${days_(days)} ${hours_(hours)} тому` : `${days_(days)} тому`;
  if (hours > 0) return minutes > 0 ? `${hours_(hours)} ${minutes_(minutes)} тому` : `${hours_(hours)} тому`;
  return `${minutes_(minutes)} тому`;
}

/**
 * Точний момент для тултипа: «вт, 04.08, 18:37». Відносний підпис відповідає
 * «як давно», цей — «коли саме»; разом вони закривають обидва питання.
 */
export function formatLastSeenExact(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return "";
  const seen = new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return "";
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kiev",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(seen);
}
