import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabaseClient";
import {
  groupSupplierPoolRows,
  sanitizeSearchTerm,
  transliterateSearchTerm,
  type SupplierPoolProduct,
  type SupplierPoolRow,
} from "@/lib/supplierPoolRows";

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

/**
 * Усі картки постачальників із «Підрядників» — їх два десятки, читаємо разом.
 * Теж через `supabase.schema("tosho")`: таблиця contractors є лише в tosho,
 * а `db` типізований перетином схем і такої таблиці «не бачить».
 */
export async function fetchSupplierContractors(): Promise<SupplierContractor[]> {
  const { data, error } = await supabase
    .schema("tosho")
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

/** Сторінка товарів одного постачальника: сирі рядки, скільки різних назв у ній, скільки товарів усього під запит. */
export type SupplierProductsPage = {
  rows: SupplierPoolRow[];
  names: number;
  total: number;
  products: SupplierPoolProduct[];
};

export const SUPPLIER_PRODUCTS_PAGE_SIZE = 40;

/**
 * Слова запиту для RPC — так само, як у searchSupplierPool: оригінал плюс
 * транслітерація, коротше двох символів — порожньо (перегляд усього).
 */
export function searchTermsFor(term: string): string[] {
  const clean = sanitizeSearchTerm(term);
  if (clean.length < 2) return [];
  const variants = new Set<string>([clean.toLowerCase()]);
  const translit = transliterateSearchTerm(clean);
  if (translit && translit !== clean.toLowerCase()) variants.add(translit);
  return [...variants];
}

export async function fetchSupplierProducts(input: {
  slug: string;
  terms: readonly string[];
  category: string | null;
  offset: number;
  limit?: number;
}): Promise<SupplierProductsPage> {
  const limit = input.limit ?? SUPPLIER_PRODUCTS_PAGE_SIZE;
  const { data, error } = await supabase.schema("tosho").rpc("list_supplier_products", {
    p_slug: input.slug,
    p_terms: input.terms.length ? [...input.terms] : null,
    p_category: input.category,
    p_limit: limit,
    p_offset: input.offset,
  });
  if (error) throw error;
  const raw = (data ?? []) as unknown as Array<SupplierPoolRow & { total: number | string }>;
  const total = raw.length ? toNumber(raw[0].total) : 0;
  const rows: SupplierPoolRow[] = raw.map(({ total: _total, ...row }) => row);
  return {
    rows,
    names: new Set(rows.map((row) => row.name)).size,
    total,
    // Той самий згортач, що в пошуку прорахунку: кольори всередину картки.
    products: groupSupplierPoolRows(rows, limit, input.terms),
  };
}

/**
 * Нескінченна вибірка сторінками по ТОВАРАХ: зсув наступної сторінки — це
 * скільки різних назв уже завантажено, а не скільки рядків.
 */
export function useSupplierProducts(slug: string, terms: readonly string[], category: string | null) {
  return useInfiniteQuery({
    queryKey: supplierKeys.products(slug, terms, category),
    queryFn: ({ pageParam }) => fetchSupplierProducts({ slug, terms, category, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.names, 0);
      return lastPage.names > 0 && loaded < lastPage.total ? loaded : undefined;
    },
    staleTime: 60_000,
  });
}

export type SupplierCategory = { category: string; products: number };

export async function fetchSupplierCategories(slug: string): Promise<SupplierCategory[]> {
  const { data, error } = await supabase.schema("tosho").rpc("supplier_pool_categories", { p_slug: slug });
  if (error) throw error;
  return ((data ?? []) as unknown as SupplierCategory[]).map((row) => ({
    category: row.category,
    products: toNumber(row.products),
  }));
}

export function useSupplierCategories(slug: string) {
  return useQuery({
    queryKey: supplierKeys.categories(slug),
    queryFn: () => fetchSupplierCategories(slug),
    staleTime: 5 * 60_000,
  });
}
