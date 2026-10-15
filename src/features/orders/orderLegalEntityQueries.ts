import { buildExecutorFromLegalEntity, storedLegalEntityId, type ClosingDocument, type LegalEntityRow, type OrderExecutor } from "./orderExecutor";
import type { Json } from "@/lib/database.types";
import { supabase } from "@/lib/supabaseClient";

/**
 * Наша юрособа на замовленні (REQ-322#p1–p3). Довідник читаємо функцією
 * list_order_legal_entities — таблицю бачить лише фінансове коло.
 */
export type OrderLegalEntityOption = { row: LegalEntityRow; executor: OrderExecutor };

export async function listOrderLegalEntities(teamId: string): Promise<OrderLegalEntityOption[]> {
  const { data, error } = await supabase.schema("tosho").rpc("list_order_legal_entities", { _team_id: teamId });
  if (error) {
    // Міграцію ще не застосовано — вибору немає, документи йдуть від ТОВ.
    if (/list_order_legal_entities|does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(error.message, { cause: error });
  }
  return ((data ?? []) as LegalEntityRow[]).map((row) => ({ row, executor: buildExecutorFromLegalEntity(row) }));
}

/** Юрособа з останнього замовлення замовника — підставляється в нове. */
export async function findCustomerLastLegalEntityId(teamId: string, customerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("orders")
    .select("our_legal_entity_id")
    .eq("team_id", teamId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ our_legal_entity_id: string | null }>();
  if (error) return null;
  return data?.our_legal_entity_id ?? null;
}

/**
 * Поля для update замовлення: посилання + знімок реквізитів. ТОВ — обидва null
 * (див. storedLegalEntityId).
 */
export const legalEntityColumns = (option: OrderLegalEntityOption | null) => {
  const id = storedLegalEntityId(option);
  return { our_legal_entity_id: id, our_legal_entity: id && option ? (option.executor as unknown as Json) : null };
};

/**
 * Для insert: колонки лише коли документи не від ТОВ. Без міграції вставка
 * ТОВ-замовлення тоді не падає на «column not found».
 */
export const legalEntityInsertColumns = (option: OrderLegalEntityOption | null) =>
  storedLegalEntityId(option) ? legalEntityColumns(option) : {};

export async function setOrderLegalEntity(params: {
  teamId: string;
  orderId: string;
  option: OrderLegalEntityOption;
}): Promise<void> {
  const { error } = await supabase
    .schema("tosho")
    .from("orders")
    // Власний підпис договору був від попередньої юрособи — він не переходить.
    .update({
      ...legalEntityColumns(params.option),
      contract_signed_at: null,
      contract_signed_via: null,
      updated_at: new Date().toISOString(),
    })
    .eq("team_id", params.teamId)
    .eq("id", params.orderId);
  if (error) throw new Error(error.message || "Не вдалося змінити юрособу.", { cause: error });
}

export async function setOrderClosingDocument(params: {
  teamId: string;
  orderId: string;
  closingDocument: ClosingDocument;
}): Promise<void> {
  const { error } = await supabase
    .schema("tosho")
    .from("orders")
    .update({ closing_document: params.closingDocument, updated_at: new Date().toISOString() })
    .eq("team_id", params.teamId)
    .eq("id", params.orderId);
  if (error) throw new Error(error.message || "Не вдалося зберегти закривальний документ.", { cause: error });
}

/**
 * Юрособа для нового замовлення: явно обрана, інакше з останнього замовлення
 * замовника, інакше null (документи від ТОВ). Збій довідника не зупиняє
 * створення замовлення — юрособу можна змінити в картці.
 */
export async function resolveOrderLegalEntity(params: {
  teamId: string;
  customerId: string | null | undefined;
  explicitId?: string | null;
}): Promise<OrderLegalEntityOption | null> {
  try {
    const options = await listOrderLegalEntities(params.teamId);
    const wantedId =
      params.explicitId ??
      (params.customerId ? await findCustomerLastLegalEntityId(params.teamId, params.customerId) : null);
    if (!wantedId) return null;
    return options.find((option) => option.row.id === wantedId) ?? null;
  } catch {
    return null;
  }
}

/** Номер і дата акта з BAS. Тригер пускає лише бухгалтерію, СЕО й owner. */
export async function setOrderActNumber(params: {
  teamId: string;
  orderId: string;
  number: string;
  date: string;
}): Promise<{ actNumber: string | null; actDate: string | null }> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("orders")
    .update({ act_number: params.number.trim() || null, act_date: params.date || null, updated_at: new Date().toISOString() })
    .eq("team_id", params.teamId)
    .eq("id", params.orderId)
    .select("act_number,act_date")
    .single<{ act_number: string | null; act_date: string | null }>();
  if (error) throw new Error(error.message || "Не вдалося зберегти номер акта.", { cause: error });
  return { actNumber: data.act_number, actDate: data.act_date };
}
