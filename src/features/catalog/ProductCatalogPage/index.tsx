/**
 * ProductCatalogPage (Main Entry Point)
 * 
 * Main page component that orchestrates all catalog functionality including
 * displaying, filtering, creating, editing, and deleting product models.
 * 
 * This component uses custom hooks for state management and combines multiple
 * sub-components for a modular architecture.
 */

import { useMemo } from "react";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { AlertCircle } from "lucide-react";

// Hooks
import { useTeamData } from "./hooks/useTeamData";
import { useCatalogData } from "./hooks/useCatalogData";
import { useFilters } from "./hooks/useFilters";
import { useCategoryManager } from "./hooks/useCategoryManager";
import { useModelEditor } from "./hooks/useModelEditor";

// Components
import { CatalogHeader } from "./components/CatalogHeader";
import { CatalogSidebar } from "./components/CatalogSidebar";
import { ModelGrid } from "./components/ModelGrid";
import { ModelEditor } from "./components/ModelEditor";
import { CategoryDialog } from "./components/CategoryDialog";

export default function ProductCatalogPage() {
  // Load team data
  const { teamId, teamLoading, teamError } = useTeamData();

  // Load catalog data
  const { catalog, setCatalog, catalogLoading, catalogError } = useCatalogData(teamId);

  // Initialize filters (will auto-select first type/kind when catalog loads)
  const filters = useFilters({ catalog });

  // Category management
  const categoryManager = useCategoryManager({
    teamId,
    catalog,
    setCatalog,
    selectedTypeId: filters.selectedTypeId,
    setSelectedTypeId: filters.setSelectedTypeId,
    setSelectedKindId: filters.setSelectedKindId,
  });

  // Model editor
  const modelEditor = useModelEditor({
    teamId,
    catalog,
    setCatalog,
    selectedTypeId: filters.selectedTypeId,
    selectedKindId: filters.selectedKindId,
    allModelsWithContext: filters.allModelsWithContext,
  });

  // Get available methods for draft kind
  const availableMethodsForDraft = useMemo(() => {
    return catalog
      .find((t) => t.id === modelEditor.draftTypeId)
      ?.kinds.find((k) => k.id === modelEditor.draftKindId)?.methods ?? [];
  }, [catalog, modelEditor.draftTypeId, modelEditor.draftKindId]);

  // Handle type selection
  const handleSelectType = (typeId: string) => {
    filters.setSelectedTypeId(typeId);
    const nextType = catalog.find((type) => type.id === typeId);
    filters.setSelectedKindId(nextType?.kinds[0]?.id ?? "");
    filters.setGlobalSearch("");
    modelEditor.setNewPrintPositionName("");
    modelEditor.setPrintPositionError(null);
  };

  // Handle kind selection
  const handleSelectKind = (kindId: string) => {
    filters.setSelectedKindId(kindId);
    modelEditor.setNewPrintPositionName("");
    modelEditor.setPrintPositionError(null);
  };

  // Loading states
  if (teamLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Завантаження...</div>;
  }

  if (teamError) {
    return <div className="p-6 text-sm text-destructive">{teamError}</div>;
  }

  if (!teamId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Немає доступної команди. Перевір членство або інвайт.
      </div>
    );
  }

  if (catalogLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Завантаження каталогу...</div>;
  }

  if (catalogError) {
    return <div className="p-6 text-sm text-destructive">{catalogError}</div>;
  }

  return (
    <div className="w-full h-screen flex flex-col bg-background">
      <CatalogHeader
        catalog={catalog}
        totalModels={filters.totalModels}
        incompleteModels={filters.incompleteModels}
        globalSearch={filters.globalSearch}
        setGlobalSearch={filters.setGlobalSearch}
        showOnlyIncomplete={filters.showOnlyIncomplete}
        setShowOnlyIncomplete={filters.setShowOnlyIncomplete}
        filteredModelsCount={filters.filteredGlobalModels.length}
        onCreateModel={modelEditor.openCreateDrawer}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full max-w-[1400px] mx-auto px-6 py-6">
          <div className="h-full rounded-2xl border border-border/40 bg-gradient-to-br from-background via-background to-muted/20 overflow-hidden flex shadow-xl">
            <CatalogSidebar
              catalog={catalog}
              selectedTypeId={filters.selectedTypeId}
              selectedKindId={filters.selectedKindId}
              selectedType={filters.selectedType}
              selectedKinds={filters.selectedKinds}
              selectedKind={filters.selectedKind}
              newPrintPositionName={modelEditor.newPrintPositionName}
              setNewPrintPositionName={modelEditor.setNewPrintPositionName}
              printPositionSaving={modelEditor.printPositionSaving}
              printPositionError={modelEditor.printPositionError}
              typeQuoteTypeSaving={categoryManager.typeQuoteTypeSaving}
              typeQuoteTypeError={categoryManager.typeQuoteTypeError}
              onSelectType={handleSelectType}
              onSelectKind={handleSelectKind}
              onAddType={categoryManager.openAddType}
              onAddKind={categoryManager.openAddKind}
              onAddPrintPosition={modelEditor.handleAddPrintPosition}
              onDeletePrintPosition={modelEditor.handleDeletePrintPosition}
              onQuoteTypeUpdate={categoryManager.handleQuoteTypeUpdate}
            />

            {/* Right: Models Grid */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-1 overflow-y-auto p-5">
                <ModelGrid
                  filteredModels={filters.filteredGlobalModels}
                  globalSearch={filters.globalSearch}
                  showOnlyIncomplete={filters.showOnlyIncomplete}
                  inlineEditId={modelEditor.inlineEditId}
                  inlinePrice={modelEditor.inlinePrice}
                  setInlinePrice={modelEditor.setInlinePrice}
                  onStartInlineEdit={modelEditor.startInlineEdit}
                  onSaveInlineEdit={modelEditor.saveInlineEdit}
                  onClone={modelEditor.handleCloneModel}
                  onEdit={modelEditor.openEditDrawer}
                  onDelete={modelEditor.confirmDeleteModel}
                  onClearFilters={() => {
                    filters.setGlobalSearch("");
                    filters.setShowOnlyIncomplete(false);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category Dialog */}
      <CategoryDialog
        open={categoryManager.categoryDialogOpen}
        onOpenChange={categoryManager.setCategoryDialogOpen}
        mode={categoryManager.categoryMode}
        catalog={catalog}
        categoryName={categoryManager.newCategoryName}
        onCategoryNameChange={categoryManager.setNewCategoryName}
        quoteType={categoryManager.newTypeQuoteType}
        onQuoteTypeChange={categoryManager.setNewTypeQuoteType}
        selectedTypeForKind={categoryManager.selectedTypeForKind}
        onSelectedTypeForKindChange={categoryManager.setSelectedTypeForKind}
        categorySaving={categoryManager.categorySaving}
        categoryError={categoryManager.categoryError}
        onSave={categoryManager.handleAddCategory}
      />

      {/* Model Editor Dialog */}
      <ModelEditor
        open={modelEditor.drawerOpen}
        onOpenChange={modelEditor.setDrawerOpen}
        editingModelId={modelEditor.editingModelId}
        savingModel={modelEditor.savingModel}
        catalog={catalog}
        draftTypeId={modelEditor.draftTypeId}
        draftKindId={modelEditor.draftKindId}
        draftName={modelEditor.draftName}
        draftPriceMode={modelEditor.draftPriceMode}
        draftFixedPrice={modelEditor.draftFixedPrice}
        draftTiers={modelEditor.draftTiers}
        draftMethodIds={modelEditor.draftMethodIds}
        draftImageUrl={modelEditor.draftImageUrl}
        imageUploadMode={modelEditor.imageUploadMode}
        availableMethods={availableMethodsForDraft}
        newMethodName={modelEditor.newMethodName}
        newMethodPrice={modelEditor.newMethodPrice}
        methodSaving={modelEditor.methodSaving}
        methodError={modelEditor.methodError}
        onTypeChange={modelEditor.handleDraftTypeChange}
        onKindChange={modelEditor.handleDraftKindChange}
        onNameChange={modelEditor.setDraftName}
        onPriceModeChange={modelEditor.handlePriceModeChange}
        onFixedPriceChange={modelEditor.setDraftFixedPrice}
        onTierUpdate={modelEditor.updateDraftTier}
        onAddTier={modelEditor.addDraftTier}
        onRemoveTier={modelEditor.removeDraftTier}
        onMethodToggle={modelEditor.toggleDraftMethod}
        onMethodNameChange={modelEditor.setNewMethodName}
        onMethodPriceChange={modelEditor.setNewMethodPrice}
        onAddMethod={modelEditor.handleAddMethod}
        onImageUrlChange={modelEditor.setDraftImageUrl}
        onImageUploadModeChange={modelEditor.setImageUploadMode}
        onImageFileUpload={modelEditor.handleImageFileUpload}
        onSave={modelEditor.handleSaveModel}
        onDelete={() => {
          if (modelEditor.editingModelId) {
            modelEditor.confirmDeleteModel(modelEditor.editingModelId);
          }
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={modelEditor.deleteDialogOpen}
        onOpenChange={modelEditor.setDeleteDialogOpen}
        title="Підтвердження видалення"
        description="Ви впевнені, що хочете видалити цю модель? Цю дію не можна буде скасувати."
        icon={<AlertCircle className="h-5 w-5 text-destructive" />}
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        confirmClassName="bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lg shadow-destructive/20"
        onConfirm={modelEditor.handleDeleteModel}
      />
    </div>
  );
}
