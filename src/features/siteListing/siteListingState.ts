import { siteListingPrice } from "@/lib/siteListing/price";
import type { SiteListingDraft } from "@/lib/siteListing/types";

/**
 * Стан черги «На сайт» (REQ-311#p4) — чиста логіка без React і без бази.
 * Рядок — відповідь `tosho.site_listing_candidates(p_supplier)`.
 */

export type SiteListingCandidate = {
  model_name: string;
  articles: string[];
  colors: number;
  priced_colors: number;
  supplier_price_min: number | null;
  supplier_price_max: number | null;
  image_url: string | null;
  supplier_url: string | null;
  is_new: boolean;
  section: string | null;
  category: string | null;
  vendor: string | null;
  first_seen_at: string | null;
  item_id: string | null;
  decision: "take" | "skip" | null;
  /** «running» — фонова функція вже взяла чернетку в роботу. */
  draft_status: "none" | "pending" | "running" | "ready" | "failed" | null;
  draft_error: string | null;
  draft: SiteListingDraft | null;
  category_override: string | null;
  batch_id: string | null;
  batch_created_at: string | null;
  item_updated_at: string | null;
};

export type SiteListingTab = "new" | "take" | "file" | "skip";

export const SITE_LISTING_TABS: ReadonlyArray<{ key: SiteListingTab; label: string }> = [
  { key: "new", label: "Нові" },
  { key: "take", label: "Беремо" },
  { key: "file", label: "У файлі" },
  { key: "skip", label: "Не беремо" },
];

/** Постачальники, яких автоперенесення вже стосується (спека: перше джерело — Тотобі). */
export const SITE_LISTING_SUPPLIERS: ReadonlySet<string> = new Set(["totobi.com.ua"]);

export function candidateTab(candidate: SiteListingCandidate): SiteListingTab {
  if (candidate.decision === "skip") return "skip";
  if (candidate.decision === "take") return candidate.batch_id ? "file" : "take";
  return "new";
}

/**
 * «Готується» довше за 10 хвилин — виклик обірвався: фонова функція
 * вкладається в хвилину, а з помилкою вона записала б `failed`. Показуємо як
 * невдачу з кнопкою «Спробувати ще», інакше рядок висів би вічно.
 */
export const DRAFT_STALE_MS = 10 * 60_000;

export type DraftView = "none" | "pending" | "ready" | "failed";

export function draftView(candidate: SiteListingCandidate, now: number): DraftView {
  if (candidate.draft_status === "ready" && candidate.draft) return "ready";
  if (candidate.draft_status === "pending" || candidate.draft_status === "running") {
    const updated = candidate.item_updated_at ? Date.parse(candidate.item_updated_at) : Number.NaN;
    return Number.isFinite(updated) && now - updated > DRAFT_STALE_MS ? "failed" : "pending";
  }
  if (candidate.draft_status === "failed") return "failed";
  return "none";
}

export function draftErrorText(candidate: SiteListingCandidate): string {
  if (candidate.draft_status === "pending" || candidate.draft_status === "running") {
    return "Чернетка готується понад 10 хвилин — схоже, виклик обірвався.";
  }
  return candidate.draft_error?.trim() || "Чернетка не вдалася.";
}

/** «Беремо» лише з ціною постачальника на кожен колір: без неї нашої ціни немає. */
export function canTake(candidate: SiteListingCandidate): boolean {
  return candidate.colors > 0 && candidate.priced_colors === candidate.colors;
}

/** Розділ для файлу: вибраний у CRM руками важливіший за чернетку. */
export function fileCategory(candidate: SiteListingCandidate): string | null {
  return candidate.category_override?.trim() || candidate.draft?.category?.trim() || null;
}

export function readyForFile(candidate: SiteListingCandidate, now: number): boolean {
  return candidateTab(candidate) === "take" && draftView(candidate, now) === "ready" && fileCategory(candidate) !== null;
}

export function countByTab(candidates: SiteListingCandidate[]): Record<SiteListingTab, number> {
  const counts: Record<SiteListingTab, number> = { new: 0, take: 0, file: 0, skip: 0 };
  for (const candidate of candidates) counts[candidateTab(candidate)] += 1;
  return counts;
}

/** Черга перепитує базу, лише поки є що чекати. */
export function hasPendingDrafts(candidates: SiteListingCandidate[], now: number): boolean {
  return candidates.some((candidate) => candidateTab(candidate) === "take" && draftView(candidate, now) === "pending");
}

const money = (value: number) => value.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** «357,59 → 354 грн» або «від 134,00 → від 132 грн», коли кольори різні за ціною. */
export function priceLabel(candidate: SiteListingCandidate): string | null {
  const min = candidate.supplier_price_min;
  if (min === null) return null;
  const ours = siteListingPrice(min);
  const ranged = candidate.supplier_price_max !== null && candidate.supplier_price_max !== min;
  const from = ranged ? "від " : "";
  return `${from}${money(min)} → ${from}${ours ?? "—"} грн`;
}
