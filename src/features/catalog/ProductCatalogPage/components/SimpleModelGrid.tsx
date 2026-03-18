/**
 * SimpleModelGrid Component - NEW DESIGN
 * 
 * Grid display of models using SimpleModelCard
 */

import { Button } from "@/components/ui/button";
import { Loader2, PackageSearch, Search } from "lucide-react";
import { SimpleModelCard } from "./SimpleModelCard";
import type { ModelWithContext } from "@/types/catalog";

interface SimpleModelGridProps {
  filteredModels: ModelWithContext[];
  globalSearch: string;
  hasActiveSelection: boolean;
  loading?: boolean;
  onClone: (modelId: string) => void;
  onEdit: (modelId: string) => void;
  onDelete: (modelId: string) => void;
  onClearFilters: () => void;
}

export function SimpleModelGrid({
  filteredModels,
  globalSearch,
  hasActiveSelection,
  loading = false,
  onClone,
  onEdit,
  onDelete,
  onClearFilters,
}: SimpleModelGridProps) {
  if (!hasActiveSelection) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-16">
        <div className="rounded-full bg-muted/30 p-6 mb-4">
          <PackageSearch className="h-12 w-12 text-muted-foreground/40" />
        </div>
        <p className="text-lg font-medium text-muted-foreground mb-2">Оберіть вид у каталозі</p>
        <p className="text-sm text-muted-foreground/60 mb-4">
          На старті каталог більше не відкриває першу позицію автоматично.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-16">
        <div className="rounded-full bg-muted/30 p-6 mb-4">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground/40" />
        </div>
        <p className="text-lg font-medium text-muted-foreground mb-2">Завантажуємо моделі</p>
        <p className="text-sm text-muted-foreground/60">Підтягуємо тільки вибраний вид, а не весь каталог.</p>
      </div>
    );
  }

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
