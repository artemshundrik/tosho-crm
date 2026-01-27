/**
 * SearchBar Component - NEW DESIGN
 * 
 * Search bar with filters, results count, and action buttons
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Filter, Plus, Search, X } from "lucide-react";
import type { CatalogType } from "@/types/catalog";
import { exportToCSV } from "@/utils/catalogUtils";

interface SearchBarProps {
  catalog: CatalogType[];
  globalSearch: string;
  setGlobalSearch: (value: string) => void;
  filteredModelsCount: number;
  onCreateModel: () => void;
}

export function SearchBar({
  catalog,
  globalSearch,
  setGlobalSearch,
  filteredModelsCount,
  onCreateModel,
}: SearchBarProps) {
  return (
    <div className="p-4 border-b border-border/40 bg-muted/20">
      <div className="flex items-center gap-3">
        {/* Search Input */}
        <div className="flex-1 relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
          <Input
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Пошук моделі або SKU..."
            className="pl-9 pr-9 bg-background/80 border-border/60 focus:border-primary/40 h-9"
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

        {/* Filters Button */}
        <Button variant="outline" size="sm" className="gap-2 h-9">
          <Filter className="h-4 w-4" />
          Фільтри
        </Button>

        {/* Results Count */}
        <Badge variant="outline" className="text-xs px-2.5 py-1 h-9 flex items-center gap-1.5">
          <span className="font-semibold tabular-nums">{filteredModelsCount}</span>
          <span className="text-muted-foreground">моделей</span>
        </Badge>

        {/* Export CSV */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportToCSV(catalog)}
          className="gap-2 h-9"
        >
          <Download className="h-4 w-4" />
          Експорт CSV
        </Button>

        {/* New Model */}
        <Button
          onClick={onCreateModel}
          size="sm"
          className="gap-2 h-9 shadow-lg shadow-primary/20"
        >
          <Plus className="h-4 w-4" />
          Нова модель
        </Button>
      </div>
    </div>
  );
}
