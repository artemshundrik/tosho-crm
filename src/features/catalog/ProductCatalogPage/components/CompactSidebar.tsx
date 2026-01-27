/**
 * CompactSidebar Component - NEW DESIGN
 * 
 * Compact left sidebar with nested navigation (categories -> kinds)
 * Based on the new design reference
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Edit2, Plus } from "lucide-react";
import type { CatalogType } from "@/types/catalog";

interface CompactSidebarProps {
  catalog: CatalogType[];
  selectedTypeId: string;
  selectedKindId: string;
  totalModels: number;
  incompleteModels: number;
  onSelectType: (typeId: string) => void;
  onSelectKind: (kindId: string) => void;
  onAddType: () => void;
  onAddKind: (typeId: string) => void;
  onEditType?: (typeId: string) => void;
  onEditKind?: (kindId: string) => void;
}

export function CompactSidebar({
  catalog,
  selectedTypeId,
  selectedKindId,
  totalModels,
  incompleteModels,
  onSelectType,
  onSelectKind,
  onAddType,
  onAddKind,
  onEditType,
  onEditKind,
}: CompactSidebarProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(
    new Set(catalog.map((t) => t.id))
  );

  const toggleType = (typeId: string) => {
    const newExpanded = new Set(expandedTypes);
    if (newExpanded.has(typeId)) {
      newExpanded.delete(typeId);
    } else {
      newExpanded.add(typeId);
    }
    setExpandedTypes(newExpanded);
  };

  const getQuoteTypeLabel = (quoteType?: string | null) => {
    if (quoteType === "merch") return "Merch";
    if (quoteType === "print") return "Print";
    return null;
  };

  return (
    <div className="w-[280px] flex flex-col bg-background border-r border-border/40">
      {/* Header */}
      <div className="p-4 border-b border-border/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Навігація
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
          onClick={onAddType}
          title="Додати категорію"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation Tree */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {catalog.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            Немає категорій
          </div>
        ) : (
          catalog.map((type) => {
            const isExpanded = expandedTypes.has(type.id);
            const isSelected = selectedTypeId === type.id;
            const quoteLabel = getQuoteTypeLabel(type.quote_type);

            return (
              <div key={type.id} className="space-y-0.5">
                {/* Type Button */}
                <div
                  className={cn(
                    "group flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all",
                    isSelected
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted/50"
                  )}
                >
                  <button
                    onClick={() => toggleType(type.id)}
                    className="p-0.5 hover:bg-muted rounded transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      onSelectType(type.id);
                      if (!isExpanded) {
                        setExpandedTypes((prev) => new Set([...prev, type.id]));
                      }
                    }}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                  >
                    <span className="font-medium truncate">{type.name}</span>
                    {quoteLabel && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "h-5 px-2 text-[10px] font-semibold",
                          isSelected
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {quoteLabel}
                      </Badge>
                    )}
                  </button>
                  {/* Edit Type Icon */}
                  {onEditType && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditType(type.id);
                      }}
                      className={cn(
                        "p-1 rounded hover:bg-muted transition-colors opacity-0 group-hover:opacity-100",
                        isSelected && "opacity-100"
                      )}
                      title="Редагувати тип"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Kinds (nested) */}
                {isExpanded && type.kinds.length > 0 && (
                  <div className="ml-6 space-y-0.5 mt-0.5">
                    {type.kinds.map((kind) => {
                      const isKindSelected = selectedKindId === kind.id;
                      return (
                        <div
                          key={kind.id}
                          className={cn(
                            "group/kind w-full flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all",
                            isKindSelected
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                          )}
                        >
                          <button
                            onClick={() => {
                              onSelectType(type.id);
                              onSelectKind(kind.id);
                            }}
                            className="flex-1 flex items-center justify-between gap-2 text-left min-w-0"
                          >
                            <span className="truncate">{kind.name}</span>
                            <span
                              className={cn(
                                "text-xs tabular-nums shrink-0",
                                isKindSelected
                                ? "text-primary/70"
                                : "text-muted-foreground/50"
                            )}
                          >
                            {kind.models.length}
                          </span>
                        </button>
                          {/* Edit Kind Icon */}
                          {onEditKind && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditKind(kind.id);
                              }}
                              className={cn(
                                "p-1 rounded hover:bg-muted/60 transition-colors opacity-0 group-hover/kind:opacity-100",
                                isKindSelected && "opacity-100"
                              )}
                              title="Редагувати вид"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add Kind Button */}
                {isExpanded && (
                  <button
                    onClick={() => onAddKind(type.id)}
                    className="ml-6 w-[calc(100%-1.5rem)] flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Додати вид</span>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Stats */}
      <div className="p-4 border-t border-border/40 space-y-2 shrink-0">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Всього моделей:</span>
          <span className="font-semibold tabular-nums">{totalModels}</span>
        </div>
        {incompleteModels > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-amber-600 dark:text-amber-500">
              Незавершених:
            </span>
            <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-500">
              {incompleteModels}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
