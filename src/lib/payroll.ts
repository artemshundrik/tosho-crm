import { supabase } from "@/lib/supabaseClient";
import { pickRateForMonth } from "@/lib/designerPayrollMath";

// Payroll sheet (зарплатна відомість) data access.
// One entry = one employee's pay for one month: ставка + премія − утримання.
// Backed by tosho.payroll_entries (see scripts/payroll-entries.sql). Owner/CEO only via RLS.

export type PayrollEntry = {
  userId: string;
  period: string; // YYYY-MM-01
  baseAmount: number;
  bonusAmount: number;
  deductionAmount: number;
  /** Штраф за місяць. Віднімається від totalAmount окремо від «Офіційної ЗП». */
  penaltyAmount: number;
  /** Уже виданий аванс. Віднімається від totalAmount — у ньому лишається залишок. */
  advanceAmount: number;
  advanceDate: string | null; // YYYY-MM-DD
  totalAmount: number;
  note: string | null;
};

export type PayrollValues = {
  baseAmount: number;
  bonusAmount: number;
  deductionAmount: number;
  penaltyAmount: number;
  advanceAmount: number;
  advanceDate: string | null;
  note: string | null;
};

type PayrollRow = {
  user_id: string;
  period: string;
  base_amount: number | string | null;
  bonus_amount: number | string | null;
  deduction_amount: number | string | null;
  penalty_amount: number | string | null;
  advance_amount: number | string | null;
  advance_date: string | null;
  total_amount: number | string | null;
  note: string | null;
};

const toNumber = (value: number | string | null | undefined): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

/** Build the canonical period key (first day of the month) from year + 1-based month. */
export function periodKey(year: number, month: number): string {
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}-01`;
}

export const PAYROLL_MONTHS = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
] as const;

/**
 * Accounts intentionally kept off the payroll sheet (owner / management / a
 * duplicate account). Excluded by user id since display names change.
 * Used by the finance "Виплати команді" view.
 */
export const PAYROLL_EXCLUDED_USER_IDS = new Set<string>([
  "9753ba06-3911-40fe-a9d4-bea1a92f1667", // В'ячеслав Хом'яков
  "ceade688-2792-4814-b0f4-c4e4b6d058e1", // Олена Борщ
  "e73aee8c-ebc8-449f-af12-6420a363498a", // Євгенія Безручко
]);

/** People paid through the sheet without a CRM account (fixed placeholder ids). */
export type ManualPayrollPerson = { userId: string; name: string; jobRole: string };
export const MANUAL_PAYROLL_PEOPLE: ManualPayrollPerson[] = [
  { userId: "30e3147f-3c00-45f9-ac04-91a160799efd", name: "Тетяна Карандюк", jobRole: "Бухгалтер" },
  { userId: "d604c8de-9976-42db-b9ec-f2f756818295", name: "Юлія Кубенко", jobRole: "Бухгалтер" },
  // "Анастасія К." placeholder removed 2026-07-14 — merged into the real
  // Настя Коптева account (d664089c…); her payroll + payout history was moved there.
  { userId: "5630d0bc-5ae7-40a1-bd4b-2f46c89e1000", name: "Сашко З.", jobRole: "Пакувальник" },
];

export const parsePayrollAmount = (raw: string): number => {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100) / 100);
};

/** Load all payroll entries for a workspace + period, keyed by user id. */
export async function loadPayrollEntries(
  workspaceId: string,
  period: string
): Promise<Map<string, PayrollEntry>> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("payroll_entries")
    .select(
      "user_id, period, base_amount, bonus_amount, deduction_amount, penalty_amount, advance_amount, advance_date, total_amount, note"
    )
    .eq("workspace_id", workspaceId)
    .eq("period", period);

  if (error) throw error;

  const map = new Map<string, PayrollEntry>();
  for (const row of (data ?? []) as PayrollRow[]) {
    map.set(row.user_id, {
      userId: row.user_id,
      period: row.period,
      baseAmount: toNumber(row.base_amount),
      bonusAmount: toNumber(row.bonus_amount),
      deductionAmount: toNumber(row.deduction_amount),
      penaltyAmount: toNumber(row.penalty_amount),
      advanceAmount: toNumber(row.advance_amount),
      advanceDate: row.advance_date,
      totalAmount: toNumber(row.total_amount),
      note: row.note,
    });
  }
  return map;
}

/**
 * Чинна на цей місяць базова ставка кожного, з картки співробітника
 * (вкладка «Оплата» → «Базова ставка, ₴/міс», tosho.employee_pay_rates).
 *
 * Ставки датовані: чинна на місяць — найпізніша з тих, що набрали чинності не
 * пізніше 1 числа цього місяця. Нуль не повертаємо: у відомості порожня ставка
 * і ставка «0» виглядають однаково, тож підставляти нуль немає сенсу.
 */
export async function loadEffectiveBaseRates(
  workspaceId: string,
  period: string
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .schema("tosho")
    // employee_pay_rates немає в згенерованих типах — той самий каст, що і в
    // картці співробітника (MemberPaySection).
    .from("employee_pay_rates" as never)
    .select("user_id, base_month_rate, effective_from")
    .eq("workspace_id", workspaceId);

  if (error) throw error;

  const byUser = new Map<string, Array<{ effectiveFrom: string; baseMonthRate: number }>>();
  for (const row of (data ?? []) as unknown as Array<{
    user_id: string;
    base_month_rate: number | string | null;
    effective_from: string;
  }>) {
    const list = byUser.get(row.user_id) ?? [];
    list.push({ effectiveFrom: row.effective_from, baseMonthRate: toNumber(row.base_month_rate) });
    byUser.set(row.user_id, list);
  }

  const monthKey = period.slice(0, 7); // YYYY-MM-01 → YYYY-MM
  const rates = new Map<string, number>();
  for (const [uid, list] of byUser) {
    const picked = pickRateForMonth(list, monthKey);
    if (picked && picked.baseMonthRate > 0) rates.set(uid, picked.baseMonthRate);
  }
  return rates;
}

/** Upsert one employee's pay for one month. total_amount is generated in the DB. */
export async function upsertPayrollEntry(params: {
  workspaceId: string;
  userId: string;
  period: string;
  updatedBy: string | null;
  values: PayrollValues;
}): Promise<void> {
  const { workspaceId, userId, period, updatedBy, values } = params;
  const { error } = await supabase
    .schema("tosho")
    .from("payroll_entries")
    .upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        period,
        base_amount: values.baseAmount,
        bonus_amount: values.bonusAmount,
        deduction_amount: values.deductionAmount,
        penalty_amount: values.penaltyAmount,
        advance_amount: values.advanceAmount,
        // Дата без суми заборонена перевіркою в БД — тримаємо це й тут.
        advance_date: values.advanceAmount > 0 ? values.advanceDate : null,
        note: values.note,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,user_id,period" }
    );

  if (error) throw error;
}
