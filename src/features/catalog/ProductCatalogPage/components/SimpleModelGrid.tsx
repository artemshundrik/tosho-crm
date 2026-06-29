/**
 * SimpleModelGrid Component - NEW DESIGN
 * 
 * Grid display of models using SimpleModelCard
 */

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { PackageSearch, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SimpleModelCard } from "./SimpleModelCard";
import type { ModelWithContext } from "@/types/catalog";

const GRID_CLASS = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4";

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

function SimpleModelGridBase({
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
        <p className="text-lg font-medium text-muted-foreground mb-2">Оберіть категорію або вид</p>
        <p className="text-sm text-muted-foreground/60 mb-4">
          Виберіть категорію чи вид зліва, щоб переглянути моделі.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={GRID_CLASS} aria-busy="true" aria-label="Завантаження моделей">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card"
          >
            <Skeleton className="aspect-[4/5] w-full rounded-none" />
            <div className="flex flex-col gap-3 p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <div className="flex gap-1.5 pt-1">
                <Skeleton className="h-6 w-16 rounded-md" />
                <Skeleton className="h-6 w-12 rounded-md" />
              </div>
            </div>
          </div>
        ))}
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
    <div className={GRID_CLASS}>
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

export const SimpleModelGrid = memo(SimpleModelGridBase);
