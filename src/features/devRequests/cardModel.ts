import { moduleKeyLabel } from "@/lib/projectMap";
import { KIND_LABELS, PRIORITY_LABELS, type DevRequest } from "./types";

/**
 * Чиста логіка картки на дошці запитів.
 *
 * Винесена з компонента навмисно: тут два правила, які легко зламати
 * непомітно — «порожній напрямок не показуємо взагалі» і «кнопка меню не
 * починає перетягування». Обидва в JSX виглядають як дрібниця, а ламаються
 * тихо, тож живуть окремо й під тестами.
 */

/**
 * Позначка на обгортці меню картки.
 *
 * Атрибут, а не клас: класи на дошці міняє верстка, і випадкове
 * перейменування мовчки повернуло б перетягування картки за кнопку меню.
 */
export const CARD_MENU_ATTR = "data-request-card-menu";

type ClosestCapable = { closest?: (selector: string) => unknown };

/**
 * Чи жест почався всередині меню картки.
 *
 * НАВІЩО: перевірити це в самому `dragstart` не вийде — подія стріляє на
 * КАРТЦІ (джерело перетягування — найближчий draggable-предок), тож із
 * `event.target` не видно, що миша натиснула кнопку меню. Тому дивимось на
 * `pointerdown`, який приходить першим у ланцюжку подій натискання.
 */
export function isCardMenuTarget(target: unknown): boolean {
  const node = target as ClosestCapable | null;
  if (!node || typeof node.closest !== "function") return false;
  return node.closest(`[${CARD_MENU_ATTR}]`) != null;
}

/**
 * Наскільки гучно звучить мітка.
 *  - `loud` — видно з відстані (терміново);
 *  - `normal` — рядова мітка;
 *  - `quiet` — присутня, але не тягне на себе увагу (не горить).
 */
export type ChipWeight = "quiet" | "normal" | "loud";

export type RequestChip = {
  key: "kind" | "module" | "priority";
  label: string;
  weight: ChipWeight;
};

/**
 * Мітки картки: тип, напрямок, пріоритет.
 *
 * Напрямку немає — мітки немає. Порожній чип гірший за його відсутність: він
 * займає місце в ряду й читається як справжня категорія «—».
 *
 * Пріоритет `high` голосний, `low` тихий, і це не про колір, а про задум:
 * дошку сканують очима, і єдине, що має чіплятись поглядом, — «Терміново».
 * Підпис напрямку береться з реєстру модулів через `moduleKeyLabel`, свого
 * списку рядків тут немає.
 */
export function buildRequestChips(request: DevRequest): RequestChip[] {
  const chips: RequestChip[] = [
    { key: "kind", label: KIND_LABELS[request.kind], weight: "normal" },
  ];

  const moduleLabel = moduleKeyLabel(request.moduleKey);
  if (moduleLabel) chips.push({ key: "module", label: moduleLabel, weight: "normal" });

  if (request.priority) {
    chips.push({
      key: "priority",
      label: PRIORITY_LABELS[request.priority],
      weight: request.priority === "high" ? "loud" : request.priority === "low" ? "quiet" : "normal",
    });
  }

  return chips;
}

/**
 * Автор картки: ім'я з Telegram, а якщо його немає — нікнейм.
 *
 * Обидва поля необов'язкові й незалежні: у Telegram username можна не мати
 * взагалі. Показувати лише «@username» означало б, що частина карток лишиться
 * без автора; показувати обидва — шум у мета-рядку, тож нікнейм ховаємо в
 * підказку, коли ім'я вже видно.
 */
export function resolveAuthor(request: DevRequest): { label: string; hint?: string } | null {
  if (request.displayName) {
    return {
      label: request.displayName,
      hint: request.tgUsername ? `@${request.tgUsername}` : undefined,
    };
  }
  if (request.tgUsername) return { label: `@${request.tgUsername}` };
  return null;
}
