import { useCallback, useEffect, useState } from "react";

import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import {
  loadSpecificationItemTexts,
  saveSpecificationItemTexts,
  type SpecificationItemText,
} from "@/features/orders/specificationQueries";
import {
  effectiveSpecTemplate,
  hasMixedSpecItems,
  suggestSpecTemplate,
  type SpecTemplate,
} from "@/features/orders/specTemplate";

/** Непоправлені тексти йдуть за шаблоном; поправлені менеджером лишаються як є. */
const withTemplate = (texts: SpecificationItemText[], template: SpecTemplate) =>
  texts.map((entry) => {
    const nextDefault = entry.defaultTexts[template];
    const untouched = entry.text.trim() === entry.defaultText.trim();
    return { ...entry, defaultText: nextDefault, text: untouched ? nextDefault : entry.text };
  });

/**
 * «Текст у СП» (REQ-322#p24): опис кожної позиції, який менеджер може поправити
 * перед друком. Вантажиться, коли відкривається модалка СП, зберігається разом
 * з умовами партії.
 */
export function useSpecificationItemTexts(teamId: string | null, record: DerivedOrderRecord | null, open: boolean) {
  const [texts, setTexts] = useState<SpecificationItemText[]>([]);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [template, setTemplateState] = useState<SpecTemplate>(effectiveSpecTemplate(record?.specTemplate));
  const enabled = open && Boolean(teamId) && record?.source === "stored";
  // Залежимо від id і масиву позицій, а не від самого запису: збереження умов
  // кладе в state новий об'єкт запису (позиції ті самі), і повне перечитування
  // затерло б щойно набраний текст.
  const recordId = record?.id ?? null;
  const items = record?.items ?? null;
  const storedTemplate = record?.specTemplate ?? null;
  // Підказку виду даємо лише СП, якої ще не створювали: створена друкувалась
  // товарним шаблоном, і тихо перемкнути її означало б інший документ.
  const canSuggest = storedTemplate === null && !record?.specificationCreatedAt;

  // Почалось нове завантаження — «вантажиться» й чисто ще в цьому рендері.
  const loadKey = enabled && teamId && recordId ? items : null;
  const [startedFor, setStartedFor] = useState<typeof items>(null);
  if (startedFor !== loadKey) {
    setStartedFor(loadKey);
    if (loadKey) {
      setLoading(true);
      setDirty(false);
      setTemplateState(effectiveSpecTemplate(storedTemplate));
    }
  }

  useEffect(() => {
    if (!enabled || !teamId || !recordId || !items) return;
    let cancelled = false;
    const initial = effectiveSpecTemplate(storedTemplate);
    loadSpecificationItemTexts(teamId, [{ id: recordId, source: "stored", items }], initial)
      .then((next) => {
        if (cancelled) return;
        const suggested = canSuggest ? suggestSpecTemplate(next) : initial;
        setTemplateState(suggested);
        setTexts(suggested === initial ? next : withTemplate(next, suggested));
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
  }, [enabled, teamId, recordId, items, storedTemplate, canSuggest]);

  const setTemplate = useCallback((next: SpecTemplate) => {
    setDirty(true);
    setTemplateState(next);
    setTexts((current) => withTemplate(current, next));
  }, []);

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

  return { texts, loading, setText, resetText, save, template, setTemplate, mixed: hasMixedSpecItems(texts) };
}

export type SpecificationItemTextsState = ReturnType<typeof useSpecificationItemTexts>;
