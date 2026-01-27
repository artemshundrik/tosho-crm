/**
 * useCommandPalette Hook
 * 
 * Manages state and actions for the command palette
 * Handles search history, quick actions, and navigation
 */

import { useState, useMemo, useEffect } from "react";
import type { ModelWithContext } from "@/types/catalog";

const SEARCH_HISTORY_KEY = "catalog.searchHistory";
const MAX_HISTORY_ITEMS = 10;

export type CommandAction = {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  onSelect: () => void;
  group?: string;
};

interface UseCommandPaletteProps {
  models: ModelWithContext[];
  onCreateModel: () => void;
  onEditModel: (modelId: string) => void;
  onNavigateToType: (typeId: string) => void;
  onNavigateToKind: (kindId: string) => void;
  onExportCSV: () => void;
}

export function useCommandPalette({
  models,
  onCreateModel,
  onEditModel,
  onNavigateToType,
  onNavigateToKind,
  onExportCSV,
}: UseCommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Save search history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
    } catch {
      // Ignore storage errors
    }
  }, [searchHistory]);

  // Add to search history
  const addToHistory = (query: string) => {
    if (!query.trim()) return;
    
    setSearchHistory((prev) => {
      const filtered = prev.filter((item) => item !== query);
      return [query, ...filtered].slice(0, MAX_HISTORY_ITEMS);
    });
  };

  // Clear search history
  const clearHistory = () => {
    setSearchHistory([]);
  };

  // Quick actions
  const quickActions: CommandAction[] = useMemo(
    () => [
      {
        id: "create-model",
        label: "Створити нову модель",
        icon: "Plus",
        shortcut: "⌘N",
        group: "Швидкі дії",
        onSelect: () => {
          onCreateModel();
          setOpen(false);
        },
      },
      {
        id: "export-csv",
        label: "Експортувати в CSV",
        icon: "Download",
        group: "Швидкі дії",
        onSelect: () => {
          onExportCSV();
          setOpen(false);
        },
      },
    ],
    [onCreateModel, onExportCSV]
  );

  // Get unique types and kinds
  const types = useMemo(() => {
    const uniqueTypes = new Map<string, { id: string; name: string }>();
    models.forEach((item) => {
      if (!uniqueTypes.has(item.typeId)) {
        uniqueTypes.set(item.typeId, { id: item.typeId, name: item.typeName });
      }
    });
    return Array.from(uniqueTypes.values());
  }, [models]);

  const kinds = useMemo(() => {
    const uniqueKinds = new Map<string, { id: string; name: string; typeName: string }>();
    models.forEach((item) => {
      if (!uniqueKinds.has(item.kindId)) {
        uniqueKinds.set(item.kindId, {
          id: item.kindId,
          name: item.kindName,
          typeName: item.typeName,
        });
      }
    });
    return Array.from(uniqueKinds.values());
  }, [models]);

  // Filter models based on search
  const filteredModels = useMemo(() => {
    if (!search.trim()) return [];
    
    const query = search.toLowerCase().trim();
    return models
      .filter(
        (item) =>
          item.model.name.toLowerCase().includes(query) ||
          item.typeName.toLowerCase().includes(query) ||
          item.kindName.toLowerCase().includes(query) ||
          item.model.id.toLowerCase().includes(query)
      )
      .slice(0, 10); // Limit to 10 results
  }, [models, search]);

  // Filter types and kinds based on search
  const filteredTypes = useMemo(() => {
    if (!search.trim()) return [];
    const query = search.toLowerCase().trim();
    return types.filter((type) => type.name.toLowerCase().includes(query)).slice(0, 5);
  }, [types, search]);

  const filteredKinds = useMemo(() => {
    if (!search.trim()) return [];
    const query = search.toLowerCase().trim();
    return kinds.filter((kind) => kind.name.toLowerCase().includes(query)).slice(0, 5);
  }, [kinds, search]);

  // Handle model selection
  const handleSelectModel = (modelId: string) => {
    addToHistory(search);
    onEditModel(modelId);
    setOpen(false);
    setSearch("");
  };

  // Handle type navigation
  const handleNavigateToType = (typeId: string) => {
    addToHistory(search);
    onNavigateToType(typeId);
    setOpen(false);
    setSearch("");
  };

  // Handle kind navigation
  const handleNavigateToKind = (kindId: string) => {
    addToHistory(search);
    onNavigateToKind(kindId);
    setOpen(false);
    setSearch("");
  };

  // Toggle command palette
  const toggle = () => setOpen((prev) => !prev);

  return {
    open,
    setOpen,
    search,
    setSearch,
    searchHistory,
    clearHistory,
    quickActions,
    filteredModels,
    filteredTypes,
    filteredKinds,
    handleSelectModel,
    handleNavigateToType,
    handleNavigateToKind,
    toggle,
  };
}
