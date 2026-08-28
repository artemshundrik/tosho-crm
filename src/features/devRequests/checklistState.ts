/**
 * Стани пунктів чекліста — листковий модуль БЕЗ ЖОДНИХ ІМПОРТІВ.
 *
 * Те саме міркування, що в papercuts.ts: правило «що вважати відкритим»
 * потрібне і застосунку, і Netlify-функції, і модулю впізнавання накопичувачів.
 * А checklist.ts для них заважкий — він тягне lucide-react заради іконок станів.
 */

/** `dropped` — «не робимо»: скасоване рішенням, а не зроблене. */
export const CLOSED_CHECK_STATES = ["done", "dropped"] as const;

/**
 * Чи лишилось у списку хоч щось у роботі.
 *
 * Скасоване не тримає нічого — у цьому суть стану «не робимо».
 */
export function hasOpenChecklistItems(items: ReadonlyArray<{ state?: string | null }>): boolean {
  return items.some((item) => {
    const state = (item?.state ?? "todo").trim();
    return !(CLOSED_CHECK_STATES as readonly string[]).includes(state);
  });
}
