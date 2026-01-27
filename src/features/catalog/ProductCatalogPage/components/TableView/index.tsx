/**
 * TableView Component
 * 
 * Table layout for catalog models with sorting, selection, and inline actions
 */

import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Search } from "lucide-react";
import { ModelRow } from "./ModelRow";
import type { ModelWithContext } from "@/types/catalog";

type SortField = "name" | "type" | "kind" | "price" | "status";
type SortDirection = "asc" | "desc";

interface TableViewProps {
  filteredModels: ModelWithContext[];
  globalSearch: string;
  showOnlyIncomplete: boolean;
  onEdit: (id: string) => void;
  onClone: (id: string) => void;
  onDelete: (id: string) => void;
  onClearFilters: () => void;
  // Selection
  isAllSelected: boolean;
  isIndeterminate: boolean;
  isSelected: (id: string) => boolean;
  onToggleSelectAll: () => void;
  onToggleSelection: (id: string) => void;
}

export function TableView({
  filteredModels,
  globalSearch,
  showOnlyIncomplete,
  onEdit,
  onClone,
  onDelete,
  onClearFilters,
  isAllSelected,
  isIndeterminate,
  isSelected,
  onToggleSelectAll,
  onToggleSelection,
}: TableViewProps) {
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Sort models
  const sortedModels = useMemo(() => {
    const sorted = [...filteredModels];

    sorted.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case "name":
          aValue = a.model.name.toLowerCase();
          bValue = b.model.name.toLowerCase();
          break;
        case "type":
          aValue = a.typeName.toLowerCase();
          bValue = b.typeName.toLowerCase();
          break;
        case "kind":
          aValue = a.kindName.toLowerCase();
          bValue = b.kindName.toLowerCase();
          break;
        case "price":
          aValue = a.model.price ?? 0;
          bValue = b.model.price ?? 0;
          break;
        case "status":
          aValue = a.validation.isValid ? 1 : 0;
          bValue = b.validation.isValid ? 1 : 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredModels, sortField, sortDirection]);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Empty state
  if (sortedModels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-12">
        <div className="rounded-full bg-muted/30 p-6 mb-4">
          <Search className="h-12 w-12 text-muted-foreground/40" />
        </div>
        <p className="text-lg font-medium text-muted-foreground mb-2">Моделей не знайдено</p>
        <p className="text-sm text-muted-foreground/60 mb-4">
          Спробуйте змінити критерії пошуку
        </p>
        {(globalSearch || showOnlyIncomplete) && (
          <Button variant="outline" onClick={onClearFilters} size="sm">
            Скинути фільтри
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border/60 bg-muted/30">
            {/* Select all checkbox */}
            <th className="w-12 px-4 py-3 text-left">
              <Checkbox
                checked={isAllSelected}
                onCheckedChange={onToggleSelectAll}
                aria-label="Select all"
                className={isIndeterminate ? "data-[state=checked]:bg-primary" : ""}
              />
            </th>

            {/* Image */}
            <th className="w-16 px-2 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Фото
            </th>

            {/* Name */}
            <th className="px-4 py-3 text-left">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("name")}
                className="h-8 -ml-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
              >
                Назва
                <ArrowUpDown className="ml-2 h-3 w-3" />
              </Button>
            </th>

            {/* Category */}
            <th className="px-4 py-3 text-left">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("type")}
                className="h-8 -ml-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
              >
                Категорія
                <ArrowUpDown className="ml-2 h-3 w-3" />
              </Button>
            </th>

            {/* Kind */}
            <th className="px-4 py-3 text-left">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("kind")}
                className="h-8 -ml-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
              >
                Вид
                <ArrowUpDown className="ml-2 h-3 w-3" />
              </Button>
            </th>

            {/* Price */}
            <th className="px-4 py-3 text-left">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("price")}
                className="h-8 -ml-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
              >
                Ціна
                <ArrowUpDown className="ml-2 h-3 w-3" />
              </Button>
            </th>

            {/* Methods */}
            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Методи
            </th>

            {/* Status */}
            <th className="px-4 py-3 text-left">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSort("status")}
                className="h-8 -ml-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
              >
                Статус
                <ArrowUpDown className="ml-2 h-3 w-3" />
              </Button>
            </th>

            {/* Actions */}
            <th className="w-20 px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Дії
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedModels.map((item) => (
            <ModelRow
              key={item.model.id}
              item={item}
              isSelected={isSelected(item.model.id)}
              onToggleSelection={onToggleSelection}
              onEdit={onEdit}
              onClone={onClone}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
