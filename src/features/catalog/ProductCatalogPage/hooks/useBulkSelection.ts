/**
 * useBulkSelection Hook
 * 
 * Manages multi-select functionality for models in the catalog
 * Supports select all, deselect all, and individual selection
 */

import { useState, useCallback, useMemo } from "react";

interface UseBulkSelectionProps {
  itemIds: string[];
}

export function useBulkSelection({ itemIds }: UseBulkSelectionProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /**
   * Toggle selection for a single item
   */
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  /**
   * Select multiple items
   */
  const selectMultiple = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  /**
   * Deselect multiple items
   */
  const deselectMultiple = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  /**
   * Select all items
   */
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(itemIds));
  }, [itemIds]);

  /**
   * Clear all selections
   */
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  /**
   * Check if item is selected
   */
  const isSelected = useCallback(
    (id: string) => {
      return selectedIds.has(id);
    },
    [selectedIds]
  );

  /**
   * Check if all items are selected
   */
  const isAllSelected = useMemo(() => {
    return itemIds.length > 0 && itemIds.every((id) => selectedIds.has(id));
  }, [itemIds, selectedIds]);

  /**
   * Check if some (but not all) items are selected
   */
  const isIndeterminate = useMemo(() => {
    const selectedCount = itemIds.filter((id) => selectedIds.has(id)).length;
    return selectedCount > 0 && selectedCount < itemIds.length;
  }, [itemIds, selectedIds]);

  /**
   * Get count of selected items
   */
  const selectedCount = useMemo(() => {
    return Array.from(selectedIds).filter((id) => itemIds.includes(id)).length;
  }, [selectedIds, itemIds]);

  /**
   * Get array of selected IDs (only from current itemIds)
   */
  const selectedIdsArray = useMemo(() => {
    return itemIds.filter((id) => selectedIds.has(id));
  }, [itemIds, selectedIds]);

  /**
   * Toggle select all
   */
  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      clearSelection();
    } else {
      selectAll();
    }
  }, [isAllSelected, selectAll, clearSelection]);

  return {
    selectedIds: selectedIdsArray,
    selectedCount,
    isSelected,
    isAllSelected,
    isIndeterminate,
    toggleSelection,
    selectMultiple,
    deselectMultiple,
    selectAll,
    clearSelection,
    toggleSelectAll,
  };
}
