/**
 * ModelGrid Component
 * 
 * Grid display of filtered models with empty state
 */

import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { ModelCard } from "./ModelCard";
import type { ModelWithContext } from "@/types/catalog";

interface ModelGridProps {
  filteredModels: ModelWithContext[];
  globalSearch: string;
  showOnlyIncomplete: boolean;
  inlineEditId: string | null;
  inlinePrice: string;
  setInlinePrice: (value: string) => void;
  onStartInlineEdit: (modelId: string, price: number) => void;
  onSaveInlineEdit: () => void;
  onClone: (modelId: string) => void;
  onEdit: (modelId: string) => void;
  onDelete: (modelId: string) => void;
  onClearFilters: () => void;
}

export function ModelGrid({
  filteredModels,
  globalSearch,
  showOnlyIncomplete,
  inlineEditId,
  inlinePrice,
  setInlinePrice,
  onStartInlineEdit,
  onSaveInlineEdit,
  onClone,
  onEdit,
  onDelete,
  onClearFilters,
}: ModelGridProps) {
  if (filteredModels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
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
    <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-2 gap-4">
      {filteredModels.map((item) => (
        <ModelCard
          key={item.model.id}
          item={item}
          inlineEditId={inlineEditId}
          inlinePrice={inlinePrice}
          setInlinePrice={setInlinePrice}
          onStartInlineEdit={onStartInlineEdit}
          onSaveInlineEdit={onSaveInlineEdit}
          onClone={onClone}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
