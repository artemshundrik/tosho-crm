import { supabase } from "@/lib/supabaseClient";
import { loadOrderCreationDraft } from "./orderRecords";
import { describeOrderItemConflict, toOrderItemPayload } from "./orderQuoteLinks";

/**
 * Докласти позиції погодженого прорахунку в наявне замовлення (REQ-344). Правила —
 * той самий замовник, валюта, рахунок не запитано, СП не підписана — перевіряє
 * tosho.append_quote_items_to_order; сума замовлення перераховується там же.
 */
export async function appendQuoteItemsToOrder(params: {
  teamId: string;
  orderId: string;
  quoteId: string;
  selectedQuoteItemIds: string[];
  userId?: string | null;
}) {
  const draft = await loadOrderCreationDraft(params.teamId, params.quoteId, params.userId);
  const selectedIds = new Set(params.selectedQuoteItemIds.filter(Boolean));
  const selectedItems = draft.selectableItems.filter((item) => {
    const id = item.quoteItemId ?? item.id;
    return selectedIds.has(id) && !draft.orderedItemNumbers[id];
  });

  if (draft.readiness.blockers.length > 0) {
    throw new Error(`Не можна додати позиції. Блокери: ${draft.readiness.blockers.join(", ")}.`);
  }
  if (selectedItems.length === 0) {
    throw new Error("Виберіть хоча б одну позицію, якої ще немає в замовленні.");
  }

  const { error } = await supabase.schema("tosho").rpc("append_quote_items_to_order", {
    p_order_id: params.orderId,
    p_quote_id: params.quoteId,
    p_items: selectedItems.map(toOrderItemPayload),
  });
  if (error) throw describeOrderItemConflict(error) ?? new Error(error.message);
  return { id: params.orderId };
}

/** Обгортка для картки прорахунку: помилку віддає текстом, а не кидає. */
export async function addQuoteItemsToOrder(
  params: Parameters<typeof appendQuoteItemsToOrder>[0]
): Promise<{ ok: true; data: { id: string } } | { ok: false; message: string }> {
  try {
    return { ok: true, data: await appendQuoteItemsToOrder(params) };
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "";
    return { ok: false, message: message || "Не вдалося додати позиції до замовлення." };
  }
}
