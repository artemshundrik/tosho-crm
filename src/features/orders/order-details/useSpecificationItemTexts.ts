import { useCallback, useEffect, useState } from "react";

import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import {
  loadSpecificationItemTexts,
  saveSpecificationItemTexts,
  type SpecificationItemText,
} from "@/features/orders/specificationQueries";

/**
 * «Текст у СП» (REQ-322#p24): опис кожної позиції, який менеджер може поправити
 * перед друком. Вантажиться, коли відкривається модалка СП, зберігається разом
 * з умовами партії.
 */
export function useSpecificationItemTexts(teamId: string | null, record: DerivedOrderRecord | null, open: boolean) {
  const [texts, setTexts] = useState<SpecificationItemText[]>([]);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const enabled = open && Boolean(teamId) && record?.source === "stored";
  // Залежимо від id і масиву позицій, а не від самого запису: збереження умов
  // кладе в state новий об'єкт запису (позиції ті самі), і повне перечитування
  // затерло б щойно набраний текст.
  const recordId = record?.id ?? null;
  const items = record?.items ?? null;

  // Почалось нове завантаження — «вантажиться» й чисто ще в цьому рендері.
  const loadKey = enabled && teamId && recordId ? items : null;
  const [startedFor, setStartedFor] = useState<typeof items>(null);
  if (startedFor !== loadKey) {
    setStartedFor(loadKey);
    if (loadKey) {
      setLoading(true);
      setDirty(false);
    }
  }

  useEffect(() => {
    if (!enabled || !teamId || !recordId || !items) return;
    let cancelled = false;
    loadSpecificationItemTexts(teamId, [{ id: recordId, source: "stored", items }])
      .then((next) => {
        if (!cancelled) setTexts(next);
      })
      .catch((error: unknown) => {
        console.error("Failed to load specification item texts", error);
        if (!cancelled) setTexts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, teamId, recordId, items]);

  const setText = useCallback((itemId: string, text: string) => {
    setDirty(true);
    setTexts((current) => current.map((entry) => (entry.itemId === itemId ? { ...entry, text } : entry)));
  }, []);

  const resetText = useCallback((itemId: string) => {
    setDirty(true);
    setTexts((current) => current.map((entry) => (entry.itemId === itemId ? { ...entry, text: entry.defaultText } : entry)));
  }, []);

  const save = useCallback(async () => {
    if (!dirty || !teamId || texts.length === 0) return;
    await saveSpecificationItemTexts(teamId, texts);
    setDirty(false);
  }, [dirty, teamId, texts]);

  return { texts, loading, setText, resetText, save };
}

export type SpecificationItemTextsState = ReturnType<typeof useSpecificationItemTexts>;
