/**
 * ModelEditor Component
 * 
 * Main dialog for creating and editing catalog models with all configuration
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import { BasicInfoTab } from "./BasicInfoTab";
import { PricingSection } from "./PricingSection";
import { MethodsSection } from "./MethodsSection";
import type { CatalogType, CatalogMethod, CatalogPriceTier, PriceMode, ImageUploadMode } from "@/types/catalog";

interface ModelEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingModelId: string | null;
  savingModel: boolean;
  catalog: CatalogType[];
  
  // Draft state
  draftTypeId: string;
  draftKindId: string;
  draftName: string;
  draftPriceMode: PriceMode;
  draftFixedPrice: string;
  draftTiers: CatalogPriceTier[];
  draftMethodIds: string[];
  draftImageUrl: string;
  imageUploadMode: ImageUploadMode;
  
  // Methods
  availableMethods: CatalogMethod[];
  newMethodName: string;
  newMethodPrice: string;
  methodSaving: boolean;
  methodError: string | null;
  
  // Handlers
  onTypeChange: (value: string) => void;
  onKindChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPriceModeChange: (mode: PriceMode) => void;
  onFixedPriceChange: (value: string) => void;
  onTierUpdate: (id: string, patch: Partial<CatalogPriceTier>) => void;
  onAddTier: () => void;
  onRemoveTier: (id: string) => void;
  onMethodToggle: (methodId: string) => void;
  onMethodNameChange: (value: string) => void;
  onMethodPriceChange: (value: string) => void;
  onAddMethod: () => void;
  onImageUrlChange: (value: string) => void;
  onImageUploadModeChange: (mode: ImageUploadMode) => void;
  onImageFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  onDelete: () => void;
}

export function ModelEditor({
  open,
  onOpenChange,
  editingModelId,
  savingModel,
  catalog,
  draftTypeId,
  draftKindId,
  draftName,
  draftPriceMode,
  draftFixedPrice,
  draftTiers,
  draftMethodIds,
  draftImageUrl,
  imageUploadMode,
  availableMethods,
  newMethodName,
  newMethodPrice,
  methodSaving,
  methodError,
  onTypeChange,
  onKindChange,
  onNameChange,
  onPriceModeChange,
  onFixedPriceChange,
  onTierUpdate,
  onAddTier,
  onRemoveTier,
  onMethodToggle,
  onMethodNameChange,
  onMethodPriceChange,
  onAddMethod,
  onImageUrlChange,
  onImageUploadModeChange,
  onImageFileUpload,
  onSave,
  onDelete,
}: ModelEditorProps) {
  const draftKind = catalog
    .find((t) => t.id === draftTypeId)
    ?.kinds.find((k) => k.id === draftKindId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[90vh] overflow-hidden border border-border/60 bg-card top-1/2 translate-y-[-50%]">
        <div className="px-6 py-5 border-b border-border/40 bg-muted/5">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {editingModelId ? "Редагування моделі" : "Створення моделі"}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground/80">
              Налаштуйте параметри моделі та її ціноутворення
            </DialogDescription>
          </DialogHeader>

          {/* Progress Steps */}
          <div className="flex items-center gap-3 mt-5">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all",
                  draftName.trim()
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                1
              </div>
              <span
                className={cn(
                  "text-sm font-medium transition-colors",
                  draftName.trim() ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Базова інфо
              </span>
            </div>

            <div
              className={cn(
                "h-0.5 w-12 transition-all",
                draftName.trim() && draftKindId ? "bg-primary" : "bg-border"
              )}
            />

            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all",
                  draftName.trim() && draftKindId
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                2
              </div>
              <span
                className={cn(
                  "text-sm font-medium transition-colors",
                  draftName.trim() && draftKindId ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Ціни
              </span>
            </div>

            <div
              className={cn(
                "h-0.5 w-12 transition-all",
                draftMethodIds.length > 0 ? "bg-primary" : "bg-border"
              )}
            />

            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all",
                  draftMethodIds.length > 0
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                3
              </div>
              <span
                className={cn(
                  "text-sm font-medium transition-colors",
                  draftMethodIds.length > 0 ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Методи
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="px-6 py-6 space-y-8">
            <BasicInfoTab
              catalog={catalog}
              draftTypeId={draftTypeId}
              draftKindId={draftKindId}
              draftName={draftName}
              draftImageUrl={draftImageUrl}
              imageUploadMode={imageUploadMode}
              onTypeChange={onTypeChange}
              onKindChange={onKindChange}
              onNameChange={onNameChange}
              onImageUrlChange={onImageUrlChange}
              onImageUploadModeChange={onImageUploadModeChange}
              onImageFileUpload={onImageFileUpload}
            />

            <Separator className="bg-border/40" />

            <PricingSection
              draftPriceMode={draftPriceMode}
              draftFixedPrice={draftFixedPrice}
              draftTiers={draftTiers}
              onPriceModeChange={onPriceModeChange}
              onFixedPriceChange={onFixedPriceChange}
              onTierUpdate={onTierUpdate}
              onAddTier={onAddTier}
              onRemoveTier={onRemoveTier}
            />

            <Separator className="bg-border/40" />

            <MethodsSection
              draftKindId={draftKindId}
              draftKindName={draftKind?.name}
              availableMethods={availableMethods}
              selectedMethodIds={draftMethodIds}
              newMethodName={newMethodName}
              newMethodPrice={newMethodPrice}
              methodSaving={methodSaving}
              methodError={methodError}
              onMethodNameChange={onMethodNameChange}
              onMethodPriceChange={onMethodPriceChange}
              onAddMethod={onAddMethod}
              onToggleMethod={onMethodToggle}
            />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/40 bg-muted/5 shrink-0 sm:justify-between">
          {editingModelId ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Видалити
            </Button>
          ) : (
            <div></div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-border/60"
            >
              Скасувати
            </Button>
            <Button
              onClick={onSave}
              disabled={!draftName.trim() || !draftKindId || savingModel}
              className="shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all disabled:opacity-50"
            >
              {savingModel
                ? "Збереження..."
                : editingModelId
                ? "Зберегти зміни"
                : "Створити модель"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
