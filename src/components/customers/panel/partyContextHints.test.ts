import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import type { PartyLinkedItem, PartyLinkedRecords } from "../partyLinkedRecords";
import { getPartyContextHints } from "./partyContextHints";

const NOW = new Date("2026-11-01T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const records = (patch: Partial<PartyLinkedRecords>): PartyLinkedRecords => ({
  calculations: [],
  orders: [],
  designTasks: [],
  ltvEntry: null,
  ...patch,
});
const quote = (patch: Partial<PartyLinkedItem>): PartyLinkedItem => ({
  id: "q1",
  number: "TS-1026-0029",
  status: "estimated",
  total: 1000,
  created_at: daysAgo(1),
  updated_at: daysAgo(1),
  ...patch,
});

describe("getPartyContextHints", () => {
  it("погоджений прорахунок із сумою 0 ₴", () => {
    const hints = getPartyContextHints({
      records: records({ calculations: [quote({ status: "approved", total: 0 })] }),
      hasDeliveryPoint: true,
      now: NOW,
    });
    expect(hints).toEqual([{ kind: "approved_zero_total", quoteId: "q1", quoteNumber: "TS-1026-0029" }]);
  });

  it("суми ще не пораховано (total = null) — про «0 ₴» не кажемо", () => {
    const hints = getPartyContextHints({
      records: records({ calculations: [quote({ status: "approved", total: null })] }),
      hasDeliveryPoint: true,
      now: NOW,
    });
    expect(hints).toEqual([]);
  });

  it("КП на погодженні без руху понад 60 днів", () => {
    const stale = getPartyContextHints({
      records: records({ calculations: [quote({ status: "awaiting_approval", updated_at: daysAgo(61) })] }),
      hasDeliveryPoint: true,
      now: NOW,
    });
    expect(stale).toEqual([{ kind: "stale_offer", quoteId: "q1", quoteNumber: "TS-1026-0029", days: 61 }]);
    const fresh = getPartyContextHints({
      records: records({ calculations: [quote({ status: "awaiting_approval", updated_at: daysAgo(59) })] }),
      hasDeliveryPoint: true,
      now: NOW,
    });
    expect(fresh).toEqual([]);
  });

  it("незвантажене замовлення без адреси доставки", () => {
    const order: PartyLinkedItem = { id: "o1", number: "TO-1026-0011", status: "in_production", delivery_status: "not_shipped" };
    expect(getPartyContextHints({ records: records({ orders: [order] }), hasDeliveryPoint: false, now: NOW })).toEqual([
      { kind: "order_without_delivery", orderId: "o1", orderNumber: "TO-1026-0011" },
    ]);
    expect(getPartyContextHints({ records: records({ orders: [order] }), hasDeliveryPoint: true, now: NOW })).toEqual([]);
  });

  it("відвантажене чи скасоване замовлення адреси вже не просить", () => {
    const shipped: PartyLinkedItem = { id: "o1", number: "TO-1", status: "in_production", delivery_status: "shipped" };
    const cancelled: PartyLinkedItem = { id: "o2", number: "TO-2", status: "cancelled", delivery_status: "not_shipped" };
    expect(
      getPartyContextHints({ records: records({ orders: [shipped, cancelled] }), hasDeliveryPoint: false, now: NOW })
    ).toEqual([]);
  });
});
