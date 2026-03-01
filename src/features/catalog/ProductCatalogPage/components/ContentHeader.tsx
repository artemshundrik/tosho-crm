/**
 * ContentHeader Component - NEW DESIGN
 * 
 * Header for content area with breadcrumb, description, chips for places/methods
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  Edit2,
  MapPin,
  Package,
  Plus,
  Printer,
  Settings,
  Shirt,
  Sparkles,
} from "lucide-react";
import type { CatalogType, CatalogKind } from "@/types/catalog";

interface ContentHeaderProps {
  selectedType: CatalogType | undefined;
  selectedKind: CatalogKind | undefined;
  printPositionError?: string | null;
  printPositionSaving: boolean;
  onAddPrintPosition: (kindId: string, label?: string) => void;
  onDeletePrintPosition: (kindId: string, positionId: string) => void;
  onUpdatePrintPosition: (kindId: string, positionId: string, label: string) => Promise<boolean>;
  methodSaving: boolean;
  methodError?: string | null;
  onAddMethod: (kindId: string, name?: string) => void;
  onUpdateMethod: (kindId: string, methodId: string, name: string) => Promise<boolean>;
  onDeleteMethod: (kindId: string, methodId: string) => void;
}

export function ContentHeader({
  selectedType,
  selectedKind,
  printPositionError,
  printPositionSaving,
  onAddPrintPosition,
  onDeletePrintPosition,
  onUpdatePrintPosition,
  methodSaving,
  methodError,
  onAddMethod,
  onUpdateMethod,
  onDeleteMethod,
}: ContentHeaderProps) {
  const quoteType = selectedType?.quote_type === "merch" || selectedType?.quote_type === "print" ? selectedType.quote_type : "other";
  const quoteTypeLabel = quoteType === "merch" ? "мерч" : quoteType === "print" ? "поліграфія" : "інше";
  const QuoteTypeIcon = quoteType === "merch" ? Shirt : quoteType === "print" ? Printer : Package;
  const availableMethods = selectedKind?.methods || [];
  const printPositions = selectedKind?.printPositions || [];
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [positionModalMode, setPositionModalMode] = useState<"add" | "edit">("add");
  const [positionModalId, setPositionModalId] = useState<string | null>(null);
  const [positionModalValue, setPositionModalValue] = useState("");

  const [methodModalOpen, setMethodModalOpen] = useState(false);
  const [methodModalMode, setMethodModalMode] = useState<"add" | "edit">("add");
  const [methodModalId, setMethodModalId] = useState<string | null>(null);
  const [methodModalValue, setMethodModalValue] = useState("");

  const openAddPositionModal = () => {
    setPositionModalMode("add");
    setPositionModalId(null);
    setPositionModalValue("");
    setPositionModalOpen(true);
  };

  const openEditPositionModal = (id: string, label: string) => {
    setPositionModalMode("edit");
    setPositionModalId(id);
    setPositionModalValue(label);
    setPositionModalOpen(true);
  };

  const openAddMethodModal = () => {
    setMethodModalMode("add");
    setMethodModalId(null);
    setMethodModalValue("");
    setMethodModalOpen(true);
  };

  const openEditMethodModal = (id: string, name: string) => {
    setMethodModalMode("edit");
    setMethodModalId(id);
    setMethodModalValue(name);
    setMethodModalOpen(true);
  };

  useEffect(() => {
    setPositionModalOpen(false);
    setMethodModalOpen(false);
    setPositionModalId(null);
    setMethodModalId(null);
    setPositionModalValue("");
    setMethodModalValue("");
  }, [selectedKind?.id]);

  if (!selectedType || !selectedKind) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Оберіть категорію та вид для початку роботи
      </div>
    );
  }

  return (
    <div className="p-6 border-b border-border/40 space-y-4">
      {/* Breadcrumb + Actions */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 flex-1 min-w-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground inline-flex items-center gap-1.5">
              <QuoteTypeIcon className="h-3.5 w-3.5" />
              {quoteTypeLabel}
            </span>
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
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Місця:
          </span>
          <div className="flex flex-wrap gap-2 flex-1">
            {printPositions.map((pos) => (
              <button
                key={pos.id}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-foreground transition",
                  "hover:bg-muted/60 hover:border-border",
                  positionModalId === pos.id && positionModalOpen && "ring-1 ring-primary/30"
                )}
                type="button"
                onClick={() => openEditPositionModal(pos.id, pos.label)}
              >
                {pos.label}
              </button>
            ))}
            <button
              type="button"
              onClick={openAddPositionModal}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border/70 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted/40"
            >
              <Plus className="h-3.5 w-3.5" />
              Додати місце
            </button>
          </div>
        </div>
      </div>

      {/* Methods Chips */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Методи:
          </span>
          <div className="flex flex-wrap gap-2 flex-1">
            {availableMethods.map((method) => (
              <button
                key={method.id}
                type="button"
                onClick={() => openEditMethodModal(method.id, method.name)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition",
                  "hover:bg-primary/15",
                  methodModalId === method.id && methodModalOpen && "ring-1 ring-primary/30"
                )}
              >
                {method.name}
              </button>
            ))}
            <button
              type="button"
              onClick={openAddMethodModal}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/15"
            >
              <Plus className="h-3.5 w-3.5" />
              Додати метод
            </button>
          </div>
        </div>
      </div>

      {/* Print Position Modal */}
      <Dialog open={positionModalOpen} onOpenChange={setPositionModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {positionModalMode === "add" ? "Нове місце нанесення" : "Редагувати місце"}
            </DialogTitle>
            <DialogDescription>
              {positionModalMode === "add"
                ? "Вкажіть назву нового місця нанесення."
                : "Оновіть назву місця нанесення."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={positionModalValue}
              onChange={(e) => setPositionModalValue(e.target.value)}
              placeholder="Напр. Лівий рукав"
              className="h-11"
              autoFocus
            />
            {printPositionError && (
              <div className="text-xs text-destructive">{printPositionError}</div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {positionModalMode === "edit" && positionModalId ? (
              <Button
                variant="destructiveSolid"
                onClick={() => {
                  if (!window.confirm("Видалити це місце нанесення?")) return;
                  onDeletePrintPosition(selectedKind.id, positionModalId);
                  setPositionModalOpen(false);
                }}
                disabled={printPositionSaving}
              >
                Видалити
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPositionModalOpen(false)}>
                Скасувати
              </Button>
              <Button
                onClick={async () => {
                  if (!positionModalValue.trim()) return;
                  if (positionModalMode === "add") {
                    onAddPrintPosition(selectedKind.id, positionModalValue);
                    setPositionModalOpen(false);
                    setPositionModalValue("");
                    return;
                  }
                  if (positionModalId) {
                    const ok = await onUpdatePrintPosition(
                      selectedKind.id,
                      positionModalId,
                      positionModalValue
                    );
                    if (ok) {
                      setPositionModalOpen(false);
                    }
                  }
                }}
                disabled={!positionModalValue.trim() || printPositionSaving}
              >
                {positionModalMode === "add" ? "Додати" : "Зберегти"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Method Modal */}
      <Dialog open={methodModalOpen} onOpenChange={setMethodModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {methodModalMode === "add" ? "Новий метод" : "Редагувати метод"}
            </DialogTitle>
            <DialogDescription>
              {methodModalMode === "add"
                ? "Вкажіть назву методу нанесення."
                : "Оновіть назву методу нанесення."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={methodModalValue}
              onChange={(e) => setMethodModalValue(e.target.value)}
              placeholder="Напр. DTF"
              className="h-11"
              autoFocus
            />
            {methodError && <div className="text-xs text-destructive">{methodError}</div>}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {methodModalMode === "edit" && methodModalId ? (
              <Button
                variant="destructiveSolid"
                onClick={() => {
                  if (!window.confirm("Видалити цей метод?")) return;
                  onDeleteMethod(selectedKind.id, methodModalId);
                  setMethodModalOpen(false);
                }}
                disabled={methodSaving}
              >
                Видалити
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMethodModalOpen(false)}>
                Скасувати
              </Button>
              <Button
                onClick={async () => {
                  if (!methodModalValue.trim()) return;
                  if (methodModalMode === "add") {
                    onAddMethod(selectedKind.id, methodModalValue);
                    setMethodModalOpen(false);
                    setMethodModalValue("");
                    return;
                  }
                  if (methodModalId) {
                    const ok = await onUpdateMethod(
                      selectedKind.id,
                      methodModalId,
                      methodModalValue
                    );
                    if (ok) {
                      setMethodModalOpen(false);
                    }
                  }
                }}
                disabled={!methodModalValue.trim() || methodSaving}
              >
                {methodModalMode === "add" ? "Додати" : "Зберегти"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
