/**
 * SimpleModelCard Component - NEW DESIGN
 * 
 * Simplified model card matching the reference design with product type placeholder
 */

import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Image as ImageIcon, Layers, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ModelWithContext } from "@/types/catalog";

interface SimpleModelCardProps {
  item: ModelWithContext;
  onEdit: (modelId: string) => void;
  onClone: (modelId: string) => void;
  onDelete: (modelId: string) => void;
}

export function SimpleModelCard({
  item,
  onEdit,
  onClone,
  onDelete,
}: SimpleModelCardProps) {
  const { model, kindName, validation } = item;
  const [isHovered, setIsHovered] = useState(false);
  const [imageErrored, setImageErrored] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const hasTiers = model.priceTiers && model.priceTiers.length > 0;
  const hasNoMethods = !model.methodIds || model.methodIds.length === 0;
  const sku = model.metadata?.sku?.trim();
  const rawVariants = model.metadata?.variants ?? [];
  const variants = rawVariants.filter(
    (variant, index) =>
      variant.active !== false &&
      (Boolean(
        variant.name.trim() ||
          variant.sku?.trim() ||
          variant.imageUrl?.trim() ||
          variant.imageAsset?.thumbUrl ||
          variant.imageAsset?.previewUrl
      ) ||
        (index === 0 && rawVariants.length > 1))
  );
  const selectedVariant =
    variants.find((variant) => variant.id === selectedVariantId) ?? variants[0] ?? null;
  const selectedVariantImageUrl =
    selectedVariant?.imageUrl?.trim() ||
    selectedVariant?.imageAsset?.thumbUrl ||
    selectedVariant?.imageAsset?.previewUrl ||
    null;
  const selectedVariantSku = selectedVariant?.sku?.trim();
  const selectedVariantName = selectedVariant?.name.trim();
  const displayImageUrl = selectedVariantImageUrl || model.imageUrl || null;
  const displayTitle = selectedVariantName ? `${model.name} · ${selectedVariantName}` : model.name;
  const displaySku = selectedVariantSku || sku || null;

  // Map kindName to product type for placeholder
  const getProductTypeLabel = (kind: string): string => {
    const lower = kind.toLowerCase();
    if (lower.includes("футболк") || lower.includes("t-shirt")) return "T-Shirt";
    if (lower.includes("худі") || lower.includes("hoodie")) return "Hoodie";
    if (lower.includes("сумк") || lower.includes("bag")) return "Bag";
    if (lower.includes("поло") || lower.includes("polo")) return "Polo";
    if (lower.includes("кепк") || lower.includes("cap")) return "Cap";
    if (lower.includes("шорт")) return "Shorts";
    return kindName;
  };

  const productTypeLabel = getProductTypeLabel(kindName);

  useEffect(() => {
    setImageErrored(false);
  }, [model.id, displayImageUrl]);

  useEffect(() => {
    if (variants.length === 0) {
      setSelectedVariantId(null);
      return;
    }
    if (!selectedVariantId || !variants.some((variant) => variant.id === selectedVariantId)) {
      setSelectedVariantId(variants[0].id);
    }
  }, [selectedVariantId, variants]);

  // Get actual method names from the kind's methods
  const getMethodNames = () => {
    if (!model.methodIds || model.methodIds.length === 0) return [];
    
    // Map methodIds to actual method names using the methods from context
    const methodsMap = new Map(item.methods.map((m) => [m.id, m.name]));
    
    return model.methodIds
      .map((id) => methodsMap.get(id))
      .filter((name): name is string => !!name);
  };

  const allMethodNames = getMethodNames();
  const methodNames = allMethodNames.slice(0, 2);
  const extraMethodsCount = allMethodNames.length > 2 ? allMethodNames.length - 2 : 0;
  const openEditor = () => onEdit(model.id);
  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openEditor();
  };
  const stopCardClick = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "group relative flex cursor-pointer flex-col rounded-xl border transition-all duration-200",
        "hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
        !validation.isValid
          ? "tone-warning-subtle"
          : "border-border/60 bg-card hover:border-primary/30"
      )}
      onClick={openEditor}
      onKeyDown={handleCardKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Three Dots Menu - Top Right (on hover) */}
      <div className="absolute top-3 right-3 z-20" onClick={stopCardClick}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                "h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm shadow-md transition-opacity",
                isHovered ? "opacity-100" : "opacity-0"
              )}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(model.id)}>
              Редагувати
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onClone(model.id)}>
              Копіювати
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(model.id)}
              className="text-destructive"
            >
              Видалити
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-t-xl bg-gradient-to-br from-muted/30 to-muted/10">
        {displayImageUrl && !imageErrored ? (
          <img
            src={displayImageUrl}
            alt={displayTitle}
            className="h-full w-full object-cover"
            onError={() => setImageErrored(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-4xl font-bold text-muted-foreground/30 tracking-tight">
              {productTypeLabel}
            </span>
          </div>
        )}

        {variants.length > 0 ? (
          <div className="absolute inset-x-3 bottom-3 z-10 flex items-center gap-2 overflow-x-auto">
            {variants.slice(0, 7).map((variant) => {
              const imageUrl =
                variant.imageUrl?.trim() ||
                variant.imageAsset?.thumbUrl ||
                variant.imageAsset?.previewUrl ||
                null;
              const selected = variant.id === selectedVariant?.id;
              return (
                <button
                  key={variant.id}
                  type="button"
                  title={variant.sku?.trim() ? `${variant.name || "Модифікація"} · ${variant.sku}` : variant.name}
                  className={cn(
                    "relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white transition-all",
                    selected
                      ? "border-primary"
                      : "border-muted-foreground/35 hover:border-muted-foreground/50"
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedVariantId(variant.id);
                  }}
                >
                  {imageUrl ? (
                    <>
                      <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      {!selected ? <span className="absolute inset-0 bg-white/45" /> : null}
                    </>
                  ) : (
                    <ImageIcon className="h-4 w-4 text-muted-foreground/60" />
                  )}
                </button>
              );
            })}
            {variants.length > 7 ? (
              <span className="flex h-9 shrink-0 items-center rounded-md border border-border/60 bg-background/90 px-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
                +{variants.length - 7}
              </span>
            ) : null}
          </div>
        ) : null}
        
        {hasTiers && variants.length === 0 ? (
          <div className="absolute right-3 bottom-3 z-10">
            <Badge
              variant="secondary"
              className="bg-background/90 backdrop-blur-sm shadow-md text-xs font-semibold gap-1 px-2.5 py-1"
            >
              <Layers className="h-3 w-3" />
              {model.priceTiers?.length} тиражів
            </Badge>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1.5">
          <h3 className="line-clamp-2 text-base font-semibold leading-tight">
            {displayTitle}
          </h3>

          {displaySku ? (
            <div className="text-xs font-medium text-muted-foreground">
              Артикул: <span className="text-foreground/80">{displaySku}</span>
            </div>
          ) : null}
        </div>

        <div className={cn("flex min-w-0 flex-wrap items-center gap-2", !displaySku && "-mt-1")}>
          <span className="truncate text-sm text-muted-foreground">{kindName}</span>
          {variants.length > 0 ? (
            <Badge variant="outline" className="h-6 shrink-0 px-2 text-xs">
              {variants.length} модиф.
            </Badge>
          ) : null}
          {hasTiers ? (
            <Badge variant="secondary" className="h-6 shrink-0 gap-1 px-2 text-xs">
              <Layers className="h-3 w-3" />
              {model.priceTiers?.length}
            </Badge>
          ) : null}
        </div>

        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {hasNoMethods ? (
            <span className="text-xs text-muted-foreground italic">
              Методи не вказані
            </span>
          ) : (
            <>
              {methodNames?.map((methodName, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="text-xs px-2 py-0 h-6"
                >
                  {methodName}
                </Badge>
              ))}
              {extraMethodsCount > 0 && (
                <Badge
                  variant="outline"
                  className="text-xs px-2 py-0 h-6"
                >
                  +{extraMethodsCount}
                </Badge>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
