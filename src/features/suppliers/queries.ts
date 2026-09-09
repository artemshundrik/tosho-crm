import { useQuery } from "@tanstack/react-query";

import { db, supabase } from "@/lib/supabaseClient";

import type { SupplierDefinition } from "./suppliersCatalog";
import type { SupplierPoolSummaryRow } from "./suppliersStatus";

/**
 * Запити сторінки «Постачальники». Усе — читання; RPC живуть у
 * scripts/supplier-pool-page.sql і працюють під чинною RLS пулу.
 *
 * Через `supabase.schema("tosho")`, а не `db`: типи `db` — перетин схем,
 * і нові RPC він не бачить (так само кличуть search_supplier_pool).
 */

export const supplierKeys = {
  summary: ["suppliers", "summary"] as const,
  contractors: ["suppliers", "contractors"] as const,
  products: (slug: string, terms: readonly string[], category: string | null) =>
    ["suppliers", "products", slug, terms.join(" "), category ?? ""] as const,
  categories: (slug: string) => ["suppliers", "categories", slug] as const,
};

const toNumber = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0));

export async function fetchSupplierPoolSummary(): Promise<SupplierPoolSummaryRow[]> {
  const { data, error } = await supabase.schema("tosho").rpc("supplier_pool_summary");
  if (error) throw error;
  // bigint із PostgREST може приїхати рядком — числа приводимо тут, один раз.
  return ((data ?? []) as unknown as SupplierPoolSummaryRow[]).map((row) => ({
    ...row,
    rows_active: toNumber(row.rows_active),
    products: toNumber(row.products),
    with_price: toNumber(row.with_price),
    with_photo: toNumber(row.with_photo),
    categories: toNumber(row.categories),
  }));
}

/** Стан пулу міняється раз на добу — п'ять хвилин свіжості нікому нічого не забирають. */
export function useSupplierPoolSummary() {
  return useQuery({ queryKey: supplierKeys.summary, queryFn: fetchSupplierPoolSummary, staleTime: 5 * 60_000 });
}

export type SupplierContractor = {
  id: string;
  name: string;
  contact_name: string | null;
  phones: string[] | null;
  emails: string[] | null;
  website: string | null;
  notes: string | null;
};

/** Усі картки постачальників із «Підрядників» — їх два десятки, читаємо разом. */
export async function fetchSupplierContractors(): Promise<SupplierContractor[]> {
  const { data, error } = await db
    .from("contractors")
    .select("id, name, contact_name, phones, emails, website, notes")
    .eq("kind", "supplier");
  if (error) throw error;
  return (data ?? []) as unknown as SupplierContractor[];
}

export function useSupplierContractors() {
  return useQuery({ queryKey: supplierKeys.contractors, queryFn: fetchSupplierContractors, staleTime: 5 * 60_000 });
}

const hostOf = (url: string | null): string | null => {
  if (!url?.trim()) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Картка підрядника для постачальника: у під'єднаного — за прив'язкою з пулу
 * (contractor_id), у запланованого — за збігом домену сайту.
 */
export function contractorForSupplier(
  definition: SupplierDefinition,
  summary: SupplierPoolSummaryRow | null | undefined,
  contractors: SupplierContractor[] | undefined
): SupplierContractor | null {
  if (!contractors?.length) return null;
  if (summary?.contractor_id) {
    const byId = contractors.find((c) => c.id === summary.contractor_id);
    if (byId) return byId;
  }
  return contractors.find((c) => hostOf(c.website) === definition.slug) ?? null;
}
