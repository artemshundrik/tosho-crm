/**
 * CatalogHeader Component
 * 
 * Top header with title, stats badges, search, and action buttons
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Download, Plus, Search, X } from "lucide-react";
import type { CatalogType } from "@/types/catalog";
import { exportToCSV } from "@/utils/catalogUtils";
import { ViewSwitcher, type ViewMode } from "../ViewSwitcher";

interface CatalogHeaderProps {
  catalog: CatalogType[];
  totalModels: number;
  incompleteModels: number;
  globalSearch: string;
  setGlobalSearch: (value: string) => void;
  showOnlyIncomplete: boolean;
  setShowOnlyIncomplete: (value: boolean) => void;
  filteredModelsCount: number;
  onCreateModel: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function CatalogHeader({
  catalog,
  totalModels,
  incompleteModels,
  globalSearch,
  setGlobalSearch,
  showOnlyIncomplete,
  setShowOnlyIncomplete,
  filteredModelsCount,
  onCreateModel,
  viewMode,
  onViewModeChange,
}: CatalogHeaderProps) {
  return (
    <>
      {/* Fixed Top Bar */}
      <div className="shrink-0 px-6 py-4 border-b border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Каталог продукції</h1>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-xs font-semibold px-2.5 py-0.5 bg-primary/5 border-primary/20 text-primary"
              >
                {totalModels} моделей
              </Badge>
              {incompleteModels > 0 && (
                <Badge
                  variant="outline"
                  className="text-xs font-semibold px-2.5 py-0.5 bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {incompleteModels} незавершених
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(catalog)}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Експорт CSV
            </Button>
            <Button
              onClick={onCreateModel}
              className="shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all gap-2"
            >
              <Plus className="h-4 w-4" />
              Нова модель
            </Button>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-5 border-b border-border/40 shrink-0 bg-gradient-to-r from-background/80 to-muted/5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 max-w-2xl">
            <ViewSwitcher view={viewMode} onViewChange={onViewModeChange} />
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
              <Input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Пошук по всьому каталогу..."
                className="pl-9 pr-9 bg-background/80 border-border/60 focus:border-primary/40 focus:ring-primary/20 transition-all"
              />
              {globalSearch && (
                <button
                  onClick={() => setGlobalSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              variant={showOnlyIncomplete ? "default" : "outline"}
              size="sm"
              onClick={() => setShowOnlyIncomplete(!showOnlyIncomplete)}
              className="gap-2 shrink-0"
            >
              <AlertTriangle className="h-4 w-4" />
              Незавершені
            </Button>
          </div>
          <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5 shrink-0">
            {filteredModelsCount} результатів
          </Badge>
        </div>
      </div>
    </>
  );
}
