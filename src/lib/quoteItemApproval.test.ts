import { describe, expect, it } from "vitest";

import {
  filterIncludedQuoteItems,
  hasQuoteItemChoice,
  isQuoteItemDeclined,
  isQuoteItemIncluded,
  needsQuoteItemChoice,
  summarizeQuoteItemChoice,
} from "./quoteItemApproval";

describe("isQuoteItemIncluded", () => {
  /**
   * НАЙВАЖЛИВІШИЙ ТЕСТ У ФАЙЛІ. На день міграції всі 333 позиції в базі мають
   * `is_approved = null`, і якби правило читало його як «не взяли», підсумки
   * 305 прорахунків стали б нулями. Саме тому тут `!== false`, а не `=== true`.
   */
  it("рахує позицію, про яку не питали", () => {
    expect(isQuoteItemIncluded({ is_approved: null })).toBe(true);
    expect(isQuoteItemIncluded({})).toBe(true);
    expect(isQuoteItemIncluded({ is_approved: undefined })).toBe(true);
  });

  it("рахує позицію, яку клієнт узяв", () => {
    expect(isQuoteItemIncluded({ is_approved: true })).toBe(true);
  });

  it("не рахує позицію, від якої клієнт відмовився", () => {
    expect(isQuoteItemIncluded({ is_approved: false })).toBe(false);
  });
});

describe("isQuoteItemDeclined", () => {
  it("відмова — це лише явне false, не порожнеча", () => {
    expect(isQuoteItemDeclined({ is_approved: false })).toBe(true);
    expect(isQuoteItemDeclined({ is_approved: null })).toBe(false);
    expect(isQuoteItemDeclined({})).toBe(false);
    expect(isQuoteItemDeclined({ is_approved: true })).toBe(false);
  });
});

describe("filterIncludedQuoteItems", () => {
  it("лишає взяте й не питане, прибирає відмовлене", () => {
    const items = [
      { id: "lido", is_approved: true },
      { id: "reflect", is_approved: false },
      { id: "odessa", is_approved: null },
    ];
    expect(filterIncludedQuoteItems(items).map((item) => item.id)).toEqual(["lido", "odessa"]);
  });

  /** Живий випадок TS-0826-0036: три парасольки, клієнт узяв одну. */
  it("зводить три альтернативи до однієї обраної", () => {
    const items = [
      { id: "lido", is_approved: true },
      { id: "reflect", is_approved: false },
      { id: "odessa", is_approved: false },
    ];
    expect(filterIncludedQuoteItems(items)).toHaveLength(1);
  });

  it("не чіпає прорахунок, якого питання не торкалось", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }].map((item) => ({
      ...item,
      is_approved: null,
    }));
    expect(filterIncludedQuoteItems(items)).toHaveLength(3);
  });
});

describe("hasQuoteItemChoice", () => {
  it("мовчить, поки питання не ставили", () => {
    expect(hasQuoteItemChoice([{ is_approved: null }, {}])).toBe(false);
  });

  /**
   * «Підтвердила всі три» — це теж відповідь, і вона мусить відрізнятись від
   * «діалогу не було»: інакше менеджер не бачить, чи її вибір зберігся.
   */
  it("бачить відповідь навіть коли взяли все", () => {
    expect(hasQuoteItemChoice([{ is_approved: true }, { is_approved: true }])).toBe(true);
  });

  it("бачить відповідь, коли щось відхилили", () => {
    expect(hasQuoteItemChoice([{ is_approved: true }, { is_approved: false }])).toBe(true);
  });
});

describe("needsQuoteItemChoice", () => {
  it("не питає, коли позиція одна — вибирати нема з чого", () => {
    expect(needsQuoteItemChoice([{ is_approved: null }])).toBe(false);
    expect(needsQuoteItemChoice([])).toBe(false);
  });

  it("питає, коли позицій кілька", () => {
    expect(needsQuoteItemChoice([{ is_approved: null }, { is_approved: null }])).toBe(true);
  });
});

describe("summarizeQuoteItemChoice", () => {
  it("рахує взяті й відхилені", () => {
    expect(
      summarizeQuoteItemChoice([
        { is_approved: true },
        { is_approved: false },
        { is_approved: false },
      ])
    ).toEqual({ included: 1, declined: 2, total: 3 });
  });

  it("не питане вважає взятим", () => {
    expect(summarizeQuoteItemChoice([{ is_approved: null }, {}])).toEqual({
      included: 2,
      declined: 0,
      total: 2,
    });
  });
});
