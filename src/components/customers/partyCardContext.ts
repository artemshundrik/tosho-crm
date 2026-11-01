import * as React from "react";

/**
 * Повна картка замовника або ліда, відкрита там, де по ньому клацнули (REQ-348):
 * у прорахунку, дизайн-задачі, замовленні, зі спливної картки в списках.
 *
 * Раніше клік відкривав проміжне вікно-довідку, яке довго вантажилось і нічого
 * не давало змінити, — за правкою треба було йти в «Замовники» й назад.
 * Тепер довідка живе під курсором (PartyHoverCard), а клік відкриває картку.
 *
 * Тут лише контракт: провайдер стоїть в AppLayout, а важке (форми, запити)
 * довантажується при першому відкритті.
 */

export type PartyCardTarget = {
  customerId?: string | null;
  leadId?: string | null;
  /** Коли id немає (прорахунок ліда тримає лише назву): шукаємо за назвою. */
  name?: string | null;
};

export type PartyCardSavedResult = {
  kind: "customer" | "lead";
  id: string;
  name: string;
  logoUrl: string | null;
  /** Лід став замовником — далі живе цей замовник. */
  convertedCustomerId: string | null;
};

export type OpenPartyCard = (
  target: PartyCardTarget,
  options?: { onSaved?: (result: PartyCardSavedResult) => void }
) => void;

export const PartyCardContext = React.createContext<OpenPartyCard | null>(null);

/** null — провайдера немає (тести, сторінки поза AppLayout): кнопку не показуємо. */
export function useOpenPartyCard(): OpenPartyCard | null {
  return React.useContext(PartyCardContext);
}
