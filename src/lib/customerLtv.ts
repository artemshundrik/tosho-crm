/**
 * Customer LTV (Lifetime Value) — MVP, frontend-only aggregation.
 *
 * Status: READ-ONLY EXPERIMENT. No DB changes, no schema migrations.
 * Reuses existing `loadDerivedOrders` from `@/features/orders/orderRecords`.
 *
 * To remove this feature cleanly:
 *  1. Delete this file.
 *  2. Remove the imports + the `customerLtvMap` state + the `LTV` table column
 *     from `src/pages/OrdersCustomersPage.tsx` (search for "LTV" comments).
 *
 * Caveats (intentional, documented for v1):
 *  - Counts ALL derived orders (stored + approved-quote-derived). For a B2B
 *    print/merch CRM that is a good approximation of "revenue realised", but
 *    it does NOT exclude cancelled/refunded orders — future iteration can
 *    filter by `orderStatus`.
 *  - Currency aware: groups totals per currency. If a customer has mixed
 *    currencies, the dominant one (by total absolute value) is surfaced for
 *    display and a `mixedCurrencies` flag is set.
 *  - No COGS / margin awareness — this is gross revenue, not profit.
 */

import type { DerivedOrderRecord } from "@/features/orders/orderRecords";

export type CustomerLtvEntry = {
  /** Aggregate revenue across all currencies (raw sum, only meaningful when mixedCurrencies is false). */
  lifetimeRevenue: number;
  /** Number of orders contributing to the total. */
  ordersCount: number;
  /** ISO timestamp of the most recent order, or null if unknown. */
  lastOrderAt: string | null;
  /** Dominant currency code (e.g. "UAH"). */
  currency: string;
  /** True if the customer has orders in more than one currency. */
  mixedCurrencies: boolean;
};

const DEFAULT_CURRENCY = "UAH";

/**
 * Group derived orders by `customerId` and produce an LTV entry per customer.
 * Orders without a `customerId` are skipped silently.
 */
export function aggregateCustomerLtv(
  orders: readonly DerivedOrderRecord[]
): Map<string, CustomerLtvEntry> {
  // First pass: bucket by customerId, then by currency.
  const buckets = new Map<string, Map<string, { sum: number; count: number; lastAt: string | null }>>();

  for (const order of orders) {
    const customerId = order.customerId?.trim();
    if (!customerId) continue;
    const total = typeof order.total === "number" && Number.isFinite(order.total) ? order.total : 0;
    if (total === 0) continue; // skip zero-total orders (drafts, no items)
    const currency = (order.currency || DEFAULT_CURRENCY).toUpperCase();
    const createdAt = order.createdAt ?? null;

    let perCurrency = buckets.get(customerId);
    if (!perCurrency) {
      perCurrency = new Map();
      buckets.set(customerId, perCurrency);
    }
    const slot = perCurrency.get(currency) ?? { sum: 0, count: 0, lastAt: null };
    slot.sum += total;
    slot.count += 1;
    if (createdAt && (!slot.lastAt || createdAt > slot.lastAt)) {
      slot.lastAt = createdAt;
    }
    perCurrency.set(currency, slot);
  }

  // Second pass: pick dominant currency per customer.
  const result = new Map<string, CustomerLtvEntry>();
  for (const [customerId, perCurrency] of buckets.entries()) {
    let dominantCurrency = DEFAULT_CURRENCY;
    let dominantSum = -Infinity;
    let totalOrders = 0;
    let latestAt: string | null = null;
    for (const [currency, slot] of perCurrency.entries()) {
      totalOrders += slot.count;
      if (slot.lastAt && (!latestAt || slot.lastAt > latestAt)) latestAt = slot.lastAt;
      const absSum = Math.abs(slot.sum);
      if (absSum > dominantSum) {
        dominantSum = absSum;
        dominantCurrency = currency;
      }
    }
    const dominantSlot = perCurrency.get(dominantCurrency)!;
    result.set(customerId, {
      lifetimeRevenue: dominantSlot.sum,
      ordersCount: totalOrders,
      lastOrderAt: latestAt,
      currency: dominantCurrency,
      mixedCurrencies: perCurrency.size > 1,
    });
  }
  return result;
}

/* ----------------------------- RFM segmentation ---------------------------- */

/**
 * RFM-based customer segment. Simplified from the classic 5x5x5 model into
 * 5 actionable buckets that map to typical B2B merch/print workflows.
 *
 * Rules (in priority order, first match wins):
 *  - champion  : top-quintile monetary AND recency < 90d AND ordersCount >= 3
 *  - new       : exactly 1 order AND recency < 90d  (just landed, nurture)
 *  - loyal     : ordersCount >= 3 AND recency < 180d
 *  - at_risk   : ordersCount >= 2 AND recency in [180d, 365d]  (slipping)
 *  - dormant   : recency > 365d  (lost or hibernating)
 *  - none      : no orders / no data
 *  - default   : "loyal" fallback for "recent, 2 orders"
 */
export type RfmSegment =
  | "champion"
  | "new"
  | "loyal"
  | "at_risk"
  | "dormant"
  | "none";

export const RFM_SEGMENT_LABELS: Record<RfmSegment, string> = {
  champion: "Champion",
  new: "Новий",
  loyal: "Лояльний",
  at_risk: "Зникає",
  dormant: "Сплячий",
  none: "Без замовлень",
};

/** Per-segment Badge tone — uses semantic design tokens from src/components/ui/badge.tsx. */
export const RFM_SEGMENT_TONE: Record<
  RfmSegment,
  "success" | "info" | "warning" | "neutral" | "accent"
> = {
  champion: "success",
  new: "accent",
  loyal: "info",
  at_risk: "warning",
  dormant: "neutral",
  none: "neutral",
};

const DAY_MS = 86_400_000;

/** Compute the monetary value at the given quintile (default 0.8 = top 20%). */
export function computeMonetaryQuintile(
  ltvMap: ReadonlyMap<string, CustomerLtvEntry>,
  quintile = 0.8
): number {
  const values: number[] = [];
  for (const entry of ltvMap.values()) {
    if (entry.lifetimeRevenue > 0) values.push(entry.lifetimeRevenue);
  }
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  const idx = Math.min(Math.floor(values.length * quintile), values.length - 1);
  return values[idx];
}

/** Compute the RFM segment for a single customer entry. */
export function computeRfmSegment(
  entry: CustomerLtvEntry | undefined,
  context: { topQuintileMonetary: number; now?: Date }
): RfmSegment {
  if (!entry || entry.ordersCount === 0) return "none";
  const now = context.now ?? new Date();
  const recencyDays = entry.lastOrderAt
    ? (now.getTime() - new Date(entry.lastOrderAt).getTime()) / DAY_MS
    : Number.POSITIVE_INFINITY;
  const F = entry.ordersCount;
  const M = entry.lifetimeRevenue;

  if (M >= context.topQuintileMonetary && recencyDays < 90 && F >= 3) return "champion";
  if (F === 1 && recencyDays < 90) return "new";
  if (F >= 3 && recencyDays < 180) return "loyal";
  if (F >= 2 && recencyDays >= 180 && recencyDays <= 365) return "at_risk";
  if (recencyDays > 365) return "dormant";
  return "loyal";
}

/** Pre-compute segments for all customers at once. */
export function buildSegmentMap(
  ltvMap: ReadonlyMap<string, CustomerLtvEntry>,
  now: Date = new Date()
): Map<string, RfmSegment> {
  const topQuintileMonetary = computeMonetaryQuintile(ltvMap, 0.8);
  const out = new Map<string, RfmSegment>();
  for (const [customerId, entry] of ltvMap.entries()) {
    out.set(customerId, computeRfmSegment(entry, { topQuintileMonetary, now }));
  }
  return out;
}

/**
 * Build a tooltip explaining the figure — useful because LTV semantics
 * are easy to misread ("gross or net?", "what counts as an order?").
 */
export function buildCustomerLtvTooltip(entry: CustomerLtvEntry): string {
  const parts: string[] = [];
  parts.push(`${entry.ordersCount} замовлень`);
  if (entry.lastOrderAt) {
    const date = new Date(entry.lastOrderAt);
    if (!Number.isNaN(date.getTime())) {
      parts.push(`останнє: ${date.toLocaleDateString("uk-UA")}`);
    }
  }
  if (entry.mixedCurrencies) {
    parts.push(`показано у ${entry.currency} (є замовлення в інших валютах)`);
  }
  parts.push("Сума по всіх замовленнях, без врахування собівартості.");
  return parts.join(" · ");
}
