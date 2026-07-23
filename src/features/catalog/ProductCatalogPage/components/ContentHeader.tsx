/**
 * ContentHeader Component - NEW DESIGN
 * 
 * Header for content area with breadcrumb, description, chips for places/methods
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
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
  onCountMethodUsage: (methodId: string) => Promise<number>;
  onCountPrintPositionUsage: (positionId: string) => Promise<number>;
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
  onCountMethodUsage,
  onCountPrintPositionUsage,
}: ContentHeaderProps) {
  const quoteType = selectedType?.quote_type === "merch" || selectedType?.quote_type === "print" ? selectedType.quote_type : "other";
  const quoteTypeLabel = quoteType === "merch" ? "мерч" : quoteType === "print" ? "поліграфія" : "інше";
  const QuoteTypeIcon = quoteType === "merch" ? Shirt : quoteType === "print" ? Printer : Package;
  const availableMethods = selectedKind?.methods || [];
  const printPositions = selectedKind?.printPositions || [];
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [positionModalMode, setPositionModalMode] = useState<"add" | "edit">("add");
  const [positionModalId, setPositionModalId] = useState<string | null>(null);
  const [positionModalValue, setPositionModalValue] = useState("");

  const [methodModalOpen, setMethodModalOpen] = useState(false);
  const [methodModalMode, setMethodModalMode] = useState<"add" | "edit">("add");
  const [methodModalId, setMethodModalId] = useState<string | null>(null);
  const [methodModalValue, setMethodModalValue] = useState("");

  // Usage counts for the item being edited (null = still checking). Used to
  // block deleting a place/method that is referenced by existing quotes.
  const [positionUsage, setPositionUsage] = useState<number | null>(null);
  const [methodUsage, setMethodUsage] = useState<number | null>(null);

  const openAddPositionModal = () => {
    setPositionModalMode("add");
    setPositionModalId(null);
    setPositionModalValue("");
    setPositionUsage(null);
    setPositionModalOpen(true);
  };

  const openEditPositionModal = (id: string, label: string) => {
    setPositionModalMode("edit");
    setPositionModalId(id);
    setPositionModalValue(label);
    setPositionUsage(null);
    setPositionModalOpen(true);
    void onCountPrintPositionUsage(id).then(setPositionUsage);
  };

  const openAddMethodModal = () => {
    setMethodModalMode("add");
    setMethodModalId(null);
    setMethodModalValue("");
    setMethodUsage(null);
    setMethodModalOpen(true);
  };

  const openEditMethodModal = (id: string, name: string) => {
    setMethodModalMode("edit");
    setMethodModalId(id);
    setMethodModalValue(name);
    setMethodUsage(null);
    setMethodModalOpen(true);
    void onCountMethodUsage(id).then(setMethodUsage);
  };

  useEffect(() => {
    setSettingsOpen(false);
    setPositionModalOpen(false);
    setMethodModalOpen(false);
    setPositionModalId(null);
    setMethodModalId(null);
    setPositionModalValue("");
    setMethodModalValue("");
    setPositionUsage(null);
    setMethodUsage(null);
  }, [selectedKind?.id]);

  if (!selectedType || !selectedKind) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Оберіть категорію та вид для початку роботи
      </div>
    );
  }

  return (
    <>
      {/* Lean header: breadcrumb + view settings */}
      <div className="border-b border-border/40 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
              <QuoteTypeIcon className="h-3.5 w-3.5" />
              {quoteTypeLabel}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
            <span className="truncate font-semibold">{selectedType.name}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
            <span className="truncate font-semibold text-primary">{selectedKind.name}</span>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-muted-foreground lg:inline">
              {availableMethods.length} {availableMethods.length === 1 ? "метод" : "методів"} · {printPositions.length}{" "}
              {printPositions.length === 1 ? "місце" : "місць"}
            </span>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
              Налаштування виду
            </Button>
          </div>
        </div>
      </div>

      {/* View settings drawer: places + methods */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Налаштування виду</SheetTitle>
            <SheetDescription>
              {selectedType.name} › {selectedKind.name}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Places */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Місця нанесення
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {printPositions.map((pos) => (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => openEditPositionModal(pos.id, pos.label)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-foreground transition",
                      "hover:border-border hover:bg-muted/60",
                      positionModalId === pos.id && positionModalOpen && "ring-1 ring-primary/30"
                    )}
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
            </section>

            {/* Methods */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Методи нанесення
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
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
            </section>
          </div>
        </SheetContent>
      </Sheet>

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
              <div className="flex flex-col items-start gap-1">
                <Button
                  variant="destructiveSolid"
                  onClick={() => {
                    if (!window.confirm("Видалити це місце нанесення?")) return;
                    onDeletePrintPosition(selectedKind.id, positionModalId);
                    setPositionModalOpen(false);
                  }}
                  disabled={printPositionSaving || positionUsage === null || positionUsage > 0}
                >
                  Видалити
                </Button>
                {positionUsage === null ? (
                  <span className="text-2xs text-muted-foreground">Перевірка використання…</span>
                ) : positionUsage > 0 ? (
                  <span className="text-2xs text-warning-foreground">
                    Використовується в {positionUsage} {positionUsage === 1 ? "прорахунку" : "прорахунках"}
                  </span>
                ) : null}
              </div>
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
              <div className="flex flex-col items-start gap-1">
                <Button
                  variant="destructiveSolid"
                  onClick={() => {
                    if (!window.confirm("Видалити цей метод?")) return;
                    onDeleteMethod(selectedKind.id, methodModalId);
                    setMethodModalOpen(false);
                  }}
                  disabled={methodSaving || methodUsage === null || methodUsage > 0}
                >
                  Видалити
                </Button>
                {methodUsage === null ? (
                  <span className="text-2xs text-muted-foreground">Перевірка використання…</span>
                ) : methodUsage > 0 ? (
                  <span className="text-2xs text-warning-foreground">
                    Використовується в {methodUsage} {methodUsage === 1 ? "прорахунку" : "прорахунках"}
                  </span>
                ) : null}
              </div>
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
    </>
  );
}
