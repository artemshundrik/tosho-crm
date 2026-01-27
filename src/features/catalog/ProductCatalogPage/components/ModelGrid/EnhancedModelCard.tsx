/**
 * EnhancedModelCard Component
 * 
 * Enhanced version with better design, animations, and hover effects
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Coins,
  Copy,
  Edit2,
  Image as ImageIcon,
  Layers,
  Trash2,
  TrendingDown,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { CURRENCY_SYMBOL } from "@/constants/catalog";
import { calculateDiscount, getPriceRange, formatPrice } from "@/utils/catalogUtils";
import type { ModelWithContext } from "@/types/catalog";

interface EnhancedModelCardProps {
  item: ModelWithContext;
  inlineEditId: string | null;
  inlinePrice: string;
  setInlinePrice: (value: string) => void;
  onStartInlineEdit: (modelId: string, price: number) => void;
  onSaveInlineEdit: () => void;
  onClone: (modelId: string) => void;
  onEdit: (modelId: string) => void;
  onDelete: (modelId: string) => void;
}

export function EnhancedModelCard({
  item,
  inlineEditId,
  inlinePrice,
  setInlinePrice,
  onStartInlineEdit,
  onSaveInlineEdit,
  onClone,
  onEdit,
  onDelete,
}: EnhancedModelCardProps) {
  const { model, typeName, kindName, validation } = item;
  const hasTiers = model.priceTiers && model.priceTiers.length > 0;
  const priceLabel = getPriceRange(model);
  const discount = calculateDiscount(model);
  const isInlineEditing = inlineEditId === model.id;
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-2xl border transition-all duration-300",
        "hover:shadow-2xl hover:scale-[1.02] hover:-translate-y-1",
        validation.isValid
          ? "border-border/50 bg-gradient-to-br from-card via-card to-muted/10 hover:border-primary/40 hover:shadow-primary/10"
          : "border-amber-200 bg-gradient-to-br from-amber-50/50 via-card to-amber-50/30 dark:border-amber-800 dark:from-amber-950/20 dark:to-amber-950/10 hover:shadow-amber-500/10"
      )}
    >
      {/* Status Badge - Top Right Corner */}
      <div className="absolute top-3 right-3 z-10 flex gap-2">
        {validation.isValid ? (
          <Badge
            variant="secondary"
            className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 backdrop-blur-sm hover:bg-emerald-500/20 transition-colors shadow-lg"
            title="Модель повністю налаштована"
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Готово
          </Badge>
        ) : (
          <Badge
            variant="secondary"
            className="bg-amber-500/10 text-amber-700 border-amber-500/20 backdrop-blur-sm hover:bg-amber-500/20 transition-colors animate-pulse shadow-lg"
            title={`Потребує уваги: ${validation.warnings.join(", ")}`}
          >
            <Clock className="h-3 w-3 mr-1" />
            Незавершено
          </Badge>
        )}
      </div>

      {/* Image Section with Zoom Effect */}
      <div className="relative w-full aspect-video overflow-hidden rounded-t-2xl bg-gradient-to-br from-muted/50 to-muted/20">
        {model.imageUrl && !imageError ? (
          <div className="relative w-full h-full group/image">
            <img
              src={model.imageUrl}
              alt={model.name}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              className={cn(
                "w-full h-full object-cover transition-all duration-500",
                "group-hover/image:scale-110",
                imageLoaded ? "opacity-100" : "opacity-0"
              )}
            />
            {/* Loading shimmer */}
            {!imageLoaded && (
              <div className="absolute inset-0 bg-gradient-to-r from-muted/50 via-muted/30 to-muted/50 animate-shimmer" />
            )}
            {/* Overlay gradient on hover */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/image:opacity-100 transition-opacity duration-300" />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center space-y-2">
              <ImageIcon className="h-16 w-16 mx-auto text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground/50">Без фото</p>
            </div>
          </div>
        )}

        {/* Discount Badge - Image Overlay */}
        {discount > 0 && (
          <div className="absolute bottom-3 left-3">
            <Badge className="bg-emerald-500 text-white border-0 shadow-lg animate-in fade-in slide-in-from-left-4">
              <Sparkles className="h-3 w-3 mr-1" />
              Економія до {discount}%
            </Badge>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="flex-1 p-4 space-y-3">
        {/* Header */}
        <div className="space-y-2">
          <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors line-clamp-2">
            {model.name}
          </h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="px-2 py-0.5 rounded-md bg-muted/50">{typeName}</span>
            <span>→</span>
            <span className="px-2 py-0.5 rounded-md bg-muted/50">{kindName}</span>
          </div>
        </div>

        {/* Price Section */}
        <div className="flex items-baseline justify-between gap-2 pt-2 border-t border-border/40">
          <div className="flex-1">
            {isInlineEditing && !hasTiers ? (
              <Input
                type="number"
                value={inlinePrice}
                onChange={(e) => setInlinePrice(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSaveInlineEdit();
                  if (e.key === "Escape") onStartInlineEdit("", 0);
                }}
                className="w-full h-10 text-right font-mono text-lg font-bold"
                autoFocus
                onBlur={onSaveInlineEdit}
              />
            ) : (
              <button
                onClick={() => !hasTiers && onStartInlineEdit(model.id, model.price || 0)}
                disabled={hasTiers}
                title={!hasTiers ? "Клікніть для редагування ціни" : ""}
                className={cn(
                  "font-mono text-3xl font-black tabular-nums tracking-tight text-left w-full",
                  !hasTiers && "hover:text-primary transition-colors cursor-pointer"
                )}
              >
                {priceLabel}
                <span className="text-lg font-semibold text-muted-foreground/80 ml-1">
                  {CURRENCY_SYMBOL}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Badges Row */}
        <div className="flex items-center gap-2 flex-wrap">
          {hasTiers ? (
            <Badge
              variant="secondary"
              className="gap-1.5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400"
              title={`Ціни по тиражах: ${model.priceTiers?.map((t) => `${t.min}-${t.max ?? "∞"}: ${formatPrice(t.price)}${CURRENCY_SYMBOL}`).join(", ")}`}
            >
              <Layers className="h-3.5 w-3.5" />
              {model.priceTiers?.length} тиражі
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1.5">
              Фікс. ціна
            </Badge>
          )}

          {model.methodIds && model.methodIds.length > 0 && (
            <Badge
              variant="secondary"
              className="gap-1.5"
              title={`${model.methodIds.length} методів нанесення`}
            >
              <Coins className="h-3.5 w-3.5" />
              {model.methodIds.length}
            </Badge>
          )}
        </div>
      </div>

      {/* Actions Footer */}
      <div className="p-4 pt-0 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 hover:bg-blue-500/10 hover:text-blue-600 hover:border-blue-500/30 transition-all"
          onClick={() => onClone(model.id)}
          title="Створити копію моделі"
        >
          <Copy className="h-4 w-4 mr-2" />
          Копіювати
        </Button>

        <Button
          size="sm"
          className="flex-1 shadow-md hover:shadow-lg transition-all"
          onClick={() => onEdit(model.id)}
          title="Відкрити редактор моделі"
        >
          <Edit2 className="h-4 w-4 mr-2" />
          Редагувати
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="hover:bg-destructive/10 hover:text-destructive transition-all"
          onClick={() => onDelete(model.id)}
          title="Видалити модель"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
