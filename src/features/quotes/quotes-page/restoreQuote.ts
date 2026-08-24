import { setStatus as setQuoteStatus } from "@/lib/toshoApi";
import { notifyQuoteInitiatorOnStatusChange } from "@/lib/workflowNotifications";
import { boardColumnStatuses } from "@/lib/kanbanBoards";
import { statusLabels } from "./config";

/**
 * Дорога назад зі списку скасованих на дошку (REQ-138).
 *
 * ЧОМУ В ПЕРШУ КОЛОНКУ, А НЕ В ТОЙ СТАН, У ЯКОМУ ПРОРАХУНОК БУВ. Попереднього
 * статусу ми не зберігаємо — і не збираємось: це було б іще одне поле, яке
 * хтось має вчасно проставити, а таких у нас уже є. Чесніше покласти картку на
 * початок, де людина сама вирішить, куди їй далі.
 *
 * ЧОМУ ЦЕ ОКРЕМИЙ МОДУЛЬ. QuotesPage уже на 8 тисяч рядків, і ратчет розміру
 * (scripts/check-file-growth.mjs) б'є саме по причині: у файл такого розміру
 * нове не дописується. Тут — уся дія цілком, сторінці лишається знімок стану
 * й тост.
 *
 * Сповіщення ініціатору не критичне: якщо воно не пішло, статус усе одно
 * змінився, і валити всю дію через це було б гірше, ніж мовчазний рядок у
 * консолі.
 */
export async function restoreQuoteToBoard(
  quoteId: string,
  actorUserId: string | null
): Promise<{ status: string; label: string }> {
  const nextStatus = boardColumnStatuses("quotes")[0];
  if (!nextStatus) throw new Error("У реєстрі канбанів немає жодної колонки прорахунків");

  await setQuoteStatus({ quoteId, status: nextStatus });
  try {
    await notifyQuoteInitiatorOnStatusChange({ quoteId, toStatus: nextStatus, actorUserId });
  } catch (notifyError) {
    console.warn("Failed to notify quote initiator about status change", notifyError);
  }

  return { status: nextStatus, label: statusLabels[nextStatus] ?? nextStatus };
}
