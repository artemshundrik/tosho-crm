import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { customerFilterKey, customerFilterNames, type CustomerFilterValue } from "@/lib/customerFilter";
import { buildQuoteCustomerOrFilter, quotePostgrestIlikeEquals } from "@/lib/quoteListFilters";

/**
 * Дизайн-задача знає замовника трьома шляхами: `metadata.customer_id` (буває id
 * ліда), `metadata.customer_name` і прорахунок (`metadata.quote_id` або
 * `entity_id`) цього замовника. Частина задач має лише останній шлях, тож id
 * прорахунків беремо тими самими умовами, що фільтр списку прорахунків.
 */

const QUOTE_ID_CHUNK_SIZE = 80;
const QUOTE_IDS_TTL_MS = 15_000;

export type CustomerTaskActivityRow = {
  id: string;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
  title?: string | null;
  created_at: string;
};

const EMPTY_IDS: ReadonlySet<string> = new Set();

const quoteIdsCache = new Map<string, { at: number; promise: Promise<string[]> }>();

export function listQuoteIdsForCustomer(teamId: string, customer: CustomerFilterValue): Promise<string[]> {
  const key = `${teamId}|${customerFilterKey(customer)}`;
  const cached = quoteIdsCache.get(key);
  if (cached && Date.now() - cached.at < QUOTE_IDS_TTL_MS) return cached.promise;
  const filter = buildQuoteCustomerOrFilter(customer);
  const promise = filter
    ? Promise.resolve(supabase.schema("tosho").from("quotes").select("id").eq("team_id", teamId).or(filter)).then(
        ({ data, error }) => {
          if (error) throw error;
          return ((data ?? []) as Array<{ id?: string | null }>).map((row) => row.id?.trim() ?? "").filter(Boolean);
        }
      )
    : Promise.resolve([]);
  quoteIdsCache.set(key, { at: Date.now(), promise });
  promise.catch(() => quoteIdsCache.delete(key));
  return promise;
}

/** Id прорахунків замовника для клієнтського відбору задач. */
export function useCustomerQuoteIds(teamId: string | null | undefined, customer: CustomerFilterValue | null) {
  const [state, setState] = useState<{ key: string; ids: ReadonlySet<string> }>({ key: "", ids: new Set() });
  const key = customer && teamId ? `${teamId}|${customerFilterKey(customer)}` : "";
  useEffect(() => {
    if (!customer || !teamId) return;
    let cancelled = false;
    void listQuoteIdsForCustomer(teamId, customer)
      .then((ids) => {
        if (!cancelled) setState({ key, ids: new Set(ids) });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [customer, key, teamId]);
  return state.key === key ? state.ids : EMPTY_IDS;
}

/**
 * Усі задачі замовника (без пагінації: їх десятки). Одна умова `or` на шлях:
 * id замовника, назва без регістру, прорахунки замовника.
 */
export async function listCustomerDesignTaskActivityRows(params: {
  teamId: string;
  customer: CustomerFilterValue;
  status?: string | null;
}): Promise<CustomerTaskActivityRow[]> {
  const quoteIds = await listQuoteIdsForCustomer(params.teamId, params.customer);
  const base = [
    `metadata->>customer_id.eq.${params.customer.id}`,
    ...customerFilterNames(params.customer).map(
      (name) => `metadata->>customer_name.ilike.${quotePostgrestIlikeEquals(name)}`
    ),
  ];
  const chunks: string[][] = [];
  for (let index = 0; index < quoteIds.length; index += QUOTE_ID_CHUNK_SIZE) {
    chunks.push(quoteIds.slice(index, index + QUOTE_ID_CHUNK_SIZE));
  }
  if (chunks.length === 0) chunks.push([]);
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const filters = chunk.length > 0
        ? [...base, `metadata->>quote_id.in.(${chunk.join(",")})`, `entity_id.in.(${chunk.join(",")})`]
        : base;
      let query = supabase
        .from("activity_log")
        .select("id,entity_id,metadata,title,created_at")
        .eq("team_id", params.teamId)
        .eq("action", "design_task")
        .or(filters.join(","))
        .order("created_at", { ascending: false });
      if (params.status) query = query.eq("metadata->>status", params.status);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CustomerTaskActivityRow[];
    })
  );
  const rowById = new Map<string, CustomerTaskActivityRow>();
  results.flat().forEach((row) => rowById.set(row.id, row));
  return Array.from(rowById.values()).sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime() || b.id.localeCompare(a.id)
  );
}
