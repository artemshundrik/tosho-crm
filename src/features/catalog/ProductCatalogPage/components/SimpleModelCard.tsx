/**
 * SimpleModelCard Component - NEW DESIGN
 * 
 * Simplified model card matching the reference design with product type placeholder
 */

import { useState } from "react";
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
  const { model, typeName, kindName, validation } = item;
  const [isHovered, setIsHovered] = useState(false);
  const hasTiers = model.priceTiers && model.priceTiers.length > 0;
  const hasNoMethods = !model.methodIds || model.methodIds.length === 0;

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

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border transition-all duration-200",
        "hover:shadow-lg",
        !validation.isValid
          ? "border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/10"
          : "border-border/60 bg-card hover:border-primary/30"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Three Dots Menu - Top Right (on hover) */}
      <div className="absolute top-3 right-3 z-20">
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

      {/* Image / Placeholder */}
      <div className="relative w-full aspect-square bg-gradient-to-br from-muted/30 to-muted/10 rounded-t-xl overflow-hidden">
        {model.imageUrl ? (
          <img
            src={model.imageUrl}
            alt={model.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl font-bold text-muted-foreground/30 tracking-tight">
              {productTypeLabel}
            </span>
          </div>
        )}
        
        {/* Tiers Badge - Bottom Right (on image) */}
        {hasTiers && (
          <div className="absolute right-3 bottom-3 z-10">
            <Badge
              variant="secondary"
              className="bg-background/90 backdrop-blur-sm shadow-md text-xs font-semibold gap-1 px-2.5 py-1"
            >
              <Layers className="h-3 w-3" />
              {model.priceTiers?.length} тиражів
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-2 flex-1 flex flex-col">
        {/* Title */}
        <h3 className="font-semibold text-base leading-tight line-clamp-2">
          {model.name}
        </h3>

        {/* Category */}
        <p className="text-sm text-muted-foreground">
          {kindName}
        </p>

        {/* Methods Tags */}
        <div className="flex flex-wrap gap-1.5 pt-1">
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
