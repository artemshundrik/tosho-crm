/**
 * ModelCard Component
 * 
 * Individual model card displaying model info, price, image, and actions
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AlertTriangle, Coins, Copy, Edit2, Image as ImageIcon, Layers, Trash2, TrendingDown } from "lucide-react";
import { CURRENCY_SYMBOL } from "@/constants/catalog";
import { calculateDiscount, getPriceRange } from "@/utils/catalogUtils";
import type { ModelWithContext } from "@/types/catalog";

interface ModelCardProps {
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

export function ModelCard({
  item,
  inlineEditId,
  inlinePrice,
  setInlinePrice,
  onStartInlineEdit,
  onSaveInlineEdit,
  onClone,
  onEdit,
  onDelete,
}: ModelCardProps) {
  const { model, typeName, kindName, validation } = item;
  const hasTiers = model.priceTiers && model.priceTiers.length > 0;
  const priceLabel = getPriceRange(model);
  const discount = calculateDiscount(model);
  const isInlineEditing = inlineEditId === model.id;

  return (
    <div
      className={cn(
        "group relative flex gap-4 rounded-2xl border p-4 transition-all duration-300",
        validation.isValid
          ? "border-border/50 bg-gradient-to-br from-card via-card to-muted/10 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
          : "border-amber-200 bg-gradient-to-br from-amber-50/50 via-card to-amber-50/30 dark:border-amber-800 dark:from-amber-950/20 dark:to-amber-950/10"
      )}
    >
      {/* Image */}
      <div className="shrink-0">
        {model.imageUrl ? (
          <img
            src={model.imageUrl}
            alt={model.name}
            className="w-20 h-20 rounded-lg object-cover border border-border/40"
          />
        ) : (
          <div className="w-20 h-20 rounded-lg bg-muted/30 border-2 border-dashed border-border/40 flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base truncate mb-1 group-hover:text-primary transition-colors">
              {model.name}
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 mb-2">
              <span>{typeName}</span>
              <span>→</span>
              <span>{kindName}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {hasTiers ? (
                <>
                  <Badge
                    variant="secondary"
                    className="font-medium gap-1.5 px-2 py-0.5 text-[11px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800"
                  >
                    <Layers className="h-3 w-3" /> {model.priceTiers?.length} тиражі
                  </Badge>
                  {discount > 0 && (
                    <Badge
                      variant="secondary"
                      className="font-medium gap-1 px-2 py-0.5 text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                    >
                      <TrendingDown className="h-3 w-3" /> до -{discount}%
                    </Badge>
                  )}
                </>
              ) : (
                <Badge
                  variant="outline"
                  className="font-normal text-[11px] text-muted-foreground/80 border-border/60"
                >
                  Фікс. ціна
                </Badge>
              )}
            </div>
          </div>

          {/* Price */}
          <div className="text-right shrink-0">
            {isInlineEditing && !hasTiers ? (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={inlinePrice}
                  onChange={(e) => setInlinePrice(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSaveInlineEdit();
                    if (e.key === "Escape") onStartInlineEdit("", 0);
                  }}
                  className="w-24 h-8 text-right pr-2 text-sm font-mono"
                  autoFocus
                  onBlur={onSaveInlineEdit}
                />
              </div>
            ) : (
              <button
                onClick={() => !hasTiers && onStartInlineEdit(model.id, model.price || 0)}
                disabled={hasTiers}
                className={cn(
                  "font-mono text-2xl font-bold tabular-nums tracking-tight",
                  !hasTiers && "hover:opacity-70 transition-opacity cursor-pointer"
                )}
              >
                {priceLabel}{" "}
                <span className="text-base font-semibold text-muted-foreground/80">
                  {CURRENCY_SYMBOL}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Validation Warnings */}
        {!validation.isValid && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs text-amber-700 dark:text-amber-400">
              {validation.warnings.join(", ")}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center text-xs pt-2 border-t border-border/40">
          <div className="flex items-center gap-1.5 text-muted-foreground/80">
            {model.methodIds && model.methodIds.length > 0 ? (
              <>
                <Coins className="h-3.5 w-3.5" />
                <span className="font-medium">{model.methodIds.length} методів</span>
              </>
            ) : (
              <span className="text-muted-foreground/50">Без методів</span>
            )}
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-600 transition-all"
              onClick={(e) => {
                e.stopPropagation();
                onClone(model.id);
              }}
              title="Клонувати модель"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-all"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(model.id);
              }}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive transition-all"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(model.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
