import * as React from "react";

import { searchSupplierPool, type SupplierPoolProduct } from "@/lib/supplierPool";

import type { QuoteImportDraftItem } from "@/features/quotes/quote-import/types";

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
 */
export type PoolCandidates = { status: "loading" | "done"; products: SupplierPoolProduct[] };

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
      void searchSupplierPool(name, { limit: 5 })
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
