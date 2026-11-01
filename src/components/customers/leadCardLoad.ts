import { supabase } from "@/lib/supabaseClient";
import { getFallbackLeadColumnsVariant, getLeadColumns, type LeadColumnsVariant, type LeadRow } from "./leadRecord";

/**
 * Рядок ліда для картки (панель, вікно редагування). Стара схема без колонок
 * реквізитів — запасний набір колонок. `null` — ліда немає: видалили або
 * вже перевели в замовника.
 */
export async function loadLeadRow(teamId: string, leadId: string): Promise<LeadRow | null> {
  const loadLead = async (variant: LeadColumnsVariant) =>
    await supabase
      .schema("tosho")
      .from("leads")
      .select(getLeadColumns(variant))
      .eq("team_id", teamId)
      .eq("id", leadId)
      .maybeSingle<LeadRow>();

  let variant: LeadColumnsVariant = "full";
  let { data, error } = await loadLead(variant);
  let fallbackVariant = error ? getFallbackLeadColumnsVariant(variant, error.message ?? "") : null;
  while (error && fallbackVariant) {
    variant = fallbackVariant;
    ({ data, error } = await loadLead(variant));
    fallbackVariant = error ? getFallbackLeadColumnsVariant(variant, error.message ?? "") : null;
  }
  if (error) throw error;
  return data ?? null;
}
