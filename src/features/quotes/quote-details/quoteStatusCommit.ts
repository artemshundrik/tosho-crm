import { changeQuoteStatus, logQuoteActivity } from "@/features/quotes/quote-details/queries";
import { formatStatusLabel } from "@/features/quotes/quote-details/config";
import { logActivity } from "@/lib/activityLogger";
import { notifyQuoteInitiatorOnStatusChange } from "@/lib/workflowNotifications";

/**
 * Запис переходу статусу прорахунку з усім, що його супроводжує: сповіщення
 * ініціатора, рядок у журналі, задачі дизайнеру й бухгалтеру на затвердженні.
 *
 * Гейти (незбережені тиражі, накрутка, вибір позицій) — НЕ тут: вони потребують
 * стану сторінки й перевіряються до виклику (`quoteStatusGates`). Тут лише те,
 * що однакове для сторінки прорахунку й прев'ю в списку (REQ-346#p8), — щоб
 * перехід з прев'ю не забув про сповіщення чи журнал.
 *
 * Замок редагування прев'ю не бере: якщо прорахунок тримає інший, запис
 * відхилить тригер бази, і `message` скаже це людською мовою.
 */
export async function commitQuoteStatusChange({
  teamId,
  quoteId,
  quoteNumber,
  previousStatus,
  nextStatus,
  note,
  actorUserId,
}: {
  teamId: string | null;
  quoteId: string;
  quoteNumber: string | null | undefined;
  previousStatus: string;
  nextStatus: string;
  note: string;
  actorUserId: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const changed = await changeQuoteStatus({ quoteId, status: nextStatus, note: note || undefined });
  if (!changed.ok) return { ok: false, message: changed.message };

  // Сповіщаємо лише про СПРАВЖНІЙ перехід — і питаємо про це БАЗУ, а не свій
  // знімок. Той самий статус (повторне «Затверджено», збереження нотатки без
  // зміни стану) база ігнорує: ні в історію, ні в аудит нічого не пише.
  // Порівняння `previousStatus !== nextStatus` знімало лише свій випадок і не
  // бачило, що встигла зробити сусідня вкладка чи інша людина — саме так
  // 25.08.2026 прилетіли чотири однакові повідомлення при одному рядку
  // історії. Тепер `set_quote_status` сам каже, чи змінився рядок (REQ-231).
  //
  // Сповіщення не ламає зміну статусу: вона вже сталась.
  if (changed.data) {
    try {
      await notifyQuoteInitiatorOnStatusChange({ quoteId, fromStatus: previousStatus, toStatus: nextStatus, actorUserId });
    } catch (notifyError) {
      console.warn("Failed to notify quote initiator about status change", notifyError);
    }
  }

  const href = `/orders/estimates/${quoteId}`;
  const logged = await logQuoteActivity(
    {
      teamId,
      action: "змінив статус",
      entityType: "quotes",
      entityId: quoteId,
      title: `Статус: ${formatStatusLabel(previousStatus)} → ${formatStatusLabel(nextStatus)}`,
      href,
      metadata: { source: "quote_status", from: previousStatus, to: nextStatus, note },
    },
    "Помилка зміни статусу"
  );
  if (!logged.ok) return { ok: false, message: logged.message };

  if (nextStatus === "approved" && previousStatus !== "approved") {
    const number = quoteNumber ?? "";
    await Promise.allSettled([
      logActivity({
        teamId,
        action: "створив задачу",
        entityType: "quotes",
        entityId: quoteId,
        title: `Задача для дизайнера: макет для прорахунку ${number}`.trim(),
        href,
        metadata: { role: "designer", source: "quote_status", status: nextStatus },
      }),
      logActivity({
        teamId,
        action: "створив задачу",
        entityType: "quotes",
        entityId: quoteId,
        title: `Задача для бухгалтера: рахунок для прорахунку ${number}`.trim(),
        href,
        metadata: { role: "accountant", source: "quote_status", status: nextStatus },
      }),
    ]);
  }
  return { ok: true };
}
