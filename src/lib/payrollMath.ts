/**
 * Чиста арифметика відомості «Виплати команді» — без Supabase, щоб тест
 * (payrollMath.test.ts) не тягнув клієнт бази.
 *
 * Та сама формула, що в generated-колонках `total_amount` і `earned_amount`
 * таблиці tosho.payroll_entries (scripts/payroll-official-split.sql).
 * Відомість рахує підсумки з чернетки ще до збереження, тож копія потрібна;
 * але вона ОДНА — розійтись із базою можна лише тут.
 */
export type PayrollMoney = {
  baseAmount: number;
  bonusAmount: number;
  /** «Офіційна ЗП» — колонка deduction_amount названа історично. Іде через банк, з готівки віднімається. */
  deductionAmount: number;
  penaltyAmount: number;
  personalOrderAmount: number;
  /** Офіційний аванс (АЗП). Теж через банк, теж віднімається. */
  officialAdvanceAmount: number;
  /** Офіційні податки — лише облік, у жоден підсумок не входять. */
  officialTaxAmount: number;
  advanceAmount: number;
};

export function computePayrollTotals(v: PayrollMoney): { total: number; earned: number } {
  // Загальна ЗП за місяць: скільки людина заробила, незалежно від того, як це виплачено.
  const earned = v.baseAmount + v.bonusAmount - v.penaltyAmount;
  // До виплати на руки: із заробленого йдуть особисте замовлення, усе офіційне (через банк)
  // і вже виданий готівковий аванс.
  const total =
    earned - v.personalOrderAmount - v.deductionAmount - v.officialAdvanceAmount - v.advanceAmount;
  return { total, earned };
}
