import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import { quoteBriefFallback } from "./designTaskQuoteBrief";

// REQ-330: TS-1026-0007 — три задачі, ТЗ лише в пакета; пляшка й килимок
// показували ТЗ пакета, бо брали ТЗ прорахунку як запасне.
describe("ТЗ прорахунку як запасне ТЗ задачі", () => {
  const quoteBrief = "https://totobi.com.ua/…/paket-podarunkoviy-drinka-tm-totobi/\nось пакетік тільки чорним кольором";

  it("три задачі на прорахунку — чужого ТЗ не показуємо", () => {
    expect(quoteBriefFallback({ quoteTaskCount: 3, quoteBrief })).toBeNull();
  });

  it("задача одна — ТЗ прорахунку і є її ТЗ", () => {
    expect(quoteBriefFallback({ quoteTaskCount: 1, quoteBrief })).toBe(quoteBrief);
  });

  it("не вдалось порахувати (0) — теж не показуємо", () => {
    expect(quoteBriefFallback({ quoteTaskCount: 0, quoteBrief })).toBeNull();
  });

  it("порожнє ТЗ прорахунку — коментар, як і раніше", () => {
    expect(quoteBriefFallback({ quoteTaskCount: 1, quoteBrief: "  ", quoteComment: "коментар" })).toBe("коментар");
  });
});
