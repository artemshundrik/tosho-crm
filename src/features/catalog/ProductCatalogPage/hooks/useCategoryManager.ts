/**
 * useCategoryManager Hook
 * 
 * Manages creation and modification of catalog types and kinds
 */

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { CatalogType, CatalogKind, CategoryMode, QuoteType } from "@/types/catalog";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
};

interface UseCategoryManagerProps {
  teamId: string | null;
  catalog: CatalogType[];
  setCatalog: React.Dispatch<React.SetStateAction<CatalogType[]>>;
  selectedTypeId: string;
  setSelectedTypeId: (id: string) => void;
  selectedKindId: string;
  setSelectedKindId: (id: string) => void;
}

export function useCategoryManager({
  teamId,
  catalog,
  setCatalog,
  selectedTypeId,
  setSelectedTypeId,
  selectedKindId,
  setSelectedKindId,
}: UseCategoryManagerProps) {
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryMode, setCategoryMode] = useState<CategoryMode>("type");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newTypeQuoteType, setNewTypeQuoteType] = useState<QuoteType>("merch");
  const [selectedTypeForKind, setSelectedTypeForKind] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null); // Track if editing existing type
  const [editingKindId, setEditingKindId] = useState<string | null>(null); // Track if editing existing kind

  const [typeQuoteTypeSaving, setTypeQuoteTypeSaving] = useState(false);
  const [typeQuoteTypeError, setTypeQuoteTypeError] = useState<string | null>(null);

  /**
   * Opens dialog to add a new type (category)
   */
  const openAddType = () => {
    setCategoryMode("type");
    setNewCategoryName("");
    setNewTypeQuoteType("merch");
    setEditingTypeId(null); // Clear editing state
    setCategoryError(null);
    setCategoryDialogOpen(true);
  };

  /**
   * Opens dialog to add a new kind (subcategory)
   */
  const openAddKind = () => {
    setCategoryMode("kind");
    setNewCategoryName("");
    setEditingKindId(null); // Clear editing state
    setCategoryError(null);
    setSelectedTypeForKind(selectedTypeId || catalog[0]?.id || "");
    setCategoryDialogOpen(true);
  };

  /**
   * Opens dialog to edit an existing kind
   */
  const openEditKind = (kindId: string) => {
    // Find the kind and its parent type
    let foundKind: CatalogKind | null = null;
    let parentTypeId: string | null = null;
    
    for (const type of catalog) {
      const kind = type.kinds.find((k) => k.id === kindId);
      if (kind) {
        foundKind = kind;
        parentTypeId = type.id;
        break;
      }
    }
    
    if (foundKind && parentTypeId) {
      setCategoryMode("kind");
      setNewCategoryName(foundKind.name);
      setEditingKindId(kindId); // Set editing state
      setSelectedTypeForKind(parentTypeId);
      setCategoryError(null);
      setCategoryDialogOpen(true);
    }
  };

  /**
   * Opens dialog to edit an existing type
   */
  const openEditType = (typeId: string, typeName: string, quoteType: QuoteType | null) => {
    setCategoryMode("type");
    setNewCategoryName(typeName);
    setNewTypeQuoteType(quoteType || "merch");
    setEditingTypeId(typeId); // Set editing state
    setSelectedTypeId(typeId);
    setCategoryError(null);
    setCategoryDialogOpen(true);
  };

  /**
   * Handles adding a new category (type or kind)
   */
  const handleAddCategory = async () => {
    if (!teamId) {
      setCategoryError("Немає доступної команди. Перевір членство або інвайт.");
      return;
    }
    const name = newCategoryName.trim();
    if (!name) return;
    if (categorySaving) return;
    
    setCategorySaving(true);
    setCategoryError(null);

    try {
      if (categoryMode === "type") {
        if (editingTypeId) {
          // UPDATE existing type
          const { error } = await supabase
            .schema("tosho")
            .from("catalog_types")
            .update({ name, quote_type: newTypeQuoteType })
            .eq("id", editingTypeId);
            
          if (error) throw error;

          // Update local state
          setCatalog((prev) =>
            prev.map((type) =>
              type.id === editingTypeId
                ? { ...type, name, quote_type: newTypeQuoteType }
                : type
            )
          );
          setEditingTypeId(null); // Clear editing state
        } else {
          // INSERT new type
          const { data, error } = await supabase
            .schema("tosho")
            .from("catalog_types")
            .insert({ team_id: teamId, name, quote_type: newTypeQuoteType })
            .select("id,name,quote_type")
            .single();
            
          if (error || !data) throw error;

          const newType: CatalogType = {
            id: data.id,
            name: data.name,
            quote_type: data.quote_type ?? null,
            kinds: [],
          };
          
          setCatalog((prev) => [...prev, newType]);
          setSelectedTypeId(data.id);
        }
      } else {
        // KIND mode
        if (!selectedTypeForKind) return;
        
        if (editingKindId) {
          // UPDATE existing kind
          const { error } = await supabase
            .schema("tosho")
            .from("catalog_kinds")
            .update({ name })
            .eq("id", editingKindId);
            
          if (error) throw error;

          // Update local state
          setCatalog((prev) =>
            prev.map((type) => ({
              ...type,
              kinds: type.kinds.map((kind) =>
                kind.id === editingKindId
                  ? { ...kind, name }
                  : kind
              ),
            }))
          );
          setEditingKindId(null); // Clear editing state
        } else {
          // INSERT new kind
          const { data, error } = await supabase
            .schema("tosho")
            .from("catalog_kinds")
            .insert({ team_id: teamId, type_id: selectedTypeForKind, name })
            .select("id,name,type_id")
            .single();
            
          if (error || !data) throw error;

          const newKind: CatalogKind = {
            id: data.id,
            name: data.name,
            models: [],
            methods: [],
            printPositions: [],
          };
          
          setCatalog((prev) =>
            prev.map((type) =>
              type.id === selectedTypeForKind
                ? { ...type, kinds: [...type.kinds, newKind] }
                : type
            )
          );
          
          setSelectedTypeId(selectedTypeForKind);
          setSelectedKindId(data.id);
        }
      }

      setCategoryDialogOpen(false);
    } catch (error: unknown) {
      console.error("create category failed", error);
      setCategoryError(getErrorMessage(error, "Не вдалося створити категорію"));
    } finally {
      setCategorySaving(false);
    }
  };

  /**
   * Updates the quote type for a catalog type
   */
  const handleQuoteTypeUpdate = async (value: QuoteType) => {
    if (!teamId || !selectedTypeId || typeQuoteTypeSaving) return;
    
    setTypeQuoteTypeSaving(true);
    setTypeQuoteTypeError(null);
    
    const { error } = await supabase
      .schema("tosho")
      .from("catalog_types")
      .update({ quote_type: value })
      .eq("id", selectedTypeId)
      .eq("team_id", teamId);
      
    if (error) {
      setTypeQuoteTypeError(error.message);
      setTypeQuoteTypeSaving(false);
      return;
    }
    
    setCatalog((prev) =>
      prev.map((type) =>
        type.id === selectedTypeId ? { ...type, quote_type: value } : type
      )
    );
    
    setTypeQuoteTypeSaving(false);
  };

  /**
   * Handles deleting a kind
   */
  const handleDeleteKind = async (kindId: string) => {
    if (!teamId) {
      setCategoryError("Немає доступної команди.");
      return;
    }
    
    setCategorySaving(true);
    setCategoryError(null);

    try {
      // Delete kind from database
      const { error } = await supabase
        .schema("tosho")
        .from("catalog_kinds")
        .delete()
        .eq("id", kindId);
        
      if (error) throw error;

      // Update local state - remove the deleted kind
      setCatalog((prev) =>
        prev.map((type) => ({
          ...type,
          kinds: type.kinds.filter((kind) => kind.id !== kindId),
        }))
      );
      
      // Close dialog and reset
      setCategoryDialogOpen(false);
      setEditingKindId(null);
      
      // Select first remaining kind in the type if the deleted one was selected
      if (selectedKindId === kindId) {
        const parentType = catalog.find((t) => t.kinds.some((k) => k.id === kindId));
        if (parentType) {
          const remainingKinds = parentType.kinds.filter((k) => k.id !== kindId);
          if (remainingKinds.length > 0) {
            setSelectedKindId(remainingKinds[0].id);
          } else {
            // No more kinds in this type, select first kind from first type
            const firstTypeWithKinds = catalog.find((t) => t.kinds.length > 0 && t.id !== parentType.id);
            if (firstTypeWithKinds && firstTypeWithKinds.kinds.length > 0) {
              setSelectedTypeId(firstTypeWithKinds.id);
              setSelectedKindId(firstTypeWithKinds.kinds[0].id);
            }
          }
        }
      }
    } catch (error: unknown) {
      console.error("delete kind failed", error);
      setCategoryError(getErrorMessage(error, "Не вдалося видалити вид"));
    } finally {
      setCategorySaving(false);
    }
  };

  /**
   * Handles deleting a type
   */
  const handleDeleteType = async (typeId: string) => {
    if (!teamId) {
      setCategoryError("Немає доступної команди.");
      return;
    }
    
    setCategorySaving(true);
    setCategoryError(null);

    try {
      // Delete type from database
      const { error } = await supabase
        .schema("tosho")
        .from("catalog_types")
        .delete()
        .eq("id", typeId);
        
      if (error) throw error;

      // Update local state - remove the deleted type
      setCatalog((prev) => prev.filter((type) => type.id !== typeId));
      
      // Close dialog and reset
      setCategoryDialogOpen(false);
      setEditingTypeId(null);
      
      // Select first remaining type if the deleted one was selected
      if (selectedTypeId === typeId) {
        const remainingTypes = catalog.filter((t) => t.id !== typeId);
        if (remainingTypes.length > 0) {
          setSelectedTypeId(remainingTypes[0].id);
          if (remainingTypes[0].kinds.length > 0) {
            setSelectedKindId(remainingTypes[0].kinds[0].id);
          }
        }
      }
    } catch (error: unknown) {
      console.error("delete type failed", error);
      setCategoryError(getErrorMessage(error, "Не вдалося видалити категорію"));
    } finally {
      setCategorySaving(false);
    }
  };

  return {
    categoryDialogOpen,
    setCategoryDialogOpen,
    categoryMode,
    setCategoryMode,
    newCategoryName,
    setNewCategoryName,
    newTypeQuoteType,
    setNewTypeQuoteType,
    selectedTypeForKind,
    setSelectedTypeForKind,
    categorySaving,
    categoryError,
    editingTypeId,
    editingKindId,
    openAddType,
    openAddKind,
    openEditType,
    openEditKind,
    handleAddCategory,
    handleDeleteType,
    handleDeleteKind,
    typeQuoteTypeSaving,
    typeQuoteTypeError,
    handleQuoteTypeUpdate,
  };
}
