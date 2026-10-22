import { describe, expect, it, vi } from "vitest";

import { THREAD_EVENT_ACTIONS } from "@/features/taskChat/threadEvents";

import { ORDER_PURCHASE_EVENT, orderPurchaseEventTitle } from "./orderPurchaseEvents";

// threadEvents тягне клієнт бази; для переліку дій він не потрібен.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

describe("рядки стрічки про закупки", () => {
  it("подія є у білому списку стрічки замовлення", () => {
    expect(ORDER_PURCHASE_EVENT).toBe("order_purchase");
    expect(THREAD_EVENT_ACTIONS).toContain(ORDER_PURCHASE_EVENT);
  });

  it("заголовки дослівні", () => {
    expect(orderPurchaseEventTitle.created).toBe("Внесено закупку");
    expect(orderPurchaseEventTitle.paid).toBe("Закупку оплачено");
    expect(orderPurchaseEventTitle.paymentCancelled("Помилка в сумі")).toBe("Скасовано оплату закупки: Помилка в сумі");
    expect(orderPurchaseEventTitle.received).toBe("Товар отримано");
    expect(orderPurchaseEventTitle.noneSet).toBe("Позначено: закупок немає");
    expect(orderPurchaseEventTitle.noneUnset).toBe("Знято позначку «закупок немає»");
  });

  it("заголовки не містять сум і назви постачальника", () => {
    // Закупка «Коробка-200 шт», постачальник «КОРОБКА», сума 5 250,30.
    const titles = [
      orderPurchaseEventTitle.created,
      orderPurchaseEventTitle.paid,
      orderPurchaseEventTitle.paymentCancelled("Подвійне внесення"),
      orderPurchaseEventTitle.received,
      orderPurchaseEventTitle.noneSet,
      orderPurchaseEventTitle.noneUnset,
    ];
    for (const title of titles) {
      expect(title).not.toMatch(/\d/);
      expect(title.toLowerCase()).not.toContain("коробка");
      expect(title).not.toContain("5 250");
    }
  });
});
