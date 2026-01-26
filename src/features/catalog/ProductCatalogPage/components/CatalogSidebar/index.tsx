/**
 * CatalogSidebar Component
 * 
 * Left sidebar with types, kinds, print positions, and quote type selector
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MapPin, Plus, X } from "lucide-react";
import type { CatalogType, CatalogKind, QuoteType } from "@/types/catalog";

interface CatalogSidebarProps {
  catalog: CatalogType[];
  selectedTypeId: string;
  selectedKindId: string;
  selectedType: CatalogType | undefined;
  selectedKinds: CatalogKind[];
  selectedKind: CatalogKind | undefined;
  newPrintPositionName: string;
  setNewPrintPositionName: (value: string) => void;
  printPositionSaving: boolean;
  printPositionError: string | null;
  typeQuoteTypeSaving: boolean;
  typeQuoteTypeError: string | null;
  onSelectType: (typeId: string) => void;
  onSelectKind: (kindId: string) => void;
  onAddType: () => void;
  onAddKind: () => void;
  onAddPrintPosition: (kindId: string) => void;
  onDeletePrintPosition: (kindId: string, positionId: string) => void;
  onQuoteTypeUpdate: (value: QuoteType) => void;
}

export function CatalogSidebar({
  catalog,
  selectedTypeId,
  selectedKindId,
  selectedType,
  selectedKinds,
  selectedKind,
  newPrintPositionName,
  setNewPrintPositionName,
  printPositionSaving,
  printPositionError,
  typeQuoteTypeSaving,
  typeQuoteTypeError,
  onSelectType,
  onSelectKind,
  onAddType,
  onAddKind,
  onAddPrintPosition,
  onDeletePrintPosition,
  onQuoteTypeUpdate,
}: CatalogSidebarProps) {
  return (
    <>
      {/* Left: Types */}
      <div className="w-[220px] border-r border-border/40 flex flex-col bg-gradient-to-b from-muted/10 to-transparent">
        <div className="p-4 pb-3 shrink-0 border-b border-border/20 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/90 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-primary/60"></div>
            Категорії
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAddType}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        
        <div className="px-4 py-3 border-b border-border/30 bg-muted/5 space-y-2">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Тип прорахунку
          </Label>
          <div className="text-[11px] text-muted-foreground">
            Для категорії:{" "}
            <span className="text-foreground/90 font-medium">
              {selectedType?.name ?? "Оберіть категорію"}
            </span>
          </div>
          <Select
            value={selectedType?.quote_type ?? ""}
            onValueChange={(v) => selectedType && onQuoteTypeUpdate(v as QuoteType)}
            disabled={!selectedType || typeQuoteTypeSaving}
          >
            <SelectTrigger className="h-9 text-xs bg-background/70 border-border/60">
              <SelectValue placeholder="Не задано" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="merch">Мерч</SelectItem>
              <SelectItem value="print">Поліграфія</SelectItem>
              <SelectItem value="other">Інше</SelectItem>
            </SelectContent>
          </Select>
          {typeQuoteTypeError && (
            <div className="text-xs text-destructive">{typeQuoteTypeError}</div>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {catalog.map((type) => (
            <button
              key={type.id}
              onClick={() => onSelectType(type.id)}
              className={cn(
                "group flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-sm transition-all duration-200",
                selectedTypeId === type.id
                  ? "bg-gradient-to-r from-primary/15 to-primary/5 text-primary font-semibold shadow-sm ring-1 ring-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <span className="truncate">{type.name}</span>
              <div className="flex items-center gap-1.5">
                {type.quote_type ? (
                  <Badge
                    variant="secondary"
                    className={cn(
                      "h-5 px-2 text-[10px] font-medium capitalize",
                      selectedTypeId === type.id
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground/70"
                    )}
                  >
                    {type.quote_type === "merch"
                      ? "Мерч"
                      : type.quote_type === "print"
                      ? "Поліграфія"
                      : "Інше"}
                  </Badge>
                ) : null}
                <Badge
                  variant="secondary"
                  className={cn(
                    "h-5 px-2 text-[10px] font-medium transition-colors",
                    selectedTypeId === type.id
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground/70"
                  )}
                >
                  {type.kinds.length}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Middle: Kinds */}
      <div className="w-[240px] border-r border-border/40 flex flex-col bg-gradient-to-b from-muted/5 to-transparent">
        <div className="p-4 pb-3 shrink-0 border-b border-border/20 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/90 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500/60"></div>
            {selectedType?.name || "Види"}
          </div>
          {selectedTypeId && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAddKind}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        
        <div className="px-4 py-3 border-b border-border/30 bg-muted/5 space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Місця нанесення
          </div>
          <div className="flex gap-2">
            <Input
              value={newPrintPositionName}
              onChange={(e) => setNewPrintPositionName(e.target.value)}
              placeholder={selectedKind ? "Напр. З однієї сторони" : "Оберіть вид"}
              className="h-9 text-xs bg-background/70 border-border/60"
              disabled={!selectedKind}
            />
            <Button
              size="sm"
              onClick={() => selectedKind && onAddPrintPosition(selectedKind.id)}
              disabled={!selectedKind || !newPrintPositionName.trim() || printPositionSaving}
            >
              {printPositionSaving ? "..." : "Додати"}
            </Button>
          </div>
          {printPositionError && (
            <div className="text-xs text-destructive">{printPositionError}</div>
          )}
          <div className="flex flex-wrap gap-2">
            {!selectedKind ? (
              <span className="text-xs text-muted-foreground">
                Оберіть вид, щоб додати варіанти
              </span>
            ) : selectedKind.printPositions.length === 0 ? (
              <span className="text-xs text-muted-foreground">Немає варіантів</span>
            ) : (
              selectedKind.printPositions.map((pos) => (
                <div
                  key={pos.id}
                  className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-xs"
                >
                  <span>{pos.label}</span>
                  <button
                    type="button"
                    onClick={() => onDeletePrintPosition(selectedKind.id, pos.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {selectedKinds.length === 0 ? (
            <div className="text-sm text-muted-foreground/60 px-2 py-8 text-center">
              Немає видів
            </div>
          ) : (
            selectedKinds.map((kind) => (
              <button
                key={kind.id}
                onClick={() => onSelectKind(kind.id)}
                className={cn(
                  "group flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-sm transition-all duration-200",
                  selectedKindId === kind.id
                    ? "bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-400 font-semibold shadow-sm ring-1 ring-emerald-500/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
              >
                <span className="truncate">{kind.name}</span>
                <Badge
                  variant="secondary"
                  className={cn(
                    "h-5 px-2 text-[10px] font-medium transition-colors",
                    selectedKindId === kind.id
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                      : "text-muted-foreground/70"
                  )}
                >
                  {kind.models.length}
                </Badge>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
