import { supabase } from "@/lib/supabaseClient";
import { normalizeCustomerLogoUrl } from "@/lib/customerLogo";

/**
 * Коротка довідка про замовника або ліда — для картки під курсором.
 *
 * Вантажимо ЛІНИВО, у момент наведення: списки прорахунків і дизайн-задач
 * тягнуть лише назву й логотип, а доливати контакти в кожен рядок наперед —
 * це зайві сотні полів на сторінку заради даних, які здебільшого ніхто не
 * подивиться.
 *
 * Відповідь кешується в модулі: повторне наведення на ту саму картку мережу
 * вже не чіпає.
 */

export type PartyKind = "customer" | "lead";

export type PartyHoverInfo = {
  id: string;
  kind: PartyKind;
  name: string;
  legalName: string | null;
  logoUrl: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  managerUserId: string | null;
  /** Ім'я менеджера з тексту, якщо користувача не прив'язано. */
  managerName: string | null;
  source: string | null;
  reminderAt: string | null;
  eventName: string | null;
  eventAt: string | null;
};

const cache = new Map<string, PartyHoverInfo | null>();
const inFlight = new Map<string, Promise<PartyHoverInfo | null>>();

function cacheKey(kind: PartyKind, id: string) {
  return `${kind}:${id}`;
}

function firstPhone(value: unknown): string | null {
  if (Array.isArray(value)) {
    const found = value.find((item) => typeof item === "string" && item.trim());
    return typeof found === "string" ? found.trim() : null;
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

async function fetchCustomer(id: string): Promise<PartyHoverInfo | null> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("customers")
    .select(
      "id,name,legal_name,logo_url,contact_name,phone,email,contact_phone,contact_email,website,manager,manager_user_id"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    kind: "customer",
    name: data.name?.trim() || data.legal_name?.trim() || "Замовник",
    legalName: data.legal_name?.trim() || null,
    logoUrl: normalizeCustomerLogoUrl(data.logo_url ?? null),
    contactName: data.contact_name?.trim() || null,
    phone: data.phone?.trim() || data.contact_phone?.trim() || null,
    email: data.email?.trim() || data.contact_email?.trim() || null,
    website: data.website?.trim() || null,
    managerUserId: data.manager_user_id ?? null,
    managerName: data.manager?.trim() || null,
    source: null,
    reminderAt: null,
    eventName: null,
    eventAt: null,
  };
}

async function fetchLead(id: string): Promise<PartyHoverInfo | null> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("leads")
    .select(
      "id,company_name,legal_name,logo_url,first_name,last_name,email,phone_numbers,website,source,manager,manager_user_id"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const contactName = [data.first_name?.trim(), data.last_name?.trim()].filter(Boolean).join(" ") || null;

  return {
    id: data.id,
    kind: "lead",
    name: data.company_name?.trim() || data.legal_name?.trim() || contactName || "Лід",
    legalName: data.legal_name?.trim() || null,
    logoUrl: normalizeCustomerLogoUrl(data.logo_url ?? null),
    contactName,
    phone: firstPhone(data.phone_numbers),
    email: data.email?.trim() || null,
    website: data.website?.trim() || null,
    managerUserId: data.manager_user_id ?? null,
    managerName: data.manager?.trim() || null,
    source: data.source?.trim() || null,
    reminderAt: null,
    eventName: null,
    eventAt: null,
  };
}

export async function loadPartyHoverInfo(kind: PartyKind, id: string): Promise<PartyHoverInfo | null> {
  const key = cacheKey(kind, id);
  if (cache.has(key)) return cache.get(key) ?? null;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (kind === "customer" ? fetchCustomer(id) : fetchLead(id))
    .catch((error) => {
      // Картка — допоміжна річ: не показати її краще, ніж зламати сторінку.
      console.warn("[party-hover] load failed", error);
      return null;
    })
    .then((value) => {
      cache.set(key, value);
      inFlight.delete(key);
      return value;
    });

  inFlight.set(key, promise);
  return promise;
}

export function getCachedPartyHoverInfo(kind: PartyKind, id: string) {
  return cache.get(cacheKey(kind, id)) ?? null;
}
