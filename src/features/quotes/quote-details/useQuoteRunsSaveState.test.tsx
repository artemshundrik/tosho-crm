import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { useQuoteRunsSaveState } from "./useQuoteRunsSaveState";
import type { QuoteRun } from "@/lib/toshoApi";

/**
 * Відклик автозбереження тиражів (REQ-278). Перевіряється саме те, у що людина
 * вірить, дивлячись на напис: «Зберігаю…» означає «їде», «Збережено» — «доїхало
 * щойно», «не збережено» — «у базі цього немає».
 */

const run = (overrides: Partial<QuoteRun> = {}): QuoteRun =>
  ({
    id: "r1",
    quote_item_id: "item-1",
    quantity: 10,
    unit_price_model: 100,
    unit_price_print: 0,
    logistics_cost: 0,
    desired_manager_income: 0,
    markup_rate: 40,
    manager_rate: 10,
    fixed_cost_rate: 30,
    vat_rate: 20,
    is_approved: false,
    ...overrides,
  }) as QuoteRun;

const setup = (overrides: Partial<Parameters<typeof useQuoteRunsSaveState>[0]> = {}) =>
  renderHook((props: Parameters<typeof useQuoteRunsSaveState>[0]) => useQuoteRunsSaveState(props), {
    initialProps: {
      runs: [run()],
      savedRuns: [run()],
      pristineDraft: null,
      saving: false,
      blocked: false,
      ...overrides,
    },
  });

describe("useQuoteRunsSaveState", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("нічого не змінилось — нічого й не пишемо", () => {
    const { result } = setup();
    expect(result.current.stateForItem("item-1")).toBe("idle");
  });

  it("правка чекає на автозбереження — «Зберігаю…»", () => {
    const { result } = setup({ runs: [run({ quantity: 1000 })] });
    expect(result.current.stateForItem("item-1")).toBe("pending");
  });

  it("гейт тримає правку — «не збережено», а не вічне «Зберігаю…»", () => {
    const { result } = setup({ runs: [run({ quantity: 1000 })], blocked: true });
    expect(result.current.stateForItem("item-1")).toBe("blocked");
  });

  it("квитанція «Збережено» гасне сама", () => {
    const { result } = setup();
    act(() => result.current.markSaved([run({ quantity: 1000 })], [run()]));
    expect(result.current.stateForItem("item-1")).toBe("saved");

    act(() => void vi.advanceTimersByTime(3_000));
    expect(result.current.stateForItem("item-1")).toBe("idle");
  });

  /**
   * ЗАМІРЯНО НА ЖИВОМУ (прогін під наскрізним сторожем): заблокований запис
   * давав СІМ спроб за шість секунд і стільки ж тостів, бо невдача не знімає
   * розбіжності підпису. Латка тримається до наступної правки.
   */
  it("після відмови автозбереження спиняється — до наступної правки", () => {
    const attempted = [run({ quantity: 1000 })];
    const { result, rerender } = setup({ runs: attempted });

    act(() => result.current.markFailed(attempted));
    expect(result.current.retryHalted).toBe(true);
    expect(result.current.stateForItem("item-1")).toBe("blocked");

    rerender({
      runs: [run({ quantity: 1500 })],
      savedRuns: [run()],
      pristineDraft: null,
      saving: false,
      blocked: false,
    });
    expect(result.current.retryHalted).toBe(false);
    expect(result.current.stateForItem("item-1")).toBe("pending");
  });

  it("успішне збереження знімає латку", () => {
    const attempted = [run({ quantity: 1000 })];
    const { result } = setup({ runs: attempted });

    act(() => result.current.markFailed(attempted));
    expect(result.current.retryHalted).toBe(true);

    act(() => result.current.markSaved(attempted, [run()]));
    expect(result.current.retryHalted).toBe(false);
  });
});
