import { describe, expect, it } from "vitest";

import { computePayrollTotals, isRatePrefillPeriod, type PayrollMoney } from "./payrollMath";

const money = (over: Partial<PayrollMoney> = {}): PayrollMoney => ({
  baseAmount: 0,
  bonusAmount: 0,
  deductionAmount: 0,
  penaltyAmount: 0,
  personalOrderAmount: 0,
  officialAdvanceAmount: 0,
  officialTaxAmount: 0,
  advanceAmount: 0,
  ...over,
});

describe("computePayrollTotals", () => {
  // Дар'я М. з макета REQ-284: усі поля заповнені, копійки в офіційній частині.
  const daria = money({
    baseAmount: 22500,
    bonusAmount: 3410,
    personalOrderAmount: 1260,
    deductionAmount: 2259.79,
    officialAdvanceAmount: 2259.79,
    officialTaxAmount: 1578,
    advanceAmount: 4950,
  });

  it("«Загальна ЗП» — ставка + бонус − штраф, спосіб виплати її не міняє", () => {
    expect(computePayrollTotals(daria).earned).toBeCloseTo(25910, 2);
    expect(computePayrollTotals(money({ baseAmount: 25000, penaltyAmount: 1490.13 })).earned).toBeCloseTo(
      23509.87,
      2
    );
  });

  it("«До виплати» — із заробленого йдуть особисте, офіційна ЗП, АЗП і готівковий аванс", () => {
    expect(computePayrollTotals(daria).total).toBeCloseTo(15180.42, 2);
  });

  it("офіційні податки — лише облік: жоден підсумок від них не змінюється", () => {
    const without = computePayrollTotals(daria);
    const withTax = computePayrollTotals({ ...daria, officialTaxAmount: 99999 });
    expect(withTax).toEqual(without);
  });

  it("порожній рядок дає нулі, а не NaN", () => {
    expect(computePayrollTotals(money())).toEqual({ total: 0, earned: 0 });
  });
});

describe("isRatePrefillPeriod", () => {
  const sept18 = new Date(2026, 8, 18);

  it("поточний і попередній місяць — так: відомість за серпень заповнюють у вересні", () => {
    expect(isRatePrefillPeriod("2026-09-01", sept18)).toBe(true);
    expect(isRatePrefillPeriod("2026-08-01", sept18)).toBe(true);
  });

  it("майбутній — так", () => {
    expect(isRatePrefillPeriod("2026-10-01", sept18)).toBe(true);
  });

  it("давніші — ні: перегляд старого місяця не дописує туди рядків", () => {
    expect(isRatePrefillPeriod("2026-07-01", sept18)).toBe(false);
    expect(isRatePrefillPeriod("2026-01-01", sept18)).toBe(false);
  });

  it("у січні попередній — грудень минулого року", () => {
    const jan5 = new Date(2027, 0, 5);
    expect(isRatePrefillPeriod("2026-12-01", jan5)).toBe(true);
    expect(isRatePrefillPeriod("2026-11-01", jan5)).toBe(false);
  });
});
