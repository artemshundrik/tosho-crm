/**
 * SimpleModelGrid Component - NEW DESIGN
 * 
 * Grid display of models using SimpleModelCard
 */

import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { SimpleModelCard } from "./SimpleModelCard";
import type { ModelWithContext } from "@/types/catalog";

interface SimpleModelGridProps {
  filteredModels: ModelWithContext[];
  globalSearch: string;
  onClone: (modelId: string) => void;
  onEdit: (modelId: string) => void;
  onDelete: (modelId: string) => void;
  onClearFilters: () => void;
}

export function SimpleModelGrid({
  filteredModels,
  globalSearch,
  onClone,
  onEdit,
  onDelete,
  onClearFilters,
}: SimpleModelGridProps) {
  if (filteredModels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-16">
        <div className="rounded-full bg-muted/30 p-6 mb-4">
          <Search className="h-12 w-12 text-muted-foreground/40" />
        </div>
        <p className="text-lg font-medium text-muted-foreground mb-2">
          Моделей не знайдено
        </p>
        <p className="text-sm text-muted-foreground/60 mb-4">
          Спробуйте змінити критерії пошуку
        </p>
        {globalSearch && (
          <Button variant="outline" onClick={onClearFilters} size="sm">
            Скинути фільтри
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {filteredModels.map((item) => (
        <SimpleModelCard
          key={item.model.id}
          item={item}
          onClone={onClone}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
