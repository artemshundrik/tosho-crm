import type { PartyLinkedRecords } from "../partyLinkedRecords";

/**
 * Підказки з контексту в панелі замовника: те, що не є «реквізитом», але
 * заважає роботі просто зараз.
 *
 * - замовлення ще не відвантажене, а адреси доставки в картці немає;
 * - прорахунок погоджено, а сума 0 ₴ — рахунок з нього вийде порожнім;
 * - КП на погодженні без руху понад 60 днів — час нагадати клієнту.
 *
 * Чиста функція: панель і сторінка рахують підказки з тих самих записів,
 * що вже завантажили (`loadPartyLinkedRecords`), нових запитів тут немає.
 */

export type PartyContextHint =
  | { kind: "order_without_delivery"; orderId: string; orderNumber: string }
  | { kind: "approved_zero_total"; quoteId: string; quoteNumber: string }
  | { kind: "stale_offer"; quoteId: string; quoteNumber: string; days: number };

const STALE_OFFER_DAYS = 60;
const DAY_MS = 86_400_000;

const APPROVED = new Set(["approved", "completed"]);
const AWAITING_CLIENT = new Set(["awaiting_approval", "sent"]);
const SHIPPED_DELIVERY = new Set(["shipped", "delivered", "partially_delivered", "unclaimed"]);
const CLOSED_ORDER = new Set(["shipped", "completed", "cancelled"]);

export function getPartyContextHints(input: {
  records: PartyLinkedRecords;
  hasDeliveryPoint: boolean;
  now: Date;
}): PartyContextHint[] {
  const { records, hasDeliveryPoint, now } = input;
  const hints: PartyContextHint[] = [];

  if (!hasDeliveryPoint) {
    for (const order of records.orders) {
      if (CLOSED_ORDER.has(order.status ?? "")) continue;
      if (SHIPPED_DELIVERY.has(order.delivery_status ?? "")) continue;
      hints.push({ kind: "order_without_delivery", orderId: order.id, orderNumber: order.number ?? "Замовлення" });
    }
  }

  for (const quote of records.calculations) {
    const status = quote.status ?? "";
    // null — суму ще рахують з тиражів; «0 ₴» кажемо лише про пораховану.
    if (APPROVED.has(status) && quote.total != null && Number(quote.total) === 0) {
      hints.push({ kind: "approved_zero_total", quoteId: quote.id, quoteNumber: quote.number ?? "Прорахунок" });
      continue;
    }
    if (AWAITING_CLIENT.has(status)) {
      const movedAt = new Date(quote.updated_at ?? quote.created_at ?? "").getTime();
      if (!Number.isFinite(movedAt)) continue;
      const days = Math.floor((now.getTime() - movedAt) / DAY_MS);
      if (days > STALE_OFFER_DAYS) {
        hints.push({ kind: "stale_offer", quoteId: quote.id, quoteNumber: quote.number ?? "Прорахунок", days });
      }
    }
  }

  return hints;
}
