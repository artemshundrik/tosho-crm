/**
 * CommandPalette Component
 * 
 * Global command palette for quick actions, search, and navigation
 * Activated with Cmd+K or Ctrl+K
 */

import { useEffect } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Download,
  Box,
  FolderOpen,
  Layers,
  Search,
  Clock,
  X,
  AlertTriangle,
  Image as ImageIcon,
  Package,
  Coins,
} from "lucide-react";
import type { ModelWithContext } from "@/types/catalog";
import type { CommandAction } from "../hooks/useCommandPalette";
import { formatPrice, getPriceRange } from "@/utils/catalogUtils";
import { CURRENCY_SYMBOL } from "@/constants/catalog";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: string;
  onSearchChange: (search: string) => void;
  searchHistory: string[];
  onClearHistory: () => void;
  quickActions: CommandAction[];
  filteredModels: ModelWithContext[];
  filteredTypes: Array<{ id: string; name: string }>;
  filteredKinds: Array<{ id: string; name: string; typeName: string }>;
  onSelectModel: (modelId: string) => void;
  onNavigateToType: (typeId: string) => void;
  onNavigateToKind: (kindId: string) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  search,
  onSearchChange,
  searchHistory,
  onClearHistory,
  quickActions,
  filteredModels,
  filteredTypes,
  filteredKinds,
  onSelectModel,
  onNavigateToType,
  onNavigateToKind,
}: CommandPaletteProps) {
  // Reset search when closing
  useEffect(() => {
    if (!open) {
      onSearchChange("");
    }
  }, [open, onSearchChange]);

  const hasResults =
    filteredModels.length > 0 || filteredTypes.length > 0 || filteredKinds.length > 0;
  const showHistory = !search && searchHistory.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Знайти модель, категорію або виконати дію..."
        value={search}
        onValueChange={onSearchChange}
      />
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="rounded-full bg-muted/30 p-3 mb-3">
              <Search className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Нічого не знайдено</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Спробуйте інший запит або створіть нову модель
            </p>
          </div>
        </CommandEmpty>

        {/* Quick Actions */}
        <CommandGroup heading="Швидкі дії">
          {quickActions.map((action) => (
            <CommandItem key={action.id} onSelect={action.onSelect}>
              {action.icon === "Plus" && <Plus className="mr-2 h-4 w-4" />}
              {action.icon === "Download" && <Download className="mr-2 h-4 w-4" />}
              <span>{action.label}</span>
              {action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Search History */}
        {showHistory && (
          <>
            <CommandSeparator />
            <CommandGroup
              heading={
                <div className="flex items-center justify-between">
                  <span>Недавні пошуки</span>
                  <button
                    onClick={onClearHistory}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Очистити
                  </button>
                </div>
              }
            >
              {searchHistory.map((item, index) => (
                <CommandItem
                  key={`${item}-${index}`}
                  onSelect={() => onSearchChange(item)}
                  className="text-muted-foreground"
                >
                  <Clock className="mr-2 h-4 w-4" />
                  <span>{item}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Filtered Results */}
        {hasResults && (
          <>
            {/* Categories */}
            {filteredTypes.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Категорії">
                  {filteredTypes.map((type) => (
                    <CommandItem
                      key={type.id}
                      onSelect={() => onNavigateToType(type.id)}
                      className="cursor-pointer"
                    >
                      <FolderOpen className="mr-2 h-4 w-4 text-primary" />
                      <span>{type.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* Kinds */}
            {filteredKinds.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Види">
                  {filteredKinds.map((kind) => (
                    <CommandItem
                      key={kind.id}
                      onSelect={() => onNavigateToKind(kind.id)}
                      className="cursor-pointer"
                    >
                      <Layers className="mr-2 h-4 w-4 text-emerald-500" />
                      <div className="flex items-center gap-2 flex-1">
                        <span>{kind.name}</span>
                        <span className="text-xs text-muted-foreground">→ {kind.typeName}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* Models */}
            {filteredModels.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Моделі">
                  {filteredModels.map(({ model, typeName, kindName, validation }) => {
                    const priceRange = getPriceRange(model);
                    const hasTiers = model.priceTiers && model.priceTiers.length > 0;

                    return (
                      <CommandItem
                        key={model.id}
                        onSelect={() => onSelectModel(model.id)}
                        className="cursor-pointer py-3"
                      >
                        <div className="flex items-start gap-3 flex-1">
                          {/* Image */}
                          <div className="shrink-0">
                            {model.imageUrl ? (
                              <img
                                src={model.imageUrl}
                                alt={model.name}
                                className="w-10 h-10 rounded-md object-cover border border-border/40"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-md bg-muted/30 border border-dashed border-border/40 flex items-center justify-center">
                                <ImageIcon className="h-5 w-5 text-muted-foreground/30" />
                              </div>
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium truncate">{model.name}</span>
                              {!validation.isValid && (
                                <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="truncate">
                                {typeName} → {kindName}
                              </span>
                              {hasTiers && (
                                <Badge
                                  variant="secondary"
                                  className="h-4 px-1.5 text-[10px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400"
                                >
                                  {model.priceTiers?.length} тиражі
                                </Badge>
                              )}
                              {model.methodIds && model.methodIds.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <Coins className="h-3 w-3" />
                                  <span>{model.methodIds.length}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Price */}
                          <div className="shrink-0 text-right">
                            <div className="font-mono text-sm font-bold">
                              {priceRange} <span className="text-xs text-muted-foreground">{CURRENCY_SYMBOL}</span>
                            </div>
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
