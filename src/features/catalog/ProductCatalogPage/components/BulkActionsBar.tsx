/**
 * BulkActionsBar Component
 * 
 * Action bar that appears when models are selected
 * Provides bulk operations like export, delete, etc.
 */

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Download, Trash2, X, Copy, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

interface BulkActionsBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkExport: () => void;
  onBulkDelete: () => void;
  onBulkClone?: () => void;
  className?: string;
}

export function BulkActionsBar({
  selectedCount,
  onClearSelection,
  onBulkExport,
  onBulkDelete,
  onBulkClone,
  className,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
        "bg-card border border-border/60 rounded-xl shadow-2xl",
        "px-4 py-3 flex items-center gap-3",
        "animate-in slide-in-from-bottom-4 fade-in duration-300",
        className
      )}
    >
      {/* Selected count */}
      <div className="flex items-center gap-2 px-2">
        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
        <span className="text-sm font-semibold">
          {selectedCount} {selectedCount === 1 ? "модель" : "моделей"} вибрано
        </span>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        {onBulkClone && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBulkClone}
            className="gap-2 hover:bg-blue-500/10 hover:text-blue-600"
          >
            <Copy className="h-4 w-4" />
            Клонувати
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onBulkExport}
          className="gap-2 hover:bg-emerald-500/10 hover:text-emerald-600"
        >
          <Download className="h-4 w-4" />
          Експорт
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onBulkDelete}
          className="gap-2 hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Видалити
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Clear button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onClearSelection}
        className="h-8 w-8 hover:bg-muted"
        title="Скасувати виділення"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
