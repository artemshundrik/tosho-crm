/**
 * Рядки стрічки замовлення про закупки. Назву постачальника, опис рядка й суми
 * сюди не кладемо навмисно: стрічку бачать усі, хто бачить замовлення, а
 * закупки — лише бухгалтерія, склад і керівництво.
 */

/** Подія для стрічки замовлення — у білому списку THREAD_EVENT_ACTIONS. */
export const ORDER_PURCHASE_EVENT = "order_purchase";

export const orderPurchaseEventTitle = {
  created: "Внесено закупку",
  paid: "Закупку оплачено",
  paymentCancelled: (reason: string) => `Скасовано оплату закупки: ${reason.trim()}`,
  received: "Товар отримано",
  noneSet: "Позначено: закупок немає",
  noneUnset: "Знято позначку «закупок немає»",
} as const;
