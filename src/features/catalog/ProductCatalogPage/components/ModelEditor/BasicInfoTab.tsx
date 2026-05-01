/**
 * BasicInfoTab Component
 *
 * Basic information section: photo, type, kind, model name, and variants.
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { CheckCircle2, ChevronDown, FileText, Image as ImageIcon, Link2, Loader2, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import type { CatalogModelMetadata, CatalogModelVariant, CatalogType, ImageUploadMode } from "@/types/catalog";

interface BasicInfoTabProps {
  catalog: CatalogType[];
  draftTypeId: string;
  draftKindId: string;
  draftName: string;
  draftImageUrl: string;
  draftMetadata: CatalogModelMetadata;
  imageUploadMode: ImageUploadMode;
  avanprintImportUrl: string;
  avanprintImporting: boolean;
  avanprintImportError: string | null;
  avanprintImportSummary: string | null;
  onTypeChange: (value: string) => void;
  onKindChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onMetadataChange: (value: CatalogModelMetadata) => void;
  onImageUrlChange: (value: string) => void;
  onImageUploadModeChange: (value: ImageUploadMode) => void;
  onImageFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVariantImageUrlChange: (variantId: string, value: string) => void;
  onVariantImageFileUpload: (variantId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onAvanprintImportUrlChange: (value: string) => void;
  onAvanprintImport: () => void;
}

const getVariantLabel = (variant: CatalogModelVariant, index: number) =>
  variant.name.trim() || `Модифікація ${index + 1}`;

const getVariantPreviewUrl = (variant: CatalogModelVariant) =>
  variant.imageUrl?.trim() ||
  variant.imageAsset?.thumbUrl ||
  variant.imageAsset?.previewUrl ||
  null;

const PRIMARY_VARIANT_ID = "__primary_variant__";

export function BasicInfoTab({
  catalog,
  draftTypeId,
  draftKindId,
  draftName,
  draftImageUrl,
  draftMetadata,
  imageUploadMode,
  avanprintImportUrl,
  avanprintImporting,
  avanprintImportError,
  avanprintImportSummary,
  onTypeChange,
  onKindChange,
  onNameChange,
  onMetadataChange,
  onImageUrlChange,
  onImageUploadModeChange,
  onImageFileUpload,
  onVariantImageUrlChange,
  onVariantImageFileUpload,
  onAvanprintImportUrlChange,
  onAvanprintImport,
}: BasicInfoTabProps) {
  const draftKinds = catalog.find((t) => t.id === draftTypeId)?.kinds ?? [];
  const draftType = catalog.find((t) => t.id === draftTypeId);
  const showConfiguratorPreset = draftType?.quote_type === "print";
  const [imageErrored, setImageErrored] = React.useState(false);
  const [activeVariantId, setActiveVariantId] = React.useState<string | null>(null);
  const [variantImageErrors, setVariantImageErrors] = React.useState<Record<string, boolean>>({});
  const [descriptionOpen, setDescriptionOpen] = React.useState(false);

  React.useEffect(() => {
    setImageErrored(false);
  }, [draftImageUrl]);

  const variants = draftMetadata.variants ?? [];
  const baseVariantName = draftMetadata.baseVariantName ?? variants[0]?.name ?? "";
  const primarySku = draftMetadata.sku ?? variants[0]?.sku ?? "";
  const primaryImageUrl = draftImageUrl || (variants[0] ? getVariantPreviewUrl(variants[0]) ?? "" : "");
  const variantTabs =
    variants.length > 0
      ? variants
      : [
          {
            id: PRIMARY_VARIANT_ID,
            name: baseVariantName,
            sku: primarySku,
            imageUrl: primaryImageUrl || null,
            imageAsset: draftMetadata.imageAsset ?? null,
            active: true,
          },
        ];
  const activeVariant =
    variantTabs.find((variant) => variant.id === activeVariantId) ??
    variantTabs[0] ??
    null;
  const activeVariantIndex = activeVariant
    ? Math.max(0, variantTabs.findIndex((variant) => variant.id === activeVariant.id))
    : -1;
  const isActivePrimary = activeVariantIndex <= 0;
  const activeImageUrl = isActivePrimary || !activeVariant ? primaryImageUrl : getVariantPreviewUrl(activeVariant) ?? "";
  const activeImageFailed = isActivePrimary ? imageErrored : Boolean(activeVariant && variantImageErrors[activeVariant.id]);
  const showActiveImagePreview = Boolean(activeImageUrl) && !activeImageFailed;
  const descriptionValue = draftMetadata.description ?? "";
  const descriptionPreview = descriptionValue.replace(/\s+/g, " ").trim();

  React.useEffect(() => {
    if (variants.length === 0) {
      if (activeVariantId !== null) {
        setActiveVariantId(null);
      }
      return;
    }
    if (!activeVariantId || !variants.some((variant) => variant.id === activeVariantId)) {
      setActiveVariantId(variants[0].id);
    }
  }, [activeVariantId, variants]);

  const updateVariants = (nextVariants: CatalogModelMetadata["variants"]) => {
    onMetadataChange({
      ...draftMetadata,
      variants: nextVariants && nextVariants.length > 0 ? nextVariants : undefined,
    });
  };

  const updateVariant = (variantId: string, patch: Partial<CatalogModelVariant>) => {
    const variantIndex = variants.findIndex((variant) => variant.id === variantId);
    const nextBaseVariantName =
      variantIndex === 0 && typeof patch.name === "string"
        ? patch.name.trim() || null
        : draftMetadata.baseVariantName ?? null;

    onMetadataChange({
      ...draftMetadata,
      baseVariantName: nextBaseVariantName,
      variants: variants.map((variant) =>
        variant.id === variantId
          ? {
              ...variant,
              ...patch,
            }
          : variant
      ),
    });
  };

  const updateBaseVariantName = (value: string) => {
    const nextValue = value.trim() || null;
    onMetadataChange({
      ...draftMetadata,
      baseVariantName: nextValue,
      variants:
        variants.length > 0
          ? variants.map((variant, index) => (index === 0 ? { ...variant, name: value } : variant))
          : undefined,
    });
  };

  const updatePrimarySku = (value: string) => {
    const nextSku = value.trim() || null;
    onMetadataChange({
      ...draftMetadata,
      sku: nextSku,
      variants:
        variants.length > 0
          ? variants.map((variant, index) => (index === 0 ? { ...variant, sku: nextSku } : variant))
          : undefined,
    });
  };

  const handlePrimaryImageUrlChange = (value: string) => {
    onImageUrlChange(value);
  };

  const createVariantDraft = (seed?: Partial<CatalogModelVariant>) => ({
    id: crypto.randomUUID(),
    name: seed?.name ?? "",
    sku: seed?.sku ?? "",
    imageUrl: seed?.imageUrl ?? null,
    imageAsset: seed?.imageAsset ?? null,
    active: true,
  });

  const addVariant = () => {
    const nextVariant = createVariantDraft();
    if (variants.length === 0) {
      const primaryVariant = createVariantDraft({
        name: baseVariantName.trim(),
        sku: draftMetadata.sku ?? "",
        imageUrl: draftImageUrl || null,
        imageAsset: draftMetadata.imageAsset ?? null,
      });
      updateVariants([primaryVariant, nextVariant]);
      setActiveVariantId(nextVariant.id);
      return;
    }
    updateVariants([...variants, nextVariant]);
    setActiveVariantId(nextVariant.id);
  };

  const removeVariant = (variantId: string) => {
    if (variants.length === 0 || variantId === PRIMARY_VARIANT_ID) {
      onImageUrlChange("");
      onMetadataChange({
        ...draftMetadata,
        baseVariantName: null,
        sku: null,
        imageAsset: null,
        variants: undefined,
      });
      setActiveVariantId(null);
      return;
    }

    const removedIndex = variants.findIndex((variant) => variant.id === variantId);
    const nextVariants = variants.filter((variant) => variant.id !== variantId);
    const nextPrimaryVariant = nextVariants[0] ?? null;

    if (removedIndex === 0 && nextPrimaryVariant) {
      const nextPrimaryImageUrl = getVariantPreviewUrl(nextPrimaryVariant) ?? "";
      onImageUrlChange(nextPrimaryImageUrl);
    }

    if (nextVariants.length <= 1) {
      const primaryVariant = nextPrimaryVariant ?? null;
      const primaryImageUrl = primaryVariant ? getVariantPreviewUrl(primaryVariant) ?? "" : "";
      if (primaryVariant && removedIndex !== 0) {
        onImageUrlChange(primaryImageUrl);
      }
      onMetadataChange({
        ...draftMetadata,
        baseVariantName: primaryVariant?.name?.trim() || draftMetadata.baseVariantName || null,
        sku: primaryVariant?.sku?.trim() || draftMetadata.sku || null,
        imageAsset: primaryVariant?.imageAsset ?? (primaryImageUrl ? draftMetadata.imageAsset ?? null : null),
        variants: undefined,
      });
      setActiveVariantId(null);
      return;
    }

    onMetadataChange({
      ...draftMetadata,
      baseVariantName: nextVariants[0]?.name?.trim() || draftMetadata.baseVariantName || null,
      sku: nextVariants[0]?.sku?.trim() || draftMetadata.sku || null,
      imageAsset: removedIndex === 0 ? nextVariants[0]?.imageAsset ?? null : draftMetadata.imageAsset ?? null,
      variants: nextVariants.length > 0 ? nextVariants : undefined,
    });
    setActiveVariantId(
      removedIndex === 0
        ? nextVariants[0]?.id ?? null
        : nextVariants[Math.min(removedIndex, nextVariants.length - 1)]?.id ?? nextVariants[0]?.id ?? null
    );
  };

  const activeVariantName = isActivePrimary ? baseVariantName : activeVariant?.name ?? "";
  const activeVariantSku = isActivePrimary ? primarySku : activeVariant?.sku ?? "";
  const updateActiveVariantName = (value: string) => {
    if (isActivePrimary) {
      updateBaseVariantName(value);
      return;
    }
    if (activeVariant) {
      updateVariant(activeVariant.id, { name: value });
    }
  };
  const updateActiveVariantSku = (value: string) => {
    if (isActivePrimary) {
      updatePrimarySku(value);
      return;
    }
    if (activeVariant) {
      updateVariant(activeVariant.id, { sku: value.trim() || null });
    }
  };
  const updateActiveVariantImageUrl = (value: string) => {
    if (isActivePrimary) {
      handlePrimaryImageUrlChange(value);
      return;
    }
    if (activeVariant) {
      onVariantImageUrlChange(activeVariant.id, value);
    }
  };
  const updateDescription = (value: string) => {
    onMetadataChange({
      ...draftMetadata,
      description: value.trim() ? value : null,
    });
  };
  const handleActiveVariantFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isActivePrimary) {
      onImageFileUpload(event);
      return;
    }
    if (activeVariant) {
      onVariantImageFileUpload(activeVariant.id, event);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/50 bg-card/70 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label className="inline-flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Імпорт з Avanprint
            </Label>
            <Input
              value={avanprintImportUrl}
              onChange={(event) => onAvanprintImportUrlChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onAvanprintImport();
                }
              }}
              placeholder="https://avanprint.ua/..."
              className="bg-background/60"
              disabled={avanprintImporting}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onAvanprintImport}
            disabled={!avanprintImportUrl.trim() || avanprintImporting}
            className="gap-2 lg:w-[150px]"
          >
            {avanprintImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {avanprintImporting ? "Тягнемо" : "Підтягнути"}
          </Button>
        </div>
        {avanprintImportError ? (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {avanprintImportError}
          </div>
        ) : null}
        {avanprintImportSummary ? (
          <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-success-soft-border bg-success-soft px-3 py-1.5 text-xs font-medium text-success-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{avanprintImportSummary}</span>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-border/50 bg-card/70 p-4">
        <div className="mb-4">
          <Label className="text-sm font-semibold">Товар</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Тип і вид уже підставляються з каталогу, назву товару вкажіть вручну.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.4fr)]">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Тип товару</Label>
            <Select value={draftTypeId} onValueChange={onTypeChange}>
              <SelectTrigger className="bg-background/60">
                <SelectValue placeholder="Оберіть тип" />
              </SelectTrigger>
              <SelectContent>
                {catalog.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Вид товару</Label>
            <Select value={draftKindId} onValueChange={onKindChange} disabled={!draftTypeId}>
              <SelectTrigger className="bg-background/60">
                <SelectValue placeholder={draftTypeId ? "Оберіть вид" : "Спочатку тип"} />
              </SelectTrigger>
              <SelectContent>
                {draftKinds.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Назва товару <span className="text-destructive">*</span>
            </Label>
            <Input
              value={draftName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Напр. Malfini Basic 160"
              className="bg-background/60"
            />
          </div>
          {showConfiguratorPreset ? (
            <div className="space-y-2 lg:col-span-2">
              <Label className="text-sm font-medium">Preset конфігуратора</Label>
              <Select
                value={draftMetadata.configuratorPreset ?? "none"}
                onValueChange={(value) =>
                  onMetadataChange({
                    ...draftMetadata,
                    configuratorPreset:
                      value === "none"
                        ? null
                        : (value as "print_package" | "print_notebook" | "print_note_blocks"),
                  })
                }
              >
                <SelectTrigger className="bg-background/60">
                  <SelectValue placeholder="Без додаткового конфігуратора" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без додаткового конфігуратора</SelectItem>
                  <SelectItem value="print_package">Паперовий пакет</SelectItem>
                  <SelectItem value="print_notebook">Блокнот</SelectItem>
                  <SelectItem value="print_note_blocks">Блоки для записів</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-border/50 bg-background/40">
          <button
            type="button"
            onClick={() => setDescriptionOpen((value) => !value)}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/20"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-muted-foreground">Опис товару</div>
              <div className={cn("mt-0.5 truncate text-sm", descriptionPreview ? "text-foreground" : "text-muted-foreground/70")}>
                {descriptionPreview || "Додати короткий опис для каталогу та прорахунків"}
              </div>
            </div>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", descriptionOpen && "rotate-180")}
            />
          </button>
          {descriptionOpen ? (
            <div className="border-t border-border/50 p-3">
              <Textarea
                value={descriptionValue}
                onChange={(event) => updateDescription(event.target.value)}
                placeholder="Опис з Avanprint або власний опис товару"
                rows={4}
                className="min-h-[112px] resize-y bg-background/70"
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border/50 bg-card/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Label className="text-sm font-semibold">Модифікації</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Модифікація 1 є основною за замовчуванням. Додавайте інші тільки коли це окремі виконання товару.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addVariant} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Додати
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {variantTabs.map((variant, index) => {
            const selected = variant.id === activeVariant?.id;
            const variantName = variant.name.trim();
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => setActiveVariantId(variants.length > 0 ? variant.id : null)}
                className={cn(
                  "min-w-[132px] rounded-lg border px-3 py-2 text-left transition-colors",
                  selected
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border/50 bg-background/50 text-muted-foreground hover:border-border/80 hover:text-foreground"
                )}
              >
                <span className="block text-sm font-semibold">Модифікація {index + 1}</span>
                {variantName ? (
                  <span className="mt-0.5 block truncate text-xs opacity-80">{variantName}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <div className="relative group overflow-hidden rounded-xl border border-border/60 bg-muted/20">
              {showActiveImagePreview ? (
                <img
                  src={activeImageUrl}
                  alt={isActivePrimary || !activeVariant ? "Основна модифікація" : getVariantLabel(activeVariant, activeVariantIndex)}
                  className="aspect-square w-full object-cover"
                  onError={() => {
                    if (isActivePrimary) {
                      setImageErrored(true);
                    } else if (activeVariant) {
                      setVariantImageErrors((prev) => ({ ...prev, [activeVariant.id]: true }));
                    }
                  }}
                />
              ) : (
                <div className="flex aspect-square w-full flex-col items-center justify-center px-5 text-center">
                  <ImageIcon className="h-9 w-9 text-muted-foreground/40" />
                  <div className="mt-3 text-xs font-medium text-muted-foreground">Немає фото</div>
                </div>
              )}
              {activeImageUrl ? (
                <button
                  type="button"
                  onClick={() => updateActiveVariantImageUrl("")}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-destructive group-hover:opacity-100"
                  aria-label="Прибрати фото модифікації"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Модифікація {activeVariantIndex + 1}</div>
                <div className="text-xs text-muted-foreground">
                  {isActivePrimary ? "Основна модифікація" : "Додаткова модифікація"}
                </div>
              </div>
              {activeVariant ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-destructive"
                  onClick={() => removeVariant(activeVariant.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  Видалити
                </Button>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Назва модифікації</Label>
                <Input
                  value={activeVariantName}
                  onChange={(event) => updateActiveVariantName(event.target.value)}
                  placeholder="Напр. Чорний, Білий, Premium"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Артикул</Label>
                <Input
                  value={activeVariantSku ?? ""}
                  onChange={(event) => updateActiveVariantSku(event.target.value)}
                  placeholder="Артикул"
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Фото модифікації</Label>
              <div className="grid gap-2 md:grid-cols-[160px_minmax(0,1fr)]">
                <ToggleGroup
                  type="single"
                  value={imageUploadMode}
                  onValueChange={(v) => v && onImageUploadModeChange(v as ImageUploadMode)}
                  className="grid grid-cols-2 gap-2"
                >
                  <ToggleGroupItem value="url" size="sm" className="h-9 text-xs">
                    <Link2 className="mr-1 h-3.5 w-3.5" /> URL
                  </ToggleGroupItem>
                  <ToggleGroupItem value="file" size="sm" className="h-9 text-xs">
                    <Upload className="mr-1 h-3.5 w-3.5" /> Файл
                  </ToggleGroupItem>
                </ToggleGroup>

                {imageUploadMode === "url" ? (
                  <Input
                    value={activeImageUrl}
                    onChange={(e) => updateActiveVariantImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="h-9 bg-background/60"
                  />
                ) : (
                  <label className="flex h-9 cursor-pointer items-center justify-center rounded-md border border-dashed border-border/70 bg-background/60 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                    <Upload className="mr-2 h-4 w-4" />
                    Завантажити фото
                    <input type="file" accept="image/*" onChange={handleActiveVariantFileUpload} className="sr-only" />
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
