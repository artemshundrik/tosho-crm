/**
 * ContentHeader Component - NEW DESIGN
 * 
 * Header for content area with breadcrumb, description, chips for places/methods
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  Edit2,
  MapPin,
  Plus,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import type { CatalogType, CatalogKind } from "@/types/catalog";

interface ContentHeaderProps {
  selectedType: CatalogType | undefined;
  selectedKind: CatalogKind | undefined;
  newPrintPositionName: string;
  setNewPrintPositionName: (value: string) => void;
  printPositionSaving: boolean;
  onAddPrintPosition: (kindId: string) => void;
  onDeletePrintPosition: (kindId: string, positionId: string) => void;
  onAddMethod?: () => void;
}

export function ContentHeader({
  selectedType,
  selectedKind,
  newPrintPositionName,
  setNewPrintPositionName,
  printPositionSaving,
  onAddPrintPosition,
  onDeletePrintPosition,
  onAddMethod,
}: ContentHeaderProps) {
  if (!selectedType || !selectedKind) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Оберіть категорію та вид для початку роботи
      </div>
    );
  }

  const availableMethods = selectedKind.methods || [];
  const printPositions = selectedKind.printPositions || [];

  return (
    <div className="p-6 border-b border-border/40 space-y-4">
      {/* Breadcrumb + Actions */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 flex-1 min-w-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">одяг</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            <span className="font-semibold">{selectedType.name}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            <span className="font-semibold text-primary">{selectedKind.name}</span>
            <button
              className="ml-1 p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              title="Редагувати назву"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Description */}
          <p className="text-xs text-muted-foreground">
            Керування моделями та налаштуваннями друку для категорії
          </p>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            title="Налаштування виду"
          >
            <Settings className="h-4 w-4" />
            Налаштування виду
          </Button>
        </div>
      </div>

      {/* Print Positions Chips */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Місця:
          </span>
          <div className="flex flex-wrap gap-2 flex-1">
            {printPositions.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">
                Немає місць нанесення
              </span>
            ) : (
              printPositions.map((pos) => (
                <Badge
                  key={pos.id}
                  variant="secondary"
                  className="gap-1.5 pr-1 bg-muted/60 hover:bg-muted"
                >
                  <span>{pos.label}</span>
                  <button
                    onClick={() => onDeletePrintPosition(selectedKind.id, pos.id)}
                    className="hover:bg-muted-foreground/20 rounded p-0.5 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
            
            {/* Add Print Position Inline */}
            <div className="flex items-center gap-1">
              <Input
                value={newPrintPositionName}
                onChange={(e) => setNewPrintPositionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newPrintPositionName.trim()) {
                    onAddPrintPosition(selectedKind.id);
                  }
                }}
                placeholder="Додати місце..."
                className="h-6 w-32 text-xs px-2"
                disabled={printPositionSaving}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => onAddPrintPosition(selectedKind.id)}
                disabled={!newPrintPositionName.trim() || printPositionSaving}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Methods Chips */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Методи:
          </span>
          <div className="flex flex-wrap gap-2 flex-1">
            {availableMethods.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">
                Немає методів нанесення
              </span>
            ) : (
              availableMethods.map((method) => (
                <Badge
                  key={method.id}
                  variant="secondary"
                  className={cn(
                    "gap-1.5",
                    "bg-primary/10 text-primary border-primary/20"
                  )}
                >
                  <span>{method.name}</span>
                </Badge>
              ))
            )}
            
            {/* Add Method Button */}
            {onAddMethod && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs gap-1"
                onClick={onAddMethod}
              >
                <Plus className="h-3.5 w-3.5" />
                Додати
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
