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
      requirements: [],
      unsavedRunCount: 0,
      ...overrides,
    },
  });

describe("useQuoteRunsSaveState", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("нічого не змінилось — нічого й не пишемо", () => {
    const { result } = setup();
    expect(result.current.stateForItem("item-1").status).toBe("idle");
  });

  it("правка чекає на автозбереження — «Зберігаю…»", () => {
    const { result } = setup({ runs: [run({ quantity: 1000 })] });
    expect(result.current.stateForItem("item-1").status).toBe("pending");
  });

  it("гейт тримає правку — «не збережено», а не вічне «Зберігаю…»", () => {
    const { result } = setup({
      runs: [run({ quantity: 1000 })],
      requirements: ["Дедлайн прорахунку"],
    });
    expect(result.current.stateForItem("item-1").status).toBe("blocked");
  });

  /**
   * РЕГРЕС REQ-281. Причина була в застосунку й до цього — банером УГОРІ
   * картки, — але людина працює внизу, у блоці тиражів, і бачила саму лише
   * червону мітку. Мітка має називати, що заповнити.
   */
  it("мітка каже, ЩО саме заповнити", () => {
    const { result } = setup({
      runs: [run({ quantity: 1000 })],
      requirements: ["Дедлайн прорахунку"],
    });
    expect(result.current.stateForItem("item-1").reason).toBe("заповніть: Дедлайн прорахунку");
  });

  it("гейт ПДВ має власну причину, і поля прорахунку важливіші за нього", () => {
    const { result } = setup({ runs: [run({ quantity: 1000 })], unsavedRunCount: 1 });
    expect(result.current.stateForItem("item-1").reason).toBe("вкажіть, з ПДВ вартість товару чи без");

    const { result: both } = setup({
      runs: [run({ quantity: 1000 })],
      requirements: ["Дедлайн прорахунку"],
      unsavedRunCount: 1,
    });
    expect(both.current.stateForItem("item-1").reason).toBe("заповніть: Дедлайн прорахунку");
  });

  it("нічого не тримає — причини немає", () => {
    const { result } = setup();
    expect(result.current.stateForItem("item-1").reason).toBeNull();
  });

  it("квитанція «Збережено» гасне сама", () => {
    const { result } = setup();
    act(() => result.current.markSaved([run({ quantity: 1000 })], [run()]));
    expect(result.current.stateForItem("item-1").status).toBe("saved");

    act(() => void vi.advanceTimersByTime(3_000));
    expect(result.current.stateForItem("item-1").status).toBe("idle");
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
    expect(result.current.stateForItem("item-1").status).toBe("blocked");
    expect(result.current.stateForItem("item-1").reason).toBe("база відмовила — правка лишилась у браузері");

    rerender({
      runs: [run({ quantity: 1500 })],
      savedRuns: [run()],
      pristineDraft: null,
      saving: false,
      requirements: [],
      unsavedRunCount: 0,
    });
    expect(result.current.retryHalted).toBe(false);
    expect(result.current.stateForItem("item-1").status).toBe("pending");
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
