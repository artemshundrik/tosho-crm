import { describe, expect, it } from "vitest";

import {
  buildLaunchPath,
  buildOrderPaymentParts,
  formatPaymentTermsChip,
  type LaunchPathInput,
} from "./orderLaunchPath";

/**
 * «Шлях до запуску» на картці замовлення показує лише умови свого способу
 * оплати (СЕО, 14.10.2026): на готівці — передоплату, на безготівці — договір,
 * СП і оплату за умовами. Підписів і воріт ще немає в даних (p7, p8), тож
 * кроки рахуються з того, що CRM знає сьогодні.
 */
const cash: LaunchPathInput = {
  paymentMethodId: "cash",
  paymentRail: "Готівкові / на карту",
  total: 5238,
  prepaymentPct: 70,
  balancePct: 30,
  balanceTiming: "before_shipment",
  balanceDaysAfterShipment: null,
  balanceDaysKind: "working",
  paymentTerms: "70/30",
  paymentStatus: "awaiting_payment",
  orderStatus: "approved",
  contractCreatedAt: null,
  specificationCreatedAt: null,
};

const cashless: LaunchPathInput = {
  ...cash,
  paymentMethodId: "bank_uah",
  paymentRail: "Безготівкові, грн.",
  total: 99360,
};

const stateOf = (input: LaunchPathInput) =>
  buildLaunchPath(input).steps.map((step) => `${step.key}:${step.state}`);

describe("buildLaunchPath", () => {
  it("готівка без передоплати чекає передоплату, запуск закритий", () => {
    const path = buildLaunchPath(cash);
    expect(path.heading).toBe("Готівка, 70/30");
    expect(path.blocker).toBe("Чекає передоплату");
    expect(stateOf(cash)).toEqual(["prepayment:current", "launch:locked", "balance:todo", "shipment:todo"]);
  });

  it("готівка з передоплатою відкриває запуск", () => {
    const paid = { ...cash, paymentStatus: "partially_paid" };
    expect(stateOf(paid)).toEqual(["prepayment:done", "launch:current", "balance:todo", "shipment:todo"]);
    expect(buildLaunchPath(paid).blocker).toBeNull();
  });

  it("готівка 100% наперед не має кроку доплати", () => {
    const full = { ...cash, prepaymentPct: 100, balancePct: 0 };
    expect(stateOf(full).map((s) => s.split(":")[0])).toEqual(["prepayment", "launch", "shipment"]);
  });

  it("запущене замовлення позначає запуск зробленим", () => {
    const launched = { ...cash, paymentStatus: "partially_paid", orderStatus: "in_production" };
    expect(stateOf(launched)).toEqual(["prepayment:done", "launch:done", "balance:todo", "shipment:todo"]);
  });

  it("безготівка без договору чекає договір", () => {
    const path = buildLaunchPath(cashless);
    expect(path.heading).toBe("Безготівка, 70/30");
    expect(path.blocker).toBe("Бракує договору");
    expect(stateOf(cashless)).toEqual(["contract:current", "specification:todo", "payment:todo", "launch:locked"]);
  });

  it("безготівка з договором і СП чекає оплату", () => {
    const input = { ...cashless, contractCreatedAt: "2026-10-14", specificationCreatedAt: "2026-10-14" };
    expect(buildLaunchPath(input).blocker).toBe("Чекає передоплату");
    expect(stateOf(input)).toEqual(["contract:done", "specification:done", "payment:current", "launch:locked"]);
  });

  it("повне відтермінування: оплата до запуску не потрібна", () => {
    const deferred = {
      ...cashless,
      prepaymentPct: 0,
      balancePct: 100,
      balanceTiming: "after_shipment" as const,
      balanceDaysAfterShipment: 14,
      balanceDaysKind: "calendar" as const,
      contractCreatedAt: "2026-10-14",
      specificationCreatedAt: "2026-10-14",
    };
    const path = buildLaunchPath(deferred);
    expect(path.heading).toBe("Безготівка, оплата після відвантаження");
    expect(path.steps.find((s) => s.key === "payment")).toMatchObject({
      state: "done",
      note: "До запуску не потрібна: 100% за 14 к.д. від ВН",
    });
    expect(path.blocker).toBeNull();
  });
});

describe("buildOrderPaymentParts", () => {
  it("ділить суму за умовами", () => {
    expect(buildOrderPaymentParts(cash)).toEqual([
      { key: "prepayment", label: "Наперед", amount: 3666.6, pct: 70 },
      { key: "balance", label: "До відвантаження", amount: 1571.4, pct: 30 },
    ]);
  });

  it("після відвантаження пише строк", () => {
    const parts = buildOrderPaymentParts({
      ...cashless,
      prepaymentPct: 0,
      balancePct: 100,
      balanceTiming: "after_shipment",
      balanceDaysAfterShipment: 14,
    });
    expect(parts.map((p) => p.label)).toEqual(["Наперед", "Після ВН, до 14 р.д."]);
  });

  it("без розбивки — одна частина на всю суму", () => {
    expect(buildOrderPaymentParts({ ...cash, prepaymentPct: null, balancePct: null, paymentTerms: "" })).toEqual([
      { key: "balance", label: "До оплати", amount: 5238, pct: 100 },
    ]);
  });
});

describe("formatPaymentTermsChip", () => {
  it("розбивка, відтермінування і її відсутність", () => {
    expect(formatPaymentTermsChip(cash)).toBe("70/30");
    expect(
      formatPaymentTermsChip({
        ...cashless,
        prepaymentPct: 0,
        balancePct: 100,
        balanceTiming: "after_shipment",
        balanceDaysAfterShipment: 14,
      })
    ).toBe("Відтермінування 14 р.д.");
    expect(formatPaymentTermsChip({ ...cash, prepaymentPct: null, balancePct: null, paymentTerms: "" })).toBeNull();
  });
});

/**
 * Старі замовлення мають лише код умов (`payment_terms`) без явних відсотків.
 * Картка показувала сирий «100_prepaid» і суму без поділу.
 */
describe("умови з коду payment_terms", () => {
  const legacy = { ...cashless, prepaymentPct: null, balancePct: null };

  it("100% передплата", () => {
    const input = { ...legacy, paymentTerms: "100_prepaid" };
    expect(formatPaymentTermsChip(input)).toBe("100% наперед");
    expect(buildOrderPaymentParts(input).map((p) => [p.label, p.pct])).toEqual([
      ["Наперед", 100],
      ["До відвантаження", 0],
    ]);
    expect(buildLaunchPath(input).heading).toBe("Безготівка, 100% наперед");
  });

  it("100% після готовності — не відтермінування: платять до відвантаження", () => {
    const input = {
      ...legacy,
      paymentTerms: "100_after",
      contractCreatedAt: "2026-10-14",
      specificationCreatedAt: "2026-10-14",
    };
    expect(formatPaymentTermsChip(input)).toBe("100% після готовності");
    const path = buildLaunchPath(input);
    expect(path.heading).toBe("Безготівка, 100% після готовності");
    expect(path.steps.find((s) => s.key === "payment")).toMatchObject({
      state: "done",
      note: "До запуску не потрібна: 100% після готовності, до відвантаження",
    });
  });
});

describe("після рецензії картки", () => {
  it("крипта — не готівка: без правила 50% і без слова «Готівка»", () => {
    const crypto = { ...cash, paymentMethodId: "crypto", paymentRail: "Криптовалюта" };
    const path = buildLaunchPath(crypto);
    expect(path.heading).toBe("Криптовалюта, 70/30");
    expect(path.steps[0].note).toBe("70% до запуску");
  });

  it("крипта 0% наперед не блокує запуск", () => {
    const crypto = { ...cash, paymentMethodId: "crypto", paymentRail: "Криптовалюта", prepaymentPct: 0, balancePct: 100 };
    const path = buildLaunchPath(crypto);
    expect(path.blocker).toBeNull();
    expect(path.steps[0]).toMatchObject({ state: "done", note: "До запуску не потрібна" });
  });

  it("запущене безготівкове замовлення без договору не кричить «Бракує договору»", () => {
    expect(buildLaunchPath({ ...cashless, orderStatus: "in_production" }).blocker).toBeNull();
  });

  it("відвантажене замовлення закриває крок відвантаження", () => {
    const shipped = { ...cash, paymentStatus: "fully_paid", orderStatus: "shipped" };
    expect(buildLaunchPath(shipped).steps.find((s) => s.key === "shipment")?.state).toBe("done");
  });
});
