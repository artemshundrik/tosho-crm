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
 *
 * Підпис не має РОДУ: CRM не знає, «був» це чи «була» (поля стать у профілі
 * немає), тож усі формулювання навколо цього форматера — іменникові.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Після цього порога відносний час («43 дні тому») гірший за дату. */
const RELATIVE_LIMIT_DAYS = 30;

/**
 * З якої кількості годин хвилини перестають щось означати.
 *
 * «21 год 21 хв тому» — це 17 символів заради точності, якою ніхто не
 * користується: рішення «писати їй зараз чи завтра» однакове і на 21:00, і на
 * 21:21. А от «1 год 40 хв» проти «1 год» — різниця відчутна, тож на коротких
 * відрізках друга одиниця лишається.
 *
 * Чому це не суперечить проханню CEO про дві суміжні одиниці: воно з'явилось
 * тому, що підпис округлював до ОДНІЄЇ («3 дн тому» ховало години). Точність
 * там, де вона працює, лишилась; зникла лише та, що заповнювала рядок.
 */
const MINUTES_DETAIL_LIMIT_HOURS = 6;

/**
 * «1 день / 3 дні / 5 днів» — повні слова, як просив CEO, не «дн».
 *
 * Експортується, бо копій цього правила в проєкті вже вісім (employment,
 * taskThread, amountInWords, TeamMemberCard, AbsenceDialog…). Дев'яту не
 * заводимо: нове місце, якому треба відмінювання, бере цю.
 */
export function pluralUk(n: number, one: string, few: string, many: string): string {
  return `${n} ${pluralWordUk(n, one, few, many)}`;
}

/**
 * Лише СЛОВО у потрібному відмінку, без числа — коли число поруч форматується
 * окремо (тисячі з пробілом, tabular-nums, власний тег). Інакше такі місця
 * писали слово намертво й видавали «3 змін» замість «3 зміни».
 */
export function pluralWordUk(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/**
 * Дні — словом, години й хвилини — скорочено.
 *
 * Це не непослідовність, а два різні запити. CEO просив саме «1 день / 3 дні /
 * 5 днів», не «3 дн». А власник 20.08.2026: «може давай скрізь де присутність
 * скоротити хв і год» — бо «21 годину 21 хвилину тому» на картці людини
 * займало пів рядка й читалось як речення, хоча це підпис. Дні в підписі
 * трапляються рідко, години з хвилинами — щоразу.
 *
 * «год» і «хв» не відмінюються — саме тому вони й короткі.
 */
const days_ = (n: number) => pluralUk(n, "день", "дні", "днів");
const hours_ = (n: number) => `${n} год`;
const minutes_ = (n: number) => `${n} хв`;

export function formatLastSeenAgo(lastSeenAt: string | null | undefined, now = new Date()): string {
  // Без роду: «не заходив» для половини команди було просто неправильним.
  if (!lastSeenAt) return "візитів не було";
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen)) return "візитів не було";

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
  if (hours > 0) {
    const minutesMatter = minutes > 0 && hours < MINUTES_DETAIL_LIMIT_HOURS;
    return minutesMatter ? `${hours_(hours)} ${minutes_(minutes)} тому` : `${hours_(hours)} тому`;
  }
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
