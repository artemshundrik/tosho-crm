import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { resolveWorkspaceId } from "@/lib/workspace";

/**
 * Ставки ціноутворення компанії: постійні витрати і податковий резерв.
 *
 * Досі це були константи в коді, продубльовані у двох сторінках — змінити
 * означало деплой, а розбіжність між копіями дала б різні ціни з різних
 * екранів. Тепер вони в tosho.company_pricing_rates (див.
 * scripts/company-pricing-rates.sql), а тут — доступ і кеш.
 *
 * Ставка МЕНЕДЖЕРА сюди не належить: вона персональна, у
 * tosho.team_member_manager_rates.
 */

/** Останній рубіж, якщо таблиця недоступна. Ті самі числа, що були в коді. */
export const FALLBACK_FIXED_COST_RATE = 30;
export const FALLBACK_VAT_RATE = 20;

export type CompanyPricingRates = {
  fixedCostRate: number;
  vatRate: number;
};

export type CompanyPricingRateChange = {
  id: number;
  field: "fixed_cost_rate" | "vat_rate";
  oldValue: number | null;
  newValue: number;
  changedBy: string | null;
  changedAt: string;
};

const DEFAULTS: CompanyPricingRates = {
  fixedCostRate: FALLBACK_FIXED_COST_RATE,
  vatRate: FALLBACK_VAT_RATE,
};

/**
 * Модульний кеш: ставки читає КОЖЕН прорахунок при відкритті, а міняються
 * вони кілька разів на рік. Скидається цілком (не патчиться по полях) —
 * на директорії учасників уже наступали на часткове оновлення кешу.
 */
let cached: { workspaceId: string; rates: CompanyPricingRates } | null = null;

export function clearCompanyPricingRatesCache() {
  cached = null;
}

function toRate(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function loadCompanyPricingRates(userId?: string | null): Promise<CompanyPricingRates> {
  const workspaceId = await resolveWorkspaceId(userId);
  if (!workspaceId) return { ...DEFAULTS };
  if (cached && cached.workspaceId === workspaceId) return { ...cached.rates };

  const { data, error } = await supabase
    .schema("tosho")
    .from("company_pricing_rates")
    .select("fixed_cost_rate,vat_rate")
    .eq("workspace_id", workspaceId)
    .maybeSingle<{ fixed_cost_rate?: number | null; vat_rate?: number | null }>();

  // Немає таблиці або рядка — працюємо на дефолтах. Прорахунки важливіші за
  // налаштування: краще порахувати старими ставками, ніж не порахувати зовсім.
  if (error) {
    if (!/does not exist|relation|schema cache|could not find the table/i.test(error.message ?? "")) {
      console.error("Failed to load company pricing rates", error);
    }
    return { ...DEFAULTS };
  }

  const rates: CompanyPricingRates = {
    fixedCostRate: toRate(data?.fixed_cost_rate, FALLBACK_FIXED_COST_RATE),
    vatRate: toRate(data?.vat_rate, FALLBACK_VAT_RATE),
  };
  cached = { workspaceId, rates };
  return { ...rates };
}

export async function saveCompanyPricingRates(
  rates: CompanyPricingRates,
  userId?: string | null
): Promise<CompanyPricingRates> {
  const workspaceId = await resolveWorkspaceId(userId);
  if (!workspaceId) throw new Error("Не вдалося визначити воркспейс.");

  const payload = {
    workspace_id: workspaceId,
    fixed_cost_rate: toRate(rates.fixedCostRate, FALLBACK_FIXED_COST_RATE),
    vat_rate: toRate(rates.vatRate, FALLBACK_VAT_RATE),
    updated_at: new Date().toISOString(),
    updated_by: userId ?? null,
  };

  // .select() обов'язковий: без нього supabase мовчить, коли RLS не пустила
  // й оновилось 0 рядків — «зберегли» без збереження.
  const { data, error } = await supabase
    .schema("tosho")
    .from("company_pricing_rates")
    .upsert(payload, { onConflict: "workspace_id" })
    .select("fixed_cost_rate,vat_rate")
    .maybeSingle<{ fixed_cost_rate?: number | null; vat_rate?: number | null }>();

  if (error) throw error;
  if (!data) throw new Error("Ставки не збережено — бракує прав.");

  clearCompanyPricingRatesCache();
  return {
    fixedCostRate: toRate(data.fixed_cost_rate, FALLBACK_FIXED_COST_RATE),
    vatRate: toRate(data.vat_rate, FALLBACK_VAT_RATE),
  };
}

export async function loadCompanyPricingRateHistory(
  userId?: string | null,
  limit = 20
): Promise<CompanyPricingRateChange[]> {
  const workspaceId = await resolveWorkspaceId(userId);
  if (!workspaceId) return [];

  const { data, error } = await supabase
    .schema("tosho")
    .from("company_pricing_rate_changes")
    .select("id,field,old_value,new_value,changed_by,changed_at")
    .eq("workspace_id", workspaceId)
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (!/does not exist|relation|schema cache|could not find the table/i.test(error.message ?? "")) {
      console.error("Failed to load pricing rate history", error);
    }
    return [];
  }

  return ((data ?? []) as Array<{
    id: number;
    field: string;
    old_value: number | null;
    new_value: number;
    changed_by: string | null;
    changed_at: string;
  }>).map((row) => ({
    id: row.id,
    field: row.field === "vat_rate" ? "vat_rate" : "fixed_cost_rate",
    oldValue: row.old_value === null ? null : Number(row.old_value),
    newValue: Number(row.new_value),
    changedBy: row.changed_by,
    changedAt: row.changed_at,
  }));
}

/**
 * Ставки для сторінок прорахунків. До завантаження віддає ті самі числа, що
 * були зашиті в коді, — тож перший кадр рахується так само, як раніше, а не
 * порожнечею. Хук потрібен саме як хук (а не разове читання кешу): коли CEO
 * змінить ставку, сторінка має перемалюватись, а не показувати старе до
 * перезавантаження.
 */
export function useCompanyPricingRates(userId?: string | null): CompanyPricingRates {
  const [rates, setRates] = useState<CompanyPricingRates>(DEFAULTS);

  useEffect(() => {
    let alive = true;
    void loadCompanyPricingRates(userId).then((next) => {
      if (alive) setRates(next);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  return rates;
}
