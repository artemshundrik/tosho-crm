import { formatLastSeenAgo } from "@/lib/lastSeen";

/**
 * Підпис під іменем у списку «Люди» Пульсу.
 *
 * ДВА ПРАВИЛА: рядок завжди каже, КОЛИ людина була в CRM, і ніколи не має
 * роду — CRM не знає, «був» це чи «була». Раніше гілка
 * «є хвилини присутності, але жодної дії» писала глухе «Присутність без дій»
 * — без часу взагалі, — і власник 20.08.2026 справедливо спитав, чому не
 * видно, скільки хвилин чи годин тому людина заходила.
 *
 * Онлайн НЕ описуємо через «тому». Позначка присутності пишеться раз на
 * кілька хвилин, тож у людини, яка просто сидить у CRM, підпис читався як
 * «був 1 хвилину тому» — і сперечався з зеленою крапкою поруч.
 */
export function formatPulsePresence(
  params: {
    online: boolean;
    actions: number;
    minutes: number;
    /** Час останньої ДІЇ в журналі активності. */
    lastActiveAt?: string | null;
    /** Час останнього візиту з user_presence — є навіть тоді, коли дій не було. */
    lastSeenAt?: string | null;
  },
  now = new Date()
): string {
  const lastAction = (params.lastActiveAt ?? "").trim();
  const lastSeen = (params.lastSeenAt ?? "").trim();

  if (params.online) {
    return params.actions > 0 && lastAction
      ? `Зараз онлайн · остання дія ${formatLastSeenAgo(lastAction, now)}`
      : "Зараз онлайн";
  }

  if (params.actions > 0 && lastAction) return `Остання дія ${formatLastSeenAgo(lastAction, now)}`;

  // Присутність без дій — теж відповідь, але лише разом із часом: «був і нічого
  // не робив» без «коли» не каже нічого.
  //
  // БЕЗ РОДУ. «Був у CRM 18 хвилин тому» для Тані й Лєни читалось як помилка —
  // так і є. Роду людини CRM не знає (у профілі такого поля немає), вгадувати
  // його за іменем не можна, а «був(ла)» — це канцелярит. Тому іменник:
  // «Остання присутність» стоїть поруч із «Остання дія» й читається як пара.
  const seen = lastSeen || lastAction;
  if (!seen) return "Візитів ще не було";
  const ago = formatLastSeenAgo(seen, now);
  return params.minutes > 0 ? `Остання присутність ${ago}, без дій` : `Остання присутність ${ago}`;
}
