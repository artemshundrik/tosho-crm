/**
 * useFilters Hook
 * 
 * Manages filtering and search state for the catalog
 */

import { useState, useMemo } from "react";
import type { CatalogType, ModelWithContext } from "@/types/catalog";
import { validateModel, normalize } from "@/utils/catalogUtils";

interface UseFiltersProps {
  catalog: CatalogType[];
  initialTypeId?: string;
  initialKindId?: string;
}

export function useFilters({ catalog, initialTypeId = "", initialKindId = "" }: UseFiltersProps) {
  const [selectedTypeId, setSelectedTypeId] = useState(initialTypeId);
  const [selectedKindId, setSelectedKindId] = useState(initialKindId);
  const [globalSearch, setGlobalSearch] = useState("");
  const [showOnlyIncomplete, setShowOnlyIncomplete] = useState(false);

  // Build all models with context
  const allModelsWithContext = useMemo<ModelWithContext[]>(() => {
    const models: ModelWithContext[] = [];

    catalog.forEach((type) => {
      type.kinds.forEach((kind) => {
        kind.models.forEach((model) => {
          models.push({
            model,
            typeId: type.id,
            typeName: type.name,
            kindId: kind.id,
            kindName: kind.name,
            methods: kind.methods || [],
            validation: validateModel(model),
          });
        });
      });
    });

    return models;
  }, [catalog]);

  // Apply filters
  const filteredGlobalModels = useMemo(() => {
    let results = allModelsWithContext;

    if (globalSearch) {
      const query = normalize(globalSearch);
      results = results.filter(
        (item) =>
          normalize(item.model.name).includes(query) ||
          normalize(item.typeName).includes(query) ||
          normalize(item.kindName).includes(query)
      );
    }

    if (showOnlyIncomplete) {
      results = results.filter((item) => !item.validation.isValid);
    }

    if (!globalSearch && selectedTypeId) {
      results = results.filter((item) => item.typeId === selectedTypeId);
      if (selectedKindId) {
        results = results.filter((item) => item.kindId === selectedKindId);
      }
    }

    return results;
  }, [allModelsWithContext, globalSearch, showOnlyIncomplete, selectedTypeId, selectedKindId]);

  const selectedType = useMemo(
    () => catalog.find((t) => t.id === selectedTypeId),
    [catalog, selectedTypeId]
  );
  
// eslint-disable-next-line react-hooks/exhaustive-deps
  const selectedKinds = selectedType?.kinds ?? [];
  
  const selectedKind = useMemo(
    () => selectedKinds.find((k) => k.id === selectedKindId),
    [selectedKinds, selectedKindId]
  );

  const totalModels = allModelsWithContext.length;
  const incompleteModels = allModelsWithContext.filter((item) => !item.validation.isValid).length;

  // Auto-select first type and kind if available
  if (catalog.length > 0 && !selectedTypeId) {
    const nextTypeId = catalog[0].id;
    const nextKindId = catalog[0].kinds[0]?.id ?? "";
    setSelectedTypeId(nextTypeId);
    setSelectedKindId(nextKindId);
  }

  return {
    selectedTypeId,
    setSelectedTypeId,
    selectedKindId,
    setSelectedKindId,
    globalSearch,
    setGlobalSearch,
    showOnlyIncomplete,
    setShowOnlyIncomplete,
    filteredGlobalModels,
    selectedType,
    selectedKinds,
    selectedKind,
    totalModels,
    incompleteModels,
    allModelsWithContext,
  };
}
