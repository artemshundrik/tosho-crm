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
          normalize(item.model.metadata?.sku ?? "").includes(query) ||
          (item.model.metadata?.variants ?? []).some(
            (variant) =>
              normalize(variant.name).includes(query) ||
              normalize(variant.sku ?? "").includes(query) ||
              normalize(variant.imageUrl ?? "").includes(query)
          ) ||
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

  // Per-kind / per-type counts of incomplete models, so the sidebar can show
  // error badges on every category without the user clicking into it.
  const { incompleteByKind, incompleteByType } = useMemo(() => {
    const byKind = new Map<string, number>();
    const byType = new Map<string, number>();
    allModelsWithContext.forEach((item) => {
      if (item.validation.isValid) return;
      byKind.set(item.kindId, (byKind.get(item.kindId) ?? 0) + 1);
      byType.set(item.typeId, (byType.get(item.typeId) ?? 0) + 1);
    });
    return { incompleteByKind: byKind, incompleteByType: byType };
  }, [allModelsWithContext]);

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
    incompleteByKind,
    incompleteByType,
    allModelsWithContext,
  };
}
