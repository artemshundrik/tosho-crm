import { describe, expect, it } from "vitest";

import {
  addBalanceDays,
  customerRequiresDocuments,
  daysBetween,
  formatBalanceDaysShort,
  formatBalanceDaysTerm,
  formatDayMonth,
  fromPayHowValue,
  getAllowedPaymentTermsOptions,
  getMinimumPrepaymentError,
  isCashLikePaymentMethod,
  isCashlessPaymentMethod,
  normalizeBalanceDaysKind,
  resolveOrderPaymentMethod,
  toPayHowValue,
} from "./paymentRules";

/**
 * Спосіб оплати вирішує, які документи потрібні замовленню. До 14.10.2026 CRM
 * його вгадувала (повні реквізити → безготівка) і не читала, що менеджер
 * поставив у картці замовника. Готівковий КСІТ через це вимагав IBAN і СП.
 */
describe("resolveOrderPaymentMethod", () => {
  const base = { partyType: "customer" as const, currency: "UAH", hasLegalEntityIdentity: true };

  it("лід — спосіб ще не обрано", () => {
    expect(resolveOrderPaymentMethod({ ...base, partyType: "lead", customerPaymentType: "cash" }).id).toBe("pending");
  });

  it("готівка з картки замовника перемагає повні реквізити", () => {
    expect(resolveOrderPaymentMethod({ ...base, customerPaymentType: "cash" }).id).toBe("cash");
  });

  it("готівка з картки перемагає й валюту прорахунку", () => {
    expect(resolveOrderPaymentMethod({ ...base, currency: "USD", customerPaymentType: "cash" }).id).toBe("cash");
  });

  it("рахунок з картки — безготівка навіть без реквізитів", () => {
    expect(
      resolveOrderPaymentMethod({ ...base, hasLegalEntityIdentity: false, customerPaymentType: "invoice" }).id
    ).toBe("bank_uah");
  });

  it("рахунок з картки у валюті — валютна безготівка", () => {
    expect(resolveOrderPaymentMethod({ ...base, currency: "EUR", customerPaymentType: "invoice" }).id).toBe("bank_fx");
  });

  it("порожня картка — як раніше: реквізити → безготівка, без них → готівка", () => {
    expect(resolveOrderPaymentMethod({ ...base, customerPaymentType: null }).id).toBe("bank_uah");
    expect(
      resolveOrderPaymentMethod({ ...base, customerPaymentType: null, hasLegalEntityIdentity: false }).id
    ).toBe("cash");
    expect(resolveOrderPaymentMethod({ ...base, customerPaymentType: null, currency: "USD" }).id).toBe("bank_fx");
  });
});

describe("isCashlessPaymentMethod", () => {
  it("безготівка — лише bank_uah і bank_fx", () => {
    expect(isCashlessPaymentMethod("bank_uah")).toBe(true);
    expect(isCashlessPaymentMethod("bank_fx")).toBe(true);
    expect(isCashlessPaymentMethod("cash")).toBe(false);
    expect(isCashlessPaymentMethod("crypto")).toBe(false);
  });

  it("старі записи без id впізнаються за підписом", () => {
    expect(isCashlessPaymentMethod(null, "Безготівкові, грн.")).toBe(true);
    expect(isCashlessPaymentMethod(null, "Готівкові / на карту")).toBe(false);
  });
});

describe("getAllowedPaymentTermsOptions", () => {
  it("на готівці немає «100% після готовності»", () => {
    expect(getAllowedPaymentTermsOptions("cash").map((option) => option.id)).toEqual(["50/50", "70/30", "100_prepaid"]);
  });

  it("на безготівці доступні всі умови", () => {
    expect(getAllowedPaymentTermsOptions("bank_uah").map((option) => option.id)).toContain("100_after");
  });
});

describe("getMinimumPrepaymentError", () => {
  it("готівка з передоплатою менше 50% — помилка", () => {
    expect(getMinimumPrepaymentError({ methodId: "cash", prepaymentPct: 30 })).toMatch(/не менше 50%/);
  });

  it("готівка рівно 50% — гаразд", () => {
    expect(getMinimumPrepaymentError({ methodId: "cash", prepaymentPct: 50 })).toBeNull();
  });

  it("без відсотка береться передоплата з умов", () => {
    expect(getMinimumPrepaymentError({ methodId: "cash", prepaymentPct: null, paymentTerms: "100_after" })).toMatch(
      /не менше 50%/
    );
    expect(getMinimumPrepaymentError({ methodId: "cash", prepaymentPct: null, paymentTerms: "70/30" })).toBeNull();
  });

  it("безготівка й крипта — без обмеження", () => {
    expect(getMinimumPrepaymentError({ methodId: "bank_uah", prepaymentPct: 0 })).toBeNull();
    expect(getMinimumPrepaymentError({ methodId: "crypto", prepaymentPct: 0 })).toBeNull();
  });
});

describe("customerRequiresDocuments", () => {
  /**
   * Від документів звільняє лише явна «Готівка» в картці. Порожнє поле (старі
   * замовники) вимагає реквізитів, як і раніше: інакше компанія з неповними
   * реквізитами вгадувалась би як готівка й проходила в замовлення без договору.
   */
  it("лише явна готівка звільняє від реквізитів і документів", () => {
    expect(customerRequiresDocuments("cash")).toBe(false);
    expect(customerRequiresDocuments("invoice")).toBe(true);
    expect(customerRequiresDocuments(null)).toBe(true);
    expect(customerRequiresDocuments(undefined)).toBe(true);
  });
});

/**
 * Відтермінування рахують у робочих або календарних днях від дати ВН (Влад,
 * 14.10.2026). Це число йде в договір і СП, тож відмінок має бути правильним:
 * «протягом 1 робочого дня», а не «1 робочих днів».
 */
describe("відтермінування доплати", () => {
  it("старі замовлення без позначки рахуються в робочих днях", () => {
    expect(normalizeBalanceDaysKind(null)).toBe("working");
    expect(normalizeBalanceDaysKind("calendar")).toBe("calendar");
    expect(normalizeBalanceDaysKind("будь-що")).toBe("working");
  });

  it("строк у договорі стоїть у родовому відмінку", () => {
    expect(formatBalanceDaysTerm(1, "working")).toBe("1 робочого дня");
    expect(formatBalanceDaysTerm(21, "calendar")).toBe("21 календарного дня");
    expect(formatBalanceDaysTerm(3, "working")).toBe("3 робочих днів");
    expect(formatBalanceDaysTerm(14, "calendar")).toBe("14 календарних днів");
    expect(formatBalanceDaysTerm(11, "working")).toBe("11 робочих днів");
  });

  it("коротко в зведенні: р.д. або к.д.", () => {
    expect(formatBalanceDaysShort(5, "working")).toBe("5 р.д.");
    expect(formatBalanceDaysShort(30, "calendar")).toBe("30 к.д.");
  });
});

describe("addBalanceDays", () => {
  it("календарні — просто додаємо", () => {
    expect(addBalanceDays("2026-10-15", 14, "calendar")).toBe("2026-10-29");
    expect(addBalanceDays("2026-12-25", 10, "calendar")).toBe("2027-01-04");
  });

  it("робочі — пропускаємо суботу й неділю, день ВН не рахуємо", () => {
    // Пт 16.10 + 1 р.д. — пн 19.10; + 5 — пт 23.10.
    expect(addBalanceDays("2026-10-16", 1, "working")).toBe("2026-10-19");
    expect(addBalanceDays("2026-10-16", 5, "working")).toBe("2026-10-23");
    // ВН у суботу: перший робочий — понеділок.
    expect(addBalanceDays("2026-10-17", 1, "working")).toBe("2026-10-19");
    expect(addBalanceDays("2026-10-14", 3, "working")).toBe("2026-10-19");
  });
});

describe("daysBetween / formatDayMonth", () => {
  it("рахує календарні дні й коротку дату", () => {
    expect(daysBetween("2026-10-20", "2026-10-29")).toBe(9);
    expect(daysBetween("2026-10-30", "2026-10-29")).toBe(-1);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2); // через перехід на зимовий час
    expect(formatDayMonth("2026-03-07")).toBe("07.03");
  });
});

/** «Як платить» (REQ-322#p17): юрособа «За рахунком» або спосіб без документів одним полем. */
describe("«Як платить»", () => {
  it("«На карту» — правила готівки: передоплата від 50%", () => {
    expect(isCashLikePaymentMethod("card")).toBe(true);
    expect(isCashlessPaymentMethod("card", null)).toBe(false);
    expect(getAllowedPaymentTermsOptions("card").map((option) => option.id)).not.toContain("100_after");
    expect(getMinimumPrepaymentError({ methodId: "card", prepaymentPct: 30 })).toMatch(/не менше 50%/);
  });

  it("крипта без правила 50%", () => {
    expect(isCashLikePaymentMethod("crypto")).toBe(false);
    expect(getMinimumPrepaymentError({ methodId: "crypto", prepaymentPct: 0 })).toBeNull();
  });

  it("«За рахунком» несе юрособу, а гривня чи валюта — з поля «Валюта»", () => {
    expect(fromPayHowValue("invoice:fop-ro", "UAH")).toEqual({ methodId: "bank_uah", legalEntityId: "fop-ro" });
    expect(fromPayHowValue("invoice:fop-ro", "EUR")).toEqual({ methodId: "bank_fx", legalEntityId: "fop-ro" });
    expect(fromPayHowValue("card", "UAH")).toEqual({ methodId: "card", legalEntityId: null });
  });

  it("значення поля збирається назад зі способу й юрособи", () => {
    expect(toPayHowValue("bank_fx", "llc")).toBe("invoice:llc");
    expect(toPayHowValue("cash", "llc")).toBe("cash");
  });
});
