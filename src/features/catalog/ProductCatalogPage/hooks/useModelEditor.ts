/**
 * useModelEditor Hook
 * 
 * Manages model creation, editing, deletion, and all related operations
 * including price tiers, methods, and image handling
 */

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type {
  CatalogModel,
  CatalogPriceTier,
  CatalogType,
  PriceMode,
  ImageUploadMode,
  ModelWithContext,
} from "@/types/catalog";
import { createLocalId, createNextTier, readImageFile } from "@/utils/catalogUtils";
import { DEFAULT_PRICE } from "@/constants/catalog";

interface UseModelEditorProps {
  teamId: string | null;
  catalog: CatalogType[];
  setCatalog: React.Dispatch<React.SetStateAction<CatalogType[]>>;
  selectedTypeId: string;
  selectedKindId: string;
  allModelsWithContext: ModelWithContext[];
}

export function useModelEditor({
  teamId,
  catalog,
  setCatalog,
  selectedTypeId,
  selectedKindId,
  allModelsWithContext,
}: UseModelEditorProps) {
  // Dialog state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [savingModel, setSavingModel] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);

  // Draft model state
  const [draftTypeId, setDraftTypeId] = useState("");
  const [draftKindId, setDraftKindId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftPriceMode, setDraftPriceMode] = useState<PriceMode>("fixed");
  const [draftFixedPrice, setDraftFixedPrice] = useState(String(DEFAULT_PRICE));
  const [draftTiers, setDraftTiers] = useState<CatalogPriceTier[]>([]);
  const [draftMethodIds, setDraftMethodIds] = useState<string[]>([]);
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [imageUploadMode, setImageUploadMode] = useState<ImageUploadMode>("url");

  // Methods management
  const [newMethodName, setNewMethodName] = useState("");
  const [newMethodPrice, setNewMethodPrice] = useState("");
  const [methodSaving, setMethodSaving] = useState(false);
  const [methodError, setMethodError] = useState<string | null>(null);

  // Print positions management
  const [newPrintPositionName, setNewPrintPositionName] = useState("");
  const [printPositionSaving, setPrintPositionSaving] = useState(false);
  const [printPositionError, setPrintPositionError] = useState<string | null>(null);

  // Inline editing
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlinePrice, setInlinePrice] = useState("");

  /**
   * Opens drawer for creating a new model
   */
  const openCreateDrawer = () => {
    setEditingModelId(null);
    setDraftTypeId(selectedTypeId || catalog[0]?.id || "");
    setDraftKindId(selectedKindId || catalog[0]?.kinds[0]?.id || "");
    setDraftName("");
    setDraftFixedPrice(String(DEFAULT_PRICE));
    setDraftPriceMode("fixed");
    setDraftTiers([]);
    setDraftMethodIds([]);
    setDraftImageUrl("");
    setDrawerOpen(true);
  };

  /**
   * Opens drawer for editing an existing model
   */
  const openEditDrawer = (modelId: string) => {
    const item = allModelsWithContext.find((i) => i.model.id === modelId);
    if (!item) return;

    const { model } = item;

    setEditingModelId(model.id);
    setDraftTypeId(item.typeId);
    setDraftKindId(item.kindId);
    setDraftName(model.name);
    setDraftMethodIds(model.methodIds ?? []);
    setDraftImageUrl(model.imageUrl || "");

    if (model.priceTiers && model.priceTiers.length > 0) {
      setDraftPriceMode("tiers");
      setDraftTiers(model.priceTiers);
      setDraftFixedPrice(String(model.priceTiers[0].price));
    } else {
      setDraftPriceMode("fixed");
      setDraftFixedPrice(String(model.price ?? DEFAULT_PRICE));
      setDraftTiers([]);
    }
    
    setDrawerOpen(true);
  };

  /**
   * Handles type change in model editor
   */
  const handleDraftTypeChange = (value: string) => {
    setDraftTypeId(value);
    const nextType = catalog.find((t) => t.id === value);
    const nextKindId = nextType?.kinds[0]?.id ?? "";
    setDraftKindId(nextKindId);
    setDraftMethodIds([]);
  };

  /**
   * Handles kind change in model editor
   */
  const handleDraftKindChange = (value: string) => {
    setDraftKindId(value);
    setDraftMethodIds([]);
    setNewMethodName("");
    setNewMethodPrice("");
    setMethodError(null);
  };

  /**
   * Handles price mode change (fixed/tiers)
   */
  const handlePriceModeChange = (mode: PriceMode) => {
    setDraftPriceMode(mode);
    if (mode === "tiers" && draftTiers.length === 0) {
      setDraftTiers([createNextTier([], Number(draftFixedPrice) || DEFAULT_PRICE)]);
    }
  };

  /**
   * Updates a specific price tier
   */
  const updateDraftTier = (id: string, patch: Partial<CatalogPriceTier>) => {
    setDraftTiers((prev) => prev.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)));
  };

  /**
   * Adds a new price tier
   */
  const addDraftTier = () => {
    const basePrice =
      draftTiers.length > 0
        ? draftTiers[draftTiers.length - 1].price
        : Number(draftFixedPrice) || DEFAULT_PRICE;
    setDraftTiers((prev) => [...prev, createNextTier(prev, basePrice)]);
  };

  /**
   * Removes a price tier
   */
  const removeDraftTier = (id: string) => {
    setDraftTiers((prev) => prev.filter((tier) => tier.id !== id));
  };

  /**
   * Toggles method selection
   */
  const toggleDraftMethod = (methodId: string) => {
    setDraftMethodIds((prev) =>
      prev.includes(methodId) ? prev.filter((id) => id !== methodId) : [...prev, methodId]
    );
  };

  /**
   * Adds a new method to the current kind
   */
  const handleAddMethod = async (kindIdOverride?: string, nameOverride?: string) => {
    const targetKindId = kindIdOverride ?? draftKindId;
    if (!teamId || !targetKindId || methodSaving) return;
    
    const name = (nameOverride ?? newMethodName).trim();
    if (!name) return;
    
    setMethodSaving(true);
    setMethodError(null);

    const { data, error } = await supabase
      .schema("tosho")
      .from("catalog_methods")
      .insert({
        team_id: teamId,
        kind_id: targetKindId,
        name,
        price: null,
      })
      .select("id,name,price,kind_id")
      .single();

    if (error || !data) {
      setMethodError(error?.message ?? "Не вдалося додати метод");
      setMethodSaving(false);
      return;
    }

    setCatalog((prev) =>
      prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => {
          if (kind.id !== targetKindId) return kind;
          const nextMethods = [
            ...kind.methods,
            { id: data.id, name: data.name, price: data.price ?? undefined },
          ];
          return { ...kind, methods: nextMethods };
        }),
      }))
    );

    setNewMethodName("");
    setNewMethodPrice("");
    setMethodSaving(false);
  };

  /**
   * Updates an existing method
   */
  const handleUpdateMethod = async (
    kindId: string,
    methodId: string,
    nextName: string
  ): Promise<boolean> => {
    if (!teamId || !kindId || !methodId || methodSaving) return false;

    const name = nextName.trim();
    if (!name) {
      setMethodError("Вкажіть назву методу");
      return false;
    }

    setMethodSaving(true);
    setMethodError(null);

    const { error } = await supabase
      .schema("tosho")
      .from("catalog_methods")
      .update({ name })
      .eq("id", methodId)
      .eq("kind_id", kindId);

    if (error) {
      setMethodError(error.message);
      setMethodSaving(false);
      return false;
    }

    setCatalog((prev) =>
      prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => {
          if (kind.id !== kindId) return kind;
          return {
            ...kind,
            methods: kind.methods.map((method) =>
              method.id === methodId ? { ...method, name } : method
            ),
          };
        }),
      }))
    );

    setMethodSaving(false);
    return true;
  };

  /**
   * Deletes a method from a kind
   */
  const handleDeleteMethod = async (kindId: string, methodId: string) => {
    if (!teamId || !kindId || !methodId || methodSaving) return;

    setMethodSaving(true);
    setMethodError(null);

    const { error: mapError } = await supabase
      .schema("tosho")
      .from("catalog_model_methods")
      .delete()
      .eq("method_id", methodId);

    if (mapError) {
      setMethodError(mapError.message);
      setMethodSaving(false);
      return;
    }

    const { error } = await supabase
      .schema("tosho")
      .from("catalog_methods")
      .delete()
      .eq("id", methodId)
      .eq("kind_id", kindId);

    if (error) {
      setMethodError(error.message);
      setMethodSaving(false);
      return;
    }

    setCatalog((prev) =>
      prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => {
          if (kind.id !== kindId) return kind;
          return {
            ...kind,
            methods: kind.methods.filter((method) => method.id !== methodId),
            models: kind.models.map((model) => ({
              ...model,
              methodIds: model.methodIds?.filter((id) => id !== methodId),
            })),
          };
        }),
      }))
    );

    setDraftMethodIds((prev) => prev.filter((id) => id !== methodId));
    setMethodSaving(false);
  };

  /**
   * Adds a print position to a kind
   */
  const handleAddPrintPosition = async (kindId: string, labelOverride?: string) => {
    if (!teamId || !kindId || printPositionSaving) return;
    
    const label = (labelOverride ?? newPrintPositionName).trim();
    if (!label) return;
    
    setPrintPositionSaving(true);
    setPrintPositionError(null);

    const { data, error } = await supabase
      .schema("tosho")
      .from("catalog_print_positions")
      .insert({
        kind_id: kindId,
        label,
        sort_order: 0,
      })
      .select("id,label,kind_id,sort_order")
      .single();

    if (error || !data) {
      setPrintPositionError(error?.message ?? "Не вдалося додати місце нанесення");
      setPrintPositionSaving(false);
      return;
    }

    setCatalog((prev) =>
      prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => {
          if (kind.id !== kindId) return kind;
          return {
            ...kind,
            printPositions: [
              ...kind.printPositions,
              { id: data.id, label: data.label, sort_order: data.sort_order ?? undefined },
            ],
          };
        }),
      }))
    );

    setNewPrintPositionName("");
    setPrintPositionSaving(false);
  };

  /**
   * Deletes a print position
   */
  const handleDeletePrintPosition = async (kindId: string, positionId: string) => {
    if (!teamId || !kindId) return;
    
    const { error } = await supabase
      .schema("tosho")
      .from("catalog_print_positions")
      .delete()
      .eq("id", positionId);
      
    if (error) {
      setPrintPositionError(error.message);
      return;
    }
    
    setCatalog((prev) =>
      prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => {
          if (kind.id !== kindId) return kind;
          return {
            ...kind,
            printPositions: kind.printPositions.filter((pos) => pos.id !== positionId),
          };
        }),
      }))
    );
  };

  /**
   * Updates a print position label
   */
  const handleUpdatePrintPosition = async (
    kindId: string,
    positionId: string,
    nextLabel: string
  ): Promise<boolean> => {
    if (!teamId || !kindId || !positionId || printPositionSaving) return false;

    const label = nextLabel.trim();
    if (!label) {
      setPrintPositionError("Вкажіть назву місця");
      return false;
    }

    setPrintPositionSaving(true);
    setPrintPositionError(null);

    const { error } = await supabase
      .schema("tosho")
      .from("catalog_print_positions")
      .update({ label })
      .eq("id", positionId)
      .eq("kind_id", kindId);

    if (error) {
      setPrintPositionError(error.message);
      setPrintPositionSaving(false);
      return false;
    }

    setCatalog((prev) =>
      prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => {
          if (kind.id !== kindId) return kind;
          return {
            ...kind,
            printPositions: kind.printPositions.map((pos) =>
              pos.id === positionId ? { ...pos, label } : pos
            ),
          };
        }),
      }))
    );

    setPrintPositionSaving(false);
    return true;
  };

  /**
   * Handles image file upload
   */
  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const dataUrl = await readImageFile(file);
      setDraftImageUrl(dataUrl);
    }
  };

  /**
   * Saves the model (create or update)
   */
  const handleSaveModel = async () => {
    if (!teamId || savingModel) return;
    
    const name = draftName.trim();
    if (!name || !draftTypeId || !draftKindId) return;
    
    setSavingModel(true);

    const modelId = editingModelId ?? createLocalId();
    const fixedPrice = Math.max(0, Number(draftFixedPrice) || 0);

    const nextModel: CatalogModel = {
      id: modelId,
      name,
      price: draftPriceMode === "tiers" ? (draftTiers[0]?.price ?? fixedPrice) : fixedPrice,
      priceTiers: draftPriceMode === "tiers" ? draftTiers : undefined,
      methodIds: draftMethodIds,
      imageUrl: draftImageUrl || undefined,
    };

    try {
      let persistedModelId = modelId;
      
      if (editingModelId) {
        const { error } = await supabase
          .schema("tosho")
          .from("catalog_models")
          .update({
            name: nextModel.name,
            price: nextModel.price ?? null,
            image_url: nextModel.imageUrl ?? null,
            kind_id: draftKindId,
          })
          .eq("id", editingModelId)
          .eq("team_id", teamId);
          
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .schema("tosho")
          .from("catalog_models")
          .insert({
            team_id: teamId,
            kind_id: draftKindId,
            name: nextModel.name,
            price: nextModel.price ?? null,
            image_url: nextModel.imageUrl ?? null,
          })
          .select("id")
          .single();
          
        if (error || !data) throw error;
        persistedModelId = data.id as string;
      }

      // Update price tiers
      await supabase
        .schema("tosho")
        .from("catalog_price_tiers")
        .delete()
        .eq("model_id", persistedModelId);

      if (nextModel.priceTiers && nextModel.priceTiers.length > 0) {
        const tierPayload = nextModel.priceTiers.map((tier) => ({
          model_id: persistedModelId,
          min_qty: tier.min,
          max_qty: tier.max,
          price: tier.price,
        }));
        
        const { error } = await supabase
          .schema("tosho")
          .from("catalog_price_tiers")
          .insert(tierPayload);
          
        if (error) throw error;
      }

      // Update methods
      await supabase
        .schema("tosho")
        .from("catalog_model_methods")
        .delete()
        .eq("model_id", persistedModelId);

      if (nextModel.methodIds && nextModel.methodIds.length > 0) {
        const methodPayload = nextModel.methodIds.map((methodId) => ({
          model_id: persistedModelId,
          method_id: methodId,
        }));
        
        const { error } = await supabase
          .schema("tosho")
          .from("catalog_model_methods")
          .insert(methodPayload);
          
        if (error) throw error;
      }

      // Update local state
      setCatalog((prevCatalog) => {
        const cleanedCatalog = prevCatalog.map((type) => ({
          ...type,
          kinds: type.kinds.map((kind) => ({
            ...kind,
            models: kind.models.filter((model) => model.id !== persistedModelId),
          })),
        }));

        return cleanedCatalog.map((type) => {
          if (type.id !== draftTypeId) return type;
          return {
            ...type,
            kinds: type.kinds.map((kind) => {
              if (kind.id !== draftKindId) return kind;
              return { ...kind, models: [...kind.models, { ...nextModel, id: persistedModelId }] };
            }),
          };
        });
      });

      setDrawerOpen(false);
    } catch (error) {
      console.error("save model failed", error);
    } finally {
      setSavingModel(false);
    }
  };

  /**
   * Opens delete confirmation dialog
   */
  const confirmDeleteModel = (modelId: string) => {
    setModelToDelete(modelId);
    setDeleteDialogOpen(true);
  };

  /**
   * Deletes a model
   */
  const handleDeleteModel = async () => {
    if (!teamId || !modelToDelete) return;
    
    const { error } = await supabase
      .schema("tosho")
      .from("catalog_models")
      .delete()
      .eq("id", modelToDelete)
      .eq("team_id", teamId);
      
    if (error) {
      console.error("delete model failed", error);
      return;
    }
    
    setCatalog((prev) =>
      prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => ({
          ...kind,
          models: kind.models.filter((model) => model.id !== modelToDelete),
        })),
      }))
    );
    
    setDeleteDialogOpen(false);
    setDrawerOpen(false);
    setModelToDelete(null);
  };

  /**
   * Clones an existing model
   */
  const handleCloneModel = async (modelId: string) => {
    if (!teamId) return;
    
    const item = allModelsWithContext.find((i) => i.model.id === modelId);
    if (!item) return;

    const clonedModel: CatalogModel = {
      ...item.model,
      name: `${item.model.name} (копія)`,
    };

    const { data: insertModel, error: insertError } = await supabase
      .schema("tosho")
      .from("catalog_models")
      .insert({
        team_id: teamId,
        kind_id: item.kindId,
        name: clonedModel.name,
        price: clonedModel.price ?? null,
        image_url: clonedModel.imageUrl ?? null,
      })
      .select("id")
      .single();
      
    if (insertError || !insertModel) {
      console.error("clone model insert failed", insertError);
      return;
    }

    const newModelId = insertModel.id as string;

    if (clonedModel.priceTiers && clonedModel.priceTiers.length > 0) {
      const tierPayload = clonedModel.priceTiers.map((tier) => ({
        model_id: newModelId,
        min_qty: tier.min,
        max_qty: tier.max,
        price: tier.price,
      }));
      
      await supabase
        .schema("tosho")
        .from("catalog_price_tiers")
        .insert(tierPayload);
    }

    if (clonedModel.methodIds && clonedModel.methodIds.length > 0) {
      const methodPayload = clonedModel.methodIds.map((methodId) => ({
        model_id: newModelId,
        method_id: methodId,
      }));
      
      await supabase
        .schema("tosho")
        .from("catalog_model_methods")
        .insert(methodPayload);
    }

    const nextModel = { ...clonedModel, id: newModelId };
    setCatalog((prev) =>
      prev.map((type) => {
        if (type.id !== item.typeId) return type;
        return {
          ...type,
          kinds: type.kinds.map((kind) => {
            if (kind.id !== item.kindId) return kind;
            return { ...kind, models: [...kind.models, nextModel] };
          }),
        };
      })
    );
  };

  /**
   * Starts inline price editing
   */
  const startInlineEdit = (modelId: string, currentPrice: number) => {
    setInlineEditId(modelId);
    setInlinePrice(String(currentPrice));
  };

  /**
   * Saves inline price edit
   */
  const saveInlineEdit = async () => {
    if (!teamId || !inlineEditId) return;
    
    const newPrice = Math.max(0, Number(inlinePrice) || 0);

    const { error } = await supabase
      .schema("tosho")
      .from("catalog_models")
      .update({ price: newPrice })
      .eq("id", inlineEditId)
      .eq("team_id", teamId);
      
    if (error) {
      console.error("inline price update failed", error);
      return;
    }

    setCatalog((prev) =>
      prev.map((type) => ({
        ...type,
        kinds: type.kinds.map((kind) => ({
          ...kind,
          models: kind.models.map((model) =>
            model.id === inlineEditId ? { ...model, price: newPrice } : model
          ),
        })),
      }))
    );

    setInlineEditId(null);
  };

  return {
    drawerOpen,
    setDrawerOpen,
    editingModelId,
    savingModel,
    deleteDialogOpen,
    setDeleteDialogOpen,
    modelToDelete,
    draftTypeId,
    setDraftTypeId,
    draftKindId,
    setDraftKindId,
    draftName,
    setDraftName,
    draftPriceMode,
    setDraftPriceMode,
    draftFixedPrice,
    setDraftFixedPrice,
    draftTiers,
    setDraftTiers,
    draftMethodIds,
    setDraftMethodIds,
    draftImageUrl,
    setDraftImageUrl,
    imageUploadMode,
    setImageUploadMode,
    newMethodName,
    setNewMethodName,
    newMethodPrice,
    setNewMethodPrice,
    methodSaving,
    methodError,
    setMethodError,
    newPrintPositionName,
    setNewPrintPositionName,
    printPositionSaving,
    printPositionError,
    setPrintPositionError,
    inlineEditId,
    inlinePrice,
    setInlinePrice,
    openCreateDrawer,
    openEditDrawer,
    handleDraftTypeChange,
    handleDraftKindChange,
    handlePriceModeChange,
    updateDraftTier,
    addDraftTier,
    removeDraftTier,
    toggleDraftMethod,
    handleAddMethod,
    handleUpdateMethod,
    handleDeleteMethod,
    handleAddPrintPosition,
    handleDeletePrintPosition,
    handleUpdatePrintPosition,
    handleImageFileUpload,
    handleSaveModel,
    confirmDeleteModel,
    handleDeleteModel,
    handleCloneModel,
    startInlineEdit,
    saveInlineEdit,
  };
}
