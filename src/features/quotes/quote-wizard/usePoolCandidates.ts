import * as React from "react";

import { searchSupplierPool, type SupplierPoolProduct } from "@/lib/supplierPool";

import type { QuoteImportDraftItem } from "@/features/quotes/quote-import/types";
import { planPoolQueries } from "./poolQueryPlan";

/**
 * «Схожі в пулі» для позицій файлу без посилання (REQ-182#p27).
 *
 * ЧОМУ ЛИШЕ ЦІ ЧЕРНЕТКИ. Товар за посиланням уже має свою фонову розвідку
 * (`useLinkPreviews`) — вона й так шукає той самий товар, точніше, бо знає
 * адресу. Позиція з каталогу товар уже назвала. Тому кандидатів з пулу питає
 * лише рядок файлу: без посилання, ще не прив'язаний до товару
 * (`!supplierProductId`) і не прив'язаний до пулу раніше в цьому ж сеансі
 * (`!tzName` — щойно клік стається, `bindCandidate` ставить `tzName`, і
 * позиція з переліку кандидатів зникає сама, без окремого прапорця).
 *
 * КЕШ ЗА НАЗВОЮ, А НЕ ЗА КЛЮЧЕМ ЧЕРНЕТКИ. Два рядки файлу з однаковою назвою
 * (варіанти одного товару, REQ-182: «варіант 1 з 2») не мають бити пул двічі
 * запитом того самого тексту.
 *
 * ТОЙ САМИЙ ПРИЙОМ, ЩО В `useKindImprintOptions`: `requested` — синхронний
 * `ref`, який лише позначає «запит уже пішов», і саме тому його можна чіпати
 * просто в тілі ефекту; `setState` стається ЛИШЕ всередині `.then`/`.catch`
 * проміса — жодного синхронного `setState` в ефекті (ратчет `set-state-in-
 * effect`). Статус «loading» ніде окремо не зберігається: це просто «імені
 * ще нема серед завершених», і як тільки відповідь прийде, `setState`
 * перемальовує рядок уже з готовим списком.
 *
 * ЗАПИТ ІДЕ ПЛАНАМИ, А НЕ ЦІЛОЮ НАЗВОЮ (REQ-182#p27, живий доказ 24.09.2026).
 * `searchSupplierPool(draft.name)` шукав ЦІЛУ фразу одним ILIKE-шаблоном, а
 * пул зве той самий товар іншим порядком слів і формою («Флісова жилетка»
 * клієнта проти «Жилет флісовий Mercury» пулу) — і не знаходив нічого на 24
 * профільних товарах. `resolvePoolCandidates` нижче пробує плани
 * `planPoolQueries` по черзі, зупиняючись на першому, що щось знайшов.
 */
export type PoolCandidates = { status: "loading" | "done"; products: SupplierPoolProduct[] };

/**
 * Плани по черзі — перший, що знайшов хоч один товар, зупиняє перебір: решта
 * планів вужчі, а не кращі. Не знайшов жоден — запасний хід: головне слово
 * (перший план) БЕЗ `mustContain`, ширшим пошуком — «схожий товар кращий за
 * жоден» (задум #p27). Для однослівної назви це той самий запит, що вже
 * пробували в циклі, тож другого разу не летить.
 */
async function resolvePoolCandidates(name: string): Promise<SupplierPoolProduct[]> {
  const plans = planPoolQueries(name);
  for (const plan of plans) {
    const products = await searchSupplierPool(plan.term, { limit: 5, mustContain: plan.mustContain });
    if (products.length > 0) return products;
  }
  const broadest = plans[0];
  if (broadest && broadest.mustContain.length > 0) {
    return searchSupplierPool(broadest.term, { limit: 5 });
  }
  return [];
}

/** Чи варто шукати кандидатів для цієї чернетки — рядок файлу, ще нічим не зайнятий. */
function wantsCandidates(draft: QuoteImportDraftItem, isFileDraft: (draft: QuoteImportDraftItem) => boolean): boolean {
  return (
    isFileDraft(draft) &&
    draft.links.length === 0 &&
    !draft.supplierProductId &&
    !draft.tzName &&
    draft.name.trim().length > 0
  );
}

export function usePoolCandidates(
  drafts: QuoteImportDraftItem[],
  isFileDraft: (draft: QuoteImportDraftItem) => boolean
): Record<string, PoolCandidates> {
  /** Завершені пошуки за назвою — `undefined` для назви означає «ще шукаю». */
  const [doneByName, setDoneByName] = React.useState<Record<string, SupplierPoolProduct[]>>({});
  const requested = React.useRef(new Set<string>());

  React.useEffect(() => {
    for (const draft of drafts) {
      if (!wantsCandidates(draft, isFileDraft)) continue;
      const name = draft.name.trim();
      if (requested.current.has(name)) continue;
      requested.current.add(name);
      void resolvePoolCandidates(name)
        .then((products) => {
          setDoneByName((prev) => ({ ...prev, [name]: products }));
        })
        .catch(() => {
          // Пул не відповів — позиція лишається текстом, як і без цього пошуку.
          setDoneByName((prev) => ({ ...prev, [name]: [] }));
        });
    }
  }, [drafts, isFileDraft]);

  return React.useMemo(() => {
    const result: Record<string, PoolCandidates> = {};
    for (const draft of drafts) {
      if (!wantsCandidates(draft, isFileDraft)) continue;
      const products = doneByName[draft.name.trim()];
      result[draft.key] = products ? { status: "done", products } : { status: "loading", products: [] };
    }
    return result;
  }, [drafts, isFileDraft, doneByName]);
}
