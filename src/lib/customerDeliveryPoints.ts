import { Building2, MapPin, Package, Truck, type LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Delivery points (Логістика) for customers and leads.
 *
 * Stored as a jsonb array in `customers.delivery_points` / `leads.delivery_points`
 * (same repeatable-rows pattern as contacts and legal_entities). Manual entry for
 * now; the np* ref fields are reserved so the future Nova Poshta API integration
 * can attach City/Warehouse refs without a schema change — manual rows will get
 * refs backfilled via autocomplete once the API lands.
 */

export type CustomerDeliveryPointType = "np_branch" | "np_postomat" | "np_courier" | "other";

export type CustomerDeliveryPoint = {
  id: string;
  type: CustomerDeliveryPointType;
  /** Населений пункт, як його вводить менеджер (пізніше — з довідника НП). */
  city: string;
  /** Відділення/поштомат ("Відділення №23") або вулиця-будинок для адресної доставки. */
  address: string;
  /** Хто приймає вантаж у цій точці. */
  contactName: string;
  contactPhone: string;
  comment: string;
  isDefault: boolean;
  /** Майбутнє НП API: Ref міста з довідника (не редагується вручну). */
  npCityRef: string | null;
  /** Майбутнє НП API: Ref відділення/поштомата з довідника. */
  npWarehouseRef: string | null;
};

export const DELIVERY_POINT_TYPE_OPTIONS: Array<{ value: CustomerDeliveryPointType; label: string }> = [
  { value: "np_branch", label: "Відділення Нової Пошти" },
  { value: "np_postomat", label: "Поштомат Нової Пошти" },
  { value: "np_courier", label: "Адресна доставка (кур'єр НП)" },
  { value: "other", label: "Інше (самовивіз, інший перевізник)" },
];

export const DELIVERY_POINT_TYPE_LABELS: Record<CustomerDeliveryPointType, string> =
  DELIVERY_POINT_TYPE_OPTIONS.reduce(
    (acc, option) => {
      acc[option.value] = option.label;
      return acc;
    },
    {} as Record<CustomerDeliveryPointType, string>
  );

export const DELIVERY_POINT_TYPE_ICONS: Record<CustomerDeliveryPointType, LucideIcon> = {
  np_branch: Building2,
  np_postomat: Package,
  np_courier: Truck,
  other: MapPin,
};

const isDeliveryPointType = (value: unknown): value is CustomerDeliveryPointType =>
  value === "np_branch" || value === "np_postomat" || value === "np_courier" || value === "other";

const generateDeliveryPointId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `delivery-point-${Math.random().toString(36).slice(2, 10)}`;
};

export const createEmptyCustomerDeliveryPoint = (): CustomerDeliveryPoint => ({
  id: generateDeliveryPointId(),
  type: "np_branch",
  city: "",
  address: "",
  contactName: "",
  contactPhone: "",
  comment: "",
  isDefault: false,
  npCityRef: null,
  npWarehouseRef: null,
});

const toTrimmedString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const parseCustomerDeliveryPoints = (value: unknown): CustomerDeliveryPoint[] => {
  if (!Array.isArray(value)) return [];
  const points = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const point: CustomerDeliveryPoint = {
        id: toTrimmedString(row.id) || generateDeliveryPointId(),
        type: isDeliveryPointType(row.type) ? row.type : "np_branch",
        city: toTrimmedString(row.city),
        address: toTrimmedString(row.address),
        contactName: toTrimmedString(row.contact_name),
        contactPhone: toTrimmedString(row.contact_phone),
        comment: toTrimmedString(row.comment),
        isDefault: row.is_default === true,
        npCityRef: toTrimmedString(row.np_city_ref) || null,
        npWarehouseRef: toTrimmedString(row.np_warehouse_ref) || null,
      };
      const hasAnyValue = point.city || point.address || point.contactName || point.contactPhone || point.comment;
      return hasAnyValue ? point : null;
    })
    .filter((entry): entry is CustomerDeliveryPoint => entry !== null);
  return ensureSingleDefault(points);
};

/** Не більше одного дефолта; якщо жодного — дефолтом стає перша точка. */
const ensureSingleDefault = (points: CustomerDeliveryPoint[]): CustomerDeliveryPoint[] => {
  if (points.length === 0) return points;
  const firstDefaultIndex = points.findIndex((point) => point.isDefault);
  const defaultIndex = firstDefaultIndex === -1 ? 0 : firstDefaultIndex;
  return points.map((point, index) => ({ ...point, isDefault: index === defaultIndex }));
};

/** Trim + drop порожніх рядків + гарантія одного дефолта. Формат — snake_case для jsonb. */
export const serializeCustomerDeliveryPoints = (points: CustomerDeliveryPoint[]) =>
  ensureSingleDefault(
    points
      .map((point) => ({
        ...point,
        city: point.city.trim(),
        address: point.address.trim(),
        contactName: point.contactName.trim(),
        contactPhone: point.contactPhone.trim(),
        comment: point.comment.trim(),
      }))
      .filter((point) => point.city || point.address || point.contactName || point.contactPhone || point.comment)
  ).map((point) => ({
    id: point.id,
    type: point.type,
    city: point.city,
    address: point.address,
    contact_name: point.contactName,
    contact_phone: point.contactPhone,
    comment: point.comment,
    is_default: point.isDefault,
    np_city_ref: point.npCityRef,
    np_warehouse_ref: point.npWarehouseRef,
  }));

/** "Відділення Нової Пошти · Київ, Відділення №23" — для read-only показу. */
export const formatCustomerDeliveryPointSummary = (point: CustomerDeliveryPoint) => {
  const location = [point.city, point.address].filter(Boolean).join(", ");
  return location ? `${DELIVERY_POINT_TYPE_LABELS[point.type]} · ${location}` : DELIVERY_POINT_TYPE_LABELS[point.type];
};

// ---------------------------------------------------------------------------
// Міст із формою прорахунку: там тип НП зберігається як npDeliveryType
// ("branch" | "locker" | "address"), у книзі клієнта — як CustomerDeliveryPointType.
// ---------------------------------------------------------------------------

export const npDeliveryTypeToPointType = (value: string): CustomerDeliveryPointType | null => {
  if (value === "branch") return "np_branch";
  if (value === "locker") return "np_postomat";
  if (value === "address") return "np_courier";
  return null;
};

export const pointTypeToNpDeliveryType = (type: CustomerDeliveryPointType): string => {
  if (type === "np_branch") return "branch";
  if (type === "np_postomat") return "locker";
  if (type === "np_courier") return "address";
  return "";
};

/** Адреси доставки замовника або ліда (порожній масив, якщо сторону не знайдено). */
export async function listPartyDeliveryPoints(params: {
  teamId: string;
  partyType: "customer" | "lead";
  partyId: string;
}): Promise<CustomerDeliveryPoint[]> {
  const table = params.partyType === "lead" ? "leads" : "customers";
  const { data, error } = await supabase
    .schema("tosho")
    .from(table)
    .select("delivery_points")
    .eq("team_id", params.teamId)
    .eq("id", params.partyId)
    .maybeSingle<{ delivery_points?: unknown }>();
  if (error) throw error;
  return parseCustomerDeliveryPoints(data?.delivery_points);
}

const deliveryPointDedupeKey = (point: Pick<CustomerDeliveryPoint, "type" | "city" | "address">) =>
  [point.type, point.city.trim().toLowerCase(), point.address.trim().toLowerCase()].join("|");

/**
 * Дописує адресу в книгу замовника/ліда (read-modify-write). Якщо така сама
 * точка (тип+місто+адреса) вже збережена — нічого не пише й повертає її id,
 * тож повторні збереження з прорахунків не плодять дублі.
 */
export async function appendDeliveryPointToParty(params: {
  teamId: string;
  partyType: "customer" | "lead";
  partyId: string;
  point: CustomerDeliveryPoint;
}): Promise<string> {
  const existing = await listPartyDeliveryPoints(params);
  const duplicate = existing.find(
    (entry) => deliveryPointDedupeKey(entry) === deliveryPointDedupeKey(params.point)
  );
  if (duplicate) return duplicate.id;

  const nextPoint: CustomerDeliveryPoint = { ...params.point, isDefault: existing.length === 0 };
  const table = params.partyType === "lead" ? "leads" : "customers";
  const { error } = await supabase
    .schema("tosho")
    .from(table)
    .update({ delivery_points: serializeCustomerDeliveryPoints([...existing, nextPoint]) })
    .eq("team_id", params.teamId)
    .eq("id", params.partyId);
  if (error) throw error;
  return nextPoint.id;
}
