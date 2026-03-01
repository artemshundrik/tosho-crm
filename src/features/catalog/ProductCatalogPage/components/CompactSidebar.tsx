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
import { ChevronDown, ChevronRight, Edit2, Package, Plus, Printer, Shirt } from "lucide-react";
import type { CatalogType, QuoteType } from "@/types/catalog";

interface CompactSidebarProps {
  catalog: CatalogType[];
  selectedTypeId: string;
  selectedKindId: string;
  totalModels: number;
  incompleteModels: number;
  onSelectType: (typeId: string) => void;
  onSelectKind: (kindId: string) => void;
  onAddType: (quoteType?: QuoteType) => void;
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
  const [expandedGroups, setExpandedGroups] = useState<Set<QuoteType>>(
    new Set<QuoteType>(["merch", "print", "other"])
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

  const normalizeQuoteType = (quoteType?: string | null): QuoteType =>
    quoteType === "merch" || quoteType === "print" || quoteType === "other" ? quoteType : "other";

  const groups: Array<{ key: QuoteType; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: "merch", label: "Мерч", icon: Shirt },
    { key: "print", label: "Поліграфія", icon: Printer },
    { key: "other", label: "Інше", icon: Package },
  ];

  const toggleGroup = (group: QuoteType) => {
    const next = new Set(expandedGroups);
    if (next.has(group)) {
      next.delete(group);
    } else {
      next.add(group);
    }
    setExpandedGroups(next);
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
          onClick={() => onAddType("other")}
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
          groups.map((group) => {
            const types = catalog.filter((type) => normalizeQuoteType(type.quote_type) === group.key);
            const isGroupExpanded = expandedGroups.has(group.key);
            const GroupIcon = group.icon;

            return (
              <div key={group.key} className="rounded-lg border border-border/50 bg-background/70">
                <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/40">
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="p-0.5 hover:bg-muted rounded transition-colors"
                    title={isGroupExpanded ? "Згорнути групу" : "Розгорнути групу"}
                  >
                    {isGroupExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <GroupIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">
                        {group.label}
                      </span>
                      <Badge variant="secondary" className="h-5 px-2 text-[10px] font-semibold">
                        {types.length}
                      </Badge>
                    </div>
                    <button
                      onClick={() => onAddType(group.key)}
                      className="p-1 rounded hover:bg-muted transition-colors text-primary"
                      title={`Додати категорію в "${group.label}"`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {isGroupExpanded && (
                  <div className="p-1.5 space-y-0.5">
                    {types.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-muted-foreground">Немає категорій</div>
                    ) : (
                      types.map((type) => {
                        const isExpanded = expandedTypes.has(type.id);
                        const isSelected = selectedTypeId === type.id;

                        return (
                          <div key={type.id} className="space-y-0.5">
                            {/* Type Button */}
                            <div
                              className={cn(
                                "group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-all",
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
                              </button>
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
                                  title="Редагувати категорію"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>

                            {/* Kinds (nested) */}
                            {isExpanded && type.kinds.length > 0 && (
                              <div className="ml-5 space-y-0.5 mt-0.5">
                                {type.kinds.map((kind) => {
                                  const isKindSelected = selectedKindId === kind.id;
                                  return (
                                    <div
                                      key={kind.id}
                                      className={cn(
                                        "group/kind w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-all",
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
                                            isKindSelected ? "text-primary/70" : "text-muted-foreground/50"
                                          )}
                                        >
                                          {kind.models.length}
                                        </span>
                                      </button>
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
                                className="ml-5 w-[calc(100%-1.25rem)] flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all"
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
