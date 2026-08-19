import { supabase } from "@/lib/supabaseClient";
import { resolveWorkspaceId } from "@/lib/workspace";

/**
 * Історія персональних ставок менеджерів.
 *
 * tosho.team_member_manager_rates тримає лише ПОТОЧНЕ значення — до появи
 * цієї історії стара ставка просто затиралась, і питання «яка ставка була в
 * людини в березні» лишалось без відповіді назавжди. Записи веде тригер
 * (scripts/manager-rate-history.sql), з клієнта таблиця тільки читається.
 */

export type ManagerRateChange = {
  id: number;
  userId: string;
  oldRate: number | null;
  newRate: number;
  changedBy: string | null;
  changedAt: string;
};

export async function loadManagerRateHistory(
  userId?: string | null,
  limit = 50
): Promise<ManagerRateChange[]> {
  const workspaceId = await resolveWorkspaceId(userId);
  if (!workspaceId) return [];

  const { data, error } = await supabase
    .schema("tosho")
    .from("team_member_manager_rate_changes")
    .select("id,user_id,old_rate,new_rate,changed_by,changed_at")
    .eq("workspace_id", workspaceId)
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (!/does not exist|relation|schema cache|could not find the table/i.test(error.message ?? "")) {
      console.error("Failed to load manager rate history", error);
    }
    return [];
  }

  return ((data ?? []) as Array<{
    id: number;
    user_id: string;
    old_rate: number | null;
    new_rate: number;
    changed_by: string | null;
    changed_at: string;
  }>).map((row) => ({
    id: row.id,
    userId: row.user_id,
    oldRate: row.old_rate === null ? null : Number(row.old_rate),
    newRate: Number(row.new_rate),
    changedBy: row.changed_by,
    changedAt: row.changed_at,
  }));
}

/**
 * Зміни бажаного заробітку в тиражах прорахунку.
 *
 * Це поле визначає ВСЮ націнку, тож одна правка міняє ціну для клієнта.
 * Пише тригер (scripts/run-income-audit.sql), причому правки однієї людини
 * в одному тиражі за 5 хвилин схлопуються в один запис — інакше
 * автозбереження тиражів залило б історію шумом.
 */
export type RunIncomeChange = {
  id: number;
  quoteId: string;
  quoteNumber: string | null;
  oldIncome: number | null;
  newIncome: number;
  changedBy: string | null;
  changedAt: string;
};

export async function loadRunIncomeHistory(limit = 30): Promise<RunIncomeChange[]> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("quote_run_income_changes")
    .select("id,quote_id,old_income,new_income,changed_by,changed_at")
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (!/does not exist|relation|schema cache|could not find the table/i.test(error.message ?? "")) {
      console.error("Failed to load run income history", error);
    }
    return [];
  }

  const rows = (data ?? []) as Array<{
    id: number;
    quote_id: string;
    old_income: number | null;
    new_income: number;
    changed_by: string | null;
    changed_at: string;
  }>;
  if (rows.length === 0) return [];

  // Номери прорахунків окремим запитом: у таблиці аудиту лежить лише id, а
  // людині «TS-0826-0026» каже більше, ніж uuid.
  const numbersByQuoteId = new Map<string, string>();
  const quoteIds = Array.from(new Set(rows.map((row) => row.quote_id)));
  const { data: quotes } = await supabase
    .schema("tosho")
    .from("quotes")
    .select("id,number")
    .in("id", quoteIds);
  for (const quote of ((quotes ?? []) as Array<{ id: string; number: string | null }>)) {
    if (quote.number) numbersByQuoteId.set(quote.id, quote.number);
  }

  return rows.map((row) => ({
    id: row.id,
    quoteId: row.quote_id,
    quoteNumber: numbersByQuoteId.get(row.quote_id) ?? null,
    oldIncome: row.old_income === null ? null : Number(row.old_income),
    newIncome: Number(row.new_income),
    changedBy: row.changed_by,
    changedAt: row.changed_at,
  }));
}
