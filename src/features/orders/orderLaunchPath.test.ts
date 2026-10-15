import { describe, expect, it } from "vitest";

import {
  buildLaunchPath,
  buildOrderPaymentParts,
  getShipmentBlocker,
  formatPaymentTermsChip,
  type LaunchPathInput,
} from "./orderLaunchPath";

/**
 * «Шлях до запуску» на картці замовлення показує лише умови свого способу
 * оплати (СЕО, 14.10.2026): на готівці — передоплату, на безготівці — договір,
 * СП і оплату за умовами. Ворота запуску (p8): договір і СП зроблені, лише
 * коли підписані (p7); до підпису — погодження (p6).
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
  contractSignedAt: null,
  specificationSignedAt: null,
  inheritedContractOrderNumber: null,
  approvals: [],
  items: [],
  currency: "UAH",
  incotermsCode: "FCA",
  incotermsPlace: null,
  contractNumber: null,
  contractDate: null,
  contractProductionDays: null,
  contractAutoProlongation: false,
  ourLegalEntityId: null,
};

const SIGNED = {
  contractCreatedAt: "2026-10-14",
  specificationCreatedAt: "2026-10-14",
  contractSignedAt: "2026-10-15",
  specificationSignedAt: "2026-10-15",
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

  it("безготівка з підписаними договором і СП чекає оплату", () => {
    const input = { ...cashless, ...SIGNED };
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
      ...SIGNED,
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

describe("ворота запуску (p6–p8)", () => {
  const created = { ...cashless, contractCreatedAt: "2026-10-14", specificationCreatedAt: "2026-10-14" };
  const approval = (kind: "contract" | "specification" | "launch", status: "pending" | "approved", stamp: string | null = null) => ({
    id: `${kind}-${status}`,
    orderId: "o",
    kind,
    status,
    documentStamp: stamp,
    requestNote: kind === "launch" ? "Постійний клієнт" : null,
    requestedBy: "m",
    requestedAt: "2026-10-15T10:00:00Z",
    decidedBy: status === "approved" ? "a" : null,
    decidedAt: null,
    decisionNote: null,
  });

  it("створені, але не погоджені — запуск чекає погодження договору", () => {
    expect(buildLaunchPath(created).blocker).toBe("Договір не погоджено");
    expect(buildLaunchPath(created).steps[0].note).toBe("Створено — надіслати на погодження");
  });

  it("договір погоджено — далі погодження СП, потім підписи", () => {
    const withContract = { ...created, approvals: [approval("contract", "approved")] };
    expect(buildLaunchPath(withContract).blocker).toBe("СП не погоджено");
    const both = { ...withContract, approvals: [approval("contract", "approved"), approval("specification", "approved")] };
    expect(buildLaunchPath(both).blocker).toBe("Договір не підписано");
    expect(buildLaunchPath({ ...both, contractSignedAt: "2026-10-15" }).blocker).toBe("СП не підписана");
  });

  it("успадкований підписаний договір не просить ні погодження, ні підпису", () => {
    const inherited = {
      ...cashless,
      contractCreatedAt: "2026-09-01",
      contractSignedAt: "2026-09-02",
      inheritedContractOrderNumber: "ZM-0926-0001",
      specificationCreatedAt: "2026-10-14",
      specificationSignedAt: "2026-10-15",
    };
    expect(buildLaunchPath(inherited).blocker).toBe("Чекає передоплату");
  });

  it("дозвіл без умов відкриває запуск і каже, чого бракує", () => {
    const path = buildLaunchPath({ ...created, approvals: [approval("launch", "approved")] });
    expect(path.blocker).toBeNull();
    expect(path.missing).toEqual(["підпису договору", "підпису СП", "оплати"]);
    expect(path.steps.find((step) => step.key === "launch")).toMatchObject({
      state: "current",
      note: "Дозволено запустити без умов",
    });
  });

  it("запит на дозвіл ще на розгляді — запуск закритий", () => {
    expect(buildLaunchPath({ ...created, approvals: [approval("launch", "pending")] }).blocker).toBe("Договір не погоджено");
  });

  it("готівка: дозвіл відкриває запуск без передоплати", () => {
    expect(buildLaunchPath({ ...cash, approvals: [approval("launch", "approved")] }).blocker).toBeNull();
  });
});

describe("ворота відвантаження (p9)", () => {
  it("70/30 до відвантаження: без повної оплати не відвантажуємо, сума доплати в причині", () => {
    expect(getShipmentBlocker({ ...cash, paymentStatus: "partially_paid" })).toBe(
      "Відвантажити можна після доплати 30% — 1 571,40 грн"
    );
    expect(getShipmentBlocker({ ...cash, paymentStatus: "fully_paid" })).toBeNull();
  });

  it("нічого не прийшло — бракує всієї суми", () => {
    expect(getShipmentBlocker(cash)).toBe("Відвантажити можна після оплати — 5 238,00 грн");
  });

  it("доплата після ВН: досить передоплати", () => {
    const afterVn = { ...cashless, balanceTiming: "after_shipment" as const, balanceDaysAfterShipment: 14 };
    expect(getShipmentBlocker({ ...afterVn, paymentStatus: "partially_paid" })).toBeNull();
    expect(getShipmentBlocker(afterVn)).toBe("Відвантажити можна після передоплати 70% — 69 552,00 грн");
  });

  it("повне відтермінування не блокує: платять після ВН (Влад, 15.10)", () => {
    const deferred = { ...cashless, prepaymentPct: 0, balancePct: 100, balanceTiming: "after_shipment" as const };
    expect(getShipmentBlocker(deferred)).toBeNull();
  });

  it("уже відвантажене не блокуємо заднім числом", () => {
    expect(getShipmentBlocker({ ...cash, orderStatus: "shipped" })).toBeNull();
  });
});
