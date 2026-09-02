import { markupGateMessage } from "@/lib/quoteMarkupApproval";
import type { QuoteDealType } from "@/lib/quoteDealType";
import { modelPriceVatGateMessage } from "./quoteRunModelPriceVat";

/**
 * Двері назовні: що мусить бути зроблене, перш ніж прорахунок поїде далі
 * статусом.
 *
 * ОДИН ВУЗОЛ НА ВСІ ГЕЙТИ, і це та сама причина, з якої тут колись зʼявився
 * гейт накрутки: до статусу ведуть швидка дія, вікно статусів і перемикач, і
 * окремі перевірки на кожному шляху рано чи пізно розходяться.
 */

/**
 * Статуси, у які не можна їхати з незбереженим тиражем.
 *
 * ЗВІДКИ ЦЕ ВЗЯЛОСЬ (REQ-242). Проєктний менеджер вписав вартість товару, не
 * обрав «з ПДВ / без ПДВ» — і гейт ПДВ мовчки спинив автозбереження. Число
 * лишилось у браузері, а він перевів прорахунок у «Прораховано»: менеджер
 * відкрила картку з нульовою собівартістю й пішла питати в чат, чи це баг.
 *
 * Рух НАЗАД («новий», «рахуємо») і скасування не блокуються: там незбережена
 * ціна нікого не вводить в оману, а замкнути людину в статусі, з якого немає
 * виходу, — гірше за саму проблему.
 */
const STATUSES_REQUIRING_SAVED_RUNS = new Set(["estimated", "awaiting_approval", "approved"]);

export type QuoteStatusGate = {
  /** Заголовок тосту — чому саме не пустили. */
  title: string;
  /** Що зробити, щоб пустило: той самий текст іде і в шапку картки. */
  message: string;
};

export function resolveQuoteStatusGate(
  nextStatus: string,
  markupBlocked: boolean,
  dealType: QuoteDealType | null | undefined,
  unsavedRunCount: number
): QuoteStatusGate | null {
  // Незбережене — ПЕРШИМ: погоджувати накрутку на ціні, якої ще немає в базі,
  // означало б погоджувати не те число, що поїде в замовлення.
  if (unsavedRunCount > 0 && STATUSES_REQUIRING_SAVED_RUNS.has(nextStatus)) {
    return { title: "Тираж не збережено", message: modelPriceVatGateMessage(unsavedRunCount) };
  }
  if (nextStatus === "approved" && markupBlocked) {
    return { title: "Спершу погодження накрутки", message: markupGateMessage(dealType) };
  }
  return null;
}

/**
 * Чому перехід статусу неможливий — людською мовою, ДО кліку.
 *
 * Друкується в меню статусу замість сірої кнопки без пояснень. Порядок причин
 * від «взагалі не твоє» до «майже готово»: права → чужий лок → незаповнена
 * картка → незбережений тираж.
 */
export function resolveStatusBlockReason(params: {
  canEditContent: boolean;
  /** Ім'я того, хто зараз тримає прорахунок; null — вільний. */
  lockHolderName?: string | null;
  lockedByOther: boolean;
  requirements: string[];
  unsavedRunCount: number;
}): string | null {
  if (!params.canEditContent) return "Змінювати статус може менеджер цього прорахунку або керівник.";
  if (params.lockedByOther) {
    return `${params.lockHolderName ?? "Інший користувач"} зараз редагує прорахунок — статус зміниться, коли редагування завершиться.`;
  }
  if (params.requirements.length > 0) return `Спершу заповніть: ${params.requirements.join(", ")}.`;
  if (params.unsavedRunCount > 0) return modelPriceVatGateMessage(params.unsavedRunCount);
  return null;
}
