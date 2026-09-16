import {
  formatMoneyRange,
  isMoneyRangeSpread,
  RUN_CHOICE_NOTE,
  type CommercialDocument,
} from "./document";

/**
 * Смуга підсумку в прев'ю КП: число «Разом» і пам'ятка, яка поїде й у
 * друкований документ.
 *
 * ЧОМУ ОКРЕМИМ ФАЙЛОМ. Розмітка прев'ю живе в `QuotesPage` — сторінці на вісім
 * тисяч рядків із власною стелею розміру. Цей блок не читає зі сторінки нічого,
 * крім готового `doc`, тож тримати його всередині нема за що; заразом текст
 * пам'ятки не є копією — він поруч, у `document.ts`.
 *
 * ТУТ БУЛА ЩЕ ОДНА СМУГА — попередження «у позиції-варіанта не внесена ціна».
 * Пішла разом із роллю «варіант» (див. `@/lib/moneyRange`): ролі більше немає,
 * попереджати нема про що.
 */

export function CommercialPreviewSummary({ doc }: { doc: CommercialDocument }) {
  const hasRunChoice = doc.sections.some((section) =>
    section.items.some((item) => item.runs.length > 1)
  );

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">Загальна сума</span>
        <span className="text-lg font-semibold">{formatMoneyRange(doc.totalRange)}</span>
      </div>
      {/* І межі, І справді кілька тиражів: на одному тиражі в кожної позиції
          межі збігаються, і пам'ятка про вибір тиражу була б ні про що. */}
      {isMoneyRangeSpread(doc.totalRange) && hasRunChoice ? (
        <p className="text-xs text-muted-foreground">{RUN_CHOICE_NOTE}</p>
      ) : null}
    </div>
  );
}
