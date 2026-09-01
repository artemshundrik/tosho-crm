import { supabase } from "@/lib/supabaseClient";
import type { QuoteMarkupApproval, QuoteMarkupApprovalStatus } from "@/lib/quoteMarkupApproval";
import type { MarkupBenchmarkSamples } from "@/lib/quoteMarkupBenchmark";
import { COLUMN_MARKUP_FALLBACK } from "@/lib/quoteRuns";

import { getErrorMessage } from "./config";
import type { QueryResult } from "./queries";

/**
 * Запити на погодження накрутки нижче дна — читання й запис (REQ-149).
 *
 * Окремим файлом, а не в queries.ts: той уже 1700 рядків, і ратчет розміру
 * (scripts/check-file-growth.mjs) саме для такого випадку й стоїть.
 */

type ApprovalRow = {
  id: string;
  quote_id: string;
  run_id: string;
  status: string;
  markup_rate: number | string | null;
  cost_total: number | string | null;
  request_note: string | null;
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

const APPROVAL_COLUMNS =
  "id,quote_id,run_id,status,markup_rate,cost_total,request_note,requested_by,requested_at,decided_by,decided_at,decision_note";

const toNumber = (value: number | string | null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value: string): QuoteMarkupApprovalStatus => {
  if (value === "approved" || value === "rejected" || value === "withdrawn") return value;
  return "pending";
};

const mapApproval = (row: ApprovalRow): QuoteMarkupApproval => ({
  id: row.id,
  quoteId: row.quote_id,
  runId: row.run_id,
  status: normalizeStatus(row.status),
  markupRate: toNumber(row.markup_rate),
  costTotal: toNumber(row.cost_total),
  requestNote: row.request_note,
  requestedBy: row.requested_by,
  requestedAt: row.requested_at,
  decidedBy: row.decided_by,
  decidedAt: row.decided_at,
  decisionNote: row.decision_note,
});

/**
 * Найсвіжіший запит НА КОЖЕН тираж прорахунку.
 *
 * Стан рахує останній запит, старі лежать заради історії («просили тричі,
 * двічі відхилили») — саме вона відповідає на питання, чому угода пішла нижче
 * дна. Тому беремо всі рядки й лишаємо перший по кожному тиражу, а не
 * фільтруємо статусом у запиті.
 */
export async function fetchQuoteMarkupApprovals(
  quoteId: string
): Promise<QueryResult<Map<string, QuoteMarkupApproval>>> {
  try {
    const { data, error } = await supabase
      .schema("tosho")
      .from("quote_run_markup_approvals")
      .select(APPROVAL_COLUMNS)
      .eq("quote_id", quoteId)
      .order("requested_at", { ascending: false });
    if (error) throw error;
    const latest = new Map<string, QuoteMarkupApproval>();
    for (const row of ((data as ApprovalRow[] | null) ?? [])) {
      if (latest.has(row.run_id)) continue;
      latest.set(row.run_id, mapApproval(row));
    }
    return { ok: true, data: latest };
  } catch (error) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося завантажити стан погодження накрутки.") };
  }
}

/**
 * Те саме для КІЛЬКОХ прорахунків — КП складається з кількох, і двері мають
 * бути замкнені, якщо нижче дна стоїть хоч один із них.
 */
export async function fetchMarkupApprovalsForQuotes(
  quoteIds: string[]
): Promise<Map<string, QuoteMarkupApproval>> {
  const latest = new Map<string, QuoteMarkupApproval>();
  if (quoteIds.length === 0) return latest;
  const { data, error } = await supabase
    .schema("tosho")
    .from("quote_run_markup_approvals")
    .select(APPROVAL_COLUMNS)
    .in("quote_id", quoteIds)
    .order("requested_at", { ascending: false });
  // Кидаємо далі, а не ковтаємо: тут від відповіді залежить, чи піде документ
  // клієнту. «Не змогли прочитати» має зупинити, а не пропустити.
  if (error) throw error;
  for (const row of ((data as ApprovalRow[] | null) ?? [])) {
    if (latest.has(row.run_id)) continue;
    latest.set(row.run_id, mapApproval(row));
  }
  return latest;
}

export async function requestMarkupApproval(params: {
  teamId: string;
  quoteId: string;
  runId: string;
  markupRate: number;
  costTotal: number;
  note?: string | null;
  userId?: string | null;
}): Promise<QueryResult<QuoteMarkupApproval>> {
  try {
    const { data, error } = await supabase
      .schema("tosho")
      .from("quote_run_markup_approvals")
      .insert({
        team_id: params.teamId,
        quote_id: params.quoteId,
        run_id: params.runId,
        status: "pending",
        markup_rate: params.markupRate,
        cost_total: params.costTotal,
        request_note: params.note?.trim() || null,
        requested_by: params.userId ?? null,
      })
      .select(APPROVAL_COLUMNS)
      .single();
    if (error) throw error;
    return { ok: true, data: mapApproval(data as ApprovalRow) };
  } catch (error) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося надіслати запит на погодження.") };
  }
}

/**
 * Рішення ухвалюється ТІЛЬКИ по рядку в стані «на погодженні» — і це умова в
 * самому запиті, а не лише в базі. Двоє погоджувачів можуть відкрити картку
 * одночасно; без `.eq("status", "pending")` другий тихо перезаписав би рішення
 * першого, і в історії лишився б тільки останній.
 */
export async function decideMarkupApproval(params: {
  approvalId: string;
  decision: "approved" | "rejected";
  note?: string | null;
}): Promise<QueryResult<QuoteMarkupApproval | null>> {
  try {
    const { data, error } = await supabase
      .schema("tosho")
      .from("quote_run_markup_approvals")
      .update({ status: params.decision, decision_note: params.note?.trim() || null })
      .eq("id", params.approvalId)
      .eq("status", "pending")
      .select(APPROVAL_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    return { ok: true, data: data ? mapApproval(data as ApprovalRow) : null };
  } catch (error) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося зберегти рішення.") };
  }
}

/**
 * Менеджер підняв накрутку на дно або вище — запит став безпредметним.
 * Без цього він висів би в черзі погоджувача назавжди, і той ухвалював би
 * рішення про число, якого вже немає.
 */
export async function withdrawMarkupApproval(approvalId: string): Promise<QueryResult<void>> {
  try {
    const { error } = await supabase
      .schema("tosho")
      .from("quote_run_markup_approvals")
      .update({ status: "withdrawn" })
      .eq("id", approvalId)
      .eq("status", "pending");
    if (error) throw error;
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, message: getErrorMessage(error, "Не вдалося відкликати запит.") };
  }
}

/**
 * Накрутки історичних тиражів для відмітки-орієнтира.
 *
 * ФІЛЬТР `desired_manager_income > 0 OR markup_rate <> 40` — не примха.
 * Колонка markup_rate має DEFAULT 40, тож тираж, якого ніхто не торкався, теж
 * має «накрутку». Якби такі рядки потрапляли у вибірку, орієнтир поступово
 * сповз би рівно до підставленого числа й почав підтверджувати сам себе.
 * Легасі-рядки впізнаються по заробітку, нові — по тому, що відсоток відрізняється
 * від типового.
 *
 * Поточний прорахунок виключаємо: орієнтир не має включати те, що менеджер
 * щойно поставив у цьому ж вікні.
 */
export async function fetchMarkupBenchmarkSamples(params: {
  quoteId: string;
  catalogModelId?: string | null;
  catalogKindId?: string | null;
}): Promise<QueryResult<MarkupBenchmarkSamples>> {
  const read = async (column: "catalog_model_id" | "catalog_kind_id", value: string) => {
    const { data, error } = await supabase
      .schema("tosho")
      .from("quote_item_runs")
      .select(`markup_rate,quote_id,quote_items!inner(${column})`)
      .eq(`quote_items.${column}`, value)
      .neq("quote_id", params.quoteId)
      .gt("quantity", 0)
      // Відсіюємо рядки, що лишились на дефолті КОЛОНКИ (40): у них накрутку
      // ніхто не задавав, і орієнтир з них вийшов би рівний сорока незалежно
      // від того, як компанія насправді торгує. Число типу угоди тут ні до
      // чого — воно з'явилось пізніше й у старих рядках його немає.
      .or(`desired_manager_income.gt.0,markup_rate.neq.${COLUMN_MARKUP_FALLBACK}`)
      .limit(500);
    if (error) throw error;
    return ((data as Array<{ markup_rate: number | string | null }> | null) ?? [])
      .map((row) => toNumber(row.markup_rate))
      .filter((rate) => rate > 0);
  };

  try {
    const modelId = params.catalogModelId?.trim() || "";
    const kindId = params.catalogKindId?.trim() || "";
    const [model, kind] = await Promise.all([
      modelId ? read("catalog_model_id", modelId) : Promise.resolve<number[]>([]),
      kindId ? read("catalog_kind_id", kindId) : Promise.resolve<number[]>([]),
    ]);
    return { ok: true, data: { model, kind } };
  } catch (error) {
    // Орієнтир — підказка, а не умова роботи: не змогли порахувати — блок
    // просто скаже «замало даних», а не зламає картку.
    return { ok: false, message: getErrorMessage(error, "Не вдалося порахувати орієнтир.") };
  }
}
