/**
 * SearchBar Component
 *
 * Top toolbar: search (with a quiet result count), a Filters popover,
 * an overflow menu for secondary actions (CSV export), and the primary
 * "New model" action.
 */

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Filter, MoreHorizontal, Plus, Search, X } from "lucide-react";
import type { CatalogType } from "@/types/catalog";
import { exportToCSV } from "@/utils/catalogUtils";

interface SearchBarProps {
  catalog: CatalogType[];
  globalSearch: string;
  setGlobalSearch: (value: string) => void;
  filteredModelsCount: number;
  showOnlyIncomplete: boolean;
  setShowOnlyIncomplete: (value: boolean) => void;
  onCreateModel: () => void;
}

/** Ukrainian plural for "модель". */
function pluralModels(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "модель";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "моделі";
  return "моделей";
}

export function SearchBar({
  catalog,
  globalSearch,
  setGlobalSearch,
  filteredModelsCount,
  showOnlyIncomplete,
  setShowOnlyIncomplete,
  onCreateModel,
}: SearchBarProps) {
  return (
    <div className="border-b border-border/40 bg-muted/20 p-4">
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="group relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary" />
          <Input
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Пошук моделі або SKU..."
            className="h-9 border-border/60 bg-background/80 pl-9 pr-9 focus:border-primary/40"
          />
          {globalSearch && (
            <button
              type="button"
              aria-label="Очистити пошук"
              onClick={() => setGlobalSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Quiet result count */}
        <span className="hidden shrink-0 text-sm tabular-nums text-muted-foreground sm:inline">
          {filteredModelsCount} {pluralModels(filteredModelsCount)}
        </span>

        {/* Filters */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2">
              <Filter className="h-4 w-4" />
              Фільтри
              {showOnlyIncomplete && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <div className="space-y-3">
              <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Фільтри
              </div>
              <label className="flex cursor-pointer items-center gap-2.5">
                <Checkbox
                  checked={showOnlyIncomplete}
                  onCheckedChange={(value) => setShowOnlyIncomplete(value === true)}
                />
                <span className="text-sm">Тільки незавершені</span>
              </label>
              {showOnlyIncomplete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full justify-start text-muted-foreground"
                  onClick={() => setShowOnlyIncomplete(false)}
                >
                  Скинути фільтри
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Overflow: secondary actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Більше дій">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportToCSV(catalog)} className="gap-2">
              <Download className="h-4 w-4 text-muted-foreground" />
              Експорт CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Primary */}
        <Button onClick={onCreateModel} size="sm" className="h-9 gap-2 shadow-lg shadow-primary/20">
          <Plus className="h-4 w-4" />
          Нова модель
        </Button>
      </div>
    </div>
  );
}
