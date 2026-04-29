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
import { Trash2 } from "lucide-react";
import { BasicInfoTab } from "./BasicInfoTab";
import { PricingSection } from "./PricingSection";
import { MethodsSection } from "./MethodsSection";
import type { CatalogType, CatalogMethod, CatalogModelMetadata, CatalogPriceTier, PriceMode, ImageUploadMode } from "@/types/catalog";

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
  draftMetadata: CatalogModelMetadata;
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
  onMetadataChange: (value: CatalogModelMetadata) => void;
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
  onVariantImageUrlChange: (variantId: string, value: string) => void;
  onVariantImageFileUpload: (variantId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
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
  draftMetadata,
  imageUploadMode,
  availableMethods,
  newMethodName,
  newMethodPrice,
  methodSaving,
  methodError,
  onTypeChange,
  onKindChange,
  onNameChange,
  onMetadataChange,
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
  onVariantImageUrlChange,
  onVariantImageFileUpload,
  onSave,
  onDelete,
}: ModelEditorProps) {
  const draftKind = catalog
    .find((t) => t.id === draftTypeId)
    ?.kinds.find((k) => k.id === draftKindId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[min(1120px,calc(100vw-1.5rem))] !max-w-none !gap-0 !overflow-hidden !p-0 sm:!p-0 max-h-[92vh] border border-border/60 bg-background shadow-2xl">
        <div className="border-b border-border/60 bg-muted/10 px-4 py-3 pr-14">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-normal">
              {editingModelId ? "Редагування товару" : "Новий товар"}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Фото, артикули, варіанти та параметри для прорахунків.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[calc(92vh-132px)] flex-1 overflow-y-auto">
          <div className="space-y-4 px-4 py-4">
            <BasicInfoTab
              catalog={catalog}
              draftTypeId={draftTypeId}
              draftKindId={draftKindId}
              draftName={draftName}
              draftImageUrl={draftImageUrl}
              draftMetadata={draftMetadata}
              imageUploadMode={imageUploadMode}
              onTypeChange={onTypeChange}
              onKindChange={onKindChange}
              onNameChange={onNameChange}
              onMetadataChange={onMetadataChange}
              onImageUrlChange={onImageUrlChange}
              onImageUploadModeChange={onImageUploadModeChange}
              onImageFileUpload={onImageFileUpload}
              onVariantImageUrlChange={onVariantImageUrlChange}
              onVariantImageFileUpload={onVariantImageFileUpload}
            />

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-border/50 bg-card/70 p-4">
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
              </div>

              <div className="rounded-xl border border-border/50 bg-card/70 p-4">
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
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/60 bg-background/95 px-4 py-3 sm:justify-between">
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
              className="transition-all disabled:opacity-50"
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
