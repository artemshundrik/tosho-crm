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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { Image as ImageIcon, Link2, Package, Plus, Trash2, Upload, X } from "lucide-react";
import type { CatalogModelMetadata, CatalogModelVariant, CatalogType, ImageUploadMode } from "@/types/catalog";

interface BasicInfoTabProps {
  catalog: CatalogType[];
  draftTypeId: string;
  draftKindId: string;
  draftName: string;
  draftImageUrl: string;
  draftMetadata: CatalogModelMetadata;
  imageUploadMode: ImageUploadMode;
  onTypeChange: (value: string) => void;
  onKindChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onMetadataChange: (value: CatalogModelMetadata) => void;
  onImageUrlChange: (value: string) => void;
  onImageUploadModeChange: (value: ImageUploadMode) => void;
  onImageFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVariantImageUrlChange: (variantId: string, value: string) => void;
  onVariantImageFileUpload: (variantId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
}

const getVariantLabel = (variant: CatalogModelVariant, index: number) =>
  variant.name.trim() || `Модифікація ${index + 1}`;

const getVariantPreviewUrl = (variant: CatalogModelVariant) =>
  variant.imageUrl?.trim() ||
  variant.imageAsset?.thumbUrl ||
  variant.imageAsset?.previewUrl ||
  null;

export function BasicInfoTab({
  catalog,
  draftTypeId,
  draftKindId,
  draftName,
  draftImageUrl,
  draftMetadata,
  imageUploadMode,
  onTypeChange,
  onKindChange,
  onNameChange,
  onMetadataChange,
  onImageUrlChange,
  onImageUploadModeChange,
  onImageFileUpload,
  onVariantImageUrlChange,
  onVariantImageFileUpload,
}: BasicInfoTabProps) {
  const draftKinds = catalog.find((t) => t.id === draftTypeId)?.kinds ?? [];
  const draftType = catalog.find((t) => t.id === draftTypeId);
  const showConfiguratorPreset = draftType?.quote_type === "print";
  const [imageErrored, setImageErrored] = React.useState(false);
  const [activeVariantId, setActiveVariantId] = React.useState<string | null>(null);
  const [variantImageErrors, setVariantImageErrors] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    setImageErrored(false);
  }, [draftImageUrl]);

  const showImagePreview = Boolean(draftImageUrl) && !imageErrored;
  const variants = draftMetadata.variants ?? [];
  const baseVariantName = draftMetadata.baseVariantName ?? variants[0]?.name ?? "";
  const activeVariantIndex = Math.max(
    0,
    variants.findIndex((variant) => variant.id === activeVariantId)
  );
  const activeVariant = variants[activeVariantIndex] ?? null;

  React.useEffect(() => {
    if (variants.length === 0) {
      setActiveVariantId(null);
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

  const createVariantDraft = (seed?: Partial<CatalogModelVariant>) => ({
    id: crypto.randomUUID(),
    name: seed?.name ?? "",
    sku: seed?.sku ?? "",
    colorHex: seed?.colorHex ?? "#111827",
    imageUrl: seed?.imageUrl ?? null,
    imageAsset: seed?.imageAsset ?? null,
    active: true,
  });

  const addVariant = () => {
    const nextVariant = createVariantDraft();
    if (variants.length === 0) {
      const primaryVariant = createVariantDraft({
        name: baseVariantName.trim() || "Основний",
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

  const clearVariants = () => {
    updateVariants(undefined);
    setActiveVariantId(null);
  };

  const syncActiveVariantFromBase = () => {
    if (!activeVariant) return;
    updateVariant(activeVariant.id, {
      sku: draftMetadata.sku ?? "",
      imageUrl: draftImageUrl || null,
      imageAsset: draftMetadata.imageAsset ?? null,
    });
  };

  const removeVariant = (variantId: string) => {
    const nextVariants = variants.filter((variant) => variant.id !== variantId);
    onMetadataChange({
      ...draftMetadata,
      baseVariantName: nextVariants[0]?.name?.trim() || draftMetadata.baseVariantName || null,
      variants: nextVariants.length > 0 ? nextVariants : undefined,
    });
    setActiveVariantId(nextVariants[0]?.id ?? null);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 rounded-xl border border-border/50 bg-card/70 p-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="space-y-3">
          <Label className="text-sm font-medium">Фото товару</Label>
          <div className="relative group overflow-hidden rounded-xl border border-border/60 bg-muted/20">
            {showImagePreview ? (
              <img
                src={draftImageUrl}
                alt="Preview"
                className="aspect-square w-full object-cover"
                onError={() => setImageErrored(true)}
              />
            ) : (
              <div className="flex aspect-square w-full flex-col items-center justify-center px-5 text-center">
                <ImageIcon className="h-9 w-9 text-muted-foreground/40" />
                <div className="mt-3 text-xs font-medium text-muted-foreground">Немає фото</div>
              </div>
            )}
            {draftImageUrl ? (
              <button
                type="button"
                onClick={() => onImageUrlChange("")}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-destructive group-hover:opacity-100"
                aria-label="Прибрати фото товару"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <ToggleGroup
            type="single"
            value={imageUploadMode}
            onValueChange={(v) => v && onImageUploadModeChange(v as ImageUploadMode)}
            className="grid grid-cols-2 gap-2"
          >
            <ToggleGroupItem value="url" size="sm" className="h-8 text-xs">
              <Link2 className="mr-1 h-3.5 w-3.5" /> URL
            </ToggleGroupItem>
            <ToggleGroupItem value="file" size="sm" className="h-8 text-xs">
              <Upload className="mr-1 h-3.5 w-3.5" /> Файл
            </ToggleGroupItem>
          </ToggleGroup>

          {imageUploadMode === "url" ? (
            <Input
              value={draftImageUrl}
              onChange={(e) => onImageUrlChange(e.target.value)}
              placeholder="https://..."
              className="h-9 bg-background/60"
            />
          ) : (
            <label className="flex h-10 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/60 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
              <Upload className="mr-2 h-4 w-4" />
              Завантажити фото
              <input type="file" accept="image/*" onChange={onImageFileUpload} className="sr-only" />
            </label>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Назва товару <span className="text-destructive">*</span>
            </Label>
            <Input
              value={draftName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Напр. Malfini Basic 160"
              className="bg-background/60"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Назва модифікації</Label>
              <Input
                value={baseVariantName}
                onChange={(e) => updateBaseVariantName(e.target.value)}
                placeholder="Напр. Чорний, Білий, Premium"
                className="bg-background/60"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Базовий артикул</Label>
              <Input
                value={draftMetadata.sku ?? ""}
                onChange={(e) =>
                  onMetadataChange({
                    ...draftMetadata,
                    sku: e.target.value.trim() || null,
                  })
                }
                placeholder="Якщо один артикул на модель"
                className="bg-background/60"
              />
            </div>

            {showConfiguratorPreset ? (
              <div className="space-y-2">
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
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border/50 bg-card/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-sm font-medium">Варіанти товару</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Без варіантів це один товар. Додайте варіанти тільки коли є різні кольори або виконання.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addVariant} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {variants.length > 0 ? "Додати ще" : "Додати варіанти"}
          </Button>
        </div>

        {variants.length > 0 && activeVariant ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/45 bg-muted/15 px-3 py-2">
              <div className="text-xs text-muted-foreground">
                Зараз у товарі <span className="font-semibold text-foreground">{variants.length}</span> варіанти.
                Назва товару в каталозі лишається без назви варіанту.
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={clearVariants}
              >
                Прибрати варіанти
              </Button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {variants.map((variant, index) => {
                const selected = variant.id === activeVariant.id;
                const imageUrl = getVariantPreviewUrl(variant);
                const imageFailed = variantImageErrors[variant.id];
                const label = getVariantLabel(variant, index);
                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setActiveVariantId(variant.id)}
                    className={cn(
                      "relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/20 transition-all",
                      selected
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border/50 hover:border-primary/45"
                    )}
                    title={label}
                    aria-label={label}
                  >
                    {imageUrl && !imageFailed ? (
                      <img
                        src={imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={() =>
                          setVariantImageErrors((prev) => ({ ...prev, [variant.id]: true }))
                        }
                      />
                    ) : variant.colorHex ? (
                      <span className="absolute inset-0" style={{ backgroundColor: variant.colorHex }} />
                    ) : (
                      <Package className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/50" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="rounded-lg border border-border/45 bg-card/65 p-3">
              <div className="grid gap-4 md:grid-cols-[168px_minmax(0,1fr)]">
                <div className="space-y-2">
                  <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
                    {getVariantPreviewUrl(activeVariant) && !variantImageErrors[activeVariant.id] ? (
                      <img
                        src={getVariantPreviewUrl(activeVariant) ?? undefined}
                        alt={getVariantLabel(activeVariant, activeVariantIndex)}
                        className="aspect-square w-full object-cover"
                        onError={() =>
                          setVariantImageErrors((prev) => ({ ...prev, [activeVariant.id]: true }))
                        }
                      />
                    ) : (
                      <div className="flex aspect-square w-full flex-col items-center justify-center px-3 text-center">
                        <ImageIcon className="h-7 w-7 text-muted-foreground/40" />
                        <span className="mt-2 text-xs text-muted-foreground">Фото модифікації</span>
                      </div>
                    )}
                  </div>
                  <label className="flex h-8 cursor-pointer items-center justify-center rounded-md border border-dashed border-border/70 bg-background/60 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Файл
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => onVariantImageFileUpload(activeVariant.id, event)}
                      className="sr-only"
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{getVariantLabel(activeVariant, activeVariantIndex)}</div>
                      <div className="text-xs text-muted-foreground">Редагування вибраного варіанту</div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={syncActiveVariantFromBase}
                    >
                      Взяти фото й артикул з товару
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_56px_36px]">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Назва модифікації</Label>
                      <Input
                        value={activeVariant.name}
                        onChange={(event) => updateVariant(activeVariant.id, { name: event.target.value })}
                        placeholder="Чорний, Білий, Navy"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Артикул</Label>
                      <Input
                        value={activeVariant.sku ?? ""}
                        onChange={(event) =>
                          updateVariant(activeVariant.id, { sku: event.target.value.trim() || null })
                        }
                        placeholder="Артикул"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Колір</Label>
                      <Input
                        type="color"
                        value={activeVariant.colorHex || "#111827"}
                        onChange={(event) => updateVariant(activeVariant.id, { colorHex: event.target.value })}
                        aria-label="Колір модифікації"
                        className="h-9 cursor-pointer p-1"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-transparent">Дія</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => removeVariant(activeVariant.id)}
                        aria-label="Видалити модифікацію"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">URL фото</Label>
                    <div className="flex gap-2">
                      <Input
                        value={activeVariant.imageUrl ?? ""}
                        onChange={(event) => onVariantImageUrlChange(activeVariant.id, event.target.value)}
                        placeholder="https://..."
                        className="h-9"
                      />
                      {activeVariant.imageUrl ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => onVariantImageUrlChange(activeVariant.id, "")}
                          aria-label="Прибрати фото модифікації"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/60 px-3 py-5 text-center text-xs text-muted-foreground">
            Якщо товар має один варіант, модифікації можна не додавати.
          </div>
        )}
      </div>
    </div>
  );
}
