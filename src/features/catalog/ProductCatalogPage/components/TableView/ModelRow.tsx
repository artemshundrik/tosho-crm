/**
 * ModelRow Component
 * 
 * Individual row in the table view with inline actions and selection
 */

import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Copy,
  Edit2,
  Image as ImageIcon,
  MoreHorizontal,
  Trash2,
  Layers,
  Coins,
} from "lucide-react";
import { CURRENCY_SYMBOL } from "@/constants/catalog";
import { calculateDiscount, getPriceRange } from "@/utils/catalogUtils";
import type { ModelWithContext } from "@/types/catalog";

interface ModelRowProps {
  item: ModelWithContext;
  isSelected: boolean;
  onToggleSelection: (id: string) => void;
  onEdit: (id: string) => void;
  onClone: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ModelRow({
  item,
  isSelected,
  onToggleSelection,
  onEdit,
  onClone,
  onDelete,
}: ModelRowProps) {
  const { model, typeName, kindName, validation } = item;
  const hasTiers = model.priceTiers && model.priceTiers.length > 0;
  const priceRange = getPriceRange(model);
  const discount = calculateDiscount(model);

  return (
    <tr
      className={cn(
        "group border-b border-border/40 transition-colors hover:bg-muted/30",
        isSelected && "bg-primary/5"
      )}
    >
      {/* Checkbox */}
      <td className="w-12 px-4 py-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelection(model.id)}
          aria-label={`Select ${model.name}`}
        />
      </td>

      {/* Image */}
      <td className="w-16 px-2 py-3">
        {model.imageUrl ? (
          <img
            src={model.imageUrl}
            alt={model.name}
            className="w-12 h-12 rounded-lg object-cover border border-border/40"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-muted/30 border-2 border-dashed border-border/40 flex items-center justify-center">
            <ImageIcon className="h-6 w-6 text-muted-foreground/30" />
          </div>
        )}
      </td>

      {/* Name */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">{model.name}</span>
          {!validation.isValid && (
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" title={validation.warnings.join(", ")} />
          )}
        </div>
      </td>

      {/* Category */}
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {typeName}
      </td>

      {/* Kind */}
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {kindName}
      </td>

      {/* Price */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <div className="font-mono font-bold tabular-nums">
            {priceRange} <span className="text-xs text-muted-foreground">{CURRENCY_SYMBOL}</span>
          </div>
          {hasTiers && (
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="h-5 px-1.5 text-[10px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400"
              >
                <Layers className="h-3 w-3 mr-1" />
                {model.priceTiers?.length} тиражі
              </Badge>
              {discount > 0 && (
                <span className="text-[10px] text-emerald-600 font-medium">
                  до -{discount}%
                </span>
              )}
            </div>
          )}
        </div>
      </td>

      {/* Methods */}
      <td className="px-4 py-3">
        {model.methodIds && model.methodIds.length > 0 ? (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Coins className="h-4 w-4" />
            <span>{model.methodIds.length}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/50">Без методів</span>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        {validation.isValid ? (
          <Badge
            variant="secondary"
            className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
          >
            Готово
          </Badge>
        ) : (
          <Badge
            variant="secondary"
            className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400"
          >
            Незавершено
          </Badge>
        )}
      </td>

      {/* Actions */}
      <td className="w-20 px-4 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-600"
            onClick={() => onClone(model.id)}
            title="Клонувати"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
            onClick={() => onEdit(model.id)}
            title="Редагувати"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(model.id)}>
                <Edit2 className="h-4 w-4 mr-2" />
                Редагувати
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onClone(model.id)}>
                <Copy className="h-4 w-4 mr-2" />
                Клонувати
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(model.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Видалити
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}
