/**
 * CatalogModelPicker — searchable model picker with variant (модифікація)
 * expansion, article (артикул/SKU) hints and thumbnails. Extracted from the
 * quote batch builder so the same picker can be reused in the design-task
 * product flow. The value is an opaque string: `modelId` or `modelId::variantId`
 * (see getVariantOptionValue). Use resolveModelPickerValue() to turn a chosen
 * value back into model/variant/sku/image/supplier details.
 */

import * as React from "react";
import { Check, ChevronDown, ChevronRight, Package, Search, Shirt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { CatalogModel, CatalogModelVariant } from "@/types/catalog";

export const getCatalogModelImageUrl = (model: CatalogModel) =>
  model.imageUrl?.trim() || model.metadata?.imageAsset?.thumbUrl || model.metadata?.imageAsset?.previewUrl || null;

export const getCatalogVariantImageUrl = (variant: CatalogModelVariant) =>
  variant.imageUrl?.trim() || variant.imageAsset?.thumbUrl || variant.imageAsset?.previewUrl || null;

const hasCatalogVariantDisplayData = (variant: CatalogModelVariant) =>
  Boolean(
    variant.name.trim() ||
      variant.sku?.trim() ||
      variant.imageUrl?.trim() ||
      variant.imageAsset?.thumbUrl ||
      variant.imageAsset?.previewUrl
  );

export const getVisibleCatalogVariants = (model?: CatalogModel | null) => {
  const variants = model?.metadata?.variants ?? [];
  return variants.filter(
    (variant, index) =>
      variant.active !== false &&
      (hasCatalogVariantDisplayData(variant) || (index === 0 && variants.length > 1))
  );
};

export const getVariantOptionValue = (modelId: string, variantId?: string | null) =>
  variantId ? `${modelId}::${variantId}` : modelId;

type ModelPickerGroup = {
  model: CatalogModel;
  primaryValue: string;
  primaryLabel: string;
  primaryDescription: string | null;
  primaryImageUrl: string | null;
  variants: CatalogModelVariant[];
  searchText: string;
};

const buildModelPickerGroups = (models: CatalogModel[]): ModelPickerGroup[] =>
  models.map((model) => {
    const variants = getVisibleCatalogVariants(model);
    const primaryVariant = variants[0] ?? null;
    const primaryValue = getVariantOptionValue(model.id, primaryVariant?.id ?? null);
    const primarySku = primaryVariant?.sku?.trim() || model.metadata?.sku?.trim() || null;
    const primaryImageUrl =
      (primaryVariant ? getCatalogVariantImageUrl(primaryVariant) : null) || getCatalogModelImageUrl(model);
    const variantSearch = variants
      .map((variant) => [variant.name, variant.sku, getCatalogVariantImageUrl(variant)].filter(Boolean).join(" "))
      .join(" ");

    return {
      model,
      primaryValue,
      primaryLabel: model.name,
      primaryDescription: primarySku ? `Артикул: ${primarySku}` : null,
      primaryImageUrl,
      variants,
      searchText: [model.name, model.metadata?.sku, variantSearch].filter(Boolean).join(" ").toLowerCase(),
    };
  });

const findModelPickerSelection = (groups: ModelPickerGroup[], value: string) => {
  for (const group of groups) {
    if (group.primaryValue === value || group.model.id === value) {
      const primaryVariant = group.variants[0] ?? null;
      return {
        label: primaryVariant?.name.trim() ? `${group.model.name} · ${primaryVariant.name.trim()}` : group.model.name,
        imageUrl: group.primaryImageUrl,
      };
    }
    const matchedVariant = group.variants.find((variant) => getVariantOptionValue(group.model.id, variant.id) === value);
    if (matchedVariant) {
      const variantName = matchedVariant.name.trim();
      return {
        label: variantName ? `${group.model.name} · ${variantName}` : group.model.name,
        imageUrl: getCatalogVariantImageUrl(matchedVariant) || getCatalogModelImageUrl(group.model),
      };
    }
  }
  return null;
};

export type ResolvedModelPick = {
  modelId: string;
  variantId: string | null;
  /** Variant label (колір/модифікація), when a specific modification is chosen. */
  variantName: string | null;
  /** Model name, plus " · variant" when a specific modification is chosen. */
  name: string;
  /** Article (variant SKU, falling back to model SKU). */
  sku: string | null;
  imageUrl: string | null;
  supplierUrl: string | null;
  avantprintUrl: string | null;
};

/** Turn a picker value (`modelId` or `modelId::variantId`) into full details. */
export function resolveModelPickerValue(models: CatalogModel[], value: string): ResolvedModelPick | null {
  const [modelId, variantId] = value.split("::");
  const model = models.find((item) => item.id === modelId) ?? null;
  if (!model) return null;
  const variants = getVisibleCatalogVariants(model);
  const variant = variantId
    ? variants.find((item) => item.id === variantId) ?? null
    : variants[0] ?? null;
  const variantName = variant?.name.trim() || null;
  return {
    modelId: model.id,
    variantId: variant?.id ?? null,
    variantName,
    name: variantName ? `${model.name} · ${variantName}` : model.name,
    sku: variant?.sku?.trim() || model.metadata?.sku?.trim() || null,
    imageUrl: (variant ? getCatalogVariantImageUrl(variant) : null) || getCatalogModelImageUrl(model),
    supplierUrl: model.metadata?.supplierUrl?.trim() || null,
    avantprintUrl: model.metadata?.avantprintUrl?.trim() || null,
  };
}

type CatalogModelPickerProps = {
  value: string;
  onChange: (value: string) => void;
  models: CatalogModel[];
  placeholder: string;
  disabled?: boolean;
  popoverClassName?: string;
};

export const CatalogModelPicker: React.FC<CatalogModelPickerProps> = ({
  value,
  onChange,
  models,
  placeholder,
  disabled = false,
  popoverClassName,
}) => {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [expandedModelIds, setExpandedModelIds] = React.useState<Set<string>>(() => new Set());
  const groups = React.useMemo(() => buildModelPickerGroups(models), [models]);
  const selected = React.useMemo(() => findModelPickerSelection(groups, value), [groups, value]);
  const normalizedSearch = search.trim().toLowerCase();
  const visibleGroups = React.useMemo(
    () => groups.filter((group) => !normalizedSearch || group.searchText.includes(normalizedSearch)),
    [groups, normalizedSearch]
  );
  const active = Boolean(selected);

  React.useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const toggleExpanded = (modelId: string) => {
    setExpandedModelIds((current) => {
      const next = new Set(current);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <Popover open={disabled ? false : open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex h-9 w-full items-center rounded-full border px-3.5 text-sm transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1",
            active
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-border/40 bg-background/55 text-muted-foreground hover:border-border/50 hover:bg-background/70",
            disabled && "pointer-events-none opacity-50"
          )}
        >
          {selected?.imageUrl ? (
            <span className="mr-2 flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/30">
              <img src={selected.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
            </span>
          ) : (
            <Shirt className={cn("mr-2 h-3.5 w-3.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
          )}
          <span className={cn("min-w-0 flex-1 truncate text-left font-medium", !active && "text-muted-foreground")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-[420px] max-w-[calc(100vw-2rem)] overflow-hidden p-2", popoverClassName)}
        onWheelCapture={(event) => event.stopPropagation()}
        onTouchMoveCapture={(event) => event.stopPropagation()}
      >
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Пошук моделі, модифікації або артикулу"
              className="h-9 rounded-full pl-8 text-sm"
              autoFocus
            />
          </div>
          <div
            className="max-h-[320px] space-y-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]"
            onWheelCapture={(event) => event.stopPropagation()}
            onTouchMoveCapture={(event) => event.stopPropagation()}
          >
            {visibleGroups.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">Нічого не знайдено</div>
            ) : null}
            {visibleGroups.map((group) => {
              const hasVariants = group.variants.length > 1;
              const expanded = hasVariants && (expandedModelIds.has(group.model.id) || Boolean(normalizedSearch));
              const selectedPrimary = value === group.primaryValue || value === group.model.id;
              return (
                <div key={group.model.id} className="rounded-lg">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-12 min-w-0 flex-1 justify-start gap-3 px-2 text-sm",
                        selectedPrimary && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                      )}
                      onClick={() => {
                        if (hasVariants) {
                          toggleExpanded(group.model.id);
                          return;
                        }
                        choose(group.primaryValue);
                      }}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/20">
                        {group.primaryImageUrl ? (
                          <img src={group.primaryImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <Package className="h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate font-medium">{group.primaryLabel}</span>
                        {group.primaryDescription ? (
                          <span className="block truncate text-xs font-normal text-muted-foreground">
                            {group.primaryDescription}
                          </span>
                        ) : null}
                      </span>
                      {hasVariants ? (
                        <Badge variant="outline" className="shrink-0 rounded-full border-border/60 px-2 text-2xs">
                          {group.variants.length} модиф.
                        </Badge>
                      ) : null}
                      {selectedPrimary ? <Check className="h-4 w-4 shrink-0" /> : null}
                    </Button>
                    {hasVariants ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleExpanded(group.model.id);
                        }}
                        aria-label={expanded ? "Згорнути модифікації" : "Показати модифікації"}
                      >
                        <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
                      </Button>
                    ) : null}
                  </div>
                  {expanded ? (
                    <div className="ml-5 mt-1 space-y-1 border-l border-border/50 pl-3">
                      {group.variants.map((variant, index) => {
                        const variantValue = getVariantOptionValue(group.model.id, variant.id);
                        const selectedVariant = value === variantValue;
                        const variantName = variant.name.trim() || (index === 0 ? "Основна" : `Модифікація ${index + 1}`);
                        const imageUrl = getCatalogVariantImageUrl(variant) || getCatalogModelImageUrl(group.model);
                        return (
                          <Button
                            key={variant.id}
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-11 w-full justify-start gap-3 px-2 text-sm",
                              selectedVariant && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                            )}
                            onClick={() => choose(variantValue)}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/20">
                              {imageUrl ? (
                                <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                              ) : (
                                <Package className="h-4 w-4 text-muted-foreground" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1 text-left">
                              <span className="block truncate">
                                {group.model.name} · {variantName}
                              </span>
                              {variant.sku?.trim() ? (
                                <span className="block truncate text-xs font-normal text-muted-foreground">
                                  Артикул: {variant.sku.trim()}
                                </span>
                              ) : null}
                            </span>
                            {selectedVariant ? <Check className="h-4 w-4 shrink-0" /> : null}
                          </Button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
