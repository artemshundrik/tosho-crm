import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { getCatalogVariantImageUrl } from "@/components/catalog/CatalogModelPicker";
import { useKindImprintOptions } from "@/features/quotes/quote-details/useKindImprintOptions";
import type { QuoteImportDraftImprint, QuoteImportLinkPreview } from "@/features/quotes/quote-import/types";
import type { CatalogKindOption, CatalogSuggestion } from "@/features/quotes/quote-wizard/catalogSuggestions";
import {
  applyDraftKind,
  applyLinkPreview,
  applyPoolVariant,
  mergeKindPlaces,
  previewAfterVariant,
  readLinkPreviews,
  supplierProductFields,
  supplierSourceUrls,
} from "@/features/quotes/quote-wizard/productDraftFields";
import { useCatalogSuggestions } from "@/features/quotes/quote-wizard/useCatalogSuggestions";
import { CATALOG_VARIANT_COLUMNS, groupCatalogVariantsByModel, type CatalogVariantRow } from "@/lib/catalogVariantRows";
import type { SupplierPoolProduct, SupplierPoolVariant } from "@/lib/supplierPool";
import { supabase } from "@/lib/supabaseClient";

import { createManualOrderDraft, type ManualOrderDraftItem } from "./manualOrderDraft";

const warnIfKids = (product: Pick<SupplierPoolProduct, "isKids" | "name">) => {
  if (!product.isKids) return;
  toast.warning("Додано дитячу модель", {
    description: `«${product.name}» — дитячий крій. Якщо мала бути доросла, приберіть позицію й пошукайте ту саму модель без позначки «Дитяча».`,
    duration: 8000,
  });
};

/** Кольори моделі каталогу: тією самою формою, що й кольори пулу, бо плитки ті самі. */
async function loadModelColors(modelId: string): Promise<SupplierPoolVariant[]> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("catalog_variants")
    .select(CATALOG_VARIANT_COLUMNS)
    .eq("model_id", modelId)
    .eq("is_active", true);
  if (error) return [];
  const variants = groupCatalogVariantsByModel(data as unknown as CatalogVariantRow[]).get(modelId) ?? [];
  return variants
    .filter((variant) => variant.name.trim())
    .map((variant) => ({
      id: variant.id,
      priceRowId: null,
      article: variant.sku?.trim() || null,
      label: variant.name.trim(),
      price: null,
      imageUrl: getCatalogVariantImageUrl(variant),
      url: null,
    }));
}

/** Рядки товарів вікна: хто що додав і що про це вже знає. Сам вигляд не тут. */
export function useManualOrderProducts(teamId: string, open: boolean) {
  const [drafts, setDrafts] = useState<ManualOrderDraftItem[]>([]);
  const [previews, setPreviews] = useState<Record<string, QuoteImportLinkPreview>>({});
  const catalog = useCatalogSuggestions(teamId, open);

  const kindIds = useMemo(
    () => drafts.map((draft) => draft.catalog?.kindId).filter((id): id is string => Boolean(id)),
    [drafts]
  );
  const { byKind, reset: resetKindOptions, directoryFor } = useKindImprintOptions(teamId, kindIds);
  const placesByKind = useMemo(() => mergeKindPlaces(drafts, byKind), [drafts, byKind]);

  const patchDraft = useCallback((key: string, patch: Partial<ManualOrderDraftItem>) => {
    setDrafts((prev) => prev.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  }, []);

  const reset = useCallback(() => {
    setDrafts([]);
    setPreviews({});
    resetKindOptions();
  }, [resetKindOptions]);

  const removeDraft = (key: string) => setDrafts((prev) => prev.filter((draft) => draft.key !== key));
  const addName = (name: string) => setDrafts((prev) => [...prev, createManualOrderDraft({ name })]);
  const changeKind = (key: string, kind: Pick<CatalogKindOption, "kindId" | "kindName" | "typeId" | "typeName"> | null) =>
    setDrafts((prev) => prev.map((draft) => (draft.key === key ? applyDraftKind(draft, kind) : draft)));
  const changeImprints = (key: string, imprints: QuoteImportDraftImprint[]) => patchDraft(key, { imprints });

  /**
   * Позиція з'являється одразу, ще до відповіді сайту, і доповнюється, коли та
   * прийде. Лишається, навіть коли сайт не пустив: посилання вже цінність, а
   * назву менеджер допише сам.
   */
  const addLinks = async (urls: string[]) => {
    if (urls.length === 0) return;
    const fresh = urls.map((url) => ({ url, draft: createManualOrderDraft({ links: [url] }) }));
    setDrafts((prev) => [...prev, ...fresh.map((entry) => entry.draft)]);
    setPreviews((prev) => ({
      ...prev,
      ...Object.fromEntries(fresh.map((entry) => [entry.draft.key, { status: "pending" as const }])),
    }));
    await readLinkPreviews(
      fresh.map((entry) => ({ key: entry.draft.key, url: entry.url })),
      (key, preview) => {
        setPreviews((prev) => ({ ...prev, [key]: preview }));
        const pooled = preview.status === "pending" ? null : preview.pool;
        if (pooled) warnIfKids(pooled.product);
        setDrafts((prev) =>
          prev.map((draft) => {
            if (draft.key !== key) return draft;
            const next = applyLinkPreview(catalog.kinds, draft, preview);
            if (!pooled) return next;
            const only = pooled.product.variants.length === 1 ? pooled.product.variants[0] : null;
            return {
              ...next,
              ...supplierSourceUrls(pooled.product),
              isKids: pooled.product.isKids,
              poolPriceKind: pooled.product.priceKind,
              color: next.color ?? only?.label ?? null,
              variantId: next.variantId ?? only?.id ?? null,
              colorOptions: pooled.needsColor ? pooled.product.variants : [],
              colorSource: pooled.needsColor ? pooled.product : null,
            };
          })
        );
      }
    );
  };

  const pickSupplier = (product: SupplierPoolProduct) => {
    const fields = supplierProductFields(catalog.kinds, product);
    const only = product.variants.length === 1 ? product.variants[0] : null;
    const draft = createManualOrderDraft({
      name: fields.name ?? "",
      color: fields.color ?? null,
      sku: fields.sku ?? null,
      poolPrice: fields.poolPrice ?? null,
      poolPriceKind: product.priceKind,
      supplierUrl: fields.supplierUrl ?? null,
      avantprintUrl: fields.avantprintUrl ?? null,
      isKids: Boolean(fields.isKids),
      supplierProductId: fields.supplierProductId ?? null,
      catalog: fields.catalog ?? null,
      variantId: only?.id ?? null,
      colorOptions: only ? [] : product.variants,
      colorSource: only ? null : product,
    });
    setDrafts((prev) => [...prev, draft]);
    warnIfKids(product);
    const imageUrl = product.imageUrl;
    if (imageUrl) {
      setPreviews((prev) => ({ ...prev, [draft.key]: { status: "done", imageUrl, title: product.name } }));
    }
  };

  /** Ціна моделі йде в поле лише коли вона задана: у більшості моделей там 0. */
  const pickCatalog = (suggestion: CatalogSuggestion, seedPrice: (catalogPrice: number) => string) => {
    const matched = suggestion.matched;
    const price = Number(suggestion.price ?? 0);
    const draft = createManualOrderDraft({
      name: suggestion.name,
      sku: matched?.sku ?? suggestion.sku,
      color: matched?.variantName || null,
      unitPrice: price > 0 ? seedPrice(price) : "",
      // Товар знайшли за артикулом кольору: запам'ятовуємо САМЕ той колір.
      variantId: matched?.variantId ?? null,
      catalog: {
        modelId: suggestion.modelId,
        variantId: matched?.variantId ?? null,
        kindId: suggestion.kindId,
        typeId: suggestion.typeId,
        kindName: suggestion.kindName,
        typeName: suggestion.typeName,
        specPreset: suggestion.specPreset,
        imageUrl: suggestion.imageUrl,
      },
    });
    setDrafts((prev) => [...prev, draft]);
    const imageUrl = suggestion.imageUrl;
    if (imageUrl) {
      setPreviews((prev) => ({ ...prev, [draft.key]: { status: "done", imageUrl, title: suggestion.name } }));
    }
    if (matched || !suggestion.modelId) return;
    void loadModelColors(suggestion.modelId).then((colors) => {
      if (colors.length === 0) return;
      if (colors.length === 1) {
        patchDraft(draft.key, {
          color: colors[0].label,
          variantId: colors[0].id,
          sku: colors[0].article ?? suggestion.sku,
        });
        return;
      }
      patchDraft(draft.key, { colorOptions: colors });
    });
  };

  /** Підставити товар, для якого робився обраний дизайн. `false` — у каталозі його вже немає. */
  const addCatalogModel = (modelId: string, seedPrice: (catalogPrice: number) => string): boolean => {
    const suggestion = catalog.suggestions.find((entry) => entry.modelId === modelId);
    if (!suggestion) return false;
    pickCatalog(suggestion, seedPrice);
    return true;
  };

  const pickColor = (key: string, variant: SupplierPoolVariant) => {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.key !== key) return draft;
        const next = applyPoolVariant(draft, draft.colorSource, variant);
        return { ...next, color: variant.label ?? variant.article, variantId: variant.id };
      })
    );
    setPreviews((prev) => {
      const next = previewAfterVariant(prev[key], variant);
      return next ? { ...prev, [key]: next } : prev;
    });
  };

  return {
    drafts,
    previews,
    catalog,
    optionsByKind: byKind,
    placesByKind,
    directoryFor,
    reset,
    patchDraft,
    removeDraft,
    addName,
    addLinks,
    pickSupplier,
    pickCatalog,
    addCatalogModel,
    pickColor,
    changeKind,
    changeImprints,
    busy: Object.values(previews).some((preview) => preview.status === "pending"),
  };
}
