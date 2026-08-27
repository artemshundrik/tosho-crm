import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchDesignTaskQuoteItem, resolveTaskQuoteItemId } from "./designTaskQuoteItem";

const ITEM_A = "11111111-1111-4111-8111-111111111111";
const QUOTE = "22222222-2222-4222-8222-222222222222";

/**
 * Заглушка веде журнал фільтрів — саме він доводить, що ми питаємо базу про ПОТРІБНУ
 * позицію, а не просто отримуємо правильну відповідь від доброї фікстури.
 */
function fakeSupabase(row: Record<string, unknown> | null = { name: "Куртка ALPINA", qty: 30, unit: "шт", methods: [] }) {
  const calls: { eq: Array<[string, unknown]>; ordered: boolean; limited: boolean } = {
    eq: [],
    ordered: false,
    limited: false,
  };
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      calls.eq.push([column, value]);
      return builder;
    },
    order: () => {
      calls.ordered = true;
      return builder;
    },
    limit: () => {
      calls.limited = true;
      return builder;
    },
    maybeSingle: async () => ({ data: row, error: null }),
  });
  const supabase = { schema: () => ({ from: () => builder }) } as unknown as SupabaseClient;
  return { supabase, calls };
}

describe("resolveTaskQuoteItemId", () => {
  it("бере id позиції з метаданих", () => {
    expect(resolveTaskQuoteItemId({ quote_item_id: ITEM_A })).toBe(ITEM_A);
  });

  it("поля немає — null, а не вигадане значення", () => {
    expect(resolveTaskQuoteItemId({})).toBeNull();
    expect(resolveTaskQuoteItemId(null)).toBeNull();
    expect(resolveTaskQuoteItemId("сміття")).toBeNull();
  });

  it("не-UUID не приймається — інакше запит мовчки не знайде нічого", () => {
    expect(resolveTaskQuoteItemId({ quote_item_id: "перша" })).toBeNull();
    expect(resolveTaskQuoteItemId({ quote_item_id: "" })).toBeNull();
    expect(resolveTaskQuoteItemId({ quote_item_id: 7 })).toBeNull();
  });
});

describe("fetchDesignTaskQuoteItem", () => {
  it("є quote_item_id — питаємо САМЕ цю позицію, без сортування за position", async () => {
    // Головний тест усього модуля: доти тут стояла перша позиція за position,
    // і задача на другий товар показувала перший.
    const { supabase, calls } = fakeSupabase();
    await fetchDesignTaskQuoteItem(supabase, QUOTE, { quote_item_id: ITEM_A });

    expect(calls.eq).toContainEqual(["id", ITEM_A]);
    expect(calls.ordered).toBe(false);
    expect(calls.limited).toBe(false);
  });

  it("поля немає — запасний варіант: перша позиція за position", async () => {
    // Старі задачі, заведені до появи вибору позиції.
    const { supabase, calls } = fakeSupabase();
    await fetchDesignTaskQuoteItem(supabase, QUOTE, {});

    expect(calls.eq).not.toContainEqual(["id", ITEM_A]);
    expect(calls.ordered).toBe(true);
    expect(calls.limited).toBe(true);
  });

  it("позицію прибрали з прорахунку — товару немає, а не сусідній", async () => {
    // Підставити сусідній означало б повернути ту саму брехню, тільки тихішу.
    const { supabase } = fakeSupabase(null);
    await expect(fetchDesignTaskQuoteItem(supabase, QUOTE, { quote_item_id: ITEM_A })).resolves.toBeNull();
  });

  it("завжди звіряємось із прорахунком задачі — чужа позиція не підтягнеться за самим id", async () => {
    const { supabase, calls } = fakeSupabase();
    await fetchDesignTaskQuoteItem(supabase, QUOTE, { quote_item_id: ITEM_A });
    expect(calls.eq).toContainEqual(["quote_id", QUOTE]);
  });
});

describe("регресія", () => {
  it("порожні метадані не валять читання", async () => {
    const spy = vi.fn();
    const { supabase } = fakeSupabase();
    await expect(fetchDesignTaskQuoteItem(supabase, QUOTE, undefined)).resolves.not.toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });
});
