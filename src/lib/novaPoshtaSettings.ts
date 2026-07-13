import { supabase } from "@/lib/supabaseClient";

/**
 * Налаштування відправника Нової Пошти (рівень команди). Дефолти для створення
 * ТТН — читаються в діалозі ТТН і редагуються в Налаштуваннях → Нова Пошта.
 * Секрет ключа тут не зберігається (лише в env серверної функції).
 */

export type NovaPoshtaSettings = {
  senderRef: string;
  senderName: string;
  senderContactRef: string;
  senderContactName: string;
  senderPhone: string;
  senderCityRef: string;
  senderCityName: string;
  senderWarehouseRef: string;
  senderWarehouseName: string;
  defaultPayer: string;
  defaultPaymentMethod: string;
  defaultCargoType: string;
  defaultServiceType: string;
  defaultWeight: number | null;
  defaultSeats: number;
  defaultDescription: string;
};

export const EMPTY_NOVA_POSHTA_SETTINGS: NovaPoshtaSettings = {
  senderRef: "",
  senderName: "",
  senderContactRef: "",
  senderContactName: "",
  senderPhone: "",
  senderCityRef: "",
  senderCityName: "",
  senderWarehouseRef: "",
  senderWarehouseName: "",
  defaultPayer: "Recipient",
  defaultPaymentMethod: "Cash",
  defaultCargoType: "Parcel",
  defaultServiceType: "WarehouseWarehouse",
  defaultWeight: null,
  defaultSeats: 1,
  defaultDescription: "",
};

const str = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));

type NovaPoshtaSettingsRow = Record<string, unknown>;

const mapRow = (row: NovaPoshtaSettingsRow): NovaPoshtaSettings => ({
  senderRef: str(row.sender_ref),
  senderName: str(row.sender_name),
  senderContactRef: str(row.sender_contact_ref),
  senderContactName: str(row.sender_contact_name),
  senderPhone: str(row.sender_phone),
  senderCityRef: str(row.sender_city_ref),
  senderCityName: str(row.sender_city_name),
  senderWarehouseRef: str(row.sender_warehouse_ref),
  senderWarehouseName: str(row.sender_warehouse_name),
  defaultPayer: str(row.default_payer) || "Recipient",
  defaultPaymentMethod: str(row.default_payment_method) || "Cash",
  defaultCargoType: str(row.default_cargo_type) || "Parcel",
  defaultServiceType: str(row.default_service_type) || "WarehouseWarehouse",
  defaultWeight: typeof row.default_weight === "number" ? row.default_weight : row.default_weight ? Number(row.default_weight) : null,
  defaultSeats: typeof row.default_seats === "number" ? row.default_seats : Number(row.default_seats ?? 1) || 1,
  defaultDescription: str(row.default_description),
});

/** Завантажити налаштування команди (null — ще не налаштовано). */
export async function loadNovaPoshtaSettings(teamId: string): Promise<NovaPoshtaSettings | null> {
  if (!teamId) return null;
  const { data, error } = await supabase
    .schema("tosho")
    .from("nova_poshta_settings" as never)
    .select("*")
    .eq("team_id", teamId)
    .maybeSingle<NovaPoshtaSettingsRow>();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

/** Зберегти (upsert) налаштування команди. updated_at виставляє тригер. */
export async function saveNovaPoshtaSettings(teamId: string, settings: NovaPoshtaSettings): Promise<void> {
  const row = {
    team_id: teamId,
    sender_ref: settings.senderRef || null,
    sender_name: settings.senderName || null,
    sender_contact_ref: settings.senderContactRef || null,
    sender_contact_name: settings.senderContactName || null,
    sender_phone: settings.senderPhone || null,
    sender_city_ref: settings.senderCityRef || null,
    sender_city_name: settings.senderCityName || null,
    sender_warehouse_ref: settings.senderWarehouseRef || null,
    sender_warehouse_name: settings.senderWarehouseName || null,
    default_payer: settings.defaultPayer || "Recipient",
    default_payment_method: settings.defaultPaymentMethod || "Cash",
    default_cargo_type: settings.defaultCargoType || "Parcel",
    default_service_type: settings.defaultServiceType || "WarehouseWarehouse",
    default_weight: settings.defaultWeight,
    default_seats: settings.defaultSeats || 1,
    default_description: settings.defaultDescription || null,
  };
  const { error } = await supabase
    .schema("tosho")
    .from("nova_poshta_settings" as never)
    .upsert(row as never, { onConflict: "team_id" });
  if (error) throw error;
}
