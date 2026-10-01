import { supabase } from "@/lib/supabaseClient";
import { findQuoteIdsByProductSku } from "@/lib/quoteSkuMatches";
import { applyQuoteListFilters, countQuotesByStatus, escapePostgrestIlikeTerm } from "@/lib/quoteListFilters";

/**
 * Скільки прорахунків у кожному статусі за поточними пошуком і менеджером —
 * ОДНИМ запитом: тягнемо лише колонку `status` і рахуємо в браузері
 * (агрегатів PostgREST у нас немає). Від вибраної вкладки не залежить.
 */
export async function listQuoteStatusCounts(params: {
  teamId: string;
  search?: string;
  managerUserId?: string | null;
}): Promise<Record<string, number>> {
  const q = params.search?.trim() ?? "";
  const escapedSearch = escapePostgrestIlikeTerm(q);
  const skuQuoteIds = escapedSearch.length > 0 ? await findQuoteIdsByProductSku(params.teamId, q) : [];
  const baseColumns = ["number", "comment", "title"];
  const columnVariants = [[...baseColumns, "customer_name", "design_brief"], [...baseColumns, "customer_name"], baseColumns];

  let lastError: { message?: string | null } | null = null;
  for (const searchableColumns of columnVariants) {
    const result = await applyQuoteListFilters(
      supabase.schema("tosho").from("quotes").select("status").eq("team_id", params.teamId),
      { escapedSearch, skuQuoteIds, searchableColumns, managerUserId: params.managerUserId }
    );
    if (!result.error) return countQuotesByStatus((result.data ?? []) as Array<{ status?: string | null }>);
    lastError = result.error;
    if (!/column|schema cache|could not find/i.test(result.error.message ?? "")) break;
  }
  if (lastError) throw lastError;
  return {};
}

