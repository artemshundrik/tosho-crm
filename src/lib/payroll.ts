import { supabase } from "@/lib/supabaseClient";

// Payroll sheet (зарплатна відомість) data access.
// One entry = one employee's pay for one month: ставка + премія − утримання.
// Backed by tosho.payroll_entries (see scripts/payroll-entries.sql). Owner/SEO only via RLS.

export type PayrollEntry = {
  userId: string;
  period: string; // YYYY-MM-01
  baseAmount: number;
  bonusAmount: number;
  deductionAmount: number;
  totalAmount: number;
  note: string | null;
};

export type PayrollValues = {
  baseAmount: number;
  bonusAmount: number;
  deductionAmount: number;
  note: string | null;
};

type PayrollRow = {
  user_id: string;
  period: string;
  base_amount: number | string | null;
  bonus_amount: number | string | null;
  deduction_amount: number | string | null;
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

/** Load all payroll entries for a workspace + period, keyed by user id. */
export async function loadPayrollEntries(
  workspaceId: string,
  period: string
): Promise<Map<string, PayrollEntry>> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("payroll_entries")
    .select(
      "user_id, period, base_amount, bonus_amount, deduction_amount, total_amount, note"
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
      totalAmount: toNumber(row.total_amount),
      note: row.note,
    });
  }
  return map;
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
        note: values.note,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,user_id,period" }
    );

  if (error) throw error;
}
