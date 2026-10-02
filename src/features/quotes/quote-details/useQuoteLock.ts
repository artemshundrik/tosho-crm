import { useEffect, type MutableRefObject } from "react";
import { toast } from "sonner";
import { ENTITY_LOCK_REQUESTED_IDLE_RELEASE_MS, useEntityLock } from "@/hooks/useEntityLock";
import { QUOTE_LOCKED_BY_OTHER_MESSAGE, getErrorMessage } from "./config";

/**
 * Лок прорахунку разом із тим, що бачить людина, яка в нього вперлась.
 *
 * ЗВІДКИ ЦЕ. 02.10.2026, TS-0926-0051: керівник лишив прорахунок відкритим і
 * пішов на обід, проєктний менеджер прокрутив до тиражів і вписував ціни.
 * Поля виглядали доступними, а база чотири рази відмовила зберегти (тригери
 * `trg_quote_lock_*`) — тостом англійською. «Попросити звільнити» жила лише в
 * банері вгорі сторінки, давно прокрученому, тож обоє шукали кнопку й не
 * знайшли, а лок через 5 хв простою звільнився сам.
 *
 * Тепер кнопка там, куди людина впирається: у тості відмови й у меню статусу.
 */

const TOAST_ID = "quote-locked-by-other";

/** Відмова саме через чужий лок — після перекладу в `getErrorMessage`. */
export const isQuoteLockedMessage = (message: string) => message === QUOTE_LOCKED_BY_OTHER_MESSAGE;

export function useQuoteLock(params: {
  teamId?: string | null;
  quoteId?: string | null;
  userId?: string | null;
  userLabel?: string | null;
  /**
   * Куди покласти «показати відмову». Через ref, бо автозбереження тиражів
   * оголошене на сторінці раніше за лок і бачить його лише так.
   */
  notifyLockedRef: MutableRefObject<() => void>;
}) {
  const { teamId, quoteId, userId, userLabel, notifyLockedRef } = params;
  const lock = useEntityLock({
    teamId,
    entityType: "quote",
    entityId: quoteId,
    userId,
    userLabel,
    enabled: !!teamId && !!quoteId && !!userId,
  });
  const holder = lock.holderName ?? "Інша людина";
  // «Хвилину» — з того ж числа, що й таймер у тримача, щоб текст не збрехав.
  const waitMinutes = Math.round(ENTITY_LOCK_REQUESTED_IDLE_RELEASE_MS / 60_000);
  const handover = `щойно в людини мине ${waitMinutes} хв без дій, редагування перейде до вас`;

  // `action: undefined` явно: тост із тим самим id ЗЛИВАЄТЬСЯ з попереднім
  // (sonner робить {...старий, ...новий}), і без цього «Запит надіслано»
  // лишався з кнопкою «Попросити звільнити».
  const requestRelease = () => {
    void lock
      .requestRelease()
      .then(() =>
        toast.success("Запит надіслано", {
          id: TOAST_ID,
          description: `${holder} побачить його в себе на екрані, а ${handover}.`,
          action: undefined,
        })
      )
      .catch((error: unknown) =>
        toast.error("Не вдалося надіслати запит", {
          id: TOAST_ID,
          description: getErrorMessage(error, "Спробуйте ще раз."),
          action: undefined,
        })
      );
  };

  // Один id на всі відмови: автозбереження б'ється в лок на кожному полі, і
  // без нього тости складались би стосом.
  const notifyLocked = () => {
    toast.error(`${holder} зараз редагує прорахунок`, {
      id: TOAST_ID,
      description: lock.releaseRequestSent
        ? `Зміни не збережено. Запит уже надіслано: ${handover}.`
        : `Зміни не збережено. Попросіть звільнити: ${handover}.`,
      action: lock.releaseRequestSent ? undefined : { label: "Попросити звільнити", onClick: requestRelease },
    });
  };
  useEffect(() => {
    notifyLockedRef.current = notifyLocked;
  });

  /**
   * Дія під причиною в меню статусу. Лише коли причина — саме чужий лок: без
   * прав просити звільнити марно, статус однаково не зміниш.
   */
  const statusAction = (canEdit: boolean) => {
    if (!canEdit || !lock.lockedByOther) return null;
    return lock.releaseRequestSent
      ? { label: "Запит надіслано, очікуємо…", onSelect: () => undefined, pending: true }
      : { label: "Попросити звільнити", onSelect: requestRelease };
  };

  return { lock, notifyLocked, statusAction };
}
