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

/**
 * Чи підставляти в місяць `period` (YYYY-MM-01) ставку з картки співробітника.
 *
 * Від попереднього місяця й далі. Відомість за місяць заповнюють наступного
 * (серпень — у вересні), тож попередній ще робочий, а все давніше — історія.
 * Межа потрібна, бо підставлена ставка одразу пишеться в базу: без неї сам
 * перегляд старого місяця дописував туди рядки людей, яких у відомості тоді не
 * було, і підсумок того місяця ріс.
 */
export function isRatePrefillPeriod(period: string, today: Date): boolean {
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-01`;
  return period >= prevKey;
}
