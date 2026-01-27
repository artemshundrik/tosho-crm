/**
 * ProductCatalogPage (Main Entry Point)
 * 
 * Main page component that orchestrates all catalog functionality including
 * displaying, filtering, creating, editing, and deleting product models.
 * 
 * This component uses custom hooks for state management and combines multiple
 * sub-components for a modular architecture.
 */

import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { exportToCSV } from "@/utils/catalogUtils";

// Hooks
import { useTeamData } from "./hooks/useTeamData";
import { useCatalogData } from "./hooks/useCatalogData";
import { useFilters } from "./hooks/useFilters";
import { useCategoryManager } from "./hooks/useCategoryManager";
import { useModelEditor } from "./hooks/useModelEditor";
import { useCommandPalette } from "./hooks/useCommandPalette";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useBulkSelection } from "./hooks/useBulkSelection";

// Components
import { CatalogHeader } from "./components/CatalogHeader";
import { CatalogSidebar } from "./components/CatalogSidebar";
import { ModelGrid } from "./components/ModelGrid";
import { TableView } from "./components/TableView";
import { ModelEditor } from "./components/ModelEditor";
import { CategoryDialog } from "./components/CategoryDialog";
import { CommandPalette } from "./components/CommandPalette";
import { BulkActionsBar } from "./components/BulkActionsBar";
import type { ViewMode } from "./components/ViewSwitcher";
// NEW DESIGN COMPONENTS
import { CompactSidebar } from "./components/CompactSidebar";
import { ContentHeader } from "./components/ContentHeader";
import { SearchBar } from "./components/SearchBar";
import { SimpleModelGrid } from "./components/SimpleModelGrid";

export default function ProductCatalogPage() {
  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Delete confirmation state
  const [deleteTypeConfirm, setDeleteTypeConfirm] = useState<{
    open: boolean;
    typeId: string | null;
    typeName: string;
  }>({ open: false, typeId: null, typeName: "" });

  const [deleteKindConfirm, setDeleteKindConfirm] = useState<{
    open: boolean;
    kindId: string | null;
    kindName: string;
  }>({ open: false, kindId: null, kindName: "" });

  // Load team data
  const { teamId, teamLoading, teamError } = useTeamData();

  // Load catalog data
  const { catalog, setCatalog, catalogLoading, catalogError } = useCatalogData(teamId);

  // Initialize filters (will auto-select first type/kind when catalog loads)
  const filters = useFilters({ catalog });

  // Bulk selection (for table view)
  const bulkSelection = useBulkSelection({
    itemIds: filters.filteredGlobalModels.map((item) => item.model.id),
  });

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

  // Command Palette
  const commandPalette = useCommandPalette({
    models: filters.allModelsWithContext,
    onCreateModel: modelEditor.openCreateDrawer,
    onEditModel: modelEditor.openEditDrawer,
    onNavigateToType: (typeId) => {
      filters.setSelectedTypeId(typeId);
      const nextType = catalog.find((type) => type.id === typeId);
      filters.setSelectedKindId(nextType?.kinds[0]?.id ?? "");
    },
    onNavigateToKind: (kindId) => {
      filters.setSelectedKindId(kindId);
    },
    onExportCSV: () => exportToCSV(catalog),
  });

  // Keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "k",
        metaKey: true,
        handler: () => commandPalette.toggle(),
        description: "Open command palette",
      },
      {
        key: "k",
        ctrlKey: true,
        handler: () => commandPalette.toggle(),
        description: "Open command palette",
      },
      {
        key: "n",
        metaKey: true,
        handler: () => modelEditor.openCreateDrawer(),
        description: "Create new model",
      },
      {
        key: "n",
        ctrlKey: true,
        handler: () => modelEditor.openCreateDrawer(),
        description: "Create new model",
      },
      {
        key: "/",
        handler: (e) => {
          e.preventDefault();
          filters.setGlobalSearch("");
          // Focus on search input - will be handled by the search input itself
        },
        description: "Focus search",
        preventDefault: true,
      },
      {
        key: "Escape",
        handler: () => {
          if (commandPalette.open) {
            commandPalette.setOpen(false);
          }
        },
        description: "Close dialogs",
        preventDefault: false,
      },
    ],
  });

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

  // Handle edit type
  const handleEditType = (typeId: string) => {
    const typeToEdit = catalog.find((t) => t.id === typeId);
    if (typeToEdit) {
      categoryManager.openEditType(
        typeId,
        typeToEdit.name,
        typeToEdit.quote_type as any
      );
    }
  };

  // Handle delete type request (opens confirm dialog)
  const handleRequestDeleteType = () => {
    if (categoryManager.editingTypeId) {
      const typeToDelete = catalog.find((t) => t.id === categoryManager.editingTypeId);
      if (typeToDelete) {
        setDeleteTypeConfirm({
          open: true,
          typeId: categoryManager.editingTypeId,
          typeName: typeToDelete.name,
        });
      }
    }
  };

  // Handle confirmed delete type
  const handleConfirmDeleteType = async () => {
    if (deleteTypeConfirm.typeId) {
      await categoryManager.handleDeleteType(deleteTypeConfirm.typeId);
      setDeleteTypeConfirm({ open: false, typeId: null, typeName: "" });
    }
  };

  // Handle edit kind
  const handleEditKind = (kindId: string) => {
    categoryManager.openEditKind(kindId);
  };

  // Handle delete kind request (opens confirm dialog)
  const handleRequestDeleteKind = () => {
    if (categoryManager.editingKindId) {
      // Find the kind to get its name
      for (const type of catalog) {
        const kind = type.kinds.find((k) => k.id === categoryManager.editingKindId);
        if (kind) {
          setDeleteKindConfirm({
            open: true,
            kindId: categoryManager.editingKindId,
            kindName: kind.name,
          });
          break;
        }
      }
    }
  };

  // Handle confirmed delete kind
  const handleConfirmDeleteKind = async () => {
    if (deleteKindConfirm.kindId) {
      await categoryManager.handleDeleteKind(deleteKindConfirm.kindId);
      setDeleteKindConfirm({ open: false, kindId: null, kindName: "" });
    }
  };

  // Bulk operations
  const handleBulkExport = () => {
    const selectedModels = filters.allModelsWithContext.filter((item) =>
      bulkSelection.selectedIds.includes(item.model.id)
    );

    const selectedCatalog = catalog.map((type) => ({
      ...type,
      kinds: type.kinds.map((kind) => ({
        ...kind,
        models: kind.models.filter((model) => bulkSelection.selectedIds.includes(model.id)),
      })),
    }));

    exportToCSV(selectedCatalog);
    bulkSelection.clearSelection();
  };

  const handleBulkDelete = async () => {
    if (!teamId) return;
    
    const confirmed = window.confirm(
      `Ви впевнені, що хочете видалити ${bulkSelection.selectedCount} ${
        bulkSelection.selectedCount === 1 ? "модель" : "моделей"
      }? Цю дію не можна буде скасувати.`
    );

    if (!confirmed) return;

    // Delete all selected models
    for (const modelId of bulkSelection.selectedIds) {
      await modelEditor.handleDeleteModel();
    }

    bulkSelection.clearSelection();
  };

  const handleBulkClone = async () => {
    if (!teamId) return;

    for (const modelId of bulkSelection.selectedIds) {
      await modelEditor.handleCloneModel(modelId);
    }

    bulkSelection.clearSelection();
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
    <div className="space-y-6">
      <div className="rounded-[var(--radius-section)] border border-border bg-card/60 overflow-hidden">
        {/* Main Layout: Sidebar + Content */}
        <div className="flex h-[calc(100vh-120px)]">
          {/* Compact Sidebar */}
          <CompactSidebar
            catalog={catalog}
            selectedTypeId={filters.selectedTypeId}
            selectedKindId={filters.selectedKindId}
            totalModels={filters.totalModels}
            incompleteModels={filters.incompleteModels}
            onSelectType={handleSelectType}
            onSelectKind={handleSelectKind}
            onAddType={categoryManager.openAddType}
            onAddKind={(typeId) => {
              // Set the selected type first, then open add kind dialog
              filters.setSelectedTypeId(typeId);
              categoryManager.openAddKind();
            }}
            onEditType={handleEditType}
            onEditKind={handleEditKind}
          />

          {/* Main Content Area */}
          <section className="flex-1 flex flex-col overflow-hidden">
            {/* Search Bar */}
            <SearchBar
              catalog={catalog}
              globalSearch={filters.globalSearch}
              setGlobalSearch={filters.setGlobalSearch}
              filteredModelsCount={filters.filteredGlobalModels.length}
              onCreateModel={modelEditor.openCreateDrawer}
            />

            {/* Content Header (Breadcrumb + Chips) */}
            <ContentHeader
              selectedType={filters.selectedType}
              selectedKind={filters.selectedKind}
              newPrintPositionName={modelEditor.newPrintPositionName}
              setNewPrintPositionName={modelEditor.setNewPrintPositionName}
              printPositionSaving={modelEditor.printPositionSaving}
              onAddPrintPosition={modelEditor.handleAddPrintPosition}
              onDeletePrintPosition={modelEditor.handleDeletePrintPosition}
              onAddMethod={() => {
                // Open model editor to add method
                // For now, we'll use the existing ModelEditor dialog
                // which has method management built-in
                modelEditor.openCreateDrawer();
              }}
            />

            {/* Models Grid */}
            <div className="flex-1 overflow-y-auto p-6">
              <SimpleModelGrid
                filteredModels={filters.filteredGlobalModels}
                globalSearch={filters.globalSearch}
                onClone={modelEditor.handleCloneModel}
                onEdit={modelEditor.openEditDrawer}
                onDelete={modelEditor.confirmDeleteModel}
                onClearFilters={() => {
                  filters.setGlobalSearch("");
                  filters.setShowOnlyIncomplete(false);
                }}
              />
            </div>
          </section>
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
        editingTypeId={categoryManager.editingTypeId}
        editingKindId={categoryManager.editingKindId}
        onDelete={
          categoryManager.editingTypeId
            ? handleRequestDeleteType
            : categoryManager.editingKindId
            ? handleRequestDeleteKind
            : undefined
        }
      />

      {/* Delete Type Confirmation Dialog */}
      <ConfirmDialog
        open={deleteTypeConfirm.open}
        onOpenChange={(open) =>
          setDeleteTypeConfirm((prev) => ({ ...prev, open }))
        }
        title="Видалити категорію?"
        description={`Ви впевнені, що хочете видалити категорію "${deleteTypeConfirm.typeName}"? Це видалить усі види та моделі в цій категорії. Цю дію неможливо скасувати.`}
        confirmText="Видалити"
        cancelText="Скасувати"
        onConfirm={handleConfirmDeleteType}
        variant="destructive"
      />

      {/* Delete Kind Confirmation Dialog */}
      <ConfirmDialog
        open={deleteKindConfirm.open}
        onOpenChange={(open) =>
          setDeleteKindConfirm((prev) => ({ ...prev, open }))
        }
        title="Видалити вид?"
        description={`Ви впевнені, що хочете видалити вид "${deleteKindConfirm.kindName}"? Це видалить усі моделі в цьому виді. Цю дію неможливо скасувати.`}
        confirmText="Видалити"
        cancelText="Скасувати"
        onConfirm={handleConfirmDeleteKind}
        variant="destructive"
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

      {/* Bulk Actions Bar */}
      {viewMode === "table" && (
        <BulkActionsBar
          selectedCount={bulkSelection.selectedCount}
          onClearSelection={bulkSelection.clearSelection}
          onBulkExport={handleBulkExport}
          onBulkDelete={handleBulkDelete}
          onBulkClone={handleBulkClone}
        />
      )}

      {/* Command Palette */}
      <CommandPalette
        open={commandPalette.open}
        onOpenChange={commandPalette.setOpen}
        search={commandPalette.search}
        onSearchChange={commandPalette.setSearch}
        searchHistory={commandPalette.searchHistory}
        onClearHistory={commandPalette.clearHistory}
        quickActions={commandPalette.quickActions}
        filteredModels={commandPalette.filteredModels}
        filteredTypes={commandPalette.filteredTypes}
        filteredKinds={commandPalette.filteredKinds}
        onSelectModel={commandPalette.handleSelectModel}
        onNavigateToType={commandPalette.handleNavigateToType}
        onNavigateToKind={commandPalette.handleNavigateToKind}
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
