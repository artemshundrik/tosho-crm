import { moduleKeyLabel } from "@/lib/projectMap";
import { CARD_PRIORITY_LABELS, type DevRequest } from "./types";

/**
 * Чиста логіка картки на дошці запитів.
 *
 * Винесена з компонента навмисно: тут правила, які легко зламати непомітно —
 * «звичайний пріоритет не підписуємо», «порожній напрямок називаємо словами»
 * і «кнопка меню не починає перетягування». У JSX кожне виглядає як дрібниця,
 * а ламається тихо, тож усі живуть окремо й під тестами.
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

/** Чим відкрили меню картки. */
export type MenuOpenSource = "pointer" | "keyboard";

/**
 * Чи повертати фокус на «⋯» після того, як меню закрилось.
 *
 * НАВІЩО: Radix після закриття сам ставить фокус назад на кнопку. Для
 * клавіатури це єдиний правильний хід — інакше Tab почав би обхід сторінки
 * спочатку. Але браузер вважає такий програмний фокус «як з клавіатури» й
 * малює навколо кнопки рінг, тож після кліку мишею на картці лишався синій
 * ореол, який нічим не прибрати, крім кліку деінде.
 *
 * Тому фокус повертаємо рівно тому, хто ним користується. Глушити сам рінг
 * (`focus:outline-none` чи `focus-visible:ring-0`) — не варіант: він єдине,
 * що показує клавіатурному користувачу, де він зараз.
 */
export function shouldRestoreMenuFocus(source: MenuOpenSource): boolean {
  return source === "keyboard";
}

/**
 * Наскільки гучно звучить мітка.
 *  - `loud` — видно з відстані (терміново);
 *  - `normal` — рядова мітка;
 *  - `quiet` — присутня, але не тягне на себе увагу (не горить, порожній
 *    напрямок).
 */
export type ChipWeight = "quiet" | "normal" | "loud";

export type CardMetaKey = "priority" | "module" | "author" | "asked" | "private";

export type CardMeta = {
  key: CardMetaKey;
  label: string;
  weight: ChipWeight;
  /** Підказка на наведення: нікнейм автора, пояснення лічильника. */
  hint?: string;
};

/**
 * Як підписано напрямок, якого ще немає.
 *
 * Порожнє місце читається як «поля немає», а це неправда: напрямок є, його
 * просто ніхто не поставив. Слова роблять пропуск видимим — і зрозуміло, що
 * картку варто відкрити й дозаповнити руками.
 */
export const MODULE_UNSET_LABEL = "напрямок не визначено";

/**
 * Нижній рядок картки: пріоритет, напрямок, автор, «просили N», «закрита».
 *
 * Тип запиту сюди НЕ входить — він піднятий у верхній рядок, словом і тоном
 * (див. KIND_TONE/KIND_ICONS). Порядок сталий: спершу те, що змінює чергу
 * (пріоритет), потім те, що каже «куди» (напрямок), і аж потім «від кого».
 *
 * Пріоритет `high` голосний, `low` тихий, «звичайний» не підписується взагалі
 * — див. CARD_PRIORITY_LABELS. Підпис напрямку береться з реєстру модулів
 * через `moduleKeyLabel`, свого списку рядків тут немає.
 */
export function buildCardMeta(request: DevRequest): CardMeta[] {
  const meta: CardMeta[] = [];

  // Тільки два краї шкали. `normal` і непроставлений пріоритет — однаково
  // порожній звук, і показувати їх нічим не краще за мовчання.
  if (request.priority === "high" || request.priority === "low") {
    meta.push({
      key: "priority",
      label: CARD_PRIORITY_LABELS[request.priority],
      weight: request.priority === "high" ? "loud" : "quiet",
    });
  }

  const moduleLabel = moduleKeyLabel(request.moduleKey);
  meta.push(
    moduleLabel
      ? { key: "module", label: moduleLabel, weight: "normal" }
      : {
          key: "module",
          label: MODULE_UNSET_LABEL,
          weight: "quiet",
          hint: "Напрямок ще ніхто не поставив — відкрийте картку й оберіть",
        }
  );

  const author = resolveAuthor(request);
  if (author) {
    meta.push({ key: "author", label: author.label, weight: "normal", hint: author.hint });
  }

  if (request.askedByCount > 1) {
    meta.push({
      key: "asked",
      label: `просили ${request.askedByCount}`,
      weight: "normal",
      hint: "Стільки людей просили те саме",
    });
  }

  if (request.isPrivate) {
    meta.push({
      key: "private",
      label: "закрита",
      weight: "normal",
      hint: "Видно лише власнику й СЕО",
    });
  }

  return meta;
}

/**
 * Чи підсвічувати картку цілком.
 *
 * Правило те саме, що й у гучної мітки, і тримається однією функцією
 * навмисно: підсвітка картки й слово «Терміново» мають вмикатись разом. Якби
 * умова стояла в JSX окремо, вони б із часом розійшлись — і на дошці
 * зʼявилась би червона картка без пояснення або пояснення без картки.
 */
export function isUrgentCard(request: DevRequest): boolean {
  return request.priority === "high";
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
