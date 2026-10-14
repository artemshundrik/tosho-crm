import { describe, expect, it } from "vitest";

import {
  customerRequiresDocuments,
  getAllowedPaymentTermsOptions,
  getMinimumPrepaymentError,
  isCashlessPaymentMethod,
  resolveOrderPaymentMethod,
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
