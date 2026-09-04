import * as React from "react";

import { fetchCatalogBase } from "@/features/quotes/quote-details/queries";

import { buildCatalogSuggestions, type CatalogSuggestion } from "./catalogSuggestions";

/**
 * Каталог для підказок у полі позиції (REQ-182#p14): три таблиці одним заходом
 * на відкриття вікна, далі пошук живе в браузері (див. `catalogSuggestions`).
 *
 * Без React Query навмисно, як і фото посилань: це стан одного відкритого
 * вікна. Каталог міняється рідко, але саме в цьому вікні менеджер щойно міг
 * завести модель на сусідній вкладці — тож кожне відкриття читає наново, а не
 * бере з кешу, який пережив би вікно.
 */
export function useCatalogSuggestions(teamId: string, open: boolean) {
  const [suggestions, setSuggestions] = React.useState<CatalogSuggestion[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open || !teamId) return;
    let alive = true;
    setLoading(true);
    void (async () => {
      const result = await fetchCatalogBase(teamId);
      if (!alive) return;
      // Каталог не доїхав — поле працює далі без підказок: посилання й назва
      // руками від бази не залежать, і ламати їх через невдалий запит нема чого.
      setSuggestions(result.ok ? buildCatalogSuggestions(result.data) : []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [open, teamId]);

  return { suggestions, loading };
}
