import { supabase } from "@/lib/supabaseClient";

/**
 * Клієнт довідника адрес Нової Пошти (Phase 1). Усі виклики йдуть через
 * серверну функцію `/.netlify/functions/nova-poshta` (там живе секретний ключ і
 * білий список методів). Парсинг відповіді НП зосереджений ТУТ — якщо форма
 * полів відрізнятиметься при першому живому виклику, правимо в одному місці.
 */

const FUNCTION_URL = "/.netlify/functions/nova-poshta";

/** true → ключ НП не налаштований на сервері; UI має відкотитись на ручне введення. */
export class NovaPoshtaNotConfiguredError extends Error {
  constructor() {
    super("Nova Poshta API key is not configured");
    this.name = "NovaPoshtaNotConfiguredError";
  }
}

async function callNovaPoshta(
  modelName: string,
  calledMethod: string,
  methodProperties: Record<string, unknown>
): Promise<Array<Record<string, unknown>>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Не авторизовано");

  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ modelName, calledMethod, methodProperties }),
  });

  const body = (await response.json().catch(() => null)) as
    | { data?: unknown[]; error?: string }
    | null;

  if (!response.ok) {
    const message = body?.error ?? "Нова Пошта: помилка запиту";
    if (message.toLowerCase().includes("api key is not configured")) {
      throw new NovaPoshtaNotConfiguredError();
    }
    throw new Error(message);
  }
  return Array.isArray(body?.data) ? (body!.data as Array<Record<string, unknown>>) : [];
}

const str = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));

export type NpSettlement = {
  /** Ref для getWarehouses / майбутньої ТТН (CityRef, з фолбеком на SettlementRef). */
  ref: string;
  settlementRef: string;
  present: string;
  area: string;
  warehouses: number;
};

/** Автокомпліт населеного пункту (Address.searchSettlements). */
export async function searchNpSettlements(query: string, limit = 20): Promise<NpSettlement[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const data = await callNovaPoshta("Address", "searchSettlements", { CityName: trimmed, Limit: String(limit) });
  const addresses = Array.isArray(data[0]?.Addresses) ? (data[0].Addresses as Array<Record<string, unknown>>) : [];
  return addresses
    .map((address) => {
      const cityRef = str(address.DeliveryCity);
      const settlementRef = str(address.Ref);
      return {
        ref: cityRef || settlementRef,
        settlementRef,
        present: str(address.Present) || str(address.MainDescription),
        area: str(address.Area),
        warehouses: Number(address.Warehouses ?? 0),
      };
    })
    .filter((settlement) => settlement.ref && settlement.present);
}

export type NpWarehouse = {
  ref: string;
  description: string;
  number: string;
  isPostomat: boolean;
};

/** Відділення/поштомати населеного пункту (Address.getWarehouses). */
export async function listNpWarehouses(params: {
  cityRef: string;
  settlementRef?: string;
  query?: string;
  /** true — лише поштомати; false — лише відділення; undefined — усе. */
  postomat?: boolean;
  limit?: number;
}): Promise<NpWarehouse[]> {
  if (!params.cityRef && !params.settlementRef) return [];
  const props: Record<string, unknown> = { Limit: String(params.limit ?? 50), Page: "1" };
  if (params.cityRef) props.CityRef = params.cityRef;
  else if (params.settlementRef) props.SettlementRef = params.settlementRef;
  if (params.query?.trim()) props.FindByString = params.query.trim();

  const data = await callNovaPoshta("Address", "getWarehouses", props);
  const parsed = data
    .map((warehouse) => {
      const category = str(warehouse.CategoryOfWarehouse).toLowerCase();
      const typeCode = str(warehouse.TypeOfWarehouse).toLowerCase();
      return {
        ref: str(warehouse.Ref),
        description: str(warehouse.Description),
        number: str(warehouse.Number),
        isPostomat: category.includes("postomat") || typeCode.includes("postomat"),
      };
    })
    .filter((warehouse) => warehouse.ref && warehouse.description);

  if (params.postomat === undefined) return parsed;
  return parsed.filter((warehouse) => warehouse.isPostomat === params.postomat);
}

/* ── Phase 2: відправник ─────────────────────────────────────────────────
   Читання з кабінету НП для налаштування відправника. Побічних ефектів нема —
   лише список твоїх відправників і їхніх контактних осіб. */

export type NpSender = {
  /** Ref контрагента-відправника (потрібен для ТТН як Sender). */
  ref: string;
  name: string;
  edrpou: string;
};

/** Список відправників кабінету (Counterparty.getCounterparties, property=Sender). */
export async function getNpSenders(): Promise<NpSender[]> {
  const data = await callNovaPoshta("Counterparty", "getCounterparties", {
    CounterpartyProperty: "Sender",
    Page: "1",
  });
  return data
    .map((row) => ({
      ref: str(row.Ref),
      name: str(row.Description) || str(row.CounterpartyFullName),
      edrpou: str(row.EDRPOU),
    }))
    .filter((sender) => sender.ref && sender.name);
}

export type NpContactPerson = {
  /** Ref контактної особи (потрібен для ТТН як ContactSender). */
  ref: string;
  name: string;
  phone: string;
};

/** Контактні особи відправника (Counterparty.getCounterpartyContactPersons). */
export async function getNpContactPersons(counterpartyRef: string): Promise<NpContactPerson[]> {
  if (!counterpartyRef) return [];
  const data = await callNovaPoshta("Counterparty", "getCounterpartyContactPersons", {
    Ref: counterpartyRef,
    Page: "1",
  });
  return data
    .map((row) => ({
      ref: str(row.Ref),
      name: str(row.Description),
      phone: str(row.Phones) || str(row.Phone),
    }))
    .filter((contact) => contact.ref && contact.name);
}
