import { supabase } from "@/lib/supabaseClient";
import { isMissingOrdersRelationMessage } from "./ordersSchemaErrors";

const getManualOrderMonthCode = (date = new Date()) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${month}${year}`;
};

/**
 * Наступний номер замовлення `TO-{MMYY}-{0000}` (ToSho Order), з прорахунку чи без: TS-… лишається
 * за прорахунком. quote_number НЕ унікальний, тож достатньо best-effort max+1 у межах місяця.
 */
export async function getNextOrderNumber(teamId: string) {
  const monthCode = getManualOrderMonthCode();
  const { data, error } = await supabase
    .schema("tosho")
    .from("orders")
    .select("quote_number")
    .eq("team_id", teamId)
    .like("quote_number", `TO-${monthCode}-%`)
    .order("quote_number", { ascending: false })
    .limit(1);
  if (error && !isMissingOrdersRelationMessage(error.message)) throw error;
  const last = Number.parseInt(((data ?? [])[0] as { quote_number?: string | null } | undefined)?.quote_number?.split("-")[2] ?? "", 10);
  return `TO-${monthCode}-${String(Number.isFinite(last) && last >= 1 ? last + 1 : 1).padStart(4, "0")}`;
}
