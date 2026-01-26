/**
 * useCategoryManager Hook
 * 
 * Manages creation and modification of catalog types and kinds
 */

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { CatalogType, CatalogKind, CategoryMode, QuoteType } from "@/types/catalog";

interface UseCategoryManagerProps {
  teamId: string | null;
  catalog: CatalogType[];
  setCatalog: React.Dispatch<React.SetStateAction<CatalogType[]>>;
  selectedTypeId: string;
  setSelectedTypeId: (id: string) => void;
  setSelectedKindId: (id: string) => void;
}

export function useCategoryManager({
  teamId,
  catalog,
  setCatalog,
  selectedTypeId,
  setSelectedTypeId,
  setSelectedKindId,
}: UseCategoryManagerProps) {
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryMode, setCategoryMode] = useState<CategoryMode>("type");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newTypeQuoteType, setNewTypeQuoteType] = useState<QuoteType>("merch");
  const [selectedTypeForKind, setSelectedTypeForKind] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [typeQuoteTypeSaving, setTypeQuoteTypeSaving] = useState(false);
  const [typeQuoteTypeError, setTypeQuoteTypeError] = useState<string | null>(null);

  /**
   * Opens dialog to add a new type (category)
   */
  const openAddType = () => {
    setCategoryMode("type");
    setNewCategoryName("");
    setNewTypeQuoteType("merch");
    setCategoryError(null);
    setCategoryDialogOpen(true);
  };

  /**
   * Opens dialog to add a new kind (subcategory)
   */
  const openAddKind = () => {
    setCategoryMode("kind");
    setNewCategoryName("");
    setCategoryError(null);
    setSelectedTypeForKind(selectedTypeId || catalog[0]?.id || "");
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
      } else {
        if (!selectedTypeForKind) return;
        
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

      setCategoryDialogOpen(false);
    } catch (error: any) {
      console.error("create category failed", error);
      setCategoryError(error?.message ?? "Не вдалося створити категорію");
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

  return {
    categoryDialogOpen,
    setCategoryDialogOpen,
    categoryMode,
    newCategoryName,
    setNewCategoryName,
    newTypeQuoteType,
    setNewTypeQuoteType,
    selectedTypeForKind,
    setSelectedTypeForKind,
    categorySaving,
    categoryError,
    openAddType,
    openAddKind,
    handleAddCategory,
    typeQuoteTypeSaving,
    typeQuoteTypeError,
    handleQuoteTypeUpdate,
  };
}
