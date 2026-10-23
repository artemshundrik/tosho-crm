import { supabase } from "@/lib/supabaseClient";

export type ItemDocumentNameDraft = { itemId: string; name: string; value: string };

/** Пише лише змінені назви; назва, що збігається з назвою позиції, зберігається як null. */
export async function saveOrderItemDocumentNames(teamId: string, drafts: ItemDocumentNameDraft[]) {
  const saved = new Map<string, string | null>();
  for (const draft of drafts) {
    const value = draft.value.trim();
    const documentName = value && value !== draft.name.trim() ? value : null;
    const { error } = await supabase
      .schema("tosho")
      .from("order_items")
      .update({ document_name: documentName })
      .eq("team_id", teamId)
      .eq("id", draft.itemId);
    if (error) throw error;
    saved.set(draft.itemId, documentName);
  }
  return saved;
}
