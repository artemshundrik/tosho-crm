import { describe, expect, it } from "vitest";

import {
  canRequestMarkupApproval,
  isMarkupApprovalStillBinding,
  isMarkupBlockingRelease,
  isMarkupFrozen,
  resolveQuoteMarkupGate,
  resolveQuoteRunMarkupState,
  type QuoteMarkupApproval,
  markupGateMessage,
} from "@/lib/quoteMarkupApproval";
import { defaultMarkupRateFor, minMarkupRateFor } from "@/lib/quoteDealType";

const approval = (overrides: Partial<QuoteMarkupApproval> = {}): QuoteMarkupApproval => ({
  id: "a1",
  quoteId: "q1",
  runId: "r1",
  status: "pending",
  markupRate: 15,
  costTotal: 12_400,
  requestNote: null,
  requestedBy: "user-1",
  requestedAt: "2026-08-30T12:19:00.000Z",
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  ...overrides,
});

describe("resolveQuoteRunMarkupState", () => {
  it("тираж без собівартості — заготовка, поріг не вмикається", () => {
    expect(resolveQuoteRunMarkupState({ costTotal: 0, markupRate: 0, dealType: "standard" }).kind).toBe("draft");
  });

  it("на дні й вище — питати нема про що", () => {
    expect(resolveQuoteRunMarkupState({ costTotal: 12_400, markupRate: minMarkupRateFor("standard"), dealType: "standard" }).kind).toBe("ok");
    expect(
      resolveQuoteRunMarkupState({ costTotal: 12_400, markupRate: 50, dealType: "tender" }).kind
    ).toBe("ok");
  });

  it("нижче дна без запиту — «треба погодження»", () => {
    expect(resolveQuoteRunMarkupState({ costTotal: 12_400, markupRate: 15, dealType: "standard" }).kind).toBe("under");
  });

  it("живий запит показується як є", () => {
    const cases = [
      ["pending", "pending"],
      ["approved", "approved"],
      ["rejected", "rejected"],
    ] as const;
    for (const [status, expected] of cases) {
      const state = resolveQuoteRunMarkupState({
        costTotal: 12_400,
        markupRate: 15,
        approval: approval({ status }),
        dealType: "standard",
      });
      expect(state.kind).toBe(expected);
    }
  });

  it("відкликаний запит не рахується — тираж знову чекає на надсилання", () => {
    const state = resolveQuoteRunMarkupState({
      costTotal: 12_400,
      markupRate: 15,
      approval: approval({ status: "withdrawn" }),
      dealType: "standard",
    });
    expect(state.kind).toBe("under");
  });

  it("піднята на дно накрутка гасить навіть підтверджений запит", () => {
    const state = resolveQuoteRunMarkupState({
      costTotal: 12_400,
      markupRate: minMarkupRateFor("standard"),
      approval: approval({ status: "approved" }),
      dealType: "standard",
    });
    expect(state.kind).toBe("ok");
  });
});

describe("isMarkupApprovalStillBinding — діра «погодили 15 %, потім переписали»", () => {
  const decided = approval({ status: "approved" });

  it("те саме число — рішення діє", () => {
    expect(isMarkupApprovalStillBinding(decided, { markupRate: 15, costTotal: 12_400 })).toBe(true);
  });

  it("накрутка вниз — рішення злітає", () => {
    expect(isMarkupApprovalStillBinding(decided, { markupRate: 12, costTotal: 12_400 })).toBe(false);
    expect(
      resolveQuoteRunMarkupState({ costTotal: 12_400, markupRate: 12, approval: decided, dealType: "standard" }).kind
    ).toBe("under");
  });

  it("собівартість вниз — теж злітає: грошей стало менше", () => {
    expect(isMarkupApprovalStillBinding(decided, { markupRate: 15, costTotal: 9_000 })).toBe(false);
  });

  it("рух угору рішення не чіпає — погоджувача не смикають нешкідливою правкою", () => {
    expect(isMarkupApprovalStillBinding(decided, { markupRate: 18, costTotal: 12_400 })).toBe(true);
    expect(isMarkupApprovalStillBinding(decided, { markupRate: 15, costTotal: 15_000 })).toBe(true);
  });

  it("перенесені з історії дробові відсотки не відкривають запит наново", () => {
    const messy = approval({ status: "approved", markupRate: 15.840579710144926 });
    expect(isMarkupApprovalStillBinding(messy, { markupRate: 15.840579710144926, costTotal: 12_400 })).toBe(true);
  });
});

describe("двері й заморозка", () => {
  const stateFor = (status: QuoteMarkupApproval["status"] | null) =>
    resolveQuoteRunMarkupState({
      costTotal: 12_400,
      markupRate: 15,
      approval: status ? approval({ status }) : null,
      dealType: "standard",
    });

  it("двері замкнені, поки рішення немає — і «не надсилати» не є обхідним шляхом", () => {
    expect(isMarkupBlockingRelease(stateFor(null))).toBe(true);
    expect(isMarkupBlockingRelease(stateFor("pending"))).toBe(true);
    expect(isMarkupBlockingRelease(stateFor("rejected"))).toBe(true);
  });

  it("підтверджене рішення відмикає двері", () => {
    expect(isMarkupBlockingRelease(stateFor("approved"))).toBe(false);
  });

  it("двері не чіпають тираж без собівартості й тираж на дні", () => {
    expect(isMarkupBlockingRelease(resolveQuoteRunMarkupState({ costTotal: 0, markupRate: 0, dealType: "standard" }))).toBe(false);
    expect(isMarkupBlockingRelease(
        resolveQuoteRunMarkupState({
          costTotal: 12_400,
          markupRate: minMarkupRateFor("standard"),
          dealType: "standard",
        })
      )).toBe(false);
  });

  it("число заморожене на погодженні й після нього, а після відмови — ні", () => {
    expect(isMarkupFrozen(stateFor("pending"))).toBe(true);
    expect(isMarkupFrozen(stateFor("approved"))).toBe(true);
    expect(isMarkupFrozen(stateFor("rejected"))).toBe(false);
    expect(isMarkupFrozen(stateFor(null))).toBe(false);
  });

  it("надіслати запит можна з «треба погодження» і після відмови", () => {
    expect(canRequestMarkupApproval(stateFor(null))).toBe(true);
    expect(canRequestMarkupApproval(stateFor("rejected"))).toBe(true);
    expect(canRequestMarkupApproval(stateFor("pending"))).toBe(false);
    expect(canRequestMarkupApproval(stateFor("approved"))).toBe(false);
  });
});

describe("resolveQuoteMarkupGate", () => {
  it("двері тримає будь-який тираж, а не лише позначений клієнтом", () => {
    const gate = resolveQuoteMarkupGate(
      [
        { id: "r1", costTotal: 12_400, markupRate: minMarkupRateFor("standard") },
        { id: "r2", costTotal: 9_000, markupRate: 12 },
      ],
      "standard"
    );
    expect(gate.blocked).toBe(true);
    expect(gate.blockingRunIds).toEqual(["r2"]);
  });

  it("усі тиражі погоджені або в нормі — двері відкриті", () => {
    const gate = resolveQuoteMarkupGate(
      [
        { id: "r1", costTotal: 12_400, markupRate: minMarkupRateFor("standard") },
        { id: "r2", costTotal: 12_400, markupRate: 15, approval: approval({ status: "approved" }) },
        { id: "r3", costTotal: 0, markupRate: 0 },
      ],
      "standard"
    );
    expect(gate.blocked).toBe(false);
    expect(gate.blockingRunIds).toEqual([]);
  });
});

describe("дно залежить від типу угоди (REQ-182)", () => {
  it("та сама накрутка проходить на тендері й не проходить на кастомі", () => {
    // 50 % — між дном тендера (42,9) і дном малого тиражу (81,8). Саме заради
    // цього розриву шкалу й заводили: одне число на всі угоди робило тендер і
    // сотню кастомних блокнотів однаково дешевими.
    const run = { costTotal: 12_400, markupRate: 50 } as const;
    expect(resolveQuoteRunMarkupState({ ...run, dealType: "tender" }).kind).toBe("ok");
    expect(resolveQuoteRunMarkupState({ ...run, dealType: "standard" }).kind).toBe("under");
    expect(resolveQuoteRunMarkupState({ ...run, dealType: "custom" }).kind).toBe("under");
  });

  it("прорахунок на підставленому числі свого типу погодження не просить", () => {
    // Інакше картка сама просилась би на погодження одразу після створення.
    for (const type of ["tender", "standard", "design", "custom"] as const) {
      expect(
        resolveQuoteRunMarkupState({
          costTotal: 12_400,
          markupRate: defaultMarkupRateFor(type),
          dealType: type,
        }).kind
      ).toBe("ok");
    }
  });

  it("null — це мерч зі старим дном 20 %, а не «типу не вказали»", () => {
    // Рішення Артема 01.09.2026: шкала діє лише на поліграфії. 50 % нижче дна
    // будь-якого поліграфічного типу, але вище старих 20 % — і мерч має пройти.
    expect(resolveQuoteRunMarkupState({ costTotal: 12_400, markupRate: 50, dealType: null }).kind).toBe(
      "ok"
    );
    expect(resolveQuoteRunMarkupState({ costTotal: 12_400, markupRate: 19, dealType: null }).kind).toBe(
      "under"
    );
  });

  it("повідомлення гейта називає дно САМЕ цієї угоди", () => {
    expect(markupGateMessage("tender")).toContain("42,9");
    expect(markupGateMessage("custom")).toContain("81,8");
  });
});
