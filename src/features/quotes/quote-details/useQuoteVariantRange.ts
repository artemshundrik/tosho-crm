import { useMemo } from "react";

import { isVariantQuoteItem, variantGroupRange, type MoneyRange } from "@/lib/quoteItemVariants";

/**
 * Межі групи варіантів для рядка «з них варіанти» поруч із підсумком картки.
 *
 * НАВІЩО. Клієнт у КП бачить «від 48 440 до 66 044 грн», а менеджер на картці
 * того самого прорахунку — суму ВСІХ варіантів разом. Два числа про один
 * прорахунок, і жодне з них не назване помилкою, тож рано чи пізно більше з них
 * звучить у телефонній розмові. Рядок ставить обидва поруч.
 *
 * ПІДСУМОК КАРТКИ ЛИШАЄТЬСЯ СУМОЮ — і чіпати його не можна: на ньому висять
 * замовлення, дайджести й `netlify/functions/_lib/quotePricing`. Тут лише показ.
 *
 * ЧОМУ БЕРЕМО ТІ САМІ `summaries`, ЩО Й ПІДСУМОК. Картка рахує по ОДНОМУ
 * тиражу на позицію — погодженому або обраному менеджером, — а документ по всіх
 * тиражах одразу. Якби рядок рахував інакше, він розійшовся б із числом над
 * собою, і замість одного зрозумілого розходження вийшло б два незрозумілі.
 * Тому в документі межі позиції ширші рівно тоді, коли в неї кілька тиражів.
 */
export function useQuoteVariantRange(
  items: readonly { id: string; metadata?: unknown }[],
  summaries: readonly { itemId: string; pricing: { saleTotal: number } }[]
): MoneyRange | null {
  return useMemo(() => {
    const variantItemIds = new Set(
      items.filter((item) => isVariantQuoteItem(item.metadata)).map((item) => item.id)
    );
    if (variantItemIds.size === 0) return null;

    return variantGroupRange(
      summaries.map((summary) => ({
        isVariant: variantItemIds.has(summary.itemId),
        range: { min: summary.pricing.saleTotal, max: summary.pricing.saleTotal },
      }))
    );
  }, [items, summaries]);
}
